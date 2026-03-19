'use strict';

const path = require('node:path');

let cachedMemoryContracts = null;

const DEFAULT_ROLE_ID = 'mnemo';
const DEFAULT_RUNNER = 'claude';
const DEFAULT_SOURCE_HINT = 'adapter-provided observations for the requested date';

function loadMemoryContracts() {
  if (cachedMemoryContracts) {
    return cachedMemoryContracts;
  }

  try {
    cachedMemoryContracts = require('@nmc/memory-contracts');
    return cachedMemoryContracts;
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes('@nmc/memory-contracts')
    ) {
      throw error;
    }

    cachedMemoryContracts = require('../../memory-contracts');
    return cachedMemoryContracts;
  }
}

function requireOption(options, key) {
  if (options[key] == null || options[key] === '') {
    throw new Error(`${key} is required`);
  }

  return options[key];
}

function getDefaultSystemRoot(memoryRoot) {
  const parentDir = path.dirname(memoryRoot);
  if (path.basename(parentDir) === 'system') {
    return parentDir;
  }

  return path.join(parentDir, 'system');
}

function getDefaultWorkspaceDir(systemRoot, roleId) {
  return path.join(path.dirname(systemRoot), roleId);
}

function resolveClaudePhaseContext(options = {}) {
  const memoryRoot = path.resolve(requireOption(options, 'memoryRoot'));
  const roleId = String(
    options.roleId ||
      process.env.MEMORY_ROLE_ID ||
      process.env.PIPELINE_ROLE_ID ||
      DEFAULT_ROLE_ID
  ).trim();
  const systemRoot = path.resolve(
    options.systemRoot ||
      process.env.SYSTEM_ROOT ||
      getDefaultSystemRoot(memoryRoot)
  );
  const workspaceDir = path.resolve(
    options.workspaceDir ||
      process.env.WORKSPACE_DIR ||
      getDefaultWorkspaceDir(systemRoot, roleId)
  );
  const sharedSkillsRoot = path.resolve(
    options.sharedSkillsRoot ||
      process.env.SHARED_SKILLS_ROOT ||
      path.join(systemRoot, 'skills')
  );
  const installDate =
    options.installDate ||
    process.env.MEMORY_INSTALL_DATE ||
    new Date().toISOString().slice(0, 10);
  const sourceGlob = String(
    options.sourceGlob ||
      process.env.MEMORY_SOURCE_GLOB ||
      process.env.SESSION_SOURCE_GLOB ||
      DEFAULT_SOURCE_HINT
  ).trim();
  const llmRunner = String(
    options.llmRunner ||
      options.command ||
      process.env.CLAUDE_BIN ||
      DEFAULT_RUNNER
  ).trim();

  if (!roleId) {
    throw new Error('roleId is required');
  }
  if (!llmRunner) {
    throw new Error('llmRunner is required');
  }

  return {
    installDate,
    llmRunner,
    memoryRoot,
    roleId,
    sharedSkillsRoot,
    sourceGlob,
    systemRoot,
    workspaceDir,
  };
}

function buildClaudePhaseInvocation(phase, options = {}) {
  const context = resolveClaudePhaseContext(options);
  const runnerPath = path.resolve(__dirname, 'run-phase.js');
  const args = [
    runnerPath,
    '--phase',
    phase,
    '--date',
    requireOption(options, 'date'),
    '--memory-root',
    context.memoryRoot,
    '--role-id',
    context.roleId,
    '--workspace-dir',
    context.workspaceDir,
    '--system-root',
    context.systemRoot,
    '--shared-skills-root',
    context.sharedSkillsRoot,
    '--install-date',
    context.installDate,
    '--llm-runner',
    context.llmRunner,
  ];

  if (context.sourceGlob) {
    args.push('--source-glob', context.sourceGlob);
  }

  return {
    command: process.execPath,
    args,
    displayCommand: `${context.llmRunner} < adapter-claude:${phase}:${context.roleId}:${requireOption(options, 'date')}`,
  };
}

function createClaudePipelineAdapter() {
  const adapter = {
    runExtract(options) {
      return buildClaudePhaseInvocation('extract', options);
    },
    runCurate(options) {
      return buildClaudePhaseInvocation('curate', options);
    },
  };

  const validation = loadMemoryContracts().validatePipelineAdapter(adapter);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(' '));
  }

  return adapter;
}

module.exports = {
  DEFAULT_ROLE_ID,
  DEFAULT_RUNNER,
  DEFAULT_SOURCE_HINT,
  buildClaudePhaseInvocation,
  createClaudePipelineAdapter,
  resolveClaudePhaseContext,
};
