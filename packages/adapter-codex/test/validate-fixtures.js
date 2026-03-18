'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadAdapterConformance() {
  try {
    return require('adapter-conformance');
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes('adapter-conformance')
    ) {
      throw error;
    }

    return require('../../adapter-conformance');
  }
}

const { runAdapterConformanceSuite } = loadAdapterConformance();

const {
  CODEX_ADAPTER_CAPABILITIES,
  attachCodexRole,
  createCodexConformanceAdapter,
  runCodexSingleThread,
} = require('..');

const WORKSPACE_FIXTURE = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/tests/fixtures/workspace'
);

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-codex-validate-'));
}

function main() {
  const conformanceRoot = makeTempRoot();

  try {
    const sharedSkillsRoot = path.join(conformanceRoot, 'shared-skills');
    fs.mkdirSync(sharedSkillsRoot, { recursive: true });

    const conformance = runAdapterConformanceSuite({
      adapter: createCodexConformanceAdapter(),
      fixture: {
        installDate: '2026-03-18',
        memoryRoot: WORKSPACE_FIXTURE,
        workspaceFixture: WORKSPACE_FIXTURE,
        sharedSkillsRoot,
        roleId: 'arx',
        recordId: 'fct-2026-03-05-001',
        projectionRecordId: 'st-2026-03-05-001',
      },
    });

    assert.deepEqual(conformance.capabilities, [
      'roleBundle',
      'bootstrapRole',
      'canonicalRead',
      'projectionRead',
      'status',
      'verify',
      'cliStatus',
    ]);
    assert.equal(CODEX_ADAPTER_CAPABILITIES.writeOrchestration, undefined);
  } finally {
    fs.rmSync(conformanceRoot, { recursive: true, force: true });
  }

  const executionRoot = makeTempRoot();

  try {
    const workspaceDir = path.join(executionRoot, 'arx');
    const systemRoot = path.join(executionRoot, 'system');
    const sharedSkillsRoot = path.join(executionRoot, 'shared-skills');
    fs.mkdirSync(systemRoot, { recursive: true });
    fs.mkdirSync(sharedSkillsRoot, { recursive: true });

    const run = runCodexSingleThread({
      roleId: 'arx',
      workspaceDir,
      systemRoot,
      memoryRoot: WORKSPACE_FIXTURE,
      sharedSkillsRoot,
      installDate: '2026-03-18',
      operation: 'status',
    });
    assert.equal(run.executionMode, 'single-thread');
    assert.equal(run.readOnly, true);
    assert.equal(run.result.manifest.recordCounts.facts, 0);
    assert.equal(run.result.intake.pendingFiles, 1);
    assert.equal(fs.existsSync(path.join(workspaceDir, 'BOOT.md')), true);

    const attachment = attachCodexRole({
      roleId: 'arx',
      workspaceDir,
      systemRoot,
      memoryRoot: WORKSPACE_FIXTURE,
      sharedSkillsRoot,
      installDate: '2026-03-18',
    });
    assert.equal(attachment.kind, 'role-attachment');
    assert.equal(attachment.workspace.bootExists, true);
    assert.equal(attachment.workspace.skillsLinked, true);
    assert.equal(attachment.workspace.systemLinked, true);
    assert.equal(attachment.role.id, 'arx');
  } finally {
    fs.rmSync(executionRoot, { recursive: true, force: true });
  }

  console.log(
    'Validated adapter-codex bootstrap, read-only single-thread execution, and shared conformance fixtures.'
  );
}

main();
