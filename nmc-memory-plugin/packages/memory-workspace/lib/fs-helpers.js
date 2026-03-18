'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileIfNeeded(filePath, content, overwrite) {
  if (!overwrite && fs.existsSync(filePath)) {
    return false;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function ensureSymlink(linkPath, targetPath, overwrite) {
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath) || '.';

  try {
    const stats = fs.lstatSync(linkPath);
    if (stats.isSymbolicLink() && fs.readlinkSync(linkPath) === relativeTarget) {
      return false;
    }

    if (!overwrite) {
      return false;
    }

    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch (_error) {
    // Path does not exist yet; continue.
  }

  ensureDir(path.dirname(linkPath));
  fs.symlinkSync(relativeTarget, linkPath, 'dir');
  return true;
}

function listFilesRecursive(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(entryPath));
      continue;
    }

    results.push(entryPath);
  }

  return results;
}

module.exports = {
  ensureDir,
  writeFileIfNeeded,
  ensureSymlink,
  listFilesRecursive,
};
