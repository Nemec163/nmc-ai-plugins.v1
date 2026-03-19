'use strict';

const path = require('node:path');

const { getRoleBundle } = require('./bootstrap');
const { getStatus } = require('./status');
const { getCanonicalCurrent } = require('./read');
const { query } = require('./query');
const { getRuntimeRecallBundle } = require('./runtime');

function normalizeCanonicalHit(hit) {
  return {
    sourceKind: 'canonical',
    authoritative: true,
    score: hit.score,
    recordId: hit.recordId,
    type: hit.type,
    status: hit.status,
    summary: hit.summary,
    snippet: hit.snippet,
    relativePath: hit.relativePath,
    ranking: hit.ranking,
  };
}

function normalizePendingHit(hit) {
  return {
    sourceKind: 'pending-runtime-delta',
    authoritative: false,
    score: hit.score,
    claimId: hit.claimId,
    snippet: hit.snippet,
    relativePath: hit.relativePath,
    ranking: hit.ranking,
  };
}

function normalizeRuntimeHit(hit) {
  return {
    sourceKind: 'runtime-shadow',
    authoritative: false,
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
  const text = String(options.text || '').trim();
  const roleId = String(options.roleId || '').trim();

  const canonicalCurrent = getCanonicalCurrent({ memoryRoot });
  const queryResult = text
    ? query({
        memoryRoot,
        text,
        limit: options.limit,
        includePending: options.includePending,
      })
    : null;
  const runtimeRecall = getRuntimeRecallBundle({
    memoryRoot,
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
  const status = getStatus({ memoryRoot });
  const canonicalRecall = {
    kind: 'canonical-recall',
    authoritative: true,
    hits: queryResult ? queryResult.canonicalHits : [],
    readIndex: queryResult ? queryResult.readIndex : null,
    rankingVersion: queryResult ? queryResult.contract.rankingVersion : null,
  };
  const pendingRecall = {
    kind: 'pending-runtime-delta',
    authoritative: false,
    included: queryResult ? queryResult.freshnessBoundary.runtimeDeltaIncluded : false,
    hits: queryResult ? queryResult.pendingRuntimeDelta : [],
    rankingVersion: queryResult ? queryResult.contract.rankingVersion : null,
  };
  const topHits = [
    ...canonicalRecall.hits.map(normalizeCanonicalHit),
    ...pendingRecall.hits.map(normalizePendingHit),
    ...(runtimeRecall.hits || []).map(normalizeRuntimeHit),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, Number.isInteger(options.limit) ? options.limit : 10);

  return {
    kind: 'recall-bundle',
    authoritative: false,
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
