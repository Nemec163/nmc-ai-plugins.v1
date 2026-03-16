'use strict';

const {
  BOARD_AUTONOMY,
  BOARD_GIT_FLOW,
  VALIDATION_ERROR_CODES,
} = require('./constants');

function buildIssue(code, message, path) {
  return { code, message, path };
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

function isInstallDatePlaceholder(value) {
  return value === '{{INSTALL_DATE}}T00:00:00Z';
}

function normalizeKanbanSettings(settings = {}) {
  return {
    gitFlow: settings.gitFlow ?? 'main',
    autonomy_default: settings.autonomy_default ?? 'full',
    updated_at: settings.updated_at ?? null,
  };
}

function validateKanbanSettings(settings, options = {}) {
  const { allowTemplatePlaceholders = false } = options;

  if (!isPlainObject(settings)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Kanban settings must be an object.',
          'settings'
        ),
      ],
      settings: normalizeKanbanSettings(),
    };
  }

  const normalized = normalizeKanbanSettings(settings);
  const issues = [];

  if (!BOARD_GIT_FLOW.includes(normalized.gitFlow)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `gitFlow must be one of: ${BOARD_GIT_FLOW.join(', ')}.`,
        'gitFlow'
      )
    );
  }

  if (!BOARD_AUTONOMY.includes(normalized.autonomy_default)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `autonomy_default must be one of: ${BOARD_AUTONOMY.join(', ')}.`,
        'autonomy_default'
      )
    );
  }

  if (normalized.updated_at !== null) {
    const validUpdatedAt =
      isIsoDateTime(normalized.updated_at) ||
      (allowTemplatePlaceholders && isInstallDatePlaceholder(normalized.updated_at));

    if (!validUpdatedAt) {
      issues.push(
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_VALUE,
          'updated_at must use ISO8601 UTC date-time or the install-date template placeholder.',
          'updated_at'
        )
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    settings: normalized,
  };
}

module.exports = {
  normalizeKanbanSettings,
  validateKanbanSettings,
};
