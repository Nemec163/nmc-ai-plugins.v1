'use strict';

const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');

function verify(options) {
  const memoryRoot = path.resolve(options.memoryRoot);
  const updatedAt = options.updatedAt || new Date().toISOString();
  const today = options.today || updatedAt.slice(0, 10);
  const result = loadMemoryCanon().verifyCanonWorkspace({
    memoryRoot,
    updatedAt,
    today,
    stderr: options.stderr,
  });

  return {
    ...result,
    memoryRoot,
    updatedAt,
    today,
    status: result.warningCount > 0 ? 'warning' : 'ok',
  };
}

module.exports = {
  verify,
};
