'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_PATH = path.join(ROOT_DIR, 'bin', 'run-pipeline.sh');
const WRAPPER_PATH = path.resolve(
  ROOT_DIR,
  '../../nmc-memory-plugin/skills/memory-pipeline/pipeline.sh'
);

const {
  LLM_PHASES,
  PHASES,
  PHASE_TITLES,
  needsLlmRunner,
  phaseTitle,
  resolvePhases,
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

function main() {
  assert.deepEqual(PHASES, ['extract', 'curate', 'apply', 'verify']);
  assert.deepEqual(LLM_PHASES, ['extract', 'curate', 'apply']);
  assert.equal(PHASE_TITLES.extract, 'Phase A — extract');
  assert.equal(PHASE_TITLES.verify, 'Phase D — verify');
  assert.deepEqual(resolvePhases('all'), PHASES);
  assert.deepEqual(resolvePhases('verify'), ['verify']);
  assert.equal(needsLlmRunner(['verify']), false);
  assert.equal(needsLlmRunner(['extract', 'verify']), true);
  assert.equal(phaseTitle('curate'), 'Phase B — curate');
  assert.equal(phaseTitle('custom'), 'custom');

  assert.equal(path.resolve(scripts.pipeline || ''), BIN_PATH);

  ensureFile(BIN_PATH);
  ensureExecutable(BIN_PATH);
  ensureBashSyntax(BIN_PATH);

  ensureFile(WRAPPER_PATH);
  ensureExecutable(WRAPPER_PATH);
  ensureBashSyntax(WRAPPER_PATH);

  const wrapperContents = fs.readFileSync(WRAPPER_PATH, 'utf8');
  if (!wrapperContents.includes('packages/memory-pipeline/bin/run-pipeline.sh')) {
    throw new Error('Expected plugin wrapper to target packages/memory-pipeline/bin/run-pipeline.sh');
  }

  const binContents = fs.readFileSync(BIN_PATH, 'utf8');
  for (const title of Object.values(PHASE_TITLES)) {
    if (!binContents.includes(title)) {
      throw new Error(`Expected package pipeline script to include phase title: ${title}`);
    }
  }

  console.log('Validated 15 pipeline contract assertions through @nmc/memory-pipeline.');
}

main();
