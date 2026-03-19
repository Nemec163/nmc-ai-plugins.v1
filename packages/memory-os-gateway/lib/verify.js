'use strict';

const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { getVerificationProvenance, recordCanonVerifyReceipt } = require('./provenance');
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
  const receipt = recordCanonVerifyReceipt({
    memoryRoot,
    updatedAt,
    result: {
      ...result,
      updatedAt,
    },
    reason: options.reason || 'gateway.verify',
  });
  const readIndex = verifyReadIndex({
    memoryRoot,
    reason: options.readIndexReason || 'gateway.verify.read-index-check',
    persistReceipt: options.persistReadIndexReceipt !== false,
  });
  const status =
    result.warningCount > 0 || (readIndex.exists && readIndex.ok === false)
      ? 'warning'
      : 'ok';

  return {
    ...result,
    memoryRoot,
    updatedAt,
    today,
    receipt,
    readIndex,
    status,
    verificationProvenance: getVerificationProvenance({ memoryRoot }),
  };
}

module.exports = {
  verify,
};
