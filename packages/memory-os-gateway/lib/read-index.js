'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { buildNamespaceContext } = require('./namespace');
const { readManifestSnapshot } = require('./read');
const { parseProjectionRecords, toPosixRelative, tokenizeText } = require('./records');

const READ_INDEX_FILENAME = 'read-index.json';
const READ_INDEX_SCHEMA_VERSION = '1';

function normalizeMemoryRoot(memoryRoot) {
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function resolveReadIndexPath(memoryRoot, options = {}) {
  const resolvedMemoryRoot = normalizeMemoryRoot(memoryRoot);
  return path.join(
    resolvedMemoryRoot,
    getReadIndexNamespace({
      ...options,
      memoryRoot: resolvedMemoryRoot,
    }).pathing.derivedReadIndexPath
  );
}

function getReadIndexNamespace(options = {}) {
  return buildNamespaceContext({
    memoryRoot: options.memoryRoot,
    tenantId: options.tenantId,
    tenant_id: options.tenant_id,
    spaceId: options.spaceId,
    space_id: options.space_id,
    userId: options.userId,
    user_id: options.user_id,
    surface: 'derived-read-index',
  });
}

function normalizeStoredNamespace(index, memoryRoot) {
  const declared = index && index.namespace && typeof index.namespace === 'object'
    ? index.namespace
    : {};

  return getReadIndexNamespace({
    memoryRoot,
    tenantId: declared.tenantId,
    tenant_id: declared.tenant_id,
    spaceId: declared.spaceId,
    space_id: declared.space_id,
    userId: declared.userId,
    user_id: declared.user_id,
  });
}

function checksumContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function pickSnippet(record) {
  if (record.metadata.summary) {
    return record.metadata.summary;
  }

  return record.body.split('\n')[0] || '';
}

function buildSourceSnapshot(memoryRoot, namespace) {
  const canon = loadMemoryCanon();
  const manifest = readManifestSnapshot(memoryRoot);
  const recordFiles = {};

  for (const filePath of canon.listRecordFiles(memoryRoot)) {
    const relativePath = toPosixRelative(memoryRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    recordFiles[relativePath] = {
      checksum: checksumContent(content),
    };
  }

  return {
    namespaceKey: namespace.namespaceKey,
    manifestLastUpdated: manifest ? manifest.last_updated : null,
    manifestPath: toPosixRelative(memoryRoot, canon.resolveManifestPath(memoryRoot)),
    recordFiles,
  };
}

function serializeReadIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function readReadIndex(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const namespace = getReadIndexNamespace(options);
  const indexPath = path.join(memoryRoot, namespace.pathing.derivedReadIndexPath);

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const storedNamespace = normalizeStoredNamespace(index, memoryRoot);
  index.namespace = storedNamespace;
  index.source = {
    ...(index.source || {}),
    namespaceKey: storedNamespace.namespaceKey,
  };
  index.records = Array.isArray(index.records)
    ? index.records.map((record) => ({
        ...record,
        namespace: record.namespace || storedNamespace,
      }))
    : [];
  index.path = indexPath;
  index.relativePath = toPosixRelative(memoryRoot, indexPath);
  return index;
}

function buildReadIndex(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const namespace = getReadIndexNamespace(options);
  const builtAt = options.builtAt || new Date().toISOString();
  const persist = options.persist !== false;
  const canon = loadMemoryCanon();
  const source = buildSourceSnapshot(memoryRoot, namespace);
  const postings = new Map();
  const records = [];

  for (const filePath of canon.listRecordFiles(memoryRoot)) {
    const relativePath = toPosixRelative(memoryRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseProjectionRecords(content);

    for (const record of parsed) {
      const recordId = record.metadata.record_id || null;
      if (!recordId) {
        continue;
      }

      const tokens = tokenizeText(
        [
          record.heading,
          record.metadata.record_id,
          record.metadata.summary,
          record.metadata.type,
          record.metadata.status,
          record.body,
          relativePath,
        ]
          .filter(Boolean)
          .join('\n')
      );

      const entry = {
        recordId,
        anchorId: record.anchorId,
        heading: record.heading,
        type: record.metadata.type || null,
        status: record.metadata.status || null,
        summary: record.metadata.summary || '',
        relativePath,
        snippet: pickSnippet(record),
        tokens,
        namespace,
      };

      records.push(entry);

      for (const token of tokens) {
        if (!postings.has(token)) {
          postings.set(token, []);
        }

        postings.get(token).push(recordId);
      }
    }
  }

  records.sort((left, right) => left.recordId.localeCompare(right.recordId));

  const index = {
    kind: 'read-index',
    authoritative: false,
    namespace,
    schemaVersion: READ_INDEX_SCHEMA_VERSION,
    builtAt,
    source,
    stats: {
      recordCount: records.length,
      fileCount: Object.keys(source.recordFiles).length,
      tokenCount: postings.size,
    },
    records,
    postings: Object.fromEntries(
      Array.from(postings.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([token, recordIds]) => [token, Array.from(new Set(recordIds)).sort()])
    ),
  };

  const indexPath = path.join(memoryRoot, namespace.pathing.derivedReadIndexPath);
  const relativePath = toPosixRelative(memoryRoot, indexPath);

  if (persist) {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, serializeReadIndex(index), 'utf8');
  }

  return {
    ...index,
    path: indexPath,
    relativePath,
    persisted: persist,
  };
}

function diffSourceSnapshot(index, currentSource) {
  const reasons = [];
  const indexedFiles = index && index.source && index.source.recordFiles
    ? index.source.recordFiles
    : {};
  const currentFiles = currentSource.recordFiles;
  const indexedPaths = Object.keys(indexedFiles).sort();
  const currentPaths = Object.keys(currentFiles).sort();

  for (const relativePath of indexedPaths) {
    if (!currentFiles[relativePath]) {
      reasons.push({
        code: 'missing-source-file',
        path: relativePath,
        message: `Indexed source file is missing from canon: ${relativePath}`,
      });
      continue;
    }

    if (currentFiles[relativePath].checksum !== indexedFiles[relativePath].checksum) {
      reasons.push({
        code: 'checksum-mismatch',
        path: relativePath,
        message: `Indexed source file checksum drifted: ${relativePath}`,
      });
    }
  }

  for (const relativePath of currentPaths) {
    if (!indexedFiles[relativePath]) {
      reasons.push({
        code: 'new-source-file',
        path: relativePath,
        message: `Canon contains an unindexed record file: ${relativePath}`,
      });
    }
  }

  if (currentSource.namespaceKey !== (index.source && index.source.namespaceKey)) {
    reasons.push({
      code: 'namespace-mismatch',
      path: 'namespace',
      message: `Read index namespace drifted: expected ${currentSource.namespaceKey}, found ${index.source && index.source.namespaceKey ? index.source.namespaceKey : 'missing'}`,
    });
  }

  return reasons;
}

function verifyReadIndex(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const namespace = getReadIndexNamespace(options);
  const indexPath = path.join(memoryRoot, namespace.pathing.derivedReadIndexPath);
  const index = readReadIndex(options);

  if (!index) {
    return {
      kind: 'read-index-verification',
      authoritative: false,
      namespace,
      memoryRoot,
      path: indexPath,
      relativePath: toPosixRelative(memoryRoot, indexPath),
      exists: false,
      ok: false,
      status: 'missing',
      reasons: [
        {
          code: 'missing-read-index',
          path: toPosixRelative(memoryRoot, indexPath),
          message: 'Read index has not been built yet.',
        },
      ],
      sourceFresh: false,
      builtAt: null,
      stats: {
        recordCount: 0,
        fileCount: 0,
        tokenCount: 0,
      },
      source: buildSourceSnapshot(memoryRoot, namespace),
    };
  }

  const currentSource = buildSourceSnapshot(memoryRoot, namespace);
  const reasons = diffSourceSnapshot(index, currentSource);
  const ok = reasons.length === 0;

  return {
    kind: 'read-index-verification',
    authoritative: false,
    namespace,
    memoryRoot,
    path: index.path || indexPath,
    relativePath: index.relativePath || toPosixRelative(memoryRoot, indexPath),
    exists: true,
    ok,
    status: ok ? 'ok' : 'stale',
    reasons,
    sourceFresh: ok,
    builtAt: index.builtAt || null,
    stats: index.stats || {
      recordCount: Array.isArray(index.records) ? index.records.length : 0,
      fileCount: 0,
      tokenCount: index.postings ? Object.keys(index.postings).length : 0,
    },
    source: currentSource,
  };
}

function getQueryableReadIndex(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const verification = verifyReadIndex(options);

  if (verification.ok) {
    return {
      index: readReadIndex(options),
      verification,
      source: 'persisted',
    };
  }

  if (options.rebuild === false) {
    return {
      index: null,
      verification,
      source: 'unavailable',
    };
  }

  const persisted = options.persist === true;
  const rebuilt = buildReadIndex({
    ...options,
    memoryRoot,
    builtAt: options.builtAt,
    persist: persisted,
  });

  return {
    index: rebuilt,
    verification: {
      ...verification,
      exists: persisted,
      ok: true,
      status: persisted ? 'rebuilt' : 'rebuilt-ephemeral',
      sourceFresh: true,
      builtAt: rebuilt.builtAt,
      stats: rebuilt.stats,
      reasons: verification.reasons,
    },
    source: persisted ? 'rebuilt-persisted' : 'rebuilt-ephemeral',
  };
}

module.exports = {
  READ_INDEX_FILENAME,
  READ_INDEX_SCHEMA_VERSION,
  buildReadIndex,
  build_read_index: buildReadIndex,
  getQueryableReadIndex,
  readReadIndex,
  read_read_index: readReadIndex,
  resolveReadIndexPath,
  verifyReadIndex,
  verify_read_index: verifyReadIndex,
};
