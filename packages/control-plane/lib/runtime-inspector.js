'use strict';

const { loadGateway } = require('./load-deps');
const { resolveMemoryRoot } = require('./paths');

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

function incrementCount(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = (map[normalized] || 0) + 1;
}

function getTopSources(runs) {
  const counts = {};
  for (const run of runs) {
    incrementCount(counts, run.source || 'unknown');
  }

  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.source.localeCompare(right.source);
    });
}

function getBucketHighlights(buckets) {
  return Object.entries(buckets || {})
    .map(([bucketName, summary]) => ({
      bucket: bucketName,
      count: summary.count || 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.bucket.localeCompare(right.bucket);
    });
}

function summarizeCurrentProcedures(catalog) {
  const procedures = (catalog && catalog.procedures ? catalog.procedures : [])
    .filter((lineage) => lineage.currentVersion)
    .map((lineage) => ({
      roleId: lineage.roleId,
      procedureKey: lineage.procedureKey,
      relativePath: lineage.relativePath,
      versionCount: lineage.versionCount,
      currentVersion: lineage.currentVersion,
      latestVersion: lineage.latestVersion,
    }))
    .sort((left, right) => {
      if (String(left.roleId || '') !== String(right.roleId || '')) {
        return String(left.roleId || '').localeCompare(String(right.roleId || ''));
      }

      return String(left.procedureKey || '').localeCompare(String(right.procedureKey || ''));
    });

  return {
    authoritative: true,
    lineageCount: procedures.length,
    procedures,
  };
}

function summarizeRuntimeProcedureArtifacts(runtimeDelta, limit) {
  const proceduralBucket = (((runtimeDelta || {}).buckets || {}).procedural || {});
  const feedbackBucket = (((runtimeDelta || {}).buckets || {}).procedureFeedback || {});
  const proceduralEntries = proceduralBucket.entries || [];
  const feedbackEntries = feedbackBucket.entries || [];

  return {
    authoritative: false,
    totalCount: (proceduralBucket.count || 0) + (feedbackBucket.count || 0),
    buckets: {
      procedural: {
        count: proceduralBucket.count || 0,
        entries: proceduralEntries.slice(0, limit),
      },
      procedureFeedback: {
        count: feedbackBucket.count || 0,
        entries: feedbackEntries.slice(0, limit),
      },
    },
  };
}

function getControlPlaneRuntimeInspector(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const gateway = loadGateway();
  const runtimeLimit = parsePositiveInteger(options.limit || options.runtimeLimit, 10);
  const staleAfterDays = parseNonNegativeInteger(options.runtimeStaleAfterDays, 7);
  const referenceTime = resolveReferenceTime(options);
  const runtimeDelta = gateway.getRuntimeDelta({
    memoryRoot,
    limit: runtimeLimit,
  });
  const text = String(options.text || '').trim();
  const lastCapturedAgeDays = ageInDays(runtimeDelta.lastCapturedAt, referenceTime);
  const bucketHighlights = getBucketHighlights(runtimeDelta.buckets);
  const procedureCatalog = gateway.listProcedures({
    memoryRoot,
  });
  const procedureRecall = text
    ? gateway.getRecallBundle({
        memoryRoot,
        text,
        limit: runtimeLimit,
      }).procedureRecall
    : null;
  const recall = text
    ? gateway.getRuntimeRecallBundle({
        memoryRoot,
        text,
        limit: runtimeLimit,
      })
    : null;
  const sampledRuns = runtimeDelta.runs.length < runtimeDelta.runCount;

  return {
    kind: 'control-plane-runtime-inspector',
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    memoryRoot,
    authoritative: false,
    inspectable: true,
    shadowExists: runtimeDelta.exists,
    runtimeRoot: runtimeDelta.runtimeRoot,
    shadowRoot: runtimeDelta.shadowRoot,
    manifestPath: runtimeDelta.manifestPath,
    freshness: {
      lastCapturedAt: runtimeDelta.lastCapturedAt,
      ageDays: lastCapturedAgeDays,
      staleAfterDays,
      stale:
        runtimeDelta.exists &&
        lastCapturedAgeDays != null &&
        lastCapturedAgeDays > staleAfterDays,
      runtimeAuthoritative: false,
    },
    summary: {
      runCount: runtimeDelta.runCount,
      totalArtifacts: runtimeDelta.totalArtifacts,
      lastCapturedAgeDays,
      runsInspected: runtimeDelta.runs.length,
      sampledRuns,
      topSources: getTopSources(runtimeDelta.runs),
      busiestBuckets: bucketHighlights.slice(0, 3),
    },
    procedures: {
      canonicalCurrent: summarizeCurrentProcedures(procedureCatalog),
      runtimeArtifacts: summarizeRuntimeProcedureArtifacts(runtimeDelta, runtimeLimit),
      recall: procedureRecall,
    },
    buckets: runtimeDelta.buckets,
    runs: runtimeDelta.runs,
    manifest: runtimeDelta.manifest,
    recall,
    freshnessBoundary: recall
      ? recall.freshnessBoundary
      : {
          runtimeLastCapturedAt: runtimeDelta.lastCapturedAt,
          runtimeAuthoritative: false,
        },
  };
}

module.exports = {
  getControlPlaneRuntimeInspector,
  get_control_plane_runtime_inspector: getControlPlaneRuntimeInspector,
  runtimeInspector: getControlPlaneRuntimeInspector,
  runtime_inspector: getControlPlaneRuntimeInspector,
};
