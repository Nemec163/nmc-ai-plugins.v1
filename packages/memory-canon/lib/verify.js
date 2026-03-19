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

const RECONCILIATION_STRATEGY = 'content-addressed-graph-rebuild';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function digestEntries(entries) {
  return sha256Text(
    entries
      .map(([relativePath, checksum]) => `${relativePath}\t${checksum}`)
      .join('\n')
  );
}

function buildRecordFileSnapshot(memoryRoot, recordFiles) {
  const checksums = {};

  for (const filePath of recordFiles) {
    checksums[path.relative(memoryRoot, filePath).replace(/\\/g, '/')] = sha256File(filePath);
  }

  const entries = Object.entries(checksums).sort(([left], [right]) => left.localeCompare(right));

  return {
    checksums,
    digest: digestEntries(entries),
    fileCount: entries.length,
  };
}

function buildEdgesDigest(edges) {
  return digestEntries(edges.map((edge) => [`${edge.src}\t${edge.rel}\t${edge.dst}`, '1']));
}

function normalizeReconciliation(manifest) {
  if (!manifest || !manifest.reconciliation || typeof manifest.reconciliation !== 'object') {
    return null;
  }

  return {
    strategy: manifest.reconciliation.strategy || null,
    record_file_count: Number.isInteger(manifest.reconciliation.record_file_count)
      ? manifest.reconciliation.record_file_count
      : 0,
    record_checksum_digest: manifest.reconciliation.record_checksum_digest || null,
    edges_digest: manifest.reconciliation.edges_digest || null,
  };
}

function compareReconciliation(previous, current) {
  if (!previous) {
    return {
      changed: true,
      reasons: [
        {
          code: 'reconciliation-baseline-missing',
          message: 'No prior reconciliation evidence was recorded.',
        },
      ],
    };
  }

  const reasons = [];

  if (previous.strategy !== current.strategy) {
    reasons.push({
      code: 'reconciliation-strategy-changed',
      message: `Reconciliation strategy changed from ${previous.strategy || 'missing'} to ${current.strategy}.`,
    });
  }

  if (previous.record_file_count !== current.record_file_count) {
    reasons.push({
      code: 'record-file-count-changed',
      message: `Canonical record file count changed from ${previous.record_file_count} to ${current.record_file_count}.`,
    });
  }

  if (previous.record_checksum_digest !== current.record_checksum_digest) {
    reasons.push({
      code: 'record-content-changed',
      message: 'Canonical record content digest changed since the last reconciliation.',
    });
  }

  if (previous.edges_digest !== current.edges_digest) {
    reasons.push({
      code: 'graph-output-changed',
      message: 'Derived graph digest changed since the last reconciliation.',
    });
  }

  return {
    changed: reasons.length > 0,
    reasons,
  };
}

function writeGraphEdges(edgesFile, edges, today) {
  const lines = edges.map((edge) => serializeGraphEdge(edge, today));
  fs.writeFileSync(edgesFile, lines.length > 0 ? `${lines.join('\n')}\n` : '');
  return lines.length;
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

  const previousManifest = fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    : null;
  const recordFiles = listRecordFiles(memoryRoot);
  const canonicalFiles = listCanonicalFiles(memoryRoot);
  const recordIds = new Set();
  const recordFileSnapshot = buildRecordFileSnapshot(memoryRoot, recordFiles);

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

  const candidateEdges = [];

  for (const filePath of recordFiles) {
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

  const reconciliation = {
    strategy: RECONCILIATION_STRATEGY,
    record_file_count: recordFileSnapshot.fileCount,
    record_checksum_digest: recordFileSnapshot.digest,
    edges_digest: buildEdgesDigest(validEdges),
  };
  const reconciliationComparison = compareReconciliation(
    normalizeReconciliation(previousManifest),
    reconciliation
  );
  const edgesCount = writeGraphEdges(edgesFile, validEdges, today);
  const manifest = buildManifestSnapshot({
    schemaVersion: readSchemaVersionFromWorkspace(memoryRoot),
    lastUpdated: updatedAt,
    recordCounts,
    checksums,
    edgesCount,
    reconciliation,
  });

  fs.writeFileSync(manifestFile, serializeManifestSnapshot(manifest));

  return {
    edgesCount,
    edgesFile,
    manifest,
    manifestFile,
    reconciliation: {
      ...reconciliation,
      previous: normalizeReconciliation(previousManifest),
      changed: reconciliationComparison.changed,
      reasons: reconciliationComparison.reasons,
    },
    recordCounts,
    warningCount,
  };
}

module.exports = {
  verifyCanonWorkspace,
};
