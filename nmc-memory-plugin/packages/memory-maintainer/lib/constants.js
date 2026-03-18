'use strict';

const SCHEMA_VERSION = '1.0';

const STATUS_ORDER = Object.freeze([
  'backlog',
  'planned',
  'in_progress',
  'blocked',
  'review',
  'done',
]);

const KANBAN_STATUS = STATUS_ORDER;

const KANBAN_PRIORITY = Object.freeze(['P0', 'P1', 'P2', 'P3']);

const PRIORITY_ORDER = Object.freeze({
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
});

const BOARD_AUTONOMY = Object.freeze(['full', 'partial', 'ask', 'none']);

const TASK_AUTONOMY = Object.freeze(['inherit', ...BOARD_AUTONOMY]);

const BOARD_GIT_FLOW = Object.freeze(['main', 'pr']);

const TASK_GIT_FLOW = Object.freeze(['inherit', ...BOARD_GIT_FLOW]);

const TASK_CANON_FRONTMATTER_KEYS = Object.freeze([
  'id',
  'title',
  'status',
  'priority',
  'git_flow',
  'autonomy',
  'owner',
  'next_action',
  'blocked_reason',
  'tags',
  'created_at',
  'updated_at',
]);

const CANON_KEYS = TASK_CANON_FRONTMATTER_KEYS;

const KANBAN_SETTINGS_KEYS = Object.freeze(['gitFlow', 'autonomy_default', 'updated_at']);

const KANBAN_SETTINGS_REQUIRED = Object.freeze(['gitFlow', 'autonomy_default']);

const KANBAN_SETTINGS_DEFAULTS = Object.freeze({
  gitFlow: 'main',
  autonomy_default: 'full',
  updated_at: null,
});

const CANON_SETTINGS_DEFAULTS = KANBAN_SETTINGS_DEFAULTS;

const KANBAN_TASK_FILENAME_PREFIX = 'T-';

const KANBAN_TASK_FILENAME_PATTERN = /^T-\d+/;

const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  WARNING: 1,
  ERROR: 2,
});

const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([SCHEMA_VERSION]);

const VALIDATION_ERROR_CODES = Object.freeze({
  INVALID_COLLECTION_ITEM: 'invalid-collection-item',
  INVALID_SHAPE: 'invalid-shape',
  INVALID_VALUE: 'invalid-value',
  MISSING_FIELD: 'missing-field',
});

module.exports = {
  BOARD_AUTONOMY,
  BOARD_GIT_FLOW,
  CANON_KEYS,
  CANONICAL_TASK_KEYS: TASK_CANON_FRONTMATTER_KEYS,
  CANON_SETTINGS_DEFAULTS: KANBAN_SETTINGS_DEFAULTS,
  KANBAN_SETTINGS_DEFAULTS,
  CANON_SETTINGS_KEYS: KANBAN_SETTINGS_KEYS,
  EXIT_CODES,
  KANBAN_PRIORITY,
  KANBAN_SETTINGS_KEYS,
  KANBAN_SETTINGS_REQUIRED,
  KANBAN_STATUS,
  KANBAN_TASK_FILENAME_PATTERN,
  KANBAN_TASK_FILENAME_PREFIX,
  PRIORITY_ORDER,
  SCHEMA_VERSION,
  STATUS_ORDER,
  SUPPORTED_SCHEMA_VERSIONS,
  TASK_AUTONOMY,
  TASK_CANON_FRONTMATTER_KEYS,
  TASK_GIT_FLOW,
  VALIDATION_ERROR_CODES,
};
