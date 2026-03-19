'use strict';

const path = require('node:path');

const { getRoleBundle } = require('./bootstrap');
const { buildNamespaceContext } = require('./namespace');
const { listProcedures } = require('./procedures');
const { getStatus } = require('./status');
const { getCanonicalCurrent } = require('./read');
const { query } = require('./query');
const { getRuntimeRecallBundle } = require('./runtime');

function buildProcedureLookup(memoryRoot, namespace) {
  const catalog = listProcedures({
    memoryRoot,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
  });
  const byRecordId = new Map();

  for (const lineage of catalog.procedures || []) {
    const currentRecordId = lineage.currentVersion ? lineage.currentVersion.recordId : null;
    const latestRecordId = lineage.latestVersion ? lineage.latestVersion.recordId : null;

    for (const version of lineage.versions || []) {
      byRecordId.set(version.recordId, {
        roleId: lineage.roleId,
        procedureKey: lineage.procedureKey,
        version: version.version,
        status: version.status,
        relativePath: lineage.relativePath,
        versionCount: lineage.versionCount,
        current: version.recordId === currentRecordId,
        latest: version.recordId === latestRecordId,
        currentRecordId,
        latestRecordId,
        evidenceLinkage: version.recordId === currentRecordId ? lineage.evidenceLinkage || null : null,
        classification:
          version.recordId === currentRecordId
            ? 'canonical-current-procedure'
            : 'canonical-historical-procedure',
      });
    }
  }

  return byRecordId;
}

function getCanonicalProcedureSurface(hit, procedureLookup) {
  return procedureLookup.get(hit.recordId) || null;
}

function getRuntimeProcedureSurface(hit) {
  if (hit.bucket !== 'procedural' && hit.bucket !== 'procedureFeedback') {
    return null;
  }

  return {
    classification: 'runtime-procedural-artifact',
    artifactKind: hit.bucket === 'procedureFeedback' ? 'feedback' : 'observation',
    runtimeBucket: hit.bucket,
    current: false,
    latest: false,
  };
}

function normalizeCanonicalHit(hit, procedureLookup) {
  const procedureSurface = getCanonicalProcedureSurface(hit, procedureLookup);
  return {
    sourceKind: 'canonical',
    authoritative: true,
    namespace: hit.namespace || null,
    score: hit.score,
    recordId: hit.recordId,
    type: hit.type,
    status: hit.status,
    summary: hit.summary,
    snippet: hit.snippet,
    relativePath: hit.relativePath,
    ranking: hit.ranking,
    procedureSurface,
  };
}

function normalizePendingHit(hit) {
  return {
    sourceKind: 'pending-runtime-delta',
    authoritative: false,
    namespace: hit.namespace || null,
    score: hit.score,
    claimId: hit.claimId,
    snippet: hit.snippet,
    relativePath: hit.relativePath,
    ranking: hit.ranking,
    procedureSurface: null,
  };
}

function normalizeRuntimeHit(hit) {
  const procedureSurface = getRuntimeProcedureSurface(hit);
  return {
    sourceKind: 'runtime-shadow',
    authoritative: false,
    namespace: hit.namespace || null,
    score: hit.score,
    bucket: hit.bucket,
    id: hit.id,
    runId: hit.runId,
    capturedAt: hit.capturedAt,
    summary: hit.summary || '',
    snippet: hit.text || hit.summary || '',
    relativePath: hit.relativePath,
    ranking: {
      version: 'runtime-1',
      total: hit.score,
      reasons: [
        {
          code: 'runtime-shadow-match',
          weight: hit.score,
          bucket: hit.bucket,
        },
      ],
    },
    procedureSurface,
  };
}

