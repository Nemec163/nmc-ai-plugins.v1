'use strict';

const path = require('node:path');

const { loadMemoryRuntime } = require('./load-deps');
const { recordRuntimeSummaryReceipt } = require('./provenance');

function requireMemoryRoot(options) {
  const memoryRoot = options && options.memoryRoot;
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function captureRuntime(options = {}) {
  const runtime = loadMemoryRuntime();
  const capture = runtime.captureShadowRuntime({
    ...options,
    memoryRoot: requireMemoryRoot(options),
  });
  return {
    ...capture,
    receipt:
      options.persistReceipt === false
        ? null
        : recordRuntimeSummaryReceipt({
            ...options,
            memoryRoot: requireMemoryRoot(options),
            capture,
            reason: options.reason || 'gateway.capture-runtime',
          }),
  };
}

function getRuntimeDelta(options = {}) {
  const runtime = loadMemoryRuntime();
  return runtime.getRuntimeDelta({
    ...options,
    memoryRoot: requireMemoryRoot(options),
  });
}

function getRuntimeRecallBundle(options = {}) {
  const runtime = loadMemoryRuntime();
  return runtime.getRuntimeRecallBundle({
    ...options,
    memoryRoot: requireMemoryRoot(options),
  });
}

module.exports = {
  captureRuntime,
  capture_runtime: captureRuntime,
  getRuntimeRecallBundle,
  get_runtime_recall_bundle: getRuntimeRecallBundle,
  getRuntimeDelta,
  get_runtime_delta: getRuntimeDelta,
};
