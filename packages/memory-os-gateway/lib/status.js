'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { verifyReadIndex } = require('./read-index');
const { readManifestSnapshot } = require('./read');
const { getRuntimeDelta } = require('./runtime');

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

  return 0;
}

function toIsoDate(epoch) {
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

function listMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(rootDir, entry.name))
    .sort();
}

function getStatus(options) {
  const memoryRoot = path.resolve(options.memoryRoot);
  if (!fs.existsSync(memoryRoot)) {
    throw new Error(`memory directory not found: ${memoryRoot}`);
  }

  const canon = loadMemoryCanon();
  const manifestPath = canon.resolveManifestPath(memoryRoot);
  const manifest = readManifestSnapshot(memoryRoot);
  const readIndex = verifyReadIndex({ memoryRoot });
  const runtimeDelta = getRuntimeDelta({ memoryRoot, limit: 5 });
  const pendingDir = path.join(memoryRoot, 'intake/pending');
  const processedDir = path.join(memoryRoot, 'intake/processed');
  const nowEpoch = Math.floor(Date.now() / 1000);

  let pendingOldestEpoch = 0;
  let processedStaleCount = 0;
  let overallStatus = 'OK';

  const pendingFiles = listMarkdownFiles(pendingDir);
  for (const filePath of pendingFiles) {
    const epoch = fileMtimeEpoch(filePath);
    if (pendingOldestEpoch === 0 || epoch < pendingOldestEpoch) {
      pendingOldestEpoch = epoch;
    }
  }

  const pendingOldestAgeDays =
    pendingOldestEpoch > 0 ? Math.floor((nowEpoch - pendingOldestEpoch) / 86400) : 0;
  const backlogAlert = pendingOldestAgeDays > 7;
  if (backlogAlert) {
    overallStatus = 'ALERT';
  }

  const processedFiles = listMarkdownFiles(processedDir);
  for (const filePath of processedFiles) {
    const ageDays = Math.floor((nowEpoch - fileMtimeEpoch(filePath)) / 86400);
    if (ageDays > 90) {
      processedStaleCount += 1;
    }
  }

  if (processedStaleCount > 0) {
    overallStatus = 'ALERT';
  }

  const manifestAgeDays = manifest
    ? Math.floor((nowEpoch - timestampToEpoch(manifest.last_updated)) / 86400)
    : null;

  return {
    generatedAt: new Date().toISOString(),
    memoryRoot,
    manifest: {
      exists: fs.existsSync(manifestPath),
      path: manifestPath,
      schemaVersion: manifest ? manifest.schema_version : null,
      lastUpdated: manifest ? manifest.last_updated : null,
      ageDays: manifestAgeDays,
      recordCounts: manifest
        ? manifest.record_counts
        : {
            events: 0,
            facts: 0,
            states: 0,
            identities: 0,
            competences: 0,
            procedures: 0,
          },
      edgesCount: manifest ? manifest.edges_count : 0,
    },
    intake: {
      pendingFiles: pendingFiles.length,
      oldestPending: pendingOldestEpoch > 0 ? toIsoDate(pendingOldestEpoch) : null,
      oldestPendingAgeDays: pendingOldestEpoch > 0 ? pendingOldestAgeDays : null,
      backlogAlert,
    },
    retention: {
      processedFilesOlderThan90Days: processedStaleCount,
      retentionAlert: processedStaleCount > 0,
    },
    runtime: {
      shadowExists: runtimeDelta.exists,
      runtimeRoot: runtimeDelta.runtimeRoot,
      shadowRoot: runtimeDelta.shadowRoot,
      manifestPath: runtimeDelta.manifestPath,
      disposable: runtimeDelta.disposable,
      rebuildableFrom: runtimeDelta.rebuildableFrom,
      runCount: runtimeDelta.runCount,
      totalArtifacts: runtimeDelta.totalArtifacts,
      lastCapturedAt: runtimeDelta.lastCapturedAt,
      buckets: Object.fromEntries(
        Object.entries(runtimeDelta.buckets).map(([bucketName, bucket]) => [
          bucketName,
          bucket.count,
        ])
      ),
    },
    readIndex: {
      exists: readIndex.exists,
      path: readIndex.path,
      relativePath: readIndex.relativePath,
      status: readIndex.status,
      sourceFresh: readIndex.sourceFresh,
      authoritative: false,
      builtAt: readIndex.builtAt,
      recordCount: readIndex.stats.recordCount,
      fileCount: readIndex.stats.fileCount,
      tokenCount: readIndex.stats.tokenCount,
      reasons: readIndex.reasons,
      sourceManifestLastUpdated: readIndex.source.manifestLastUpdated,
    },
    overall: {
      status: overallStatus,
    },
  };
}

module.exports = {
  getStatus,
  status: getStatus,
};
