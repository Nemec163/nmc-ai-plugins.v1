'use strict';

const { getControlPlaneSnapshot } = require('./snapshot');

function getControlPlaneHealth(options = {}) {
  const snapshot = getControlPlaneSnapshot(options);
  const checks = [
    {
      name: 'gateway-health',
      ok: snapshot.gateway.health.ok,
      detail: snapshot.gateway.health.status,
    },
    {
      name: 'gateway-verify',
      ok:
        snapshot.gateway.verify.status === 'ok' ||
        snapshot.gateway.verify.status === 'skipped',
      detail: snapshot.gateway.verify.status,
    },
    {
      name: 'queue-read-model',
      ok: Array.isArray(snapshot.queues.conflicts.items),
      detail: `${snapshot.queues.proposals.count} proposals, ${snapshot.queues.jobs.count} jobs`,
    },
    {
      name: 'queue-degraded-mode',
      ok: snapshot.queues.degradedMode.active === false,
      detail: snapshot.queues.degradedMode.active
        ? snapshot.queues.degradedMode.reasons.join(', ')
        : 'clear',
    },
    {
      name: 'manual-intervention-log',
      ok: Array.isArray(snapshot.interventions.items),
      detail: `${snapshot.interventions.summary.openCount} open interventions`,
    },
    {
      name: 'maintainer-settings',
      ok: snapshot.maintainer.board.settings.valid,
      detail: snapshot.maintainer.board.settings.path,
    },
    {
      name: 'maintainer-task-root',
      ok: snapshot.maintainer.available,
      detail: snapshot.maintainer.board.tasksRoot,
    },
    {
      name: 'maintainer-task-frontmatter',
      ok: snapshot.maintainer.board.invalidTasks.count === 0,
      detail: `${snapshot.maintainer.board.invalidTasks.count} invalid task files`,
    },
    {
      name: 'runtime-non-authoritative',
      ok: snapshot.runtime.authoritative === false,
      detail: 'runtime shadow remains non-authoritative',
    },
    {
      name: 'read-only-surface',
      ok: snapshot.operatorSurface.readOnly === true,
      detail: 'control-plane does not own scheduler or promotion authority',
    },
  ];

  const warnings = [
    ...(Array.isArray(snapshot.gateway.health.warnings)
      ? snapshot.gateway.health.warnings
      : []),
    ...(snapshot.queues.degradedMode.active ? snapshot.queues.degradedMode.reasons : []),
    ...snapshot.interventions.errors.map(
      (error) => `Invalid intervention ${error.relativePath}`
    ),
    ...snapshot.maintainer.board.settings.issues.map((issue) => issue.message),
    ...snapshot.maintainer.board.invalidTasks.items.map(
      (task) => `Invalid task ${task.taskId || task.filePath}`
    ),
  ];

  return {
    kind: 'control-plane-health',
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    memoryRoot: snapshot.memoryRoot,
    systemRoot: snapshot.systemRoot,
    ok: checks.every((check) => check.ok),
    status: checks.every((check) => check.ok) ? 'healthy' : 'degraded',
    checks,
    warnings: Array.from(new Set(warnings)),
    summary: {
      backlogAlert: snapshot.queues.backlog ? snapshot.queues.backlog.backlogAlert : false,
      proposalCount: snapshot.queues.proposals.count,
      jobCount: snapshot.queues.jobs.count,
      conflictCount: snapshot.queues.conflicts.count,
      openInterventionCount: snapshot.interventions.summary.openCount,
      runtimeRunCount: snapshot.runtime.delta.runCount,
      taskCount: snapshot.maintainer.board.tasks.total,
      invalidTaskCount: snapshot.maintainer.board.invalidTasks.count,
    },
  };
}

module.exports = {
  getControlPlaneHealth,
  controlPlaneHealth: getControlPlaneHealth,
  health: getControlPlaneHealth,
};
