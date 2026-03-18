'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryMaintainer } = require('./load-deps');
const { resolveSystemRoot } = require('./paths');

const TASK_DIRECTORIES = ['active', 'backlogs', 'done', 'inbox', 'recurring'];

function listTaskFiles(tasksDir) {
  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  return fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(tasksDir, entry.name))
    .sort();
}

function buildCountMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function readBoardSettings(settingsPath, maintainer) {
  if (!fs.existsSync(settingsPath)) {
    const validation = maintainer.validateKanbanSettings({}, { allowTemplatePlaceholders: true });
    return {
      exists: false,
      path: settingsPath,
      valid: validation.valid,
      issues: validation.issues,
      value: validation.settings,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    const validation = maintainer.validateKanbanSettings({}, { allowTemplatePlaceholders: true });
    return {
      exists: true,
      path: settingsPath,
      valid: false,
      issues: [
        {
          code: 'invalid-json',
          message: error.message,
          path: settingsPath,
        },
      ],
      value: validation.settings,
    };
  }

  const validation = maintainer.validateKanbanSettings(parsed, {
    allowTemplatePlaceholders: true,
  });

  return {
    exists: true,
    path: settingsPath,
    valid: validation.valid,
    issues: validation.issues,
    value: validation.settings,
  };
}

function buildTaskSummary(taskPath, tasksRoot, settings, maintainer) {
  const relativePath = path.relative(tasksRoot, taskPath).split(path.sep).join('/');
  const validation = maintainer.validateTaskFile(fs.readFileSync(taskPath, 'utf8'), {
    fileName: path.basename(taskPath),
    settings,
  });

  return {
    filePath: taskPath,
    relativePath,
    taskId: validation.parsed.taskIdHint,
    title: validation.effective.title,
    status: validation.effective.status,
    priority: validation.effective.priority,
    owner: validation.effective.owner,
    nextAction: validation.effective.next_action,
    blockedReason: validation.effective.blocked_reason,
    effectiveAutonomy: validation.effective.effective_autonomy,
    effectiveGitFlow: validation.effective.effective_git_flow,
    valid: validation.valid,
    issues: validation.issues,
  };
}

function getMaintainerSnapshot(options = {}) {
  const systemRoot = resolveSystemRoot(options);
  const maintainer = loadMemoryMaintainer();
  const tasksRoot = path.join(systemRoot, 'tasks');
  const activeTasksDir = path.join(tasksRoot, 'active');
  const settingsPath = path.join(activeTasksDir, '.kanban.json');
  const settings = readBoardSettings(settingsPath, maintainer);
  const byStatus = buildCountMap(maintainer.KANBAN_STATUS);
  const byPriority = buildCountMap(maintainer.KANBAN_PRIORITY);
  const directories = {};
  const issues = [...settings.issues];
  const invalidTasks = [];
  let totalTasks = 0;

  for (const directory of TASK_DIRECTORIES) {
    const directoryPath = path.join(tasksRoot, directory);
    const tasks = listTaskFiles(directoryPath).map((taskPath) =>
      buildTaskSummary(taskPath, tasksRoot, settings.value, maintainer)
    );

    for (const task of tasks) {
      totalTasks += 1;
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;

      if (!task.valid) {
        invalidTasks.push(task);
      }

      for (const issue of task.issues) {
        issues.push({
          ...issue,
          path: task.relativePath,
        });
      }
    }

    directories[directory] = {
      count: tasks.length,
      tasks,
    };
  }

  return {
    kind: 'maintainer-board-snapshot',
    available: fs.existsSync(tasksRoot),
    policyOwnedBy: '@nmc/memory-maintainer',
    schedulerOwnedBy: '@nmc/memory-maintainer',
    systemRoot,
    board: {
      tasksRoot,
      activeTasksDir,
      settings,
      directories,
      tasks: {
        total: totalTasks,
        byStatus,
        byPriority,
      },
      invalidTasks: {
        count: invalidTasks.length,
        items: invalidTasks,
      },
    },
    issues,
    contracts: {
      statusOrder: maintainer.KANBAN_STATUS,
      priorities: maintainer.KANBAN_PRIORITY,
      boardAutonomy: maintainer.BOARD_AUTONOMY,
      taskAutonomy: maintainer.TASK_AUTONOMY,
      boardGitFlow: maintainer.BOARD_GIT_FLOW,
      taskGitFlow: maintainer.TASK_GIT_FLOW,
    },
  };
}

module.exports = {
  getMaintainerSnapshot,
};
