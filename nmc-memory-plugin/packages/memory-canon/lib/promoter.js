'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CANON_SINGLE_WRITER,
  CURRENT_SCHEMA_VERSION,
  PROMOTER_IMPLEMENTATIONS,
  PROMOTER_REQUEST_TYPES,
} = require('./constants');
const { promoteCanonBatch } = require('./core-promoter');
const { createCanonWriteLock, validateCanonWriteLock } = require('./lock');
const { resolveCanonLockPath } = require('./layout');
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

function firstIssueMessage(validation, fallback) {
  if (!validation || validation.valid || !Array.isArray(validation.issues)) {
    return fallback;
  }

  return validation.issues[0] && validation.issues[0].message
    ? validation.issues[0].message
    : fallback;
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

function readLockFile(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

function acquireCanonWriteLock(request) {
  const validation = validatePromotionRequest(request);
  if (!validation.valid) {
    throw new Error(firstIssueMessage(validation, 'Invalid promotion request.'));
  }

  const memoryRoot = path.resolve(request.memory_root);
  const lockPath = resolveCanonLockPath(memoryRoot);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const acquiredAt = request.acquired_at || new Date().toISOString();
  const holder = request.holder || request.writer;
  const lock = createCanonWriteLock({
    writer: request.writer,
    mode: request.mode,
    operation: request.operation,
    holder,
    acquiredAt,
    checkpointPath: request.checkpoint_path,
  });
  const lockValidation = validateCanonWriteLock(lock);
  if (!lockValidation.valid) {
    throw new Error(firstIssueMessage(lockValidation, 'Invalid canon write lock.'));
  }

  try {
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      return {
        acquired: false,
        lockPath,
        single_writer: CANON_SINGLE_WRITER,
        existingLock: readLockFile(lockPath),
      };
    }

    throw error;
  }

  return {
    acquired: true,
    lockPath,
    single_writer: CANON_SINGLE_WRITER,
    lock,
  };
}

function releaseCanonWriteLock(request) {
  const validation = validatePromotionRequest(request);
  if (!validation.valid) {
    throw new Error(firstIssueMessage(validation, 'Invalid promotion request.'));
  }

  const memoryRoot = path.resolve(request.memory_root);
  const lockPath = resolveCanonLockPath(memoryRoot);
  if (!fs.existsSync(lockPath)) {
    return {
      released: false,
      existed: false,
      lockPath,
      single_writer: CANON_SINGLE_WRITER,
    };
  }

  const existingLock = readLockFile(lockPath);
  if (
    request.holder &&
    existingLock &&
    isNonEmptyString(existingLock.holder) &&
    existingLock.holder !== request.holder
  ) {
    throw new Error(
      `Cannot release canon write lock held by ${existingLock.holder}.`
    );
  }

  fs.rmSync(lockPath);

  return {
    released: true,
    existed: true,
    lockPath,
    single_writer: CANON_SINGLE_WRITER,
    lock: existingLock,
  };
}

function createPromoterInterface(overrides = {}) {
  return Object.freeze({
    schema_version: CURRENT_SCHEMA_VERSION,
    implementation: overrides.implementation || PROMOTER_IMPLEMENTATIONS[1],
    single_writer: overrides.singleWriter || CANON_SINGLE_WRITER,
    validateRequest: overrides.validateRequest || validatePromotionRequest,
    acquireLock: overrides.acquireLock || acquireCanonWriteLock,
    promote: overrides.promote || promote,
    releaseLock: overrides.releaseLock || releaseCanonWriteLock,
  });
}

function promote(request) {
  const validation = validatePromotionRequest(request);
  if (!validation.valid) {
    throw new Error(firstIssueMessage(validation, 'Invalid promotion request.'));
  }

  const holder = request.holder || request.writer;
  const normalizedRequest = {
    ...request,
    holder,
    operation: request.operation || PROMOTER_IMPLEMENTATIONS[1],
  };

  const acquired = acquireCanonWriteLock(normalizedRequest);
  if (!acquired.acquired && acquired.existingLock && acquired.existingLock.holder !== holder) {
    throw new Error(
      `Canon write lock already held by ${acquired.existingLock.holder}.`
    );
  }

  try {
    const result = promoteCanonBatch(normalizedRequest);
    return {
      promoted: true,
      lockPath: acquired.lockPath,
      single_writer: CANON_SINGLE_WRITER,
      ...result,
    };
  } finally {
    if (acquired.acquired) {
      releaseCanonWriteLock(normalizedRequest);
    }
  }
}

module.exports = {
  acquireCanonWriteLock,
  createPromoterInterface,
  promote,
  releaseCanonWriteLock,
  validatePromotionRequest,
};
