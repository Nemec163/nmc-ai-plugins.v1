'use strict';

const {
  KANBAN_PRIORITY,
  KANBAN_STATUS,
  TASK_AUTONOMY,
  TASK_CANON_FRONTMATTER_KEYS,
  TASK_GIT_FLOW,
  VALIDATION_ERROR_CODES,
} = require('./constants');
const {
  orderedFrontMatterKeys,
  parseKanbanFrontMatter,
  renderKanbanFrontMatter,
} = require('./parser');
const { normalizeKanbanSettings } = require('./settings');

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

function normalizeTaskText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  return value;
}

function normalizeTaskMeta(meta) {
  return {
    id: normalizeTaskText(meta.id),
    title: normalizeTaskText(meta.title) ?? '',
    status: normalizeTaskText(meta.status) ?? 'backlog',
    priority: normalizeTaskText(meta.priority) ?? 'P2',
    git_flow: normalizeTaskText(meta.git_flow) ?? 'inherit',
    autonomy: normalizeTaskText(meta.autonomy) ?? 'inherit',
    owner: normalizeTaskText(meta.owner),
    next_action: normalizeTaskText(meta.next_action),
    blocked_reason: normalizeTaskText(meta.blocked_reason),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    created_at: normalizeTaskText(meta.created_at),
    updated_at: normalizeTaskText(meta.updated_at),
    ...Object.keys(meta).reduce((carry, key) => {
      if (TASK_CANON_FRONTMATTER_KEYS.includes(key)) return carry;
      carry[key] = meta[key];
      return carry;
    }, {}),
  };
}

function parseTaskText(taskText, options = {}) {
  const { fileName = null } = options;
  const parsed = parseKanbanFrontMatter(taskText);
  const fallbackTaskId = fileName ? fileName.replace(/\.md$/i, '') : null;

  return {
    ...parsed,
    taskIdHint: parsed.meta.id ?? fallbackTaskId,
    normalizedMeta: normalizeTaskMeta({
      id: parsed.meta.id ?? fallbackTaskId,
      ...parsed.meta,
    }),
  };
}

function computeTaskPolicy(taskMeta, settings = {}) {
  const normalizedSettings = normalizeKanbanSettings(settings);
  const autonomy = taskMeta.autonomy ?? 'inherit';
  const gitFlow = taskMeta.git_flow ?? 'inherit';

  return {
    autonomy,
    git_flow: gitFlow,
    effective_autonomy:
      autonomy === 'inherit' ? normalizedSettings.autonomy_default : autonomy,
    effective_git_flow: gitFlow === 'inherit' ? normalizedSettings.gitFlow : gitFlow,
  };
}

function normalizeTaskMutation(existingMeta, partialMeta, options = {}) {
  const next = normalizeTaskMeta({ ...existingMeta, ...partialMeta });

  if (next.status === 'done') {
    next.next_action = null;
    next.blocked_reason = null;
  } else if (next.status !== 'blocked' && !Object.hasOwn(partialMeta, 'blocked_reason')) {
    next.blocked_reason = null;
  }

  next.updated_at = options.updatedAt ?? next.updated_at;
  return next;
}

function validateTaskMeta(meta) {
  if (!isPlainObject(meta)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Task frontmatter must be an object.',
          'taskMeta'
        ),
      ],
    };
  }

  const issues = [];

  if (meta.id !== null && !isNonEmptyString(meta.id)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Task id must be null or a non-empty string.',
        'id'
      )
    );
  }

  if (meta.title !== null && typeof meta.title !== 'string') {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Task title must be null or a string.',
        'title'
      )
    );
  }

  if (!KANBAN_STATUS.includes(meta.status)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `status must be one of: ${KANBAN_STATUS.join(', ')}.`,
        'status'
      )
    );
  }

  if (!KANBAN_PRIORITY.includes(meta.priority)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `priority must be one of: ${KANBAN_PRIORITY.join(', ')}.`,
        'priority'
      )
    );
  }

  if (!TASK_AUTONOMY.includes(meta.autonomy)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `autonomy must be one of: ${TASK_AUTONOMY.join(', ')}.`,
        'autonomy'
      )
    );
  }

  if (!TASK_GIT_FLOW.includes(meta.git_flow)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `git_flow must be one of: ${TASK_GIT_FLOW.join(', ')}.`,
        'git_flow'
      )
    );
  }

  if (meta.owner !== null && !isNonEmptyString(meta.owner)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'owner must be null or a non-empty string.',
        'owner'
      )
    );
  }

  if (meta.next_action !== null && !isNonEmptyString(meta.next_action)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'next_action must be null or a non-empty string.',
        'next_action'
      )
    );
  }

  if (meta.blocked_reason !== null && !isNonEmptyString(meta.blocked_reason)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'blocked_reason must be null or a non-empty string.',
        'blocked_reason'
      )
    );
  }

  if (!Array.isArray(meta.tags)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'tags must be an array of strings.',
        'tags'
      )
    );
  } else {
    meta.tags.forEach((tag, index) => {
      if (!isNonEmptyString(tag)) {
        issues.push(
          buildIssue(
            VALIDATION_ERROR_CODES.INVALID_COLLECTION_ITEM,
            'tag entries must be non-empty strings.',
            `tags[${index}]`
          )
        );
      }
    });
  }

  if (meta.created_at && !isIsoDateTime(meta.created_at)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'created_at must use ISO8601 UTC date-time.',
        'created_at'
      )
    );
  }

  if (meta.updated_at && !isIsoDateTime(meta.updated_at)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'updated_at must use ISO8601 UTC date-time.',
        'updated_at'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateTaskFile(taskText, options = {}) {
  const parsed = parseTaskText(taskText, options);
  const validation = validateTaskMeta(parsed.normalizedMeta);
  const policy = computeTaskPolicy(parsed.normalizedMeta, options.settings);

  return {
    valid: validation.valid,
    issues: validation.issues,
    parsed,
    effective: {
      ...parsed.normalizedMeta,
      ...policy,
    },
  };
}

function normalizeAndRenderTask(taskText, options = {}) {
  const validation = validateTaskFile(taskText, options);
  if (!validation.valid) {
    return {
      valid: false,
      issues: validation.issues,
    };
  }

  return {
    valid: true,
    issues: [],
    meta: validation.parsed.normalizedMeta,
    order: orderedFrontMatterKeys(validation.parsed.normalizedMeta),
    rendered:
      renderKanbanFrontMatter(validation.parsed.normalizedMeta) +
      (validation.parsed.body || ''),
    effective: validation.effective,
  };
}

module.exports = {
  computeTaskPolicy,
  normalizeAndRenderTask,
  normalizeTaskMeta,
  normalizeTaskMutation,
  parseTaskText,
  validateTaskFile,
  validateTaskMeta,
};
