'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveMemoryRoot(options = {}) {
  if (!options.memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(options.memoryRoot);
}

function resolveSystemRoot(options = {}, memoryRoot = resolveMemoryRoot(options)) {
  if (options.systemRoot) {
    return path.resolve(options.systemRoot);
  }

  const candidates = [];
  if (path.basename(memoryRoot) === 'memory') {
    candidates.push(path.resolve(memoryRoot, '..'));
  }
  candidates.push(path.resolve(memoryRoot, 'system'));
  candidates.push(path.resolve(memoryRoot, '..', 'system'));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(memoryRoot, '..');
}

module.exports = {
  resolveMemoryRoot,
  resolveSystemRoot,
};
