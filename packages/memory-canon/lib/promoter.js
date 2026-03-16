'use strict';

const {
  CANON_SINGLE_WRITER,
  CURRENT_SCHEMA_VERSION,
  PROMOTER_IMPLEMENTATIONS,
  PROMOTER_REQUEST_TYPES,
} = require('./constants');
const { VALIDATION_ERROR_CODES } = require('./load-contracts');

function buildIssue(code, message, path) {
  return {
    code,
    message,
    path,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatePromotionRequest(request) {
  const issues = [];

  if (!isPlainObject(request)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Promotion request must be an object.',
          'request'
        ),
      ],
    };
  }

  if (!PROMOTER_REQUEST_TYPES.includes(request.type)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `type must be one of: ${PROMOTER_REQUEST_TYPES.join(', ')}.`,
        'type'
      )
    );
  }

  if (!isNonEmptyString(request.memory_root)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'memory_root must be a non-empty string.',
        'memory_root'
      )
    );
  }

  if (!isNonEmptyString(request.writer)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'writer must be a non-empty string.',
        'writer'
      )
    );
  }

  if (!isNonEmptyString(request.operation)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'operation must be a non-empty string.',
        'operation'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function createPromoterInterface(overrides = {}) {
  return Object.freeze({
    schema_version: CURRENT_SCHEMA_VERSION,
    implementation: overrides.implementation || PROMOTER_IMPLEMENTATIONS[1],
    single_writer: overrides.singleWriter || CANON_SINGLE_WRITER,
    validateRequest: overrides.validateRequest || validatePromotionRequest,
    acquireLock:
      overrides.acquireLock ||
      (() => {
        throw new Error('Canon promoter lock acquisition is not implemented in this slice.');
      }),
    promote:
      overrides.promote ||
      (() => {
        throw new Error('Canon promotion is not implemented in this slice.');
      }),
    releaseLock:
      overrides.releaseLock ||
      (() => {
        throw new Error('Canon promoter lock release is not implemented in this slice.');
      }),
  });
}

module.exports = {
  createPromoterInterface,
  validatePromotionRequest,
};
