'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runStandaloneHost, setupStandalone } = require('..');

const CLI_PATH = path.resolve(__dirname, '../bin/memoryos.js');
const WORKSPACE_FIXTURE = path.resolve(__dirname, '../../../tests/fixtures/workspace');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memoryos-app-validate-'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function initGitRepo(repoRoot) {
  const init = spawnSync('git', ['init'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
}

async function main() {
  const setupRoot = makeTempRoot();
  try {
    const stateDir = path.join(setupRoot, 'state');
    const result = setupStandalone({
      stateDir,
    });

    assert.equal(fs.existsSync(path.join(stateDir, 'memoryos.json')), true);
    assert.equal(fs.existsSync(path.join(stateDir, 'system', 'memory')), true);
    assert.equal(fs.existsSync(path.join(stateDir, 'runtime')), true);
    assert.equal(result.agents.length, 5);
    assert.equal(result.config.changed, true);

    const config = readJson(path.join(stateDir, 'memoryos.json'));
    assert.equal(config.stateDir, stateDir);
    assert.equal(config.workspaceRoot, stateDir);
    assert.equal(config.systemRoot, path.join(stateDir, 'system'));
    assert.equal(config.memoryRoot, path.join(stateDir, 'system', 'memory'));

    const rerun = setupStandalone({
      stateDir,
    });
    assert.equal(rerun.config.changed, false);
  } finally {
    fs.rmSync(setupRoot, { recursive: true, force: true });
  }

  const help = spawnSync(process.execPath, [CLI_PATH, '--help'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.equal(help.status, 1);
  assert.match(help.stderr, /Usage: memoryos/);
  assert.match(help.stderr, /init \[--state-dir <path>\]/);

  const status = spawnSync(
    process.execPath,
    [CLI_PATH, 'status', '--memory-root', WORKSPACE_FIXTURE],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    }
  );
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).overall.status, 'OK');

  const runtimeRoot = makeTempRoot();
  try {
    const memoryRoot = path.join(runtimeRoot, 'workspace');
    const runtimeStoreRoot = path.join(runtimeRoot, 'runtime');
    fs.cpSync(WORKSPACE_FIXTURE, memoryRoot, { recursive: true });
    initGitRepo(memoryRoot);

    const verify = spawnSync(
      process.execPath,
      [CLI_PATH, 'verify', '--memory-root', memoryRoot],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      }
    );
    assert.equal(verify.status, 0, verify.stderr);
    assert.equal(JSON.parse(verify.stdout).receipt.status, 'ok');

    const snapshot = spawnSync(
      process.execPath,
      [CLI_PATH, 'snapshot', '--memory-root', memoryRoot],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      }
    );
    assert.equal(snapshot.status, 0, snapshot.stderr);
    assert.equal(JSON.parse(snapshot.stdout).kind, 'control-plane-snapshot');

    const run = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'run',
        '--memory-root',
        memoryRoot,
        '--runtime-root',
        runtimeStoreRoot,
        '--phase',
        'verify',
        '--date',
        '2026-03-20',
        '--once',
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      }
    );
    assert.equal(run.status, 0, run.stderr);

    const hostState = readJson(path.join(runtimeStoreRoot, 'host', 'state.json'));
    const lastRun = readJson(path.join(runtimeStoreRoot, 'host', 'last-run.json'));
    assert.equal(hostState.kind, 'memoryos-runtime-host-state');
    assert.equal(hostState.status, 'idle');
    assert.equal(hostState.cyclesCompleted, 1);
    assert.equal(hostState.runtimeAuthoritative, false);
    assert.equal(lastRun.kind, 'memoryos-runtime-host-run');
    assert.equal(lastRun.phase, 'verify');
    assert.equal(lastRun.status, 'ok');
    assert.equal(lastRun.exitCode, 0);
    assert.equal(fs.existsSync(path.join(runtimeStoreRoot, 'host', 'lock.json')), false);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }

  const loopRoot = makeTempRoot();
  try {
    const runRoot = path.join(loopRoot, 'runtime');
    const summary = await runStandaloneHost({
      memoryRoot: WORKSPACE_FIXTURE,
      runtimeRoot: runRoot,
      phase: 'verify',
      date: '2026-03-20',
      intervalSeconds: 1,
      maxRuns: 2,
      runPipeline() {
        return 0;
      },
    });
    assert.equal(summary.cyclesCompleted, 2);

    const hostState = readJson(path.join(runRoot, 'host', 'state.json'));
    assert.equal(hostState.cyclesCompleted, 2);
    assert.equal(hostState.lastRun.status, 'ok');

    const runFiles = fs
      .readdirSync(path.join(runRoot, 'host', 'runs'))
      .filter((entry) => entry.endsWith('.json'));
    assert.equal(runFiles.length, 2);
  } finally {
    fs.rmSync(loopRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
