'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const { loadPackage, resolvePackagePath } = require('./load-package');
const { DEFAULT_INTERVAL_SECONDS, runStandaloneHost } = require('./runtime-host');
const { printSummary, resolveStandalonePaths, setupStandalone } = require('./setup');

let cachedGateway = null;
let cachedControlPlane = null;

function loadMemoryGateway() {
  if (cachedGateway) {
    return cachedGateway;
  }

  cachedGateway = loadPackage('memory-os-gateway', ['../../memory-os-gateway']);
  return cachedGateway;
}

function loadControlPlane() {
  if (cachedControlPlane) {
    return cachedControlPlane;
  }

  cachedControlPlane = loadPackage('control-plane', ['../../control-plane']);
  return cachedControlPlane;
}

function parseArgv(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return {
    command: positional[0] || '',
    positional: positional.slice(1),
    flags,
  };
}

function printUsage() {
  console.error('Usage: memoryos <command> [options]');
  console.error('Commands:');
  console.error('  init [--state-dir <path>] [--workspace-root <path>] [--system-root <path>] [--memory-root <path>] [--runtime-root <path>] [--config-path <path>] [--overwrite]');
  console.error('  status [--memory-root <path>] [--config-path <path>]');
  console.error('  verify [--memory-root <path>] [--config-path <path>] [--updated-at <ts>] [--today <date>]');
  console.error('  health [--memory-root <path>] [--config-path <path>] [--system-root <path>] [--runtime-stale-after-days <n>] [--audit-limit <n>] [--stale-after-days <n>]');
  console.error('  snapshot [--memory-root <path>] [--config-path <path>] [--system-root <path>] [--runtime-stale-after-days <n>] [--audit-limit <n>] [--stale-after-days <n>]');
  console.error('  pipeline <YYYY-MM-DD> [--phase extract|curate|apply|verify|all] [--memory-root <path>] [--config-path <path>] [--adapter-module <path>] [--llm-runner <cmd>] [--node-cmd <path>]');
  console.error(`  run [--phase extract|curate|apply|verify|all] [--date <YYYY-MM-DD>] [--interval-seconds <n>] [--max-runs <n>] [--once] [--memory-root <path>] [--config-path <path>] [--adapter-module <path>] [--llm-runner <cmd>] [--node-cmd <path>] (default interval: ${DEFAULT_INTERVAL_SECONDS}s)`);
}

function outputJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

function resolvePaths(flags) {
  return resolveStandalonePaths({
    stateDir: flags['state-dir'],
    workspaceRoot: flags['workspace-root'],
    systemRoot: flags['system-root'],
    memoryRoot: flags['memory-root'],
    sharedSkillsRoot: flags['shared-skills-root'],
    runtimeRoot: flags['runtime-root'],
    configPath: flags['config-path'],
  });
}

function runPipeline(dateArg, flags) {
  if (!dateArg) {
    throw new Error('pipeline requires a YYYY-MM-DD argument');
  }

  const paths = resolvePaths(flags);
  const pipelineScript = resolvePackagePath('memory-pipeline', 'bin', 'run-pipeline.sh');
  const env = {
    ...process.env,
    MEMORY_ROOT: paths.memoryRoot,
    PIPELINE_NODE_CMD: flags['node-cmd'] || process.execPath,
  };

  if (flags['adapter-module']) {
    env.PIPELINE_ADAPTER_MODULE = flags['adapter-module'];
  }

  if (flags['llm-runner']) {
    env.PIPELINE_LLM_CMD = flags['llm-runner'];
  }

  const args = [pipelineScript, dateArg];
  if (flags.phase) {
    args.push('--phase', flags.phase);
  }

  const result = spawnSync('bash', args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status || 0;
}

function runCli(argv) {
  const { command, positional, flags } = parseArgv(argv);

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return 1;
  }

  const gateway = loadMemoryGateway();
  const controlPlane = loadControlPlane();
  const paths = resolvePaths(flags);

  switch (command) {
    case 'init': {
      const result = setupStandalone({
        stateDir: flags['state-dir'],
        workspaceRoot: flags['workspace-root'],
        systemRoot: flags['system-root'],
        memoryRoot: flags['memory-root'],
        runtimeRoot: flags['runtime-root'],
        configPath: flags['config-path'],
        overwrite: flags.overwrite === true,
      });
      console.log(printSummary(result));
      return 0;
    }
    case 'status':
      outputJson(
        gateway.getStatus({
          memoryRoot: paths.memoryRoot,
        })
      );
      return 0;
    case 'verify':
      outputJson(
        gateway.verify({
          memoryRoot: paths.memoryRoot,
          updatedAt: flags['updated-at'],
          today: flags.today,
        })
      );
      return 0;
    case 'health':
      outputJson(
        controlPlane.getControlPlaneHealth({
          memoryRoot: paths.memoryRoot,
          systemRoot: flags['system-root'] || paths.systemRoot,
          runtimeStaleAfterDays: flags['runtime-stale-after-days'],
          auditLimit: flags['audit-limit'],
          staleAfterDays: flags['stale-after-days'],
        })
      );
      return 0;
    case 'snapshot':
      outputJson(
        controlPlane.getControlPlaneSnapshot({
          memoryRoot: paths.memoryRoot,
          systemRoot: flags['system-root'] || paths.systemRoot,
          runtimeStaleAfterDays: flags['runtime-stale-after-days'],
          auditLimit: flags['audit-limit'],
          staleAfterDays: flags['stale-after-days'],
        })
      );
      return 0;
    case 'pipeline':
      return runPipeline(positional[0], flags);
    case 'run': {
      const result = runStandaloneHost({
        stateDir: flags['state-dir'],
        workspaceRoot: flags['workspace-root'],
        systemRoot: flags['system-root'],
        memoryRoot: flags['memory-root'],
        runtimeRoot: flags['runtime-root'],
        configPath: flags['config-path'],
        phase: flags.phase,
        date: flags.date,
        intervalSeconds: flags['interval-seconds'],
        maxRuns: flags['max-runs'],
        once: flags.once === true,
        adapterModule: flags['adapter-module'],
        llmRunner: flags['llm-runner'],
        nodeCmd: flags['node-cmd'],
        runPipeline,
      });

      if (result && typeof result.then === 'function') {
        return result.then(() => 0);
      }

      return 0;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

module.exports = {
  runCli,
};
