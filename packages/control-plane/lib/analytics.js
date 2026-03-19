'use strict';

const { getControlPlaneInterventions } = require('./interventions');
const { getMaintainerSnapshot } = require('./maintainer');
const { resolveMemoryRoot, resolveSystemRoot } = require('./paths');
const { getControlPlaneQueues } = require('./queues');
const { getControlPlaneRuntimeInspector } = require('./runtime-inspector');

function incrementCount(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = (map[normalized] || 0) + 1;
}

function buildInterventionActionCounts(items) {
  const byAction = {};
  const byTargetKind = {};

  for (const item of items) {
    incrementCount(byAction, item.actionId);
    incrementCount(byTargetKind, item.target && item.target.kind);
  }

  return { byAction, byTargetKind };
}

function buildAlerts({ queues, interventions, runtimeInspector, maintainer }) {
  const alerts = [];

  if (queues.backlog && queues.backlog.backlogAlert) {
    alerts.push({
      code: 'pending-intake-backlog',
      severity: 'warning',
      message: 'Pending intake backlog exceeds the expected operator threshold.',
    });
  }

  if (queues.conflicts.count > 0) {
    alerts.push({
      code: 'handoff-conflicts-present',
      severity: 'warning',
      message: `${queues.conflicts.count} queue conflicts require operator attention.`,
    });
  }

  if (interventions.summary.openCount > 0) {
    alerts.push({
      code: 'open-interventions-present',
      severity: 'info',
      message: `${interventions.summary.openCount} advisory interventions are still open.`,
    });
  }

  if (runtimeInspector.freshness.stale) {
    alerts.push({
      code: 'runtime-shadow-stale',
      severity: 'warning',
      message: 'Runtime shadow data is older than the configured freshness threshold.',
    });
  }

  if (runtimeInspector.reconciliation && runtimeInspector.reconciliation.ok === false) {
    alerts.push({
      code: 'runtime-shadow-reconciliation-drift',
      severity: 'warning',
      message: 'Runtime shadow reconciliation evidence drifted from current runtime records.',
    });
  }

  if (maintainer.board.invalidTasks.count > 0) {
    alerts.push({
      code: 'invalid-maintainer-tasks',
      severity: 'warning',
      message: `${maintainer.board.invalidTasks.count} maintainer task files are invalid.`,
    });
  }

  return alerts;
}

function buildDashboard({ queues, interventions, runtimeInspector, maintainer, alerts }) {
  return [
    {
      id: 'handoff',
      label: 'Handoff',
      status: queues.degradedMode.active ? 'degraded' : 'healthy',
      metrics: {
        proposals: queues.proposals.count,
        jobs: queues.jobs.count,
        conflicts: queues.conflicts.count,
        backlogAlert: queues.backlog ? queues.backlog.backlogAlert : false,
      },
    },
    {
      id: 'interventions',
      label: 'Interventions',
      status: interventions.summary.openCount > 0 ? 'attention' : 'clear',
      metrics: {
        total: interventions.summary.totalCount,
        open: interventions.summary.openCount,
      },
    },
    {
      id: 'runtime',
      label: 'Runtime',
      status: runtimeInspector.freshness.stale ? 'stale' : 'fresh',
      metrics: {
        runs: runtimeInspector.summary.runCount,
        totalArtifacts: runtimeInspector.summary.totalArtifacts,
        lastCapturedAt: runtimeInspector.freshness.lastCapturedAt,
      },
    },
    {
      id: 'maintainer',
      label: 'Maintainer',
      status: maintainer.board.invalidTasks.count > 0 ? 'degraded' : 'healthy',
      metrics: {
        totalTasks: maintainer.board.tasks.total,
        invalidTasks: maintainer.board.invalidTasks.count,
      },
    },
    {
      id: 'alerts',
      label: 'Alerts',
      status: alerts.length > 0 ? 'attention' : 'clear',
      metrics: {
        count: alerts.length,
      },
    },
  ];
}

function getControlPlaneAnalytics(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const systemRoot = resolveSystemRoot(options, memoryRoot);
  const queues = getControlPlaneQueues(options);
  const interventions = getControlPlaneInterventions({ memoryRoot });
  const runtimeInspector = getControlPlaneRuntimeInspector(options);
  const maintainer = getMaintainerSnapshot({ memoryRoot, systemRoot });
  const interventionCounts = buildInterventionActionCounts(interventions.items);
  const alerts = buildAlerts({
    queues,
    interventions,
    runtimeInspector,
    maintainer,
  });

  return {
    kind: 'control-plane-analytics',
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    memoryRoot,
    systemRoot,
    operatorSurface: {
      readOnly: true,
      runtimeAuthoritative: false,
    },
    summary: {
      alertCount: alerts.length,
      backlogAlert: queues.backlog ? queues.backlog.backlogAlert : false,
      degradedMode: queues.degradedMode.active,
      openInterventionCount: interventions.summary.openCount,
      runtimeRunCount: runtimeInspector.summary.runCount,
      invalidTaskCount: maintainer.board.invalidTasks.count,
    },
    queues: {
      proposals: queues.proposals.count,
      jobs: queues.jobs.count,
      conflicts: queues.conflicts.count,
      proposalStatuses: queues.proposals.byStatus,
      jobStatuses: queues.jobs.byStatus,
      conflictCodes: queues.conflicts.byCode,
    },
    interventions: {
      total: interventions.summary.totalCount,
      open: interventions.summary.openCount,
      byStatus: interventions.summary.byStatus,
      byAction: interventionCounts.byAction,
      byTargetKind: interventionCounts.byTargetKind,
    },
    runtime: {
      runCount: runtimeInspector.summary.runCount,
      totalArtifacts: runtimeInspector.summary.totalArtifacts,
      topSources: runtimeInspector.summary.topSources,
      busiestBuckets: runtimeInspector.summary.busiestBuckets,
      freshness: runtimeInspector.freshness,
      reconciliation: runtimeInspector.reconciliation,
    },
    maintainer: {
      taskCount: maintainer.board.tasks.total,
      byStatus: maintainer.board.tasks.byStatus,
      byPriority: maintainer.board.tasks.byPriority,
      invalidTaskCount: maintainer.board.invalidTasks.count,
    },
    alerts,
    dashboard: buildDashboard({
      queues,
      interventions,
      runtimeInspector,
      maintainer,
      alerts,
    }),
  };
}

module.exports = {
  analytics: getControlPlaneAnalytics,
  getControlPlaneAnalytics,
  get_control_plane_analytics: getControlPlaneAnalytics,
};
