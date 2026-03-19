'use strict';

const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { verifyReadIndex } = require('./read-index');

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
  const readIndex = verifyReadIndex({ memoryRoot });
  const status =
    result.warningCount > 0 || (readIndex.exists && readIndex.ok === false)
      ? 'warning'
      : 'ok';

  return {
    ...result,
    memoryRoot,
    updatedAt,
    today,
    readIndex,
    status,
  };
}

module.exports = {
  verify,
};
