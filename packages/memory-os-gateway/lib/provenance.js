'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon, loadMemoryRuntime } = require('./load-deps');
const { buildNamespaceContext } = require('./namespace');
const { toPosixRelative } = require('./records');

const VERIFICATION_RECEIPT_SCHEMA_VERSION = '1.0';

function sha256Text(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256File(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return sha256Text(fs.readFileSync(filePath));
}

function normalizeMemoryRoot(memoryRoot) {
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function resolveCanonVerifyReceiptPath(memoryRoot) {
  return path.join(normalizeMemoryRoot(memoryRoot), 'core', 'meta', 'verify-receipt.json');
}

function resolveReadIndexReceiptPath(memoryRoot, options = {}) {
  const namespace = buildNamespaceContext({
    memoryRoot,
    tenantId: options.tenantId,
    tenant_id: options.tenant_id,
    spaceId: options.spaceId,
    space_id: options.space_id,
    userId: options.userId,
    user_id: options.user_id,
    surface: 'verification-provenance',
  });
  const readIndexPath = path.join(namespace.memoryRoot, namespace.pathing.derivedReadIndexPath);

  return readIndexPath.replace(/read-index\.json$/, 'read-index.receipt.json');
}

function resolveRuntimeSummaryReceiptPath(memoryRoot, options = {}) {
  const runtime = loadMemoryRuntime();
  const manifestPath = runtime.resolveRuntimeManifestPath(normalizeMemoryRoot(memoryRoot), {
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

  return manifestPath.replace(/manifest\.json$/, 'manifest.receipt.json');
}

function writeReceipt(filePath, receipt) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function readReceipt(filePath, memoryRoot) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const receipt = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    ...receipt,
    exists: true,
    path: filePath,
    relativePath: toPosixRelative(memoryRoot, filePath),
  };
}

function buildReceiptSummary(kind, filePath, memoryRoot, receipt, fallback = {}) {
  if (!receipt) {
    return {
      kind,
      authoritative: false,
      exists: false,
      path: filePath,
      relativePath: toPosixRelative(memoryRoot, filePath),
      status: fallback.status || 'missing-receipt',
      surfaceExists: fallback.surfaceExists === true,
      reason: null,
      action: null,
      refreshedAt: null,
      receiptDigest: null,
      outputDigest: null,
      outputPath: fallback.outputPath || null,
      evidence: fallback.evidence || null,
    };
  }

  return {
    kind,
    authoritative: false,
    exists: true,
    path: receipt.path || filePath,
    relativePath: receipt.relativePath || toPosixRelative(memoryRoot, filePath),
    status: receipt.status || 'ok',
    surfaceExists: true,
    action: receipt.action || null,
    reason: receipt.reason || null,
    refreshedAt: receipt.refreshedAt || null,
    receiptDigest: sha256Text(JSON.stringify(receipt)),
    outputDigest: receipt.outputs ? receipt.outputs.outputDigest || null : null,
    outputPath: receipt.outputs ? receipt.outputs.outputPath || null : null,
    evidence: receipt.evidence || null,
    receipt,
  };
}

function recordCanonVerifyReceipt(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const result = options.result;
  const receiptPath = resolveCanonVerifyReceiptPath(memoryRoot);
  const manifestRelativePath = toPosixRelative(memoryRoot, result.manifestFile);
  const edgesRelativePath = toPosixRelative(memoryRoot, result.edgesFile);
  const namespace = buildNamespaceContext({
    memoryRoot,
    surface: 'verification-provenance',
  });
  const receipt = {
    kind: 'verification-receipt',
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA_VERSION,
    authoritative: false,
    surface: 'canon-verify',
    action: 'verify',
    status: result.warningCount > 0 ? 'warning' : 'ok',
    reason: options.reason || 'gateway.verify',
    refreshedAt: result.updatedAt || options.updatedAt || null,
    namespace,
    rebuildableFrom: ['canon'],
    authorityBoundary: namespace.authorityBoundary,
    evidence: {
      strategy: result.reconciliation ? result.reconciliation.strategy || null : null,
      recordFileCount: result.reconciliation ? result.reconciliation.record_file_count || 0 : 0,
      recordChecksumDigest:
        result.reconciliation ? result.reconciliation.record_checksum_digest || null : null,
      edgesDigest: result.reconciliation ? result.reconciliation.edges_digest || null : null,
      warningCount: Number.isInteger(result.warningCount) ? result.warningCount : 0,
      reconciliationChanged:
        result.reconciliation ? result.reconciliation.changed === true : false,
      reconciliationReasonCodes: result.reconciliation
        ? (result.reconciliation.reasons || []).map((reason) => reason.code)
        : [],
    },
    outputs: {
      outputPath: manifestRelativePath,
      outputDigest: sha256File(result.manifestFile),
      graphPath: edgesRelativePath,
      graphDigest: sha256File(result.edgesFile),
      edgesCount: Number.isInteger(result.edgesCount) ? result.edgesCount : 0,
    },
  };

  writeReceipt(receiptPath, receipt);
  return readReceipt(receiptPath, memoryRoot);
}

function recordReadIndexReceipt(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const result = options.result;
  const receiptPath = resolveReadIndexReceiptPath(memoryRoot, options);
  const namespace = buildNamespaceContext({
    memoryRoot,
    tenantId: options.tenantId || (result.namespace && result.namespace.tenantId),
    tenant_id: options.tenant_id,
    spaceId: options.spaceId || (result.namespace && result.namespace.spaceId),
    space_id: options.space_id,
    userId: options.userId || (result.namespace && result.namespace.userId),
    user_id: options.user_id,
    surface: 'verification-provenance',
  });
  const outputPath = result.relativePath || toPosixRelative(memoryRoot, result.path);
  const receipt = {
    kind: 'verification-receipt',
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA_VERSION,
    authoritative: false,
    surface: 'derived-read-index',
    action: options.action,
    status: result.status || (result.ok === false ? 'warning' : 'ok'),
    reason: options.reason || `gateway.read-index.${options.action}`,
    refreshedAt: result.builtAt || options.updatedAt || new Date().toISOString(),
    namespace,
    rebuildableFrom: ['canon'],
    authorityBoundary: namespace.authorityBoundary,
    evidence: {
      sourceFresh: result.sourceFresh === true,
      recordCount: result.stats ? result.stats.recordCount || 0 : 0,
      fileCount: result.stats ? result.stats.fileCount || 0 : 0,
      tokenCount: result.stats ? result.stats.tokenCount || 0 : 0,
      sourceContentFingerprint:
        result.source && result.source.contentFingerprint ? result.source.contentFingerprint : null,
      manifestRecordChecksumDigest:
        result.reconciliation && result.reconciliation.manifestRecordChecksumDigest
          ? result.reconciliation.manifestRecordChecksumDigest
          : result.source && result.source.reconciliation
            ? result.source.reconciliation.recordChecksumDigest || null
            : null,
      manifestAligned:
        result.reconciliation && typeof result.reconciliation.manifestAligned === 'boolean'
          ? result.reconciliation.manifestAligned
          : result.source && typeof result.source.reconciliationFresh === 'boolean'
            ? result.source.reconciliationFresh
            : null,
      reasonCodes: Array.isArray(result.reasons) ? result.reasons.map((reason) => reason.code) : [],
    },
    outputs: {
      outputPath,
      outputDigest: result.path ? sha256File(result.path) : null,
    },
  };

  writeReceipt(receiptPath, receipt);
  return readReceipt(receiptPath, memoryRoot);
}

function recordRuntimeSummaryReceipt(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const capture = options.capture;
  const manifest = capture.manifest || {};
  const namespace = manifest.namespace || buildNamespaceContext({
    memoryRoot,
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
    surface: 'verification-provenance',
  });
  const receiptPath = resolveRuntimeSummaryReceiptPath(memoryRoot, namespace.scope || options);
  const manifestPath = capture.manifestPath || loadMemoryRuntime().resolveRuntimeManifestPath(memoryRoot, namespace.scope);
  const receipt = {
    kind: 'verification-receipt',
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA_VERSION,
    authoritative: false,
    surface: 'runtime-summary',
    action: 'reconcile',
    status: 'ok',
    reason: options.reason || 'gateway.capture-runtime',
    refreshedAt: manifest.updatedAt || capture.record.capturedAt || null,
    namespace,
    rebuildableFrom: manifest.rebuildableFrom || ['canon', 'captured-runtime-inputs'],
    authorityBoundary: namespace.authorityBoundary || {
      runtimeAuthoritative: false,
      canonicalPromotionPath: 'single-promoter',
    },
    evidence: {
      strategy: manifest.reconciliation ? manifest.reconciliation.strategy || null : null,
      runFileCount: manifest.reconciliation ? manifest.reconciliation.run_file_count || 0 : 0,
      runContentDigest:
        manifest.reconciliation ? manifest.reconciliation.run_content_digest || null : null,
      runCount: Number.isInteger(manifest.runCount) ? manifest.runCount : 0,
      totalArtifacts: Number.isInteger(manifest.totalArtifacts) ? manifest.totalArtifacts : 0,
      lastCapturedAt: manifest.lastCapturedAt || null,
    },
    outputs: {
      outputPath: toPosixRelative(memoryRoot, manifestPath),
      outputDigest: sha256File(manifestPath),
      runPath: capture.runPath ? toPosixRelative(memoryRoot, capture.runPath) : null,
    },
  };

  writeReceipt(receiptPath, receipt);
  return readReceipt(receiptPath, memoryRoot);
}

function getVerificationProvenance(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const canon = loadMemoryCanon();
  const runtime = loadMemoryRuntime();
  const namespace = buildNamespaceContext({
    memoryRoot,
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
    surface: 'verification-provenance',
  });
  const manifestPath = canon.resolveManifestPath(memoryRoot);
  const readIndexPath = path.join(memoryRoot, namespace.pathing.derivedReadIndexPath);
  const runtimeManifestPath = runtime.resolveRuntimeManifestPath(memoryRoot, namespace.scope);
  const canonReceiptPath = resolveCanonVerifyReceiptPath(memoryRoot);
  const readIndexReceiptPath = resolveReadIndexReceiptPath(memoryRoot, namespace.scope);
  const runtimeReceiptPath = resolveRuntimeSummaryReceiptPath(memoryRoot, namespace.scope);
  const canonReceipt = readReceipt(canonReceiptPath, memoryRoot);
  const readIndexReceipt = readReceipt(readIndexReceiptPath, memoryRoot);
  const runtimeReceipt = readReceipt(runtimeReceiptPath, memoryRoot);

  return {
    kind: 'verification-provenance',
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA_VERSION,
    authoritative: false,
    memoryRoot,
    namespace,
    receipts: {
      canonVerify: buildReceiptSummary('canon-verify', canonReceiptPath, memoryRoot, canonReceipt, {
        status: fs.existsSync(manifestPath) ? 'missing-receipt' : 'not-captured',
        surfaceExists: fs.existsSync(manifestPath),
        outputPath: fs.existsSync(manifestPath) ? toPosixRelative(memoryRoot, manifestPath) : null,
      }),
      readIndex: buildReceiptSummary(
        'derived-read-index',
        readIndexReceiptPath,
        memoryRoot,
        readIndexReceipt,
        {
          status: fs.existsSync(readIndexPath) ? 'missing-receipt' : 'not-captured',
          surfaceExists: fs.existsSync(readIndexPath),
          outputPath: fs.existsSync(readIndexPath)
            ? toPosixRelative(memoryRoot, readIndexPath)
            : null,
        }
      ),
      runtimeSummary: buildReceiptSummary(
        'runtime-summary',
        runtimeReceiptPath,
        memoryRoot,
        runtimeReceipt,
        {
          status: fs.existsSync(runtimeManifestPath) ? 'missing-receipt' : 'not-captured',
          surfaceExists: fs.existsSync(runtimeManifestPath),
          outputPath: fs.existsSync(runtimeManifestPath)
            ? toPosixRelative(memoryRoot, runtimeManifestPath)
            : null,
        }
      ),
    },
  };
}

module.exports = {
  VERIFICATION_RECEIPT_SCHEMA_VERSION,
  getVerificationProvenance,
  readReceipt,
  recordCanonVerifyReceipt,
  recordReadIndexReceipt,
  recordRuntimeSummaryReceipt,
  resolveCanonVerifyReceiptPath,
  resolveReadIndexReceiptPath,
  resolveRuntimeSummaryReceiptPath,
  sha256File,
  sha256Text,
};
