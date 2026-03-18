'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CANON_LOCK_MODES,
  CANON_SINGLE_WRITER,
  CURRENT_SCHEMA_VERSION,
} = require('./constants');
const { VALIDATION_ERROR_CODES } = require('./load-contracts');
const { resolveCanonLockPath } = require('./layout');

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

function createCanonWriteLock(options) {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    writer: options.writer || CANON_SINGLE_WRITER,
    mode: options.mode || CANON_LOCK_MODES[0],
    operation: options.operation || 'canon-write',
    holder: options.holder,
    acquired_at: options.acquiredAt,
    checkpoint_path: options.checkpointPath || 'intake/_checkpoint.yaml',
  };
}

function validateCanonWriteLock(lock) {
  const issues = [];

  if (!isPlainObject(lock)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Canon write lock must be an object.',
          'lock'
        ),
      ],
    };
  }

  if (!isNonEmptyString(lock.schema_version)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'schema_version must be a non-empty string.',
        'schema_version'
      )
    );
  }

  if (!isNonEmptyString(lock.writer)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'writer must be a non-empty string.',
        'writer'
      )
    );
  }

  if (!CANON_LOCK_MODES.includes(lock.mode)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `mode must be one of: ${CANON_LOCK_MODES.join(', ')}.`,
        'mode'
      )
    );
  }

  if (!isNonEmptyString(lock.operation)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'operation must be a non-empty string.',
        'operation'
      )
    );
  }

  if (!isNonEmptyString(lock.holder)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'holder must be a non-empty string.',
        'holder'
      )
    );
  }

  if (!isNonEmptyString(lock.acquired_at)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'acquired_at must be a non-empty string.',
        'acquired_at'
      )
    );
  }

  if (!isNonEmptyString(lock.checkpoint_path)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'checkpoint_path must be a non-empty string.',
        'checkpoint_path'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function readCanonWriteLock(memoryRoot) {
  const lockPath = resolveCanonLockPath(path.resolve(memoryRoot));
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  return {
    path: lockPath,
    lock,
    validation: validateCanonWriteLock(lock),
  };
}

function acquireCanonWriteLock(options) {
  if (!isNonEmptyString(options.memoryRoot)) {
    throw new Error('memoryRoot must be a non-empty string.');
  }

  const memoryRoot = path.resolve(options.memoryRoot);
  const lockPath = resolveCanonLockPath(memoryRoot);
  if (fs.existsSync(lockPath)) {
    throw new Error(`Canon write lock already exists: ${lockPath}`);
  }

  const lock = createCanonWriteLock({
    writer: options.writer,
    mode: options.mode,
    operation: options.operation,
    holder: options.holder,
    acquiredAt: options.acquiredAt || new Date().toISOString(),
    checkpointPath: options.checkpointPath,
  });
  const validation = validateCanonWriteLock(lock);
  if (!validation.valid) {
    throw new Error(
      `Invalid canon write lock: ${validation.issues.map((issue) => issue.message).join(' ')}`
    );
  }

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

  return {
    path: lockPath,
    lock,
    validation,
  };
}

function releaseCanonWriteLock(options) {
  if (!isNonEmptyString(options.memoryRoot)) {
    throw new Error('memoryRoot must be a non-empty string.');
  }

  const lockPath = resolveCanonLockPath(path.resolve(options.memoryRoot));
  if (!fs.existsSync(lockPath)) {
    return {
      path: lockPath,
      released: false,
    };
  }

  const current = readCanonWriteLock(options.memoryRoot);
  if (
    isNonEmptyString(options.expectedHolder) &&
    current &&
    current.lock &&
    current.lock.holder !== options.expectedHolder
  ) {
    throw new Error(
      `Canon write lock holder mismatch: expected ${options.expectedHolder}, found ${current.lock.holder}`
    );
  }

  fs.unlinkSync(lockPath);
  return {
    path: lockPath,
    released: true,
    lock: current ? current.lock : null,
  };
}

module.exports = {
  acquireCanonWriteLock,
  createCanonWriteLock,
  readCanonWriteLock,
  releaseCanonWriteLock,
  validateCanonWriteLock,
};
