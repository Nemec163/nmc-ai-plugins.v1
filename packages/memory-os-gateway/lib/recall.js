'use strict';

const path = require('node:path');

const { getRoleBundle } = require('./bootstrap');
const { getStatus } = require('./status');
const { getCanonicalCurrent } = require('./read');
const { query } = require('./query');
const { getRuntimeRecallBundle } = require('./runtime');

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

  return {
    kind: 'recall-bundle',
    authoritative: false,
    memoryRoot,
    text,
    roleId: roleId || null,
    roleBundle,
    status,
    tokens: queryResult ? queryResult.tokens : [],
    canonicalCurrent,
    canonicalHits: queryResult ? queryResult.canonicalHits : [],
    pendingRuntimeDelta: queryResult ? queryResult.runtimeDelta : [],
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
