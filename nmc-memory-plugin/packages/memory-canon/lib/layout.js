'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CANON_FILE_ROOTS,
  CANON_GRAPH_FILE,
  CANON_LOCK_FILE,
  CANON_MANIFEST_FILE,
  CANON_RECORD_ROOTS,
  CANON_SYSTEM_FILE,
} = require('./constants');

function walkMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function resolveMetaDir(memoryRoot) {
  const workspaceMetaDir = path.join(memoryRoot, 'core/meta');
  if (
    fs.existsSync(workspaceMetaDir) ||
    fs.existsSync(path.join(memoryRoot, 'core')) ||
    fs.existsSync(path.join(memoryRoot, CANON_SYSTEM_FILE))
  ) {
    return workspaceMetaDir;
  }

  return path.join(memoryRoot, 'meta');
}

function resolveManifestPath(memoryRoot) {
  return path.join(resolveMetaDir(memoryRoot), CANON_MANIFEST_FILE);
}

function resolveGraphPath(memoryRoot) {
  return path.join(resolveMetaDir(memoryRoot), CANON_GRAPH_FILE);
}

function resolveCanonLockPath(memoryRoot) {
  return path.join(resolveMetaDir(memoryRoot), CANON_LOCK_FILE);
}

function listRecordFiles(memoryRoot) {
  return CANON_RECORD_ROOTS.flatMap((relativeRoot) =>
    walkMarkdownFiles(path.join(memoryRoot, relativeRoot))
  ).sort();
}

function listCanonicalFiles(memoryRoot) {
  return CANON_FILE_ROOTS.flatMap((relativeRoot) =>
    walkMarkdownFiles(path.join(memoryRoot, relativeRoot))
  ).sort();
}

module.exports = {
  listCanonicalFiles,
  listRecordFiles,
  resolveCanonLockPath,
  resolveGraphPath,
  resolveManifestPath,
  resolveMetaDir,
};
