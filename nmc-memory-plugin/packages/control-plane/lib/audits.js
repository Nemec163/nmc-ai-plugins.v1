'use strict';

const { getControlPlaneInterventions } = require('./interventions');
const { resolveMemoryRoot } = require('./paths');
const { getControlPlaneQueues } = require('./queues');
const { getControlPlaneRuntimeInspector } = require('./runtime-inspector');

function parsePositiveInteger(value, fallback) {
  const normalized = Number.parseInt(value, 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const normalized = Number.parseInt(value, 10);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : fallback;
}

function resolveReferenceTime(options = {}) {
  if (options.updatedAt) {
    const epoch = Date.parse(options.updatedAt);
    if (!Number.isNaN(epoch)) {
      return epoch;
    }
  }

  if (options.today) {
    const epoch = Date.parse(`${options.today}T00:00:00Z`);
    if (!Number.isNaN(epoch)) {
      return epoch;
    }
  }

  return Date.now();
}

function ageInDays(timestamp, referenceTime) {
  if (!timestamp) {
    return null;
  }

  const epoch = Date.parse(timestamp);
  if (Number.isNaN(epoch)) {
    return null;
  }

  return Math.max(0, Math.floor((referenceTime - epoch) / 86400000));
}

function sortNewest(left, right) {
  const leftEpoch = Date.parse(left.eventAt || 0) || 0;
  const rightEpoch = Date.parse(right.eventAt || 0) || 0;

  if (rightEpoch !== leftEpoch) {
    return rightEpoch - leftEpoch;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}

function buildQueueAuditEntries(queues) {
  return [
    ...queues.proposals.items.map((proposal) => ({
      category: 'proposal',
      id: proposal.proposalId,
      eventAt: proposal.updatedAt || proposal.createdAt,
      status: proposal.status,
      relativePath: proposal.relativePath,
      details: {
        batchDate: proposal.batchDate,
        claimsCount: proposal.claimsCount,
        reviewedClaims: proposal.reviewedClaims,
      },
    })),
    ...queues.jobs.items.map((job) => ({
      category: 'job',
      id: job.jobId,
      eventAt: job.updatedAt || job.createdAt,
      status: job.status,
      relativePath: job.relativePath,
      details: {
        proposalId: job.proposalId,
        batchDate: job.batchDate,
        operation: job.operation,
        lockPath: job.lockPath,
      },
    })),
    ...queues.conflicts.items.map((conflict, index) => ({
      category: 'conflict',
      id: `${conflict.code}-${index + 1}`,
      eventAt: null,
      status: conflict.severity,
      relativePath: conflict.proposalPath || conflict.jobPath || conflict.lockPath || null,
      details: {
        code: conflict.code,
        message: conflict.message,
      },
    })),
    ...(queues.lock.exists
      ? [
          {
            category: 'lock',
            id: 'active-canon-lock',
            eventAt: queues.lock.lock ? queues.lock.lock.acquired_at || null : null,
            status: queues.lock.validation && queues.lock.validation.valid ? 'valid' : 'invalid',
            relativePath: queues.lock.path,
            details: {
              holder: queues.lock.lock ? queues.lock.lock.holder || null : null,
              operation: queues.lock.lock ? queues.lock.lock.operation || null : null,
            },
          },
        ]
      : []),
  ];
}

function buildInterventionAuditEntries(interventions) {
  return interventions.items.map((item) => ({
    category: 'intervention',
    id: item.interventionId,
    eventAt: item.updatedAt || item.createdAt,
    status: item.status,
    relativePath: item.relativePath,
    details: {
      actionId: item.actionId,
      actor: item.actor,
      target: item.target,
    },
  }));
}

function buildRuntimeAuditEntries(runtimeInspector) {
  return runtimeInspector.runs.map((run) => ({
    category: 'runtime-run',
    id: run.runId,
    eventAt: run.capturedAt,
    status: 'captured',
    relativePath: run.relativePath,
    details: {
      source: run.source,
      artifactCount: run.artifactCount,
      runtimeInputsCount: run.runtimeInputsCount,
    },
  }));
}

function buildStaleItems(entries, referenceTime, staleAfterDays) {
  return entries
    .map((entry) => ({
      ...entry,
      ageDays: ageInDays(entry.eventAt, referenceTime),
    }))
    .filter(
      (entry) =>
        entry.ageDays != null &&
        entry.ageDays > staleAfterDays &&
        entry.status !== 'resolved' &&
        entry.status !== 'captured'
    )
    .sort((left, right) => right.ageDays - left.ageDays);
}

function getControlPlaneAudits(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const auditLimit = parsePositiveInteger(options.auditLimit, 25);
  const staleAfterDays = parseNonNegativeInteger(options.staleAfterDays, 7);
  const referenceTime = resolveReferenceTime(options);
  const queues = getControlPlaneQueues(options);
  const interventions = getControlPlaneInterventions({ memoryRoot });
  const runtimeInspector = getControlPlaneRuntimeInspector(options);
  const items = [
    ...buildQueueAuditEntries(queues),
    ...buildInterventionAuditEntries(interventions),
    ...buildRuntimeAuditEntries(runtimeInspector),
  ].sort(sortNewest);
  const staleItems = buildStaleItems(items, referenceTime, staleAfterDays);
  const runtimeTrailPartial = runtimeInspector.summary.sampledRuns === true;

  return {
    kind: 'control-plane-audits',
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    memoryRoot,
    auditScope: {
      readOnly: true,
      runtimeAuthoritative: false,
      derivedFromCurrentReceipts: true,
    },
    summary: {
      totalEntries: items.length,
      staleCount: staleItems.length,
      conflictCount: queues.conflicts.count,
      runtimeRunCount: runtimeInspector.summary.runCount,
      runtimeTrailEntries: runtimeInspector.runs.length,
      runtimeTrailPartial,
      readErrors:
        queues.proposals.errors.length +
        queues.jobs.errors.length +
        interventions.errors.length,
    },
    trail: items.slice(0, auditLimit),
    staleItems: staleItems.slice(0, auditLimit),
    errors: {
      proposalReadErrors: queues.proposals.errors,
      jobReadErrors: queues.jobs.errors,
      interventionReadErrors: interventions.errors,
    },
  };
}

module.exports = {
  audits: getControlPlaneAudits,
  getControlPlaneAudits,
  get_control_plane_audits: getControlPlaneAudits,
};
