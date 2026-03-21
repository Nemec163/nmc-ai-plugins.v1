'use strict';

const os = require('os');
const path = require('path');

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function toConfigPath(inputPath) {
  const home = os.homedir();
  const absolutePath = path.resolve(inputPath);

  if (absolutePath === home) {
    return '~';
  }

  if (absolutePath.startsWith(home + path.sep)) {
    return '~/' + path.relative(home, absolutePath);
  }

  return absolutePath;
}

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function relativeWorkspacePath(baseDir, targetPath) {
  const relativePath = path.relative(baseDir, targetPath) || '.';
  return toPosixPath(relativePath);
}

const BUNDLED_SYSTEM_TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates', 'workspace-system');
const BUNDLED_MEMORY_TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates', 'workspace-memory');
const BUNDLED_SKILLS_ROOT = path.resolve(__dirname, '..', 'skills');

module.exports = {
  expandHome,
  toConfigPath,
  toPosixPath,
  relativeWorkspacePath,
  BUNDLED_SYSTEM_TEMPLATE_ROOT,
  BUNDLED_MEMORY_TEMPLATE_ROOT,
  BUNDLED_SKILLS_ROOT,
};
