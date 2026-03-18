'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const {
  ensurePathInsideRoot,
  parseFrontmatter,
  parseProjectionRecords,
  toPosixRelative,
} = require('./records');

const CURRENT_PROJECTION_PATHS = Object.freeze({
  identity: 'core/user/identity/current.md',
  state: 'core/user/state/current.md',
});

function normalizeMemoryRoot(memoryRoot) {
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function readManifestSnapshot(memoryRoot) {
  const canon = loadMemoryCanon();
  const manifestPath = canon.resolveManifestPath(memoryRoot);

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function getProjection(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const projectionPath = options.projectionPath;

  if (!projectionPath) {
    throw new Error('projectionPath is required');
  }

  const filePath = ensurePathInsideRoot(memoryRoot, path.join(memoryRoot, projectionPath));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Projection not found: ${projectionPath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  return {
    kind: 'projection',
    canonical: true,
    memoryRoot,
    projectionPath: toPosixRelative(memoryRoot, filePath),
    filePath,
    frontmatter: parseFrontmatter(content),
    records: parseProjectionRecords(content).map((record) => ({
      ...record,
      recordId: record.metadata.record_id || null,
      type: record.metadata.type || null,
      summary: record.metadata.summary || '',
      status: record.metadata.status || null,
    })),
    content,
  };
}

function readRecord(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const recordId = String(options.recordId || '').trim();

  if (!recordId) {
    throw new Error('recordId is required');
  }

  const canon = loadMemoryCanon();
  for (const filePath of canon.listRecordFiles(memoryRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    const records = parseProjectionRecords(content);
    const matched = records.find((record) => record.metadata.record_id === recordId);

    if (!matched) {
      continue;
    }

    return {
      kind: 'record',
      canonical: true,
      memoryRoot,
      recordId,
      filePath,
      relativePath: toPosixRelative(memoryRoot, filePath),
      frontmatter,
      record: {
        ...matched,
        recordId,
        type: matched.metadata.type || null,
        summary: matched.metadata.summary || '',
        status: matched.metadata.status || null,
      },
      content,
    };
  }

  throw new Error(`Record not found: ${recordId}`);
}

function getCanonicalCurrent(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const projections = {};

  for (const [key, projectionPath] of Object.entries(CURRENT_PROJECTION_PATHS)) {
    const filePath = path.join(memoryRoot, projectionPath);
    projections[key] = fs.existsSync(filePath)
      ? getProjection({ memoryRoot, projectionPath })
      : null;
  }

  const manifest = readManifestSnapshot(memoryRoot);

  return {
    kind: 'canonical-current',
    canonical: true,
    memoryRoot,
    manifest,
    freshnessBoundary: {
      manifestLastUpdated: manifest ? manifest.last_updated : null,
      manifestPath: loadMemoryCanon().resolveManifestPath(memoryRoot),
    },
    projections,
  };
}

module.exports = {
  CURRENT_PROJECTION_PATHS,
  getCanonicalCurrent,
  getProjection,
  get_canonical_current: getCanonicalCurrent,
  get_projection: getProjection,
  readManifestSnapshot,
  readRecord,
  read_record: readRecord,
};
