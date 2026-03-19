'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_SCHEMA_VERSION = '1.0';
const RUNTIME_ROOT_PATH = 'runtime';
const RUNTIME_SHADOW_ROOT_PATH = 'runtime/shadow';
const RUNTIME_RUNS_ROOT_PATH = 'runtime/shadow/runs';
const RUNTIME_MANIFEST_PATH = 'runtime/shadow/manifest.json';

const RUNTIME_BUCKETS = Object.freeze([
  'episodic',
  'semanticCache',
  'procedural',
  'procedureFeedback',
  'retrievalTraces',
  'triggers',
  'reflections',
]);

function loadMemoryContracts() {
  try {
    return require('@nmc/memory-contracts');
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes('@nmc/memory-contracts')
    ) {
      throw error;
    }

    return require('../../memory-contracts');
  }
}

function requireMemoryRoot(options) {
  const memoryRoot = options && options.memoryRoot;
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function buildRuntimeNamespaceContext(memoryRoot, options = {}) {
  const contracts = loadMemoryContracts();
  const namespace = contracts.resolveNamespace({
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

  return {
    ...namespace,
    memoryRoot: path.resolve(memoryRoot),
    surface: 'runtime-shadow',
    authorityBoundary: {
      runtimeAuthoritative: false,
      canonicalPromotionPath: 'single-promoter',
    },
  };
}

function buildRuntimeNamespaceFromRecord(memoryRoot, record) {
  const namespace = record && record.namespace && typeof record.namespace === 'object'
    ? record.namespace
    : {};
  const scope = namespace && namespace.scope && typeof namespace.scope === 'object'
    ? namespace.scope
    : {};
  const actor = namespace && namespace.actor && typeof namespace.actor === 'object'
    ? namespace.actor
    : {};

  return buildRuntimeNamespaceContext(memoryRoot, {
    tenantId: scope.tenantId || namespace.tenantId,
    spaceId: scope.spaceId || namespace.spaceId,
    userId: scope.userId || namespace.userId,
    agentId: scope.agentId || actor.agentId,
    roleId: scope.roleId || actor.roleId,
  });
}

function normalizeManifestNamespace(memoryRoot, manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return manifest;
  }

  const namespace = buildRuntimeNamespaceFromRecord(memoryRoot, manifest);
  return {
    ...manifest,
    namespace,
    reconciliation: normalizeRuntimeReconciliation(manifest.reconciliation),
  };
}

function sha256Text(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function normalizeRuntimeReconciliation(reconciliation) {
  if (!reconciliation || typeof reconciliation !== 'object' || Array.isArray(reconciliation)) {
    return null;
  }

  return {
    strategy: reconciliation.strategy || null,
    runFileCount: Number.isInteger(reconciliation.runFileCount)
      ? reconciliation.runFileCount
      : Number.isInteger(reconciliation.run_file_count)
        ? reconciliation.run_file_count
        : 0,
    runContentDigest:
      typeof reconciliation.runContentDigest === 'string'
        ? reconciliation.runContentDigest
        : typeof reconciliation.run_content_digest === 'string'
          ? reconciliation.run_content_digest
          : null,
  };
}

function buildRuntimeReconciliation(memoryRoot, records) {
  const entries = (Array.isArray(records) ? records : [])
    .map((record) => {
      const relativePath = record.filePath
        ? path.relative(memoryRoot, record.filePath).split(path.sep).join('/')
        : `runtime/shadow/runs/${record.runId || 'unknown'}.json`;
      const checksum =
        record.filePath && fs.existsSync(record.filePath)
          ? sha256File(record.filePath)
          : sha256Text(JSON.stringify(record));

      return [relativePath, checksum];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    strategy: 'content-addressed-runtime-manifest',
    run_file_count: entries.length,
    run_content_digest: sha256Text(
      entries.map(([relativePath, checksum]) => `${relativePath}\t${checksum}`).join('\n')
    ),
  };
}

function compareRuntimeReconciliation(options = {}) {
  const exists = options.exists === true;
  const hasManifest = options.hasManifest === true;
  const current = options.current || buildRuntimeReconciliation('', []);
  const manifest = normalizeRuntimeReconciliation(options.manifest);

  if (!exists && !hasManifest) {
    return {
      status: 'not-captured',
      ok: true,
      reasons: [],
      manifest,
      current,
    };
  }

  if (exists && !hasManifest) {
    return {
      status: 'missing-manifest',
      ok: false,
      reasons: [
        {
          code: 'runtime-manifest-missing',
          message: 'Runtime shadow exists but the runtime manifest is missing.',
        },
      ],
      manifest: null,
      current,
    };
  }

  if (!manifest) {
    return {
      status: 'missing-reconciliation',
      ok: false,
      reasons: [
        {
          code: 'runtime-reconciliation-missing',
          message: 'Runtime manifest is missing content-derived reconciliation evidence.',
        },
      ],
      manifest: null,
      current,
    };
  }

  const reasons = [];

  if (manifest.runFileCount !== current.run_file_count) {
    reasons.push({
      code: 'runtime-run-file-count-mismatch',
      message: `Runtime manifest expected ${manifest.runFileCount} run files, found ${current.run_file_count}.`,
    });
  }

  if (manifest.runContentDigest !== current.run_content_digest) {
    reasons.push({
      code: 'runtime-content-digest-mismatch',
      message: 'Runtime manifest content digest drifted from current runtime shadow records.',
    });
  }

  return {
    status: reasons.length === 0 ? 'ok' : 'stale',
    ok: reasons.length === 0,
    reasons,
    manifest,
    current,
  };
}

function sanitizeRunId(runId) {
  const normalized = String(runId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    throw new Error('runId is required');
  }

  return normalized;
}

function clonePlainObject(value, errorMessage) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean);
}

function normalizeObservedAt(entry) {
  const observedAt = entry.observedAt || entry.observed_at || null;
  return observedAt ? String(observedAt) : null;
}

function normalizeRuntimeEntry(bucketName, entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Runtime bucket ${bucketName} entry ${index + 1} must be an object`);
  }

  const summary = String(entry.summary || entry.text || entry.note || '').trim();
  if (!summary) {
    throw new Error(
      `Runtime bucket ${bucketName} entry ${index + 1} requires summary, text, or note`
    );
  }

  const runtimeEntry = {
    id: String(entry.id || `${bucketName}-${index + 1}`).trim(),
    summary,
    text: String(entry.text || summary).trim(),
    observedAt: normalizeObservedAt(entry),
    tags: normalizeTags(entry.tags),
  };

  const metadata = clonePlainObject(
    entry.metadata,
    `Runtime bucket ${bucketName} entry ${index + 1} metadata must be an object`
  );
  if (metadata) {
    runtimeEntry.metadata = metadata;
  }

  return runtimeEntry;
}

function normalizeRuntimeArtifacts(artifacts) {
  const source = artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts)
    ? artifacts
    : {};

  const normalized = {};
  for (const bucketName of RUNTIME_BUCKETS) {
    const bucketEntries = source[bucketName];
    if (bucketEntries == null) {
      normalized[bucketName] = [];
      continue;
    }

    if (!Array.isArray(bucketEntries)) {
      throw new Error(`Runtime bucket ${bucketName} must be an array`);
    }

    normalized[bucketName] = bucketEntries.map((entry, index) =>
      normalizeRuntimeEntry(bucketName, entry, index)
    );
  }

  return normalized;
}

function normalizeRuntimeInputs(runtimeInputs) {
  if (runtimeInputs == null) {
    return [];
  }

  if (!Array.isArray(runtimeInputs)) {
    throw new Error('runtimeInputs must be an array');
  }

  return runtimeInputs.map((input, index) => {
    const cloned = clonePlainObject(
      input,
      `runtimeInputs entry ${index + 1} must be an object`
    );

    return cloned || {};
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function resolveRuntimeRoot(memoryRoot) {
  return path.join(path.resolve(memoryRoot), RUNTIME_ROOT_PATH);
}

function resolveRuntimeShadowRoot(memoryRoot, options = {}) {
  return path.join(
    path.resolve(memoryRoot),
    buildRuntimeNamespaceContext(memoryRoot, options).pathing.runtimeShadowRoot
  );
}

function resolveRuntimeRunsRoot(memoryRoot, options = {}) {
  return path.join(
    path.resolve(memoryRoot),
    buildRuntimeNamespaceContext(memoryRoot, options).pathing.runtimeRunsRoot
  );
}

function resolveRuntimeManifestPath(memoryRoot, options = {}) {
  return path.join(
    path.resolve(memoryRoot),
    buildRuntimeNamespaceContext(memoryRoot, options).pathing.runtimeManifestPath
  );
}

function resolveRuntimeRunPath(memoryRoot, runId, options = {}) {
  return path.join(resolveRuntimeRunsRoot(memoryRoot, options), `${sanitizeRunId(runId)}.json`);
}

function ensureRuntimeShadowStore(memoryRoot, options = {}) {
  const namespace = buildRuntimeNamespaceContext(memoryRoot, options);
  ensureDir(resolveRuntimeRoot(memoryRoot));
  ensureDir(resolveRuntimeShadowRoot(memoryRoot, namespace.scope));
  ensureDir(resolveRuntimeRunsRoot(memoryRoot, namespace.scope));

  return {
    namespace,
    runtimeRoot: resolveRuntimeRoot(memoryRoot),
    shadowRoot: resolveRuntimeShadowRoot(memoryRoot, namespace.scope),
    runsRoot: resolveRuntimeRunsRoot(memoryRoot, namespace.scope),
    manifestPath: resolveRuntimeManifestPath(memoryRoot, namespace.scope),
  };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortByNewest(left, right) {
  const leftEpoch = Date.parse(left.capturedAt || left.observedAt || 0) || 0;
  const rightEpoch = Date.parse(right.capturedAt || right.observedAt || 0) || 0;

  if (rightEpoch !== leftEpoch) {
    return rightEpoch - leftEpoch;
  }

  return String(left.id || left.runId || '').localeCompare(String(right.id || right.runId || ''));
}

function tokenizeText(input) {
  return Array.from(
    new Set(
      String(input || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function scoreText(haystack, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return 1;
  }

  const normalized = String(haystack || '').toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function countArtifacts(artifacts) {
  return RUNTIME_BUCKETS.reduce((total, bucketName) => total + artifacts[bucketName].length, 0);
}

function listRuntimeRecords(options) {
  const memoryRoot = requireMemoryRoot(options);
  const namespace = buildRuntimeNamespaceContext(memoryRoot, options);
  const runsRoot = resolveRuntimeRunsRoot(memoryRoot, namespace.scope);

  if (!fs.existsSync(runsRoot)) {
    return [];
  }

  return fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const record = loadJson(path.join(runsRoot, entry.name));
      return {
        ...record,
        namespace: buildRuntimeNamespaceFromRecord(memoryRoot, record),
      };
    })
    .sort(sortByNewest);
}

function summarizeRecords(memoryRoot, records, limit) {
  const bucketSummaries = {};
  let totalArtifacts = 0;

  for (const bucketName of RUNTIME_BUCKETS) {
    const entries = [];

    for (const record of records) {
      for (const entry of record.artifacts[bucketName] || []) {
        entries.push({
          runId: record.runId,
          source: record.source,
          capturedAt: record.capturedAt,
          namespace: record.namespace,
          relativePath: path.relative(memoryRoot, record.filePath).split(path.sep).join('/'),
          ...entry,
        });
      }
    }

    entries.sort(sortByNewest);
    bucketSummaries[bucketName] = {
      count: entries.length,
      entries: entries.slice(0, limit),
    };
    totalArtifacts += entries.length;
  }

  const runs = records.map((record) => ({
    runId: record.runId,
    source: record.source,
    capturedAt: record.capturedAt,
    namespace: record.namespace,
    runtimeInputsCount: Array.isArray(record.runtimeInputs) ? record.runtimeInputs.length : 0,
    artifactCount: countArtifacts(record.artifacts),
    counts: { ...record.counts },
    relativePath: path.relative(memoryRoot, record.filePath).split(path.sep).join('/'),
  }));

  runs.sort(sortByNewest);

  return {
    runCount: runs.length,
    totalArtifacts,
    lastCapturedAt: runs[0] ? runs[0].capturedAt : null,
    runs: runs.slice(0, limit),
    buckets: bucketSummaries,
  };
}

function buildManifest(memoryRoot, records, updatedAt, namespaceOptions = {}) {
  const summary = summarizeRecords(memoryRoot, records, 25);
  const namespace = records[0] && records[0].namespace
    ? buildRuntimeNamespaceFromRecord(memoryRoot, records[0])
    : buildRuntimeNamespaceContext(memoryRoot, namespaceOptions);
  const reconciliation = buildRuntimeReconciliation(memoryRoot, records);

  return {
    kind: 'runtime-shadow-manifest',
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    authoritative: false,
    namespace,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    updatedAt,
    runCount: summary.runCount,
    totalArtifacts: summary.totalArtifacts,
    lastCapturedAt: summary.lastCapturedAt,
    reconciliation,
    buckets: Object.fromEntries(
      RUNTIME_BUCKETS.map((bucketName) => [bucketName, { count: summary.buckets[bucketName].count }])
    ),
    runs: summary.runs,
  };
}

function writeManifest(memoryRoot, records, updatedAt, namespaceOptions = {}) {
  const namespace = records[0] && records[0].namespace
    ? buildRuntimeNamespaceFromRecord(memoryRoot, records[0])
    : buildRuntimeNamespaceContext(memoryRoot, namespaceOptions);
  const manifestPath = resolveRuntimeManifestPath(memoryRoot, namespace.scope);
  const manifest = buildManifest(memoryRoot, records, updatedAt, namespace.scope);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function captureShadowRuntime(options) {
  const memoryRoot = requireMemoryRoot(options);
  const runId = sanitizeRunId(options.runId);
  const capturedAt = String(options.capturedAt || new Date().toISOString());
  const artifacts = normalizeRuntimeArtifacts(options.artifacts);
  const runtimeInputs = normalizeRuntimeInputs(options.runtimeInputs || options.inputs);
  const namespace = buildRuntimeNamespaceContext(memoryRoot, {
    tenantId: options.tenantId,
    spaceId: options.spaceId,
    userId: options.userId,
    agentId: options.agentId,
    roleId: options.roleId,
  });
  const paths = ensureRuntimeShadowStore(memoryRoot, namespace.scope);
  const runPath = resolveRuntimeRunPath(memoryRoot, runId, namespace.scope);

  if (fs.existsSync(runPath) && options.overwrite !== true) {
    throw new Error(`Runtime shadow record already exists for runId ${runId}`);
  }

  const record = {
    kind: 'runtime-shadow-record',
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    authoritative: false,
    namespace,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    runId,
    source: String(options.source || 'unknown'),
    capturedAt,
    runtimeInputs,
    counts: Object.fromEntries(
      RUNTIME_BUCKETS.map((bucketName) => [bucketName, artifacts[bucketName].length])
    ),
    artifacts,
  };

  fs.writeFileSync(runPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  const records = listRuntimeRecords({
    memoryRoot,
    ...namespace.scope,
  }).map((runtimeRecord) => ({
    ...runtimeRecord,
    filePath: resolveRuntimeRunPath(memoryRoot, runtimeRecord.runId, namespace.scope),
  }));

  const manifest = writeManifest(memoryRoot, records, capturedAt, namespace.scope);

  return {
    kind: 'runtime-shadow-capture',
    authoritative: false,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    memoryRoot,
    runtimeRoot: paths.runtimeRoot,
    shadowRoot: paths.shadowRoot,
    runPath,
    manifestPath: paths.manifestPath,
    record: {
      ...record,
      filePath: runPath,
    },
    manifest,
  };
}

function getRuntimeDelta(options) {
  const memoryRoot = requireMemoryRoot(options);
  const namespace = buildRuntimeNamespaceContext(memoryRoot, options);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const shadowRoot = resolveRuntimeShadowRoot(memoryRoot, namespace.scope);
  const runtimeRoot = resolveRuntimeRoot(memoryRoot);
  const manifestPath = resolveRuntimeManifestPath(memoryRoot, namespace.scope);
  const exists = fs.existsSync(shadowRoot);
  const hasManifest = fs.existsSync(manifestPath);

  const records = listRuntimeRecords({
    memoryRoot,
    ...namespace.scope,
  }).map((record) => ({
    ...record,
    filePath: resolveRuntimeRunPath(memoryRoot, record.runId, namespace.scope),
  }));
  const summary = summarizeRecords(memoryRoot, records, limit);
  const manifest = hasManifest
    ? normalizeManifestNamespace(memoryRoot, loadJson(manifestPath))
    : buildManifest(memoryRoot, records, summary.lastCapturedAt || null, namespace.scope);
  const reconciliation = compareRuntimeReconciliation({
    exists,
    hasManifest,
    manifest: manifest ? manifest.reconciliation : null,
    current: buildRuntimeReconciliation(memoryRoot, records),
  });

  return {
    kind: 'runtime-delta',
    authoritative: false,
    namespace,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    memoryRoot,
    runtimeRoot,
    shadowRoot,
    manifestPath,
    exists,
    manifest,
    reconciliation,
    runCount: summary.runCount,
    totalArtifacts: summary.totalArtifacts,
    lastCapturedAt: summary.lastCapturedAt,
    buckets: summary.buckets,
    runs: summary.runs,
  };
}

function getRuntimeRecallBundle(options) {
  const memoryRoot = requireMemoryRoot(options);
  const namespace = buildRuntimeNamespaceContext(memoryRoot, options);
  const text = String(options.text || '').trim();
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const tokens = tokenizeText(text);
  const records = listRuntimeRecords({
    memoryRoot,
    ...namespace.scope,
  }).map((record) => ({
    ...record,
    filePath: resolveRuntimeRunPath(memoryRoot, record.runId, namespace.scope),
  }));
  const manifestPath = resolveRuntimeManifestPath(memoryRoot, namespace.scope);
  const hasManifest = fs.existsSync(manifestPath);
  const manifest = hasManifest
    ? normalizeManifestNamespace(memoryRoot, loadJson(manifestPath))
    : buildManifest(
        memoryRoot,
        records,
        records[0] ? records[0].capturedAt : null,
        namespace.scope
      );
  const reconciliation = compareRuntimeReconciliation({
    exists: records.length > 0,
    hasManifest,
    manifest: manifest ? manifest.reconciliation : null,
    current: buildRuntimeReconciliation(memoryRoot, records),
  });
  const allHits = [];

  for (const record of records) {
    for (const bucketName of RUNTIME_BUCKETS) {
      for (const entry of record.artifacts[bucketName] || []) {
        const score = scoreText(
          [
            bucketName,
            entry.id,
            entry.summary,
            entry.text,
            Array.isArray(entry.tags) ? entry.tags.join(' ') : '',
            entry.metadata ? JSON.stringify(entry.metadata) : '',
          ]
            .filter(Boolean)
            .join('\n'),
          tokens
        );

        if (score === 0) {
          continue;
        }

        allHits.push({
          score,
          bucket: bucketName,
          runId: record.runId,
          source: record.source,
          capturedAt: record.capturedAt,
          namespace: record.namespace,
          relativePath: path.relative(memoryRoot, record.filePath).split(path.sep).join('/'),
          ...entry,
        });
      }
    }
  }

  allHits.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return sortByNewest(left, right);
  });

  const byBucket = Object.fromEntries(
    RUNTIME_BUCKETS.map((bucketName) => {
      const bucketHits = allHits.filter((hit) => hit.bucket === bucketName);
      return [
        bucketName,
        {
          count: bucketHits.length,
          entries: bucketHits.slice(0, limit),
        },
      ];
    })
  );

  return {
    kind: 'runtime-recall-bundle',
    authoritative: false,
    namespace,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    memoryRoot,
    text,
    tokens,
    manifest,
    reconciliation,
    shadowExists: records.length > 0,
    runCount: records.length,
    totalArtifacts: manifest.totalArtifacts || 0,
    lastCapturedAt: manifest.lastCapturedAt || null,
    totalHits: allHits.length,
    hits: allHits.slice(0, limit),
    buckets: byBucket,
    byBucket,
    freshnessBoundary: {
      runtimeLastCapturedAt: manifest.lastCapturedAt || null,
      runtimeAuthoritative: false,
      runtimeReconciliationStatus: reconciliation.status,
    },
  };
}

module.exports = {
  RUNTIME_BUCKETS,
  RUNTIME_MANIFEST_PATH,
  RUNTIME_ROOT_PATH,
  RUNTIME_RUNS_ROOT_PATH,
  RUNTIME_SCHEMA_VERSION,
  RUNTIME_SHADOW_ROOT_PATH,
  captureShadowRuntime,
  ensureRuntimeShadowStore,
  getRuntimeRecallBundle,
  getRuntimeDelta,
  listRuntimeRecords,
  resolveRuntimeManifestPath,
  resolveRuntimeRoot,
  resolveRuntimeRunPath,
  resolveRuntimeRunsRoot,
  resolveRuntimeShadowRoot,
};
