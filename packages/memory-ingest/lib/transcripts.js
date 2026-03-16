'use strict';

const { VALIDATION_ERROR_CODES } = require('./load-contracts');
const { TRANSCRIPT_ROLES } = require('./constants');

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

function isIsoDateTime(value) {
  return (
    isNonEmptyString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validateTranscriptEvent(event) {
  const issues = [];

  if (!isPlainObject(event)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Transcript event must be an object.',
          'event'
        ),
      ],
    };
  }

  if (!isNonEmptyString(event.event_id)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'event_id must be a non-empty string.',
        'event_id'
      )
    );
  }

  if (!TRANSCRIPT_ROLES.includes(event.role)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `role must be one of: ${TRANSCRIPT_ROLES.join(', ')}.`,
        'role'
      )
    );
  }

  if (!isNonEmptyString(event.agent)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'agent must be a non-empty string.',
        'agent'
      )
    );
  }

  if (!isIsoDateTime(event.timestamp)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'timestamp must be an RFC3339 UTC datetime string.',
        'timestamp'
      )
    );
  }

  if (!isNonEmptyString(event.content)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'content must be a non-empty string.',
        'content'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = {
  validateTranscriptEvent,
};
