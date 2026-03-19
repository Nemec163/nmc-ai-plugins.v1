'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_PATH = path.join(ROOT_DIR, 'bin', 'run-pipeline.sh');
const LLM_RUNNER_BIN_PATH = path.join(ROOT_DIR, 'bin', 'run-llm-phase.js');
const WRAPPER_PATH = path.resolve(
  ROOT_DIR,
  '../adapter-openclaw/skills/memory-pipeline/pipeline.sh'
);
const WORKSPACE_FIXTURE = path.resolve(
  ROOT_DIR,
  '../../tests/fixtures/workspace'
);

const {
  LLM_PHASES,
  PHASES,
  PHASE_TITLES,
  describeAdapterInvocation,
  needsLlmRunner,
  phaseTitle,
  resolvePhases,
  runAdapterInvocation,
  scripts,
} = require('..');

function ensureFile(pathname) {
  if (!fs.existsSync(pathname)) {
    throw new Error(`Expected file to exist: ${pathname}`);
  }

  if (!fs.statSync(pathname).isFile()) {
    throw new Error(`Expected regular file: ${pathname}`);
  }
}

function ensureExecutable(pathname) {
  fs.accessSync(pathname, fs.constants.X_OK);
}

function ensureBashSyntax(pathname) {
  const result = spawnSync('bash', ['-n', pathname], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `bash -n failed for ${pathname}\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`
    );
  }
}

function makeTempWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-pipeline-validate-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  fs.cpSync(WORKSPACE_FIXTURE, workspaceRoot, { recursive: true });
  return {
    tempRoot,
    workspaceRoot,
  };
}

function makeFakeCodexRunner(tempRoot) {
  const runnerPath = path.join(tempRoot, 'fake-codex.js');
  const outputPath = path.join(tempRoot, 'fake-codex-output.json');

  fs.writeFileSync(
    runnerPath,
    `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

const stdin = fs.readFileSync(0, 'utf8');
fs.writeFileSync(
  ${JSON.stringify(outputPath)},
  JSON.stringify(
    {
      args: process.argv.slice(2),
      prompt: stdin,
    },
    null,
    2
  ) + '\\n',
  'utf8'
);
`,
    'utf8'
  );
  fs.chmodSync(runnerPath, 0o755);

  return {
    outputPath,
    runnerPath,
  };
}

