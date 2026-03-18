'use strict';

const path = require('node:path');

const { loadMemoryRuntime } = require('./load-deps');

function requireMemoryRoot(options) {
  const memoryRoot = options && options.memoryRoot;
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function captureRuntime(options = {}) {
  const runtime = loadMemoryRuntime();
  return runtime.captureShadowRuntime({
    ...options,
    memoryRoot: requireMemoryRoot(options),
  });
}

function getRuntimeDelta(options = {}) {
  const runtime = loadMemoryRuntime();
  return runtime.getRuntimeDelta({
    ...options,
    memoryRoot: requireMemoryRoot(options),
  });
}

module.exports = {
  captureRuntime,
  capture_runtime: captureRuntime,
  getRuntimeDelta,
  get_runtime_delta: getRuntimeDelta,
};
