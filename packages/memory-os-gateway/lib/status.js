'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { buildNamespaceContext } = require('./namespace');
const { getVerificationProvenance } = require('./provenance');
const { verifyReadIndex } = require('./read-index');
const { readManifestSnapshot } = require('./read');
const { getRuntimeDelta } = require('./runtime');
const { getSessionsStatus } = require('./sessions');

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
  const namespace = buildNamespaceContext({
    memoryRoot,
    surface: 'status',
    tenantId: options.tenantId,
    tenant_id: options.tenant_id,
    spaceId: options.spaceId,
    space_id: options.space_id,
    userId: options.userId,
    user_id: options.user_id,
    agentId: options.agentId,
    agent_id: options.agent_id,
    roleId: options.roleId,
    role_id: options.role_id,
  });
  if (!fs.existsSync(memoryRoot)) {
    throw new Error(`memory directory not found: ${memoryRoot}`);
  }

  const canon = loadMemoryCanon();
  const manifestPath = canon.resolveManifestPath(memoryRoot);
  const manifest = readManifestSnapshot(memoryRoot);
  const readIndex = verifyReadIndex({
    memoryRoot,
    persistReceipt: false,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
  });
  const runtimeDelta = getRuntimeDelta({
    memoryRoot,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
    agentId: namespace.scope.agentId,
    roleId: namespace.scope.roleId,
    limit: 5,
  });
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

  if (runtimeDelta.exists && runtimeDelta.reconciliation && runtimeDelta.reconciliation.ok === false) {
    overallStatus = 'ALERT';
  }

  const manifestAgeDays = manifest
    ? Math.floor((nowEpoch - timestampToEpoch(manifest.last_updated)) / 86400)
    : null;
  const manifestReconciliation = manifest && manifest.reconciliation && typeof manifest.reconciliation === 'object'
    ? {
        strategy: manifest.reconciliation.strategy || null,
        recordFileCount: Number.isInteger(manifest.reconciliation.record_file_count)
          ? manifest.reconciliation.record_file_count
          : 0,
        recordChecksumDigest: manifest.reconciliation.record_checksum_digest || null,
        edgesDigest: manifest.reconciliation.edges_digest || null,
      }
    : null;
  const verificationProvenance = getVerificationProvenance({
    memoryRoot,
    tenantId: namespace.tenantId,
    spaceId: namespace.spaceId,
    userId: namespace.userId,
    agentId: namespace.scope.agentId,
    roleId: namespace.scope.roleId,
  });

  return {
    generatedAt: new Date().toISOString(),
    namespace,
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
      reconciliation: manifestReconciliation,
      reconciliationFresh: readIndex.source.reconciliationFresh,
      receipt: verificationProvenance.receipts.canonVerify,
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
      namespace: runtimeDelta.namespace,
      shadowExists: runtimeDelta.exists,
      runtimeRoot: runtimeDelta.runtimeRoot,
      shadowRoot: runtimeDelta.shadowRoot,
      manifestPath: runtimeDelta.manifestPath,
      disposable: runtimeDelta.disposable,
      rebuildableFrom: runtimeDelta.rebuildableFrom,
      reconciliation: runtimeDelta.reconciliation,
      receipt: verificationProvenance.receipts.runtimeSummary,
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
      namespace: readIndex.namespace,
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
      sourceContentFingerprint: readIndex.source.contentFingerprint,
      sourceReconciliation: readIndex.source.reconciliation,
      sourceReconciliationFresh: readIndex.source.reconciliationFresh,
      reconciliation: readIndex.reconciliation || null,
      receipt: verificationProvenance.receipts.readIndex,
    },
    sessions: getSessionsStatus(memoryRoot),
    verificationProvenance,
    overall: {
      status: overallStatus,
    },
  };
}

module.exports = {
  getStatus,
  status: getStatus,
};
