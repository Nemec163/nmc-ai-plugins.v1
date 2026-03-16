'use strict';

const fs = require('fs');
const path = require('path');
const { copyTemplateTree } = require('./templates');
const { ensureDir, ensureSymlink, writeFileIfNeeded } = require('./fs-helpers');

function copyMemoryTemplate(templateRoot, targetRoot, overwrite, installDate) {
  return copyTemplateTree(templateRoot, targetRoot, overwrite, installDate);
}

function copySystemTemplate(templateRoot, targetRoot, overwrite, installDate) {
  return copyTemplateTree(templateRoot, targetRoot, overwrite, installDate);
}

function createSharedSkillsWorkspace(skillsSourceRoot, targetSkillsRoot, overwrite) {
  const created = [];

  ensureDir(targetSkillsRoot);

  for (const skillName of fs.readdirSync(skillsSourceRoot)) {
    const sourcePath = path.join(skillsSourceRoot, skillName);
    const targetPath = path.join(targetSkillsRoot, skillName);

    if (!fs.statSync(sourcePath).isDirectory()) {
      continue;
    }

    if (ensureSymlink(targetPath, sourcePath, overwrite)) {
      created.push(targetPath);
    }
  }

  return {
    root: targetSkillsRoot,
    created,
  };
}

function scaffoldAgentWorkspace(options) {
  const {
    agentId,
    workspaceDir,
    files,
    sharedSkillsRoot,
    systemRoot,
    overwrite,
  } = options;
  const created = [];

  ensureDir(workspaceDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(workspaceDir, relativePath);
    if (writeFileIfNeeded(targetPath, content, overwrite)) {
      created.push(targetPath);
    }
  }

  const skillsPath = path.join(workspaceDir, 'skills');
  if (ensureSymlink(skillsPath, sharedSkillsRoot, overwrite)) {
    created.push(skillsPath);
  }

  const systemLinkPath = path.join(workspaceDir, 'system');
  if (ensureSymlink(systemLinkPath, systemRoot, overwrite)) {
    created.push(systemLinkPath);
  }

  return {
    id: agentId,
    workspaceDir,
    created,
  };
}

function ensureAgentState(agentId, stateDir) {
  const agentRoot = path.join(stateDir, 'agents', agentId);
  const created = [];

  for (const relativeDir of ['agent', 'sessions']) {
    const dirPath = path.join(agentRoot, relativeDir);
    if (fs.existsSync(dirPath)) {
      continue;
    }
    ensureDir(dirPath);
    created.push(dirPath);
  }

  return {
    id: agentId,
    root: agentRoot,
    created,
  };
}

module.exports = {
  copyMemoryTemplate,
  copySystemTemplate,
  createSharedSkillsWorkspace,
  scaffoldAgentWorkspace,
  ensureAgentState,
};
