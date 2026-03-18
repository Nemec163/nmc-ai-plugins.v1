'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  bootstrap,
  completeJob,
  feedback,
  getCanonicalCurrent,
  getHealth,
  getOpsSnapshot,
  getProjection,
  getRoleBundle,
  getStatus,
  propose,
  query,
  readRecord,
  verify,
} = require('..');
const { acquireCanonWriteLock } = require('../../memory-canon');

const WORKSPACE_FIXTURE = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/tests/fixtures/workspace'
);
const FIXTURE_MEMORY_ROOT = WORKSPACE_FIXTURE;
const PLUGIN_ROOT = path.resolve(__dirname, '../../../nmc-memory-plugin');
const CLI_PATH = path.resolve(__dirname, '../bin/memory-os-gateway.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memory-os-gateway-validate-'));
}

function main() {
  const record = readRecord({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    recordId: 'fct-2026-03-05-001',
  });
  assert.equal(record.relativePath, 'core/user/knowledge/work.md');
  assert.equal(record.record.type, 'fact');
  assert.match(record.record.body, /high-volatility conditions/);

  const projection = getProjection({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    projectionPath: 'core/user/state/current.md',
  });
  assert.equal(projection.frontmatter.layer, 'L5');
  assert.equal(projection.records.length, 1);
  assert.equal(projection.records[0].recordId, 'st-2026-03-05-001');

  const current = getCanonicalCurrent({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(current.manifest.record_counts.events, 0);
  assert.equal(current.projections.identity.records.length, 0);
  assert.equal(current.projections.state.records[0].recordId, 'st-2026-03-05-001');

  const roleBundle = getRoleBundle({
    roleId: 'mnemo',
    installDate: '2026-03-18',
    memoryPath: '../system/memory',
    systemPath: '../system',
  });
  assert.equal(roleBundle.manifest.id, 'mnemo');
  assert.equal(typeof roleBundle.files['BOOT.md'], 'string');

  const search = query({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    text: 'What is the current approach on volatile mornings?',
  });
  assert.equal(search.freshnessBoundary.runtimeDeltaIncluded, true);
  assert.equal(search.canonicalHits[0].recordId, 'st-2026-03-05-001');
  assert.equal(
    search.runtimeDelta.some((hit) => hit.claimId === 'claim-20260305-003'),
    true
  );

  const status = getStatus({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(status.manifest.recordCounts.events, 0);
  assert.equal(status.intake.pendingFiles, 1);
  assert.equal(status.intake.backlogAlert, true);

  const health = getHealth({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(health.status, 'degraded');
  assert.equal(health.checks.some((check) => check.name === 'verify-script' && check.ok), true);

  const verifyRoot = makeTempRoot();
  try {
    const verifyWorkspaceRoot = path.join(verifyRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, verifyWorkspaceRoot, { recursive: true });
    const verification = verify({
      memoryRoot: verifyWorkspaceRoot,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(verification.status, 'ok');
    assert.equal(verification.edgesCount, 6);
    assert.equal(verification.manifest.record_counts.facts, 2);
  } finally {
    fs.rmSync(verifyRoot, { recursive: true, force: true });
  }

  const orchestrationRoot = makeTempRoot();
  try {
    const orchestrationWorkspaceRoot = path.join(orchestrationRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, orchestrationWorkspaceRoot, { recursive: true });

    const submission = propose({
      memoryRoot: orchestrationWorkspaceRoot,
      batchDate: '2026-03-18',
      proposalId: 'proposal-2026-03-18-fixture',
      source: 'gateway-test',
      claims: [
        {
          claim_id: 'claim-20260318-001',
          source_session: 'codex-2026-03-18-001',
          source_agent: 'mnemo',
          observed_at: '2026-03-18T12:00:00Z',
          confidence: 'high',
          tags: ['memory', 'gateway'],
          target_layer: 'L3',
          target_domain: 'work',
          claim:
            'The gateway write path should queue reviewed claims before legacy apply owns canon serialization.',
        },
      ],
    });
    assert.equal(submission.status, 'proposed');
    assert.equal(fs.existsSync(submission.proposalPath), true);

    const feedbackEntry = feedback({
      memoryRoot: orchestrationWorkspaceRoot,
      proposalId: submission.proposalId,
      feedback: [
        {
          claim_id: 'claim-20260318-001',
          curator_decision: 'accept',
          curator_notes: 'Pipeline-compatible handoff fixture.',
          actor: 'fixture-reviewer',
        },
      ],
    });
    assert.equal(feedbackEntry.status, 'ready-for-apply');
    assert.equal(
      fs.existsSync(path.join(orchestrationWorkspaceRoot, 'intake/pending/2026-03-18.md')),
      true
    );
    assert.match(
      fs.readFileSync(
        path.join(orchestrationWorkspaceRoot, 'intake/pending/2026-03-18.md'),
        'utf8'
      ),
      /curator_decision: "accept"/
    );

    const completed = completeJob({
      memoryRoot: orchestrationWorkspaceRoot,
      proposalId: submission.proposalId,
      holder: 'gateway-test',
    });
    assert.equal(completed.status, 'ready-for-handoff');
    assert.equal(fs.existsSync(completed.receiptPath), true);
    assert.equal(
      completed.receipt.write_path.lock_path.endsWith('core/meta/canon-write.lock.json'),
      true
    );
    assert.equal(
      completed.receipt.write_path.promotion_request.operation,
      'legacy-apply'
    );

    acquireCanonWriteLock({
      memoryRoot: orchestrationWorkspaceRoot,
      holder: 'ops-lock-holder',
      operation: 'legacy-apply',
      acquiredAt: '2026-03-18T14:00:00Z',
    });

    fs.writeFileSync(
      path.join(orchestrationWorkspaceRoot, 'intake/jobs/orphan-job.json'),
      `${JSON.stringify(
        {
          kind: 'job',
          schema_version: completed.receipt.schema_version,
          job_id: 'orphan-job',
          proposal_id: 'proposal-missing',
          batch_date: '2026-03-18',
          created_at: '2026-03-18T14:00:00Z',
          updated_at: '2026-03-18T14:00:00Z',
          status: 'ready-for-handoff',
          authoritative: false,
          pending_batch_path: 'intake/pending/2026-03-18.md',
          write_path: {
            implementation: 'legacy-apply',
            single_writer: completed.receipt.write_path.single_writer,
            promotion_request: completed.receipt.write_path.promotion_request,
            lock_path: completed.receipt.write_path.lock_path,
            lock: completed.receipt.write_path.lock,
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const opsSnapshot = getOpsSnapshot({
      memoryRoot: orchestrationWorkspaceRoot,
      updatedAt: '2026-03-18T15:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(opsSnapshot.temporary, true);
    assert.equal(opsSnapshot.proposals.count, 1);
    assert.equal(opsSnapshot.jobs.count, 2);
    assert.equal(opsSnapshot.lock.exists, true);
    assert.equal(opsSnapshot.degradedMode.active, true);
    assert.equal(
      opsSnapshot.conflicts.some((conflict) => conflict.code === 'orphan-job'),
      true
    );
    assert.equal(opsSnapshot.current.projections.state.records[0].recordId, 'st-2026-03-05-001');
  } finally {
    fs.rmSync(orchestrationRoot, { recursive: true, force: true });
  }

  const bootstrapRoot = makeTempRoot();
  try {
    const result = bootstrap({
      stateDir: path.join(bootstrapRoot, 'state'),
      workspaceRoot: path.join(bootstrapRoot, 'workspace'),
      systemRoot: path.join(bootstrapRoot, 'workspace', 'system'),
      memoryRoot: path.join(bootstrapRoot, 'workspace', 'system', 'memory'),
      systemTemplateRoot: path.join(PLUGIN_ROOT, 'templates', 'workspace-system'),
      memoryTemplateRoot: path.join(PLUGIN_ROOT, 'templates', 'workspace-memory'),
      skillsSourceRoot: path.join(PLUGIN_ROOT, 'skills'),
      installDate: '2026-03-18',
    });

    assert.equal(result.agents.length, 5);
    assert.equal(fs.existsSync(path.join(bootstrapRoot, 'workspace', 'nyx', 'BOOT.md')), true);
    assert.equal(
      fs.lstatSync(path.join(bootstrapRoot, 'workspace', 'system', 'skills', 'memory-query')).isSymbolicLink(),
      true
    );
  } finally {
    fs.rmSync(bootstrapRoot, { recursive: true, force: true });
  }

  const cliResult = spawnSync(process.execPath, [CLI_PATH, 'status', '--memory-root', FIXTURE_MEMORY_ROOT], {
    encoding: 'utf8',
  });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).manifest.recordCounts.events, 0);

  const cliOpsResult = spawnSync(
    process.execPath,
    [CLI_PATH, 'ops-snapshot', '--memory-root', FIXTURE_MEMORY_ROOT, '--skip-verify'],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(cliOpsResult.status, 0, cliOpsResult.stderr);
  assert.equal(JSON.parse(cliOpsResult.stdout).temporary, true);

  const cliWriteRoot = makeTempRoot();
  try {
    const cliWorkspaceRoot = path.join(cliWriteRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, cliWorkspaceRoot, { recursive: true });
    const claimsFile = path.join(cliWriteRoot, 'claims.json');
    fs.writeFileSync(
      claimsFile,
      JSON.stringify(
        [
          {
            claim_id: 'claim-20260318-002',
            source_session: 'cli-2026-03-18-001',
            source_agent: 'mnemo',
            observed_at: '2026-03-18T13:00:00Z',
            confidence: 'medium',
            tags: ['cli'],
            target_layer: 'L3',
            target_domain: 'preferences',
            claim: 'CLI orchestration should write proposals without direct canon access.',
          },
        ],
        null,
        2
      )
    );

    const cliPropose = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'propose',
        '--memory-root',
        cliWorkspaceRoot,
        '--batch-date',
        '2026-03-18',
        '--claims-file',
        claimsFile,
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliPropose.status, 0, cliPropose.stderr);
    assert.equal(JSON.parse(cliPropose.stdout).status, 'proposed');
  } finally {
    fs.rmSync(cliWriteRoot, { recursive: true, force: true });
  }

  console.log(
    'Validated read, bootstrap, safe write orchestration, query, status, verify, health, and CLI flows through memory-os-gateway.'
  );
}

main();
