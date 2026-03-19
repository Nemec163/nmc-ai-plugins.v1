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
  CLAUDE_ADAPTER_CAPABILITIES,
  attachClaudeRole,
  createClaudeConformanceAdapter,
  runClaudeSession,
  runClaudeSessionHandoff,
} = require('..');

const WORKSPACE_FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/workspace'
);

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-claude-validate-'));
}

function main() {
  const conformanceRoot = makeTempRoot();

  try {
    const sharedSkillsRoot = path.join(conformanceRoot, 'shared-skills');
    fs.mkdirSync(sharedSkillsRoot, { recursive: true });

    const conformance = runAdapterConformanceSuite({
      adapter: createClaudeConformanceAdapter(),
      fixture: {
        installDate: '2026-03-18',
        memoryRoot: WORKSPACE_FIXTURE,
        workspaceFixture: WORKSPACE_FIXTURE,
        sharedSkillsRoot,
        roleId: 'mnemo',
        recordId: 'fct-2026-03-05-001',
        projectionRecordId: 'st-2026-03-05-001',
        expectedBacklogAlert: false,
      },
    });

    assert.deepEqual(conformance.capabilities, [
      'roleBundle',
      'bootstrapRole',
      'canonicalRead',
      'projectionRead',
      'status',
      'verify',
      'writeOrchestration',
      'cliStatus',
    ]);
    assert.equal(CLAUDE_ADAPTER_CAPABILITIES.writeOrchestration, true);
  } finally {
    fs.rmSync(conformanceRoot, { recursive: true, force: true });
  }

  const executionRoot = makeTempRoot();

  try {
    const workspaceDir = path.join(executionRoot, 'mnemo');
    const systemRoot = path.join(executionRoot, 'system');
    const sharedSkillsRoot = path.join(executionRoot, 'shared-skills');
    fs.mkdirSync(systemRoot, { recursive: true });
    fs.mkdirSync(sharedSkillsRoot, { recursive: true });

    const run = runClaudeSession({
      roleId: 'mnemo',
      workspaceDir,
      systemRoot,
      memoryRoot: WORKSPACE_FIXTURE,
      sharedSkillsRoot,
      installDate: '2026-03-18',
      operation: 'status',
    });
    assert.equal(run.executionMode, 'session');
    assert.equal(run.readOnly, true);
    assert.equal(run.result.manifest.recordCounts.facts, 2);
    assert.equal(run.result.intake.pendingFiles, 1);
    assert.equal(fs.existsSync(path.join(workspaceDir, 'BOOT.md')), true);

    const attachment = attachClaudeRole({
      roleId: 'mnemo',
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
    assert.equal(attachment.role.id, 'mnemo');
  } finally {
    fs.rmSync(executionRoot, { recursive: true, force: true });
  }

  const handoffRoot = makeTempRoot();

  try {
    const memoryRoot = path.join(handoffRoot, 'workspace');
    const workspaceDir = path.join(handoffRoot, 'mnemo');
    const systemRoot = path.join(handoffRoot, 'system');
    const sharedSkillsRoot = path.join(handoffRoot, 'shared-skills');
    const canonPath = path.join(memoryRoot, 'core/user/knowledge/work.md');
    fs.cpSync(WORKSPACE_FIXTURE, memoryRoot, { recursive: true });
    fs.mkdirSync(systemRoot, { recursive: true });
    fs.mkdirSync(sharedSkillsRoot, { recursive: true });
    const canonBefore = fs.readFileSync(canonPath, 'utf8');

    const handoff = runClaudeSessionHandoff({
      roleId: 'mnemo',
      workspaceDir,
      systemRoot,
      memoryRoot,
      sharedSkillsRoot,
      installDate: '2026-03-18',
      batchDate: '2026-03-18',
      proposalId: 'proposal-2026-03-18-claude-fixture',
      claims: [
        {
          claim_id: 'claim-20260318-101',
          source_session: 'claude-2026-03-18-001',
          source_agent: 'mnemo',
          observed_at: '2026-03-18T12:00:00Z',
          confidence: 'high',
          tags: ['memory', 'claude'],
          target_layer: 'L3',
          target_domain: 'work',
          claim: 'Claude bounded handoff should stop at gateway-mediated promoter handoff.',
        },
      ],
      feedback: [
        {
          claim_id: 'claim-20260318-101',
          curator_decision: 'accept',
          curator_notes: 'Approved for Claude bounded connector handoff.',
          actor: 'adapter-claude-test',
        },
      ],
      holder: 'adapter-claude-test',
    });

    assert.equal(handoff.kind, 'session-handoff');
    assert.equal(handoff.readOnly, false);
    assert.equal(handoff.intake.kind, 'role-bundle');
    assert.equal(handoff.intake.role.id, 'mnemo');
    assert.equal(handoff.status, 'ready-for-handoff');
    assert.equal(handoff.submission.status, 'proposed');
    assert.equal(handoff.review.status, 'ready-for-apply');
    assert.equal(handoff.completion.receipt.write_path.promotion_request.operation, 'core-promoter');
    assert.equal(
      fs.existsSync(path.join(memoryRoot, 'intake/proposals/proposal-2026-03-18-claude-fixture.json')),
      true
    );
    assert.equal(fs.existsSync(path.join(memoryRoot, 'intake/pending/2026-03-18.md')), true);
    assert.equal(
      fs.existsSync(path.join(memoryRoot, 'intake/jobs/proposal-2026-03-18-claude-fixture-apply.json')),
      true
    );
    assert.equal(fs.readFileSync(canonPath, 'utf8'), canonBefore);
  } finally {
    fs.rmSync(handoffRoot, { recursive: true, force: true });
  }

  const rejectedHandoffRoot = makeTempRoot();

  try {
    const memoryRoot = path.join(rejectedHandoffRoot, 'workspace');
    const workspaceDir = path.join(rejectedHandoffRoot, 'mnemo');
    const systemRoot = path.join(rejectedHandoffRoot, 'system');
    const sharedSkillsRoot = path.join(rejectedHandoffRoot, 'shared-skills');
    fs.cpSync(WORKSPACE_FIXTURE, memoryRoot, { recursive: true });
    fs.mkdirSync(systemRoot, { recursive: true });
    fs.mkdirSync(sharedSkillsRoot, { recursive: true });

    assert.throws(
      () =>
        runClaudeSessionHandoff({
          roleId: 'mnemo',
          workspaceDir,
          systemRoot,
          memoryRoot,
          sharedSkillsRoot,
          installDate: '2026-03-18',
          batchDate: '2026-03-18',
          proposalId: 'proposal-2026-03-18-claude-unreviewed',
          claims: [
            {
              claim_id: 'claim-20260318-102',
              source_session: 'claude-2026-03-18-002',
              source_agent: 'mnemo',
              observed_at: '2026-03-18T13:00:00Z',
              confidence: 'medium',
              tags: ['memory', 'claude'],
              target_layer: 'L3',
              target_domain: 'work',
              claim: 'Unreviewed Claude claims must not reach explicit completion.',
            },
          ],
        }),
      /requires reviewed claims/
    );
  } finally {
    fs.rmSync(rejectedHandoffRoot, { recursive: true, force: true });
  }

  console.log('Validated adapter-claude fixtures.');
}

main();
