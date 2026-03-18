'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SUPPORTED_CAPABILITIES = Object.freeze([
  'roleBundle',
  'bootstrapRole',
  'bootstrapWorkspace',
  'canonicalRead',
  'projectionRead',
  'status',
  'verify',
  'writeOrchestration',
  'cliStatus',
]);

function makeTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function assertMethod(adapter, methodName) {
  assert.equal(
    typeof adapter[methodName],
    'function',
    `Expected claimed capability method ${methodName}() to exist`
  );
}

function assertThrowsError(fn, message) {
  let thrown = null;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown instanceof Error, true, message);
}

function validateCapabilityClaims(capabilities) {
  assert.equal(
    capabilities != null && typeof capabilities === 'object' && !Array.isArray(capabilities),
    true,
    'Adapter capabilities must be an object'
  );

  for (const [name, enabled] of Object.entries(capabilities)) {
    assert.equal(
      SUPPORTED_CAPABILITIES.includes(name),
      true,
      `Unsupported adapter capability claim: ${name}`
    );
    assert.equal(
      typeof enabled,
      'boolean',
      `Capability ${name} must be a boolean claim`
    );
  }
}

function runRoleBundleCheck(adapter, fixture) {
  assertMethod(adapter, 'getRoleBundle');
  const roleBundle = adapter.getRoleBundle({
    roleId: fixture.roleId || 'mnemo',
    installDate: fixture.installDate,
    memoryPath: fixture.memoryPath || '../system/memory',
    systemPath: fixture.systemPath || '../system',
  });

  assert.equal(roleBundle.manifest.id, fixture.roleId || 'mnemo');
  assert.equal(typeof roleBundle.files['BOOT.md'], 'string');
}

