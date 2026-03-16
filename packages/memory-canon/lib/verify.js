'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { serializeGraphEdge, extractLinksFromContent, extractRecordIdsFromContent } = require('./graph');
const { listCanonicalFiles, listRecordFiles, resolveGraphPath, resolveManifestPath, resolveMetaDir } = require('./layout');
const {
  buildManifestSnapshot,
  countRecordIdsByType,
  readSchemaVersionFromWorkspace,
  serializeManifestSnapshot,
} = require('./manifest');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileMtimeEpoch(filePath) {
  return Math.floor(fs.statSync(filePath).mtimeMs / 1000);
}

function timestampToEpoch(timestamp) {
  if (!timestamp) {
    return 0;
  }

  const direct = Date.parse(timestamp);
  if (!Number.isNaN(direct)) {
    return Math.floor(direct / 1000);
  }

  const dayOnly = Date.parse(`${timestamp}T00:00:00Z`);
  if (!Number.isNaN(dayOnly)) {
    return Math.floor(dayOnly / 1000);
  }

  return 0;
}

function readLastManifestTimestamp(manifestFile) {
  if (!fs.existsSync(manifestFile)) {
    return '';
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    return typeof parsed.last_updated === 'string' ? parsed.last_updated : '';
  } catch (error) {
    const markdown = fs.readFileSync(manifestFile, 'utf8');
    const match = markdown.match(/"last_updated":\s*"([^"]*)"/);
    return match ? match[1] : '';
  }
}

function appendGraphEdges(edgesFile, edges, today) {
  let currentLines = [];
  const existingFragments = new Set();

  if (fs.existsSync(edgesFile)) {
    currentLines = fs
      .readFileSync(edgesFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0);

    for (const line of currentLines) {
      try {
        const parsed = JSON.parse(line);
        existingFragments.add(`"src":"${parsed.src}","rel":"${parsed.rel}","dst":"${parsed.dst}"`);
      } catch (error) {
        continue;
      }
    }
  }

  for (const edge of edges) {
    const fragment = `"src":"${edge.src}","rel":"${edge.rel}","dst":"${edge.dst}"`;
    if (existingFragments.has(fragment)) {
      continue;
    }

    existingFragments.add(fragment);
    currentLines.push(serializeGraphEdge(edge, today));
  }

  fs.writeFileSync(edgesFile, currentLines.length > 0 ? `${currentLines.join('\n')}\n` : '');
  return currentLines.length;
}

function verifyCanonWorkspace(options) {
  const memoryRoot = options.memoryRoot.replace(/\/$/, '');
  const updatedAt = options.updatedAt;
  const today = options.today;
  const stderr = options.stderr || process.stderr;
  const metaDir = resolveMetaDir(memoryRoot);
  const manifestFile = resolveManifestPath(memoryRoot);
  const edgesFile = resolveGraphPath(memoryRoot);

  fs.mkdirSync(path.join(metaDir, 'graph'), { recursive: true });
  if (!fs.existsSync(edgesFile)) {
    fs.writeFileSync(edgesFile, '');
  }

  const recordFiles = listRecordFiles(memoryRoot);
  const canonicalFiles = listCanonicalFiles(memoryRoot);
  const recordIds = new Set();

  for (const filePath of recordFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const recordId of extractRecordIdsFromContent(content)) {
      recordIds.add(recordId);
    }
  }

  const recordCounts = countRecordIdsByType(Array.from(recordIds).sort());
  const checksums = {};

  for (const filePath of canonicalFiles) {
    checksums[path.relative(memoryRoot, filePath).replace(/\\/g, '/')] = sha256File(filePath);
  }

  const lastManifestEpoch = timestampToEpoch(readLastManifestTimestamp(manifestFile));
  const candidateEdges = [];

  for (const filePath of recordFiles) {
    if (lastManifestEpoch !== 0 && fileMtimeEpoch(filePath) <= lastManifestEpoch) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    candidateEdges.push(...extractLinksFromContent(content));
  }

  candidateEdges.sort((left, right) => {
    const leftKey = `${left.src}\t${left.rel}\t${left.dst}`;
    const rightKey = `${right.src}\t${right.rel}\t${right.dst}`;
    return leftKey.localeCompare(rightKey);
  });

  const seenEdges = new Set();
  const validEdges = [];
  let warningCount = 0;

  for (const edge of candidateEdges) {
    const key = `${edge.src}\t${edge.rel}\t${edge.dst}`;
    if (seenEdges.has(key)) {
      continue;
    }
    seenEdges.add(key);

    if (!recordIds.has(edge.src)) {
      stderr.write(`warning: skipping edge with missing src: ${edge.src} -> ${edge.rel} -> ${edge.dst}\n`);
      warningCount += 1;
      continue;
    }

    if (!recordIds.has(edge.dst)) {
      stderr.write(`warning: skipping dangling edge: ${edge.src} -> ${edge.rel} -> ${edge.dst}\n`);
      warningCount += 1;
      continue;
    }

    validEdges.push(edge);
  }

  const edgesCount = appendGraphEdges(edgesFile, validEdges, today);
  const manifest = buildManifestSnapshot({
    schemaVersion: readSchemaVersionFromWorkspace(memoryRoot),
    lastUpdated: updatedAt,
    recordCounts,
    checksums,
    edgesCount,
  });

  fs.writeFileSync(manifestFile, serializeManifestSnapshot(manifest));

  return {
    edgesCount,
    edgesFile,
    manifest,
    manifestFile,
    recordCounts,
    warningCount,
  };
}

module.exports = {
  verifyCanonWorkspace,
};