function requireMemoryRoot(options) {
  const memoryRoot = options && options.memoryRoot;
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function getRecallBundle(options = {}) {
  const memoryRoot = requireMemoryRoot(options);
  const namespace = buildNamespaceContext({
    memoryRoot,
    surface: 'recall-bundle',
    tenantId: options.tenantId,
    spaceId: options.spaceId,
    userId: options.userId,
    agentId: options.agentId,
    roleId: options.roleId,
  });
  const text = String(options.text || '').trim();
  const roleId = String(options.roleId || '').trim();

  const canonicalCurrent = getCanonicalCurrent({
    memoryRoot,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
    agentId: namespace.scope.agentId,
    roleId: namespace.scope.roleId,
  });
  const queryResult = text
    ? query({
        memoryRoot,
        tenantId: namespace.tenantId,
        spaceId: namespace.spaceId,
        userId: namespace.userId,
        agentId: namespace.scope.agentId,
        roleId: namespace.scope.roleId,
        text,
        limit: options.limit,
        includePending: options.includePending,
      })
    : null;
  const runtimeRecall = getRuntimeRecallBundle({
    memoryRoot,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
    text,
    limit: options.limit,
  });
  const roleBundle = roleId
    ? getRoleBundle({
        roleId,
        installDate: options.installDate,
        memoryPath: options.memoryPath,
        systemPath: options.systemPath,
      })
    : null;
  const status = getStatus({
    memoryRoot,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
    agentId: namespace.scope.agentId,
    roleId: namespace.scope.roleId,
  });
  const procedureLookup = buildProcedureLookup(memoryRoot, namespace);
  const canonicalRecall = {
    kind: 'canonical-recall',
    authoritative: true,
    namespace: queryResult ? queryResult.namespace : namespace,
    hits: queryResult ? queryResult.canonicalHits : [],
    readIndex: queryResult ? queryResult.readIndex : null,
    rankingVersion: queryResult ? queryResult.contract.rankingVersion : null,
  };
  const pendingRecall = {
    kind: 'pending-runtime-delta',
    authoritative: false,
    namespace: queryResult ? queryResult.namespace : namespace,
    included: queryResult ? queryResult.freshnessBoundary.runtimeDeltaIncluded : false,
    hits: queryResult ? queryResult.pendingRuntimeDelta : [],
    rankingVersion: queryResult ? queryResult.contract.rankingVersion : null,
  };
  const normalizedCanonicalHits = canonicalRecall.hits.map((hit) =>
    normalizeCanonicalHit(hit, procedureLookup)
  );
  const normalizedPendingHits = pendingRecall.hits.map(normalizePendingHit);
  const normalizedRuntimeHits = (runtimeRecall.hits || []).map(normalizeRuntimeHit);
  const runtimeProceduralHits = [
    ...((((runtimeRecall.buckets || {}).procedural || {}).entries || []).map(normalizeRuntimeHit)),
    ...((((runtimeRecall.buckets || {}).procedureFeedback || {}).entries || []).map(normalizeRuntimeHit)),
  ].sort((left, right) => right.score - left.score);
  const canonicalCurrentProcedureHits = normalizedCanonicalHits.filter(
    (hit) => hit.procedureSurface && hit.procedureSurface.classification === 'canonical-current-procedure'
  );
  const canonicalHistoricalProcedureHits = normalizedCanonicalHits.filter(
    (hit) => hit.procedureSurface && hit.procedureSurface.classification === 'canonical-historical-procedure'
  );
  const procedureRecall = {
    kind: 'procedure-aware-recall',
    authoritative: false,
    summary: {
      canonicalCurrentCount: canonicalCurrentProcedureHits.length,
      canonicalHistoricalCount: canonicalHistoricalProcedureHits.length,
      runtimeArtifactCount:
        ((((runtimeRecall.buckets || {}).procedural || {}).count || 0) +
          (((runtimeRecall.buckets || {}).procedureFeedback || {}).count || 0)),
    },
    canonicalCurrent: {
      authoritative: true,
      hits: canonicalCurrentProcedureHits,
    },
    canonicalHistorical: {
      authoritative: true,
      hits: canonicalHistoricalProcedureHits,
    },
    runtimeArtifacts: {
      authoritative: false,
      hits: runtimeProceduralHits,
      buckets: {
        procedural: runtimeProceduralHits.filter(
          (hit) => hit.procedureSurface && hit.procedureSurface.runtimeBucket === 'procedural'
        ),
        procedureFeedback: runtimeProceduralHits.filter(
          (hit) => hit.procedureSurface && hit.procedureSurface.runtimeBucket === 'procedureFeedback'
        ),
      },
    },
    freshnessBoundary: {
      canonicalLastUpdated: canonicalCurrent.freshnessBoundary.manifestLastUpdated,
      runtimeShadowLastCapturedAt: runtimeRecall.freshnessBoundary.runtimeLastCapturedAt,
      runtimeProceduralAuthoritative: false,
    },
  };
  const topHits = [
    ...normalizedCanonicalHits,
    ...normalizedPendingHits,
    ...normalizedRuntimeHits,
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, Number.isInteger(options.limit) ? options.limit : 10);

  return {
    kind: 'recall-bundle',
    authoritative: false,
    namespace,
    contract: {
      kind: 'recall-bundle',
      version: '1',
      scopes: {
        canonical: true,
        pendingRuntimeDelta: pendingRecall.included,
        runtimeShadow: true,
      },
    },
    memoryRoot,
    text,
    roleId: roleId || null,
    roleBundle,
    status,
    tokens: queryResult ? queryResult.tokens : [],
    canonicalCurrent,
    canonicalRecall,
    pendingRecall,
    procedureRecall,
    topHits,
    canonicalHits: queryResult ? queryResult.canonicalHits : [],
    pendingRuntimeDelta: queryResult ? queryResult.pendingRuntimeDelta : [],
    query: queryResult,
    runtime: runtimeRecall,
    runtimeRecall,
    runtimeDelta: runtimeRecall,
    freshnessBoundary: {
      canonicalLastUpdated: canonicalCurrent.freshnessBoundary.manifestLastUpdated,
      pendingRuntimeDeltaIncluded: queryResult
        ? queryResult.freshnessBoundary.runtimeDeltaIncluded
        : false,
      runtimeShadowLastCapturedAt: runtimeRecall.freshnessBoundary.runtimeLastCapturedAt,
      runtimeShadowExists: runtimeRecall.shadowExists,
      runtimeAuthoritative: false,
    },
  };
}

module.exports = {
  getRecallBundle,
  get_recall_bundle: getRecallBundle,
};
