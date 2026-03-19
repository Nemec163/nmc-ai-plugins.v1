'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const process = require('node:process');

const { resolveStandalonePaths } = require('./setup');

const DEFAULT_INTERVAL_SECONDS = 1800;
const HOST_SCHEMA_VERSION = '1.0';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatLocalDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parsePositiveInteger(value, fallback, fieldName) {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(value, fallback, fieldName) {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return parsed;
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createHostPaths(runtimeRoot) {
  const hostRoot = path.join(runtimeRoot, 'host');
  return {
    hostRoot,
    lockPath: path.join(hostRoot, 'lock.json'),
    statePath: path.join(hostRoot, 'state.json'),
    latestRunPath: path.join(hostRoot, 'last-run.json'),
    runsRoot: path.join(hostRoot, 'runs'),
  };
}

function acquireHostLock(lockPath) {
  ensureDir(path.dirname(lockPath));

  if (fs.existsSync(lockPath)) {
    const existing = readJson(lockPath);
    if (processExists(existing.pid)) {
      throw new Error(
        `memoryos run is already active for this runtime root (pid ${existing.pid})`
      );
    }
  }

  const lock = {
    schemaVersion: HOST_SCHEMA_VERSION,
    kind: 'memoryos-runtime-host-lock',
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
    runtimeAuthoritative: false,
    canonicalPromotionPath: 'single-promoter',
  };
  writeJson(lockPath, lock);

  return lock;
}

function releaseHostLock(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return;
  }

  try {
    const current = readJson(lockPath);
    if (current.pid === process.pid) {
      fs.rmSync(lockPath, { force: true });
    }
  } catch (error) {
    fs.rmSync(lockPath, { force: true });
  }
}

function buildPipelineFlags(options) {
  const flags = {
    'state-dir': options.stateDir,
    'workspace-root': options.workspaceRoot,
    'system-root': options.systemRoot,
    'memory-root': options.memoryRoot,
    'runtime-root': options.runtimeRoot,
    'config-path': options.configPath,
    'adapter-module': options.adapterModule,
    'llm-runner': options.llmRunner,
    'node-cmd': options.nodeCmd,
  };

  if (options.phase && options.phase !== 'all') {
    flags.phase = options.phase;
  }

  return flags;
}

function buildHostState(baseState, patch = {}) {
  return {
    ...baseState,
    ...patch,
    lastHeartbeatAt: new Date().toISOString(),
  };
}

async function runStandaloneHost(options = {}) {
  if (typeof options.runPipeline !== 'function') {
    throw new Error('runPipeline is required');
  }

  const intervalSeconds = parsePositiveInteger(
    options.intervalSeconds,
    DEFAULT_INTERVAL_SECONDS,
    'intervalSeconds'
  );
  const maxRuns = parseNonNegativeInteger(options.maxRuns, 0, 'maxRuns');
  const once = options.once === true;
  const phase = options.phase || 'all';
  const paths = resolveStandalonePaths(options);
  const hostPaths = createHostPaths(paths.runtimeRoot);
  const pipelineFlags = buildPipelineFlags({
    ...paths,
    phase,
    adapterModule: options.adapterModule,
    llmRunner: options.llmRunner,
    nodeCmd: options.nodeCmd,
  });
  const startedAt = new Date().toISOString();
  const lock = acquireHostLock(hostPaths.lockPath);

  ensureDir(paths.runtimeRoot);
  ensureDir(hostPaths.runsRoot);

  let activeState = {
    schemaVersion: HOST_SCHEMA_VERSION,
    kind: 'memoryos-runtime-host-state',
    status: 'running',
    pid: process.pid,
    hostname: os.hostname(),
    startedAt,
    stoppedAt: null,
    workspaceRoot: paths.workspaceRoot,
    systemRoot: paths.systemRoot,
    memoryRoot: paths.memoryRoot,
    runtimeRoot: paths.runtimeRoot,
    configPath: paths.configPath,
    intervalSeconds,
    maxRuns,
    once,
    phase,
    adapterModule: options.adapterModule || null,
    llmRunner: options.llmRunner || null,
    runtimeAuthoritative: false,
    canonicalPromotionPath: 'single-promoter',
    lock,
    cyclesCompleted: 0,
    stopRequested: false,
    lastPlannedDate: null,
    lastRun: null,
  };
  writeJson(hostPaths.statePath, activeState);

  let stopRequested = false;
  let failed = false;
  const requestStop = () => {
    stopRequested = true;
    activeState = buildHostState(activeState, {
      stopRequested: true,
    });
    writeJson(hostPaths.statePath, activeState);
  };

  const handleSignal = (signal) => {
    console.error(`[memoryos-run] received ${signal}, stopping after the current cycle`);
    requestStop();
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    while (true) {
      const cycleNumber = activeState.cyclesCompleted + 1;
      const cycleStartedAt = new Date().toISOString();
      const date = options.date || formatLocalDate();

      activeState = buildHostState(activeState, {
        currentCycle: {
          cycle: cycleNumber,
          date,
          startedAt: cycleStartedAt,
          phase,
        },
        lastPlannedDate: date,
      });
      writeJson(hostPaths.statePath, activeState);

      console.error(
        `[memoryos-run] cycle ${cycleNumber} starting for ${date} (phase: ${phase})`
      );

      let cycleError = null;
      let exitCode = 1;

      try {
        exitCode = await Promise.resolve(options.runPipeline(date, pipelineFlags));
      } catch (error) {
        cycleError = error;
      }

      const finishedAt = new Date().toISOString();
      const runRecord = {
        schemaVersion: HOST_SCHEMA_VERSION,
        kind: 'memoryos-runtime-host-run',
        cycle: cycleNumber,
        pid: process.pid,
        startedAt: cycleStartedAt,
        finishedAt,
        date,
        phase,
        memoryRoot: paths.memoryRoot,
        runtimeRoot: paths.runtimeRoot,
        adapterModule: options.adapterModule || null,
        llmRunner: options.llmRunner || null,
        status: cycleError ? 'failed' : exitCode === 0 ? 'ok' : 'failed',
        exitCode,
        error: cycleError
          ? {
            message: cycleError.message,
            code: cycleError.code || null,
          }
          : null,
        runtimeAuthoritative: false,
        canonicalPromotionPath: 'single-promoter',
      };
      const runFilePath = path.join(
        hostPaths.runsRoot,
        `${cycleNumber.toString().padStart(6, '0')}-${date}.json`
      );

      writeJson(runFilePath, runRecord);
      writeJson(hostPaths.latestRunPath, runRecord);

      activeState = buildHostState(activeState, {
        currentCycle: null,
        cyclesCompleted: cycleNumber,
        lastRun: {
          ...runRecord,
          filePath: runFilePath,
        },
      });
      writeJson(hostPaths.statePath, activeState);

      if (cycleError) {
        failed = true;
        throw cycleError;
      }

      if (exitCode !== 0) {
        failed = true;
        throw new Error(`Pipeline exited with status ${exitCode}`);
      }

      if (once || stopRequested || (maxRuns > 0 && cycleNumber >= maxRuns)) {
        break;
      }

      await sleep(intervalSeconds * 1000);
    }
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);

    activeState = buildHostState(activeState, {
      status: failed ? 'failed' : stopRequested ? 'stopped' : 'idle',
      stoppedAt: new Date().toISOString(),
      stopRequested,
      currentCycle: null,
    });
    writeJson(hostPaths.statePath, activeState);
    releaseHostLock(hostPaths.lockPath);
  }

  return {
    status: 'ok',
    cyclesCompleted: activeState.cyclesCompleted,
    statePath: hostPaths.statePath,
    lastRunPath: hostPaths.latestRunPath,
    runtimeRoot: paths.runtimeRoot,
    intervalSeconds,
    phase,
  };
}

module.exports = {
  DEFAULT_INTERVAL_SECONDS,
  buildPipelineFlags,
  createHostPaths,
  formatLocalDate,
  runStandaloneHost,
};