function main() {
  assert.deepEqual(PHASES, ['extract', 'curate', 'apply', 'verify']);
  assert.deepEqual(LLM_PHASES, ['extract', 'curate']);
  assert.equal(PHASE_TITLES.extract, 'Phase A — extract');
  assert.equal(PHASE_TITLES.verify, 'Phase D — verify');
  assert.deepEqual(resolvePhases('all'), PHASES);
  assert.deepEqual(resolvePhases('verify'), ['verify']);
  assert.equal(needsLlmRunner(['verify']), false);
  assert.equal(needsLlmRunner(['apply']), false);
  assert.equal(needsLlmRunner(['extract', 'verify']), true);
  assert.equal(phaseTitle('curate'), 'Phase B — curate');
  assert.equal(phaseTitle('custom'), 'custom');

  assert.equal(path.resolve(scripts.pipeline || ''), BIN_PATH);
  assert.equal(path.resolve(scripts.llmPhaseRunner || ''), LLM_RUNNER_BIN_PATH);

  ensureFile(BIN_PATH);
  ensureExecutable(BIN_PATH);
  ensureBashSyntax(BIN_PATH);
  ensureFile(LLM_RUNNER_BIN_PATH);

  ensureFile(WRAPPER_PATH);
  ensureExecutable(WRAPPER_PATH);
  ensureBashSyntax(WRAPPER_PATH);

  const wrapperContents = fs.readFileSync(WRAPPER_PATH, 'utf8');
  if (
    !wrapperContents.includes('memory-pipeline/bin/run-pipeline.sh') ||
    !wrapperContents.includes('../memory-pipeline/bin/run-pipeline.sh')
  ) {
    throw new Error(
      'Expected adapter wrapper to support bundled and workspace memory-pipeline paths'
    );
  }

  const binContents = fs.readFileSync(BIN_PATH, 'utf8');
  for (const title of Object.values(PHASE_TITLES)) {
    if (!binContents.includes(title)) {
      throw new Error(`Expected package pipeline script to include phase title: ${title}`);
    }
  }
  if (binContents.includes('nmc-memory-plugin/skills/memory-verify/verify.sh')) {
    throw new Error('Expected package pipeline script to avoid compatibility-shell verify defaults');
  }
  if (!binContents.includes('memory-scripts/bin/verify.sh')) {
    throw new Error('Expected package pipeline script to default to the shared verify script package');
  }
  if (!binContents.includes('run-llm-phase.js')) {
    throw new Error('Expected package pipeline script to resolve the sibling run-llm-phase.js helper');
  }

  assert.equal(
    describeAdapterInvocation({
      adapterModule: path.resolve(ROOT_DIR, '../adapter-openclaw'),
      phase: 'extract',
      date: '2026-03-05',
      llmRunner: 'openclaw',
      memoryRoot: '/tmp/workspace/system/memory',
    }),
    'openclaw skill run memory-extract --date 2026-03-05'
  );
  const codexWorkspace = makeTempWorkspace();
  try {
    const fakeCodex = makeFakeCodexRunner(codexWorkspace.tempRoot);
    const codexDescribe = describeAdapterInvocation({
      adapterModule: './packages/adapter-codex',
      phase: 'curate',
      date: '2026-03-05',
      llmRunner: fakeCodex.runnerPath,
      memoryRoot: codexWorkspace.workspaceRoot,
    });
    assert.match(codexDescribe, /exec --skip-git-repo-check/);

    const codexRun = runAdapterInvocation({
      adapterModule: './packages/adapter-codex',
      phase: 'curate',
      date: '2026-03-05',
      llmRunner: fakeCodex.runnerPath,
      memoryRoot: codexWorkspace.workspaceRoot,
    });
    assert.equal(codexRun.status, 0);

    const fakeOutput = JSON.parse(fs.readFileSync(fakeCodex.outputPath, 'utf8'));
    assert.equal(fakeOutput.args[0], 'exec');
    assert.equal(fakeOutput.args[fakeOutput.args.length - 1], '-');
    assert.match(fakeOutput.prompt, /MemoryOS curator running through adapter-codex/);
    assert.match(fakeOutput.prompt, /intake\/pending\/2026-03-05\.md/);
    assert.doesNotMatch(fakeOutput.prompt, /OpenClaw session paths/);
  } finally {
    fs.rmSync(codexWorkspace.tempRoot, { recursive: true, force: true });
  }

  const dryRunCli = spawnSync(
    process.execPath,
    [
      LLM_RUNNER_BIN_PATH,
      'describe',
      '--adapter-module',
      path.resolve(ROOT_DIR, '../adapter-openclaw'),
      '--phase',
      'curate',
      '--date',
      '2026-03-05',
      '--memory-root',
      '/tmp/workspace/system/memory',
      '--llm-runner',
      'openclaw',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(dryRunCli.status, 0, dryRunCli.stderr);
  assert.equal(dryRunCli.stdout.trim(), 'openclaw skill run memory-curate --date 2026-03-05');

  const codexDryRunWorkspace = makeTempWorkspace();
  try {
    const fakeCodex = makeFakeCodexRunner(codexDryRunWorkspace.tempRoot);
    const codexDryRunCli = spawnSync(
      process.execPath,
      [
        LLM_RUNNER_BIN_PATH,
        'describe',
        '--adapter-module',
        './packages/adapter-codex',
        '--phase',
        'extract',
        '--date',
        '2026-03-05',
        '--memory-root',
        codexDryRunWorkspace.workspaceRoot,
        '--llm-runner',
        fakeCodex.runnerPath,
      ],
      {
        cwd: path.resolve(ROOT_DIR, '../..'),
        encoding: 'utf8',
      }
    );
    assert.equal(codexDryRunCli.status, 0, codexDryRunCli.stderr);
    assert.match(codexDryRunCli.stdout.trim(), /exec --skip-git-repo-check/);
  } finally {
    fs.rmSync(codexDryRunWorkspace.tempRoot, { recursive: true, force: true });
  }

  const applyDryRunCli = spawnSync(
    process.execPath,
    [
      LLM_RUNNER_BIN_PATH,
      'describe',
      '--phase',
      'apply',
      '--date',
      '2026-03-05',
      '--memory-root',
      '/tmp/workspace/system/memory',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(applyDryRunCli.status, 0, applyDryRunCli.stderr);
  assert.equal(
    applyDryRunCli.stdout.trim(),
    'core-promoter (in-process) --memory-root /tmp/workspace/system/memory --batch-date 2026-03-05'
  );

  const tempWorkspace = makeTempWorkspace();
  try {
    const runResult = runAdapterInvocation({
      adapterModule: path.resolve(ROOT_DIR, '../adapter-openclaw'),
      phase: 'apply',
      date: '2026-03-05',
      llmRunner: 'true',
      memoryRoot: tempWorkspace.workspaceRoot,
    });
    assert.equal(runResult.status, 0);
    assert.equal(
      fs.existsSync(path.join(tempWorkspace.workspaceRoot, 'intake/processed/2026-03-05.md')),
      true
    );
  } finally {
    fs.rmSync(tempWorkspace.tempRoot, { recursive: true, force: true });
  }

  console.log('Validated pipeline contract assertions through @nmc/memory-pipeline.');
}

main();
