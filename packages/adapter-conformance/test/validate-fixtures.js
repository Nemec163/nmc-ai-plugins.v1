'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gateway = require('../../memory-os-gateway');
const { runAdapterConformanceSuite } = require('..');

const ROOT = path.resolve(__dirname, '../../..');
const PLUGIN_ROOT = path.join(ROOT, 'nmc-memory-plugin');
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
      memoryRoot: path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'workspace'),
      workspaceFixture: path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'workspace'),
      systemTemplateRoot: path.join(PLUGIN_ROOT, 'templates', 'workspace-system'),
      memoryTemplateRoot: path.join(PLUGIN_ROOT, 'templates', 'workspace-memory'),
      skillsSourceRoot: path.join(PLUGIN_ROOT, 'skills'),
      sharedSkillsRoot: path.join(PLUGIN_ROOT, 'skills'),
      roleId: 'mnemo',
      recordId: 'fct-2026-03-05-001',
      projectionRecordId: 'st-2026-03-05-001',
    },
  });

  assert.equal(result.adapter, 'gateway-fixture-adapter');
  assert.equal(result.capabilities.includes('cliStatus'), true);
  console.log('Validated shared adapter conformance fixtures.');
}

main();
