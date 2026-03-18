'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BOARD_AUTONOMY,
  BOARD_GIT_FLOW,
  KANBAN_PRIORITY,
  KANBAN_STATUS,
  TASK_AUTONOMY,
  TASK_CANON_FRONTMATTER_KEYS,
  TASK_GIT_FLOW,
  computeTaskPolicy,
  normalizeAndRenderTask,
  parseTaskText,
  validateKanbanSettings,
  validateTaskFile,
} = require('..');

const WORKSPACE_SYSTEM_ROOT = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/templates/workspace-system'
);
const KANBAN_SKILL = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/skills/kanban-operator/SKILL.md'
);

function read(relativePath) {
  return fs.readFileSync(path.join(WORKSPACE_SYSTEM_ROOT, relativePath), 'utf8');
}

function main() {
  assert.deepEqual(KANBAN_STATUS, [
    'backlog',
    'planned',
    'in_progress',
    'blocked',
    'review',
    'done',
  ]);
  assert.deepEqual(KANBAN_PRIORITY, ['P0', 'P1', 'P2', 'P3']);
  assert.deepEqual(BOARD_AUTONOMY, ['full', 'partial', 'ask', 'none']);
  assert.deepEqual(TASK_AUTONOMY, ['inherit', 'full', 'partial', 'ask', 'none']);
  assert.deepEqual(BOARD_GIT_FLOW, ['main', 'pr']);
  assert.deepEqual(TASK_GIT_FLOW, ['inherit', 'main', 'pr']);
  assert.deepEqual(TASK_CANON_FRONTMATTER_KEYS, [
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

  const settingsValidation = validateKanbanSettings(
    JSON.parse(read('tasks/active/.kanban.json')),
    { allowTemplatePlaceholders: true }
  );
  assert.equal(settingsValidation.valid, true, 'Expected template kanban settings to validate');
  assert.equal(settingsValidation.settings.gitFlow, 'main');
  assert.equal(settingsValidation.settings.autonomy_default, 'full');

  const taskText = read('tasks/templates/task.md');
  const parsedTask = parseTaskText(taskText, { fileName: 'T-0000.md' });
  assert.equal(parsedTask.normalizedMeta.id, 'T-0000');
  assert.equal(parsedTask.normalizedMeta.status, 'backlog');
  assert.equal(parsedTask.normalizedMeta.priority, 'P2');

  const taskValidation = validateTaskFile(taskText, {
    fileName: 'T-0000.md',
    settings: settingsValidation.settings,
  });
  assert.equal(taskValidation.valid, true, 'Expected task template to validate');
  assert.equal(taskValidation.effective.effective_autonomy, 'full');
  assert.equal(taskValidation.effective.effective_git_flow, 'main');

  const renderedTask = normalizeAndRenderTask(taskText, {
    fileName: 'T-0000.md',
    settings: settingsValidation.settings,
  });
  assert.equal(renderedTask.valid, true, 'Expected task template to render after normalization');
  assert.match(renderedTask.rendered, /^---\nid: T-0000\n/);

  const taskPolicy = computeTaskPolicy(parsedTask.normalizedMeta, settingsValidation.settings);
  assert.deepEqual(taskPolicy, {
    autonomy: 'inherit',
    git_flow: 'inherit',
    effective_autonomy: 'full',
    effective_git_flow: 'main',
  });

  const requiredPaths = [
    'README.md',
    'docs/README.md',
    'docs/kanban/autonomy.md',
    'policy/INDEX.md',
    'policy/shared/autonomy.md',
    'policy/shared/git-flow.md',
    'policy/shared/git.md',
    'policy/shared/operations.md',
    'scripts/kanban.mjs',
    'scripts/git-iteration-closeout.sh',
    'tasks/README.md',
    'tasks/active/.kanban.json',
    'tasks/templates/task.md',
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(
      fs.existsSync(path.join(WORKSPACE_SYSTEM_ROOT, relativePath)),
      true,
      `Expected shared maintainer asset to exist: ${relativePath}`
    );
  }

  assert.equal(fs.existsSync(KANBAN_SKILL), true, 'Expected kanban-operator skill to exist');

  console.log(
    'Validated kanban settings, task frontmatter, and shared maintainer assets through @nmc/memory-maintainer.'
  );
}

main();
