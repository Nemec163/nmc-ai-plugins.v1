'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gateway = require('../../memory-os-gateway');
const { runAdapterConformanceSuite } = require('..');

const ROOT = path.resolve(__dirname, '../../..');
const ADAPTER_ROOT = path.join(ROOT, 'packages', 'adapter-openclaw');
const ADAPTER_SKILLS_ROOT = path.join(ADAPTER_ROOT, 'skills');
const CLI_PATH = path.join(ROOT, 'packages', 'memory-os-gateway', 'bin', 'memory-os-gateway.js');

function invokeCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
  });
}

function main() {
  const result = runAdapterConformanceSuite({
    adapter: {
      name: 'gateway-fixture-adapter',
      capabilities: {
        roleBundle: true,
        bootstrapRole: true,
        bootstrapWorkspace: true,
        canonicalRead: true,
        projectionRead: true,
        status: true,
        verify: true,
        writeOrchestration: true,
        cliStatus: true,
      },
      bootstrap: gateway.bootstrap,
      completeJob: gateway.completeJob,
      feedback: gateway.feedback,
      getCanonicalCurrent: gateway.getCanonicalCurrent,
      getProjection: gateway.getProjection,
      getRoleBundle: gateway.getRoleBundle,
      getStatus: gateway.getStatus,
      invokeCli,
      propose: gateway.propose,
      readRecord: gateway.readRecord,
      verify: gateway.verify,
    },
    fixture: {
      installDate: '2026-03-18',
      memoryRoot: path.join(ROOT, 'tests', 'fixtures', 'workspace'),
      workspaceFixture: path.join(ROOT, 'tests', 'fixtures', 'workspace'),
      systemTemplateRoot: path.join(ADAPTER_ROOT, 'templates', 'workspace-system'),
      memoryTemplateRoot: path.join(ADAPTER_ROOT, 'templates', 'workspace-memory'),
      skillsSourceRoot: ADAPTER_SKILLS_ROOT,
      sharedSkillsRoot: ADAPTER_SKILLS_ROOT,
      roleId: 'mnemo',
      recordId: 'fct-2026-03-05-001',
      projectionRecordId: 'st-2026-03-05-001',
      expectedBacklogAlert: false,
    },
  });

  assert.equal(result.adapter, 'gateway-fixture-adapter');
  assert.equal(result.capabilities.includes('cliStatus'), true);
  console.log('Validated shared adapter conformance fixtures.');
}

main();
