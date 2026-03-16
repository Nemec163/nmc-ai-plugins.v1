'use strict';

const {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  VALIDATION_ERROR_CODES,
} = require('./constants');

function buildIssue(code, message, path) {
  return {
    code,
    message,
    path,
  };
}

function isSupportedSchemaVersion(value) {
  return typeof value === 'string' && SUPPORTED_SCHEMA_VERSIONS.includes(value);
}

function validateSchemaVersion(value, path = 'schema_version') {
  if (isSupportedSchemaVersion(value)) {
    return {
      valid: true,
      issues: [],
    };
  }

  return {
    valid: false,
    issues: [
      buildIssue(
        VALIDATION_ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
        `Unsupported schema version: ${String(value)}`,
        path
      ),
    ],
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION: SCHEMA_VERSION,
  isSupportedSchemaVersion,
  validateSchemaVersion,
};
