'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  getControlPlaneAnalytics,
  getControlPlaneAudits,
  getControlPlaneHealth,
  getControlPlaneInterventions,
  getControlPlaneQueues,
  getControlPlaneRuntimeInspector,
  getControlPlaneSnapshot,
  recordControlPlaneIntervention,
} = require('..');
const { acquireCanonWriteLock } = require('../../memory-canon');
const { captureRuntime, completeJob, feedback, propose } = require('../../memory-os-gateway');

const MEMORY_FIXTURE = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/tests/fixtures/workspace'
);
const SYSTEM_TEMPLATE = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/templates/workspace-system'
);
const CLI_PATH = path.resolve(__dirname, '../bin/memory-control-plane.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'control-plane-validate-'));
}

function writeTask(taskPath, body) {
  fs.writeFileSync(taskPath, `${body}\n`, 'utf8');
}

function buildWorkspaceFixture() {
  const root = makeTempRoot();
  const workspaceRoot = path.join(root, 'workspace');
  const systemRoot = path.join(workspaceRoot, 'system');
  const memoryRoot = path.join(systemRoot, 'memory');

  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.cpSync(SYSTEM_TEMPLATE, systemRoot, { recursive: true });
  fs.cpSync(MEMORY_FIXTURE, memoryRoot, { recursive: true });

  writeTask(
    path.join(systemRoot, 'tasks/active/T-100.md'),
    `---
id: T-100
title: Inspect degraded backlog
status: blocked
priority: P1
git_flow: inherit
autonomy: inherit
owner: mnemo
blocked_reason: Waiting on manual review
created_at: 2026-03-18T10:00:00Z
updated_at: 2026-03-18T10:00:00Z
---

Review the oldest pending intake batch before promotion.`
  );

  writeTask(
    path.join(systemRoot, 'tasks/active/T-101.md'),
    `---
id: T-101
title: Verify runtime shadow monitor
status: review
priority: P2
git_flow: inherit
autonomy: inherit
owner: nyx
next_action: Confirm the runtime snapshot remains read-only
created_at: 2026-03-18T11:00:00Z
updated_at: 2026-03-18T11:00:00Z
---

Confirm the control-plane view does not imply runtime authority.`
  );

  const submission = propose({
    memoryRoot,
    batchDate: '2026-03-18',
    proposalId: 'proposal-2026-03-18-control-plane',
    source: 'control-plane-test',
    claims: [
      {
        claim_id: 'claim-20260318-ctrl-001',
        source_session: 'codex-2026-03-18-ctrl',
        source_agent: 'mnemo',
        observed_at: '2026-03-18T12:00:00Z',
        confidence: 'high',
        tags: ['control-plane'],
        target_layer: 'L3',
        target_domain: 'work',
        claim: 'Control-plane should stay read-only while exposing handoff state.',
      },
    ],
  });

  feedback({
    memoryRoot,
    proposalId: submission.proposalId,
    feedback: [
      {
        claim_id: 'claim-20260318-ctrl-001',
        curator_decision: 'accept',
        curator_notes: 'Control-plane fixture approval.',
        actor: 'fixture-reviewer',
      },
    ],
  });

  const completed = completeJob({
    memoryRoot,
    proposalId: submission.proposalId,
    holder: 'control-plane-test',
  });

  acquireCanonWriteLock({
    memoryRoot,
    holder: 'control-plane-lock-holder',
    operation: 'core-promoter',
    acquiredAt: '2026-03-18T14:00:00Z',
  });

  fs.writeFileSync(
    path.join(memoryRoot, 'intake/jobs/orphan-job.json'),
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
          implementation: 'core-promoter',
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

  captureRuntime({
    memoryRoot,
    runId: 'runtime-run-2026-03-18-control-plane',
    source: 'control-plane-fixture',
    capturedAt: '2026-03-18T14:15:00Z',
    artifacts: {
      episodic: [
        {
          id: 'epi-1',
          summary: 'Operator reviewed queue degradation',
          text: 'Operator reviewed queue degradation before handoff reconcile.',
          observedAt: '2026-03-18T14:10:00Z',
          tags: ['control-plane', 'handoff'],
        },
      ],
      retrievalTraces: [
        {
          id: 'trace-1',
          summary: 'Runtime recall for orphan job',
          text: 'Recall highlighted orphan job conflict during runtime inspection.',
          observedAt: '2026-03-18T14:12:00Z',
          tags: ['orphan-job'],
        },
      ],
    },
    runtimeInputs: [
      {
        kind: 'operator-query',
        text: 'Inspect orphan job before retrying handoff.',
      },
    ],
  });

  return {
    root,
    memoryRoot,
    systemRoot,
  };
}

function main() {
  const fixture = buildWorkspaceFixture();

  try {
    const queues = getControlPlaneQueues({
      memoryRoot: fixture.memoryRoot,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(queues.kind, 'control-plane-queues');
    assert.equal(queues.proposals.count, 1);
    assert.equal(queues.proposals.byStatus['ready-for-handoff'], 1);
    assert.equal(queues.jobs.count, 2);
    assert.equal(queues.conflicts.count >= 1, true);
    assert.equal(
      queues.conflicts.items.some((conflict) => conflict.code === 'orphan-job'),
      true
    );
    assert.equal(
      queues.conflicts.items
        .find((conflict) => conflict.code === 'orphan-job')
        .availableActions.some((action) => action.actionId === 'request-handoff-reconcile'),
      true
    );

    const emptyInterventions = getControlPlaneInterventions({
      memoryRoot: fixture.memoryRoot,
    });
    assert.equal(emptyInterventions.kind, 'control-plane-interventions');
    assert.equal(emptyInterventions.summary.totalCount, 0);
    assert.equal(
      emptyInterventions.availableActions.some(
        (action) => action.actionId === 'request-handoff-reconcile'
      ),
      true
    );

    const recordedIntervention = recordControlPlaneIntervention({
      memoryRoot: fixture.memoryRoot,
      action: 'request-handoff-reconcile',
      targetKind: 'conflict',
      conflictCode: 'orphan-job',
      jobId: 'orphan-job',
      actor: 'fixture-operator',
      note: 'Inspect orphan job before retrying handoff.',
      requestedAt: '2026-03-18T14:30:00Z',
    });
    assert.equal(fs.existsSync(recordedIntervention.filePath), true);
    assert.equal(recordedIntervention.record.status, 'requested');

    const interventions = getControlPlaneInterventions({
      memoryRoot: fixture.memoryRoot,
    });
    assert.equal(interventions.summary.totalCount, 1);
    assert.equal(interventions.summary.openCount, 1);
    assert.equal(interventions.items[0].actionId, 'request-handoff-reconcile');

    const snapshot = getControlPlaneSnapshot({
      memoryRoot: fixture.memoryRoot,
      systemRoot: fixture.systemRoot,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(snapshot.kind, 'control-plane-snapshot');
    assert.equal(snapshot.operatorSurface.readOnly, true);
    assert.equal(snapshot.operatorSurface.runtimeAuthoritative, false);
    assert.equal(snapshot.operatorSurface.handoffVisibility, 'control-plane-owned');
    assert.equal(snapshot.runtime.authoritative, false);
    assert.equal(snapshot.gateway.current.projections.state.records[0].recordId, 'st-2026-03-05-001');
    assert.equal(snapshot.queues.proposals.count, 1);
    assert.equal(snapshot.queues.jobs.count, 2);
    assert.equal(snapshot.queues.lock.exists, true);
    assert.equal(snapshot.analytics.kind, 'control-plane-analytics');
    assert.equal(snapshot.audits.kind, 'control-plane-audits');
    assert.equal(snapshot.runtime.inspector.kind, 'control-plane-runtime-inspector');
    assert.equal(snapshot.runtime.inspector.authoritative, false);
    assert.equal(
      snapshot.queues.conflicts.items.some((conflict) => conflict.code === 'orphan-job'),
      true
    );
    assert.equal(snapshot.interventions.summary.openCount, 1);
    assert.equal(snapshot.maintainer.policyOwnedBy, '@nmc/memory-maintainer');
    assert.equal(snapshot.maintainer.board.settings.valid, true);
    assert.equal(snapshot.maintainer.board.tasks.total, 2);
    assert.equal(snapshot.maintainer.board.tasks.byStatus.blocked, 1);
    assert.equal(snapshot.maintainer.board.tasks.byStatus.review, 1);
    assert.equal(snapshot.maintainer.board.invalidTasks.count, 0);

    const analytics = getControlPlaneAnalytics({
      memoryRoot: fixture.memoryRoot,
      systemRoot: fixture.systemRoot,
      today: '2026-03-18',
    });
    assert.equal(analytics.kind, 'control-plane-analytics');
    assert.equal(analytics.queues.proposals, 1);
    assert.equal(analytics.queues.conflictCodes['orphan-job'], 1);
    assert.equal(analytics.runtime.runCount, 1);
    assert.equal(analytics.runtime.busiestBuckets[0].bucket, 'episodic');

    const audits = getControlPlaneAudits({
      memoryRoot: fixture.memoryRoot,
      updatedAt: '2026-03-20T00:00:00Z',
      today: '2026-03-20',
      staleAfterDays: 0,
      auditLimit: 20,
    });
    assert.equal(audits.kind, 'control-plane-audits');
    assert.equal(audits.summary.totalEntries >= 1, true);
    assert.equal(audits.summary.staleCount >= 1, true);
    assert.equal(
      audits.trail.some((item) => item.category === 'lock'),
      true
    );
    assert.equal(
      audits.trail.some((item) => item.category === 'runtime-run'),
      true
    );

    const runtimeInspector = getControlPlaneRuntimeInspector({
      memoryRoot: fixture.memoryRoot,
      today: '2026-03-18',
      updatedAt: '2026-03-18T23:00:00Z',
    });
    assert.equal(runtimeInspector.kind, 'control-plane-runtime-inspector');
    assert.equal(runtimeInspector.summary.runCount, 1);
    assert.equal(runtimeInspector.summary.totalArtifacts, 2);
    assert.equal(runtimeInspector.freshness.ageDays, 0);
    assert.equal(runtimeInspector.freshness.runtimeAuthoritative, false);

    const degradedHealth = getControlPlaneHealth({
      memoryRoot: fixture.memoryRoot,
      systemRoot: fixture.systemRoot,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(degradedHealth.kind, 'control-plane-health');
    assert.equal(degradedHealth.status, 'degraded');
    assert.equal(
      degradedHealth.checks.some(
        (check) => check.name === 'queue-degraded-mode' && check.ok === false
      ),
      true
    );
    assert.equal(
      degradedHealth.checks.some(
        (check) => check.name === 'manual-intervention-log' && check.ok === true
      ),
      true
    );
    assert.equal(
      degradedHealth.checks.some(
        (check) => check.name === 'operator-analytics-surface' && check.ok === true
      ),
      true
    );
    assert.equal(
      degradedHealth.checks.some(
        (check) => check.name === 'operator-audits-surface' && check.ok === true
      ),
      true
    );
    assert.equal(degradedHealth.warnings.includes('orphan-job'), true);
    assert.equal(degradedHealth.summary.openInterventionCount, 1);
    assert.equal(degradedHealth.summary.auditEntryCount >= 1, true);

    writeTask(
      path.join(fixture.systemRoot, 'tasks/active/T-102.md'),
      `---
id: T-102
title: Broken task fixture
status: invalid
priority: P2
git_flow: inherit
autonomy: inherit
created_at: 2026-03-18T12:00:00Z
updated_at: 2026-03-18T12:00:00Z
---

This fixture forces the health monitor into degraded mode.`
    );

    const health = getControlPlaneHealth({
      memoryRoot: fixture.memoryRoot,
      systemRoot: fixture.systemRoot,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(health.kind, 'control-plane-health');
    assert.equal(health.status, 'degraded');
    assert.equal(
      health.checks.some((check) => check.name === 'runtime-non-authoritative' && check.ok),
      true
    );
    assert.equal(
      health.checks.some(
        (check) => check.name === 'maintainer-task-frontmatter' && check.ok === false
      ),
      true
    );
    assert.equal(
      health.warnings.includes('Invalid task T-102'),
      true
    );

    const cliSnapshot = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'snapshot',
        '--memory-root',
        fixture.memoryRoot,
        '--system-root',
        fixture.systemRoot,
        '--updated-at',
        '2026-03-18T00:00:00Z',
        '--today',
        '2026-03-18',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliSnapshot.status, 0, cliSnapshot.stderr);
    const cliSnapshotJson = JSON.parse(cliSnapshot.stdout);
    assert.equal(cliSnapshotJson.maintainer.board.tasks.total, 3);
    assert.equal(cliSnapshotJson.queues.proposals.count, 1);
    assert.equal(cliSnapshotJson.interventions.summary.openCount, 1);
    assert.equal(cliSnapshotJson.analytics.summary.runtimeRunCount, 1);
    assert.equal(cliSnapshotJson.runtime.inspector.summary.runCount, 1);

    const cliHealth = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'health',
        '--memory-root',
        fixture.memoryRoot,
        '--system-root',
        fixture.systemRoot,
        '--updated-at',
        '2026-03-18T00:00:00Z',
        '--today',
        '2026-03-18',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliHealth.status, 0, cliHealth.stderr);
    assert.equal(JSON.parse(cliHealth.stdout).status, 'degraded');

    const cliAnalytics = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'analytics',
        '--memory-root',
        fixture.memoryRoot,
        '--system-root',
        fixture.systemRoot,
        '--today',
        '2026-03-18',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliAnalytics.status, 0, cliAnalytics.stderr);
    assert.equal(JSON.parse(cliAnalytics.stdout).summary.runtimeRunCount, 1);

    const cliAudit = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'audits',
        '--memory-root',
        fixture.memoryRoot,
        '--updated-at',
        '2026-03-20T00:00:00Z',
        '--today',
        '2026-03-20',
        '--stale-after-days',
        '0',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliAudit.status, 0, cliAudit.stderr);
    assert.equal(JSON.parse(cliAudit.stdout).summary.staleCount >= 1, true);

    const cliQueues = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'queues',
        '--memory-root',
        fixture.memoryRoot,
        '--updated-at',
        '2026-03-18T00:00:00Z',
        '--today',
        '2026-03-18',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliQueues.status, 0, cliQueues.stderr);
    assert.equal(JSON.parse(cliQueues.stdout).conflicts.count >= 1, true);

    const cliRuntimeInspector = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'runtime-inspector',
        '--memory-root',
        fixture.memoryRoot,
        '--updated-at',
        '2026-03-18T23:00:00Z',
        '--today',
        '2026-03-18',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliRuntimeInspector.status, 0, cliRuntimeInspector.stderr);
    assert.equal(JSON.parse(cliRuntimeInspector.stdout).summary.runCount, 1);

    const cliRecordIntervention = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'record-intervention',
        '--memory-root',
        fixture.memoryRoot,
        '--action',
        'inspect-proposal',
        '--target-kind',
        'proposal',
        '--proposal-id',
        'proposal-2026-03-18-control-plane',
        '--actor',
        'cli-operator',
        '--note',
        'Inspect proposal before another handoff attempt.',
        '--requested-at',
        '2026-03-18T15:00:00Z',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliRecordIntervention.status, 0, cliRecordIntervention.stderr);
    assert.equal(JSON.parse(cliRecordIntervention.stdout).record.actionId, 'inspect-proposal');

    const cliInterventions = spawnSync(
      process.execPath,
      [CLI_PATH, 'interventions', '--memory-root', fixture.memoryRoot],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliInterventions.status, 0, cliInterventions.stderr);
    assert.equal(JSON.parse(cliInterventions.stdout).summary.totalCount, 2);

    const cliUsage = spawnSync(process.execPath, [CLI_PATH], {
      encoding: 'utf8',
    });
    assert.equal(cliUsage.status, 1);
    assert.match(cliUsage.stderr, /snapshot/);
    assert.match(cliUsage.stderr, /health/);
    assert.match(cliUsage.stderr, /analytics/);
    assert.match(cliUsage.stderr, /audits/);
    assert.match(cliUsage.stderr, /queues/);
    assert.match(cliUsage.stderr, /interventions/);
    assert.match(cliUsage.stderr, /runtime-inspector/);
    assert.match(cliUsage.stderr, /record-intervention/);
    assert.doesNotMatch(cliUsage.stderr, /propose|feedback|complete-job/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }

  console.log(
    'Validated the control-plane queue, advisory intervention, snapshot, and health surfaces over gateway/runtime/maintainer fixtures.'
  );
}

main();