function runBootstrapCheck(adapter, fixture) {
  assertMethod(adapter, 'bootstrap');
  const tempRoot = makeTempRoot('adapter-conformance-bootstrap-');

  try {
    const workspaceRoot = path.join(tempRoot, 'workspace');
    const systemRoot = path.join(workspaceRoot, 'system');
    const memoryRoot = path.join(systemRoot, 'memory');
    const result = adapter.bootstrap({
      stateDir: path.join(tempRoot, 'state'),
      workspaceRoot,
      systemRoot,
      memoryRoot,
      systemTemplateRoot: fixture.systemTemplateRoot,
      memoryTemplateRoot: fixture.memoryTemplateRoot,
      skillsSourceRoot: fixture.skillsSourceRoot,
      sharedSkillsRoot: fixture.sharedSkillsRoot || path.join(systemRoot, 'skills'),
      installDate: fixture.installDate,
    });

    assert.equal(Array.isArray(result.agents), true);
    assert.equal(result.agents.length > 0, true);
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, fixture.bootstrapWorkspaceRoleId || 'nyx', 'BOOT.md')),
      true
    );
    assert.equal(fs.existsSync(result.sharedSkills.root), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runRoleBootstrapCheck(adapter, fixture) {
  assertMethod(adapter, 'bootstrap');
  const tempRoot = makeTempRoot('adapter-conformance-role-');

  try {
    const workspaceDir = path.join(tempRoot, fixture.roleId || 'mnemo');
    const systemRoot = path.join(tempRoot, 'system');
    const memoryRoot = path.join(systemRoot, 'memory');
    fs.mkdirSync(systemRoot, { recursive: true });
    fs.mkdirSync(memoryRoot, { recursive: true });

    const result = adapter.bootstrap({
      roleId: fixture.roleId || 'mnemo',
      workspaceDir,
      sharedSkillsRoot: fixture.sharedSkillsRoot || fixture.skillsSourceRoot,
      systemRoot,
      memoryRoot,
      installDate: fixture.installDate,
    });

    assert.equal(result.kind, 'role');
    assert.equal(result.role.id, fixture.roleId || 'mnemo');
    assert.equal(fs.existsSync(path.join(workspaceDir, 'BOOT.md')), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCanonicalReadCheck(adapter, fixture) {
  assertMethod(adapter, 'readRecord');
  assertMethod(adapter, 'getCanonicalCurrent');

  const record = adapter.readRecord({
    memoryRoot: fixture.memoryRoot,
    recordId: fixture.recordId || 'fct-2026-03-05-001',
  });
  assert.equal(record.recordId, fixture.recordId || 'fct-2026-03-05-001');
  assert.equal(record.record.type, 'fact');

  const current = adapter.getCanonicalCurrent({
    memoryRoot: fixture.memoryRoot,
  });
  assert.equal(current.kind, 'canonical-current');
  assert.equal(
    current.projections.state.records.some(
      (recordEntry) => recordEntry.recordId === (fixture.projectionRecordId || 'st-2026-03-05-001')
    ),
    true
  );
}

function runProjectionReadCheck(adapter, fixture) {
  assertMethod(adapter, 'getProjection');
  const projection = adapter.getProjection({
    memoryRoot: fixture.memoryRoot,
    projectionPath: fixture.projectionPath || 'core/user/state/current.md',
  });

  assert.equal(projection.kind, 'projection');
  assert.equal(
    projection.records.some(
      (recordEntry) => recordEntry.recordId === (fixture.projectionRecordId || 'st-2026-03-05-001')
    ),
    true
  );
}

function runStatusCheck(adapter, fixture) {
  assertMethod(adapter, 'getStatus');
  const status = adapter.getStatus({
    memoryRoot: fixture.memoryRoot,
  });

  assert.equal(typeof status.manifest.recordCounts.facts, 'number');
  if (fixture.expectedFactCount != null) {
    assert.equal(status.manifest.recordCounts.facts, fixture.expectedFactCount);
  }
  assert.equal(status.intake.pendingFiles, fixture.expectedPendingFiles || 1);
  assert.equal(status.intake.backlogAlert, true);
}

function runVerifyCheck(adapter, fixture) {
  assertMethod(adapter, 'verify');
  const tempRoot = makeTempRoot('adapter-conformance-verify-');

  try {
    const verifyRoot = path.join(tempRoot, 'workspace');
    fs.cpSync(fixture.workspaceFixture, verifyRoot, { recursive: true });

    const verification = adapter.verify({
      memoryRoot: verifyRoot,
      updatedAt: fixture.updatedAt,
      today: fixture.installDate,
    });

    assert.equal(verification.status, 'ok');
    assert.equal(verification.edgesCount, 6);
    assert.equal(verification.manifest.record_counts.facts, 2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runWriteOrchestrationCheck(adapter, fixture) {
  assertMethod(adapter, 'propose');
  assertMethod(adapter, 'feedback');
  assertMethod(adapter, 'completeJob');

  const tempRoot = makeTempRoot('adapter-conformance-write-');

  try {
    const orchestrationRoot = path.join(tempRoot, 'workspace');
    fs.cpSync(fixture.workspaceFixture, orchestrationRoot, { recursive: true });

    const submission = adapter.propose({
      memoryRoot: orchestrationRoot,
      batchDate: fixture.installDate,
      proposalId: `proposal-${fixture.installDate}-fixture`,
      source: 'adapter-conformance',
      claims: [
        {
          claim_id: `claim-${fixture.installDate.replace(/-/g, '')}-001`,
          source_session: `adapter-${fixture.installDate}-001`,
          source_agent: 'mnemo',
          observed_at: `${fixture.installDate}T12:00:00Z`,
          confidence: 'high',
          tags: ['memory', 'adapter'],
          target_layer: 'L3',
          target_domain: 'work',
          claim: 'Shared adapter conformance should validate gateway-backed proposal handoff.',
        },
      ],
    });
    assert.equal(submission.status, 'proposed');

    const feedback = adapter.feedback({
      memoryRoot: orchestrationRoot,
      proposalId: submission.proposalId,
      feedback: [
        {
          claim_id: `claim-${fixture.installDate.replace(/-/g, '')}-001`,
          curator_decision: 'accept',
          curator_notes: 'Conformance fixture approval.',
          actor: 'adapter-conformance',
        },
      ],
    });
    assert.equal(feedback.status, 'ready-for-apply');
    assert.equal(
      fs.existsSync(path.join(orchestrationRoot, `intake/pending/${fixture.installDate}.md`)),
      true
    );

    const completed = adapter.completeJob({
      memoryRoot: orchestrationRoot,
      proposalId: submission.proposalId,
      holder: 'adapter-conformance',
    });
    assert.equal(completed.status, 'ready-for-handoff');
    assert.equal(completed.receipt.write_path.promotion_request.operation, 'core-promoter');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCliStatusCheck(adapter, fixture) {
  assertMethod(adapter, 'invokeCli');

  const okResult = adapter.invokeCli(['status', '--memory-root', fixture.memoryRoot]);
  assert.equal(okResult.status, 0, okResult.stderr);
  assert.equal(JSON.parse(okResult.stdout).manifest.recordCounts.facts >= 0, true);

  const missingRoot = path.join(fixture.memoryRoot, '__missing__');
  const missingResult = adapter.invokeCli(['status', '--memory-root', missingRoot]);
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stderr, /memory directory not found/);
}

function runErrorSemanticsCheck(adapter, fixture, capabilities) {
  if (capabilities.canonicalRead) {
    assertThrowsError(
      () => adapter.readRecord({ memoryRoot: fixture.memoryRoot }),
      'Claimed canonicalRead capability should surface adapter errors as Error instances'
    );
  }

  if (capabilities.status) {
    assertThrowsError(
      () => adapter.getStatus({}),
      'Claimed status capability should surface adapter errors as Error instances'
    );
  }

  if (capabilities.writeOrchestration) {
    assertThrowsError(
      () => adapter.propose({ memoryRoot: fixture.memoryRoot, batchDate: 'invalid', claims: [] }),
      'Claimed writeOrchestration capability should surface adapter errors as Error instances'
    );
  }
}

function runAdapterConformanceSuite(options) {
  const adapter = options.adapter;
  const fixture = options.fixture;

  assert.equal(
    adapter != null && typeof adapter === 'object' && !Array.isArray(adapter),
    true,
    'adapter is required'
  );
  assert.equal(
    fixture != null && typeof fixture === 'object' && !Array.isArray(fixture),
    true,
    'fixture is required'
  );
  assert.equal(typeof adapter.name, 'string');

  const capabilities = adapter.capabilities || {};
  validateCapabilityClaims(capabilities);

  if (capabilities.roleBundle) {
    runRoleBundleCheck(adapter, fixture);
  }
  if (capabilities.bootstrapWorkspace) {
    runBootstrapCheck(adapter, fixture);
  }
  if (capabilities.bootstrapRole) {
    runRoleBootstrapCheck(adapter, fixture);
  }
  if (capabilities.canonicalRead) {
    runCanonicalReadCheck(adapter, fixture);
  }
  if (capabilities.projectionRead) {
    runProjectionReadCheck(adapter, fixture);
  }
  if (capabilities.status) {
    runStatusCheck(adapter, fixture);
  }
  if (capabilities.verify) {
    runVerifyCheck(adapter, fixture);
  }
  if (capabilities.writeOrchestration) {
    runWriteOrchestrationCheck(adapter, fixture);
  }
  if (capabilities.cliStatus) {
    runCliStatusCheck(adapter, fixture);
  }
  runErrorSemanticsCheck(adapter, fixture, capabilities);

  return {
    adapter: adapter.name,
    capabilities: SUPPORTED_CAPABILITIES.filter((capability) => capabilities[capability]),
  };
}

module.exports = {
  SUPPORTED_CAPABILITIES,
  runAdapterConformanceSuite,
  validateCapabilityClaims,
};
