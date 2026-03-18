'use strict';

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

function requireMemoryRoot(options) {
  const memoryRoot = options && options.memoryRoot;
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
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

function resolveRuntimeShadowRoot(memoryRoot) {
  return path.join(path.resolve(memoryRoot), RUNTIME_SHADOW_ROOT_PATH);
}

function resolveRuntimeRunsRoot(memoryRoot) {
  return path.join(path.resolve(memoryRoot), RUNTIME_RUNS_ROOT_PATH);
}

function resolveRuntimeManifestPath(memoryRoot) {
  return path.join(path.resolve(memoryRoot), RUNTIME_MANIFEST_PATH);
}

function resolveRuntimeRunPath(memoryRoot, runId) {
  return path.join(resolveRuntimeRunsRoot(memoryRoot), `${sanitizeRunId(runId)}.json`);
}

function ensureRuntimeShadowStore(memoryRoot) {
  ensureDir(resolveRuntimeRoot(memoryRoot));
  ensureDir(resolveRuntimeShadowRoot(memoryRoot));
  ensureDir(resolveRuntimeRunsRoot(memoryRoot));

  return {
    runtimeRoot: resolveRuntimeRoot(memoryRoot),
    shadowRoot: resolveRuntimeShadowRoot(memoryRoot),
    runsRoot: resolveRuntimeRunsRoot(memoryRoot),
    manifestPath: resolveRuntimeManifestPath(memoryRoot),
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
  const runsRoot = resolveRuntimeRunsRoot(memoryRoot);

  if (!fs.existsSync(runsRoot)) {
    return [];
  }

  return fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => loadJson(path.join(runsRoot, entry.name)))
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

function buildManifest(memoryRoot, records, updatedAt) {
  const summary = summarizeRecords(memoryRoot, records, 25);

  return {
    kind: 'runtime-shadow-manifest',
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    authoritative: false,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    updatedAt,
    runCount: summary.runCount,
    totalArtifacts: summary.totalArtifacts,
    lastCapturedAt: summary.lastCapturedAt,
    buckets: Object.fromEntries(
      RUNTIME_BUCKETS.map((bucketName) => [bucketName, { count: summary.buckets[bucketName].count }])
    ),
    runs: summary.runs,
  };
}

function writeManifest(memoryRoot, records, updatedAt) {
  const manifestPath = resolveRuntimeManifestPath(memoryRoot);
  const manifest = buildManifest(memoryRoot, records, updatedAt);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function captureShadowRuntime(options) {
  const memoryRoot = requireMemoryRoot(options);
  const runId = sanitizeRunId(options.runId);
  const capturedAt = String(options.capturedAt || new Date().toISOString());
  const artifacts = normalizeRuntimeArtifacts(options.artifacts);
  const runtimeInputs = normalizeRuntimeInputs(options.runtimeInputs || options.inputs);
  const paths = ensureRuntimeShadowStore(memoryRoot);
  const runPath = resolveRuntimeRunPath(memoryRoot, runId);

  if (fs.existsSync(runPath) && options.overwrite !== true) {
    throw new Error(`Runtime shadow record already exists for runId ${runId}`);
  }

  const record = {
    kind: 'runtime-shadow-record',
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    authoritative: false,
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

  const records = listRuntimeRecords({ memoryRoot }).map((runtimeRecord) => ({
    ...runtimeRecord,
    filePath: resolveRuntimeRunPath(memoryRoot, runtimeRecord.runId),
  }));

  const manifest = writeManifest(memoryRoot, records, capturedAt);

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
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const shadowRoot = resolveRuntimeShadowRoot(memoryRoot);
  const runtimeRoot = resolveRuntimeRoot(memoryRoot);
  const manifestPath = resolveRuntimeManifestPath(memoryRoot);
  const exists = fs.existsSync(shadowRoot);

  const records = listRuntimeRecords({ memoryRoot }).map((record) => ({
    ...record,
    filePath: resolveRuntimeRunPath(memoryRoot, record.runId),
  }));
  const summary = summarizeRecords(memoryRoot, records, limit);
  const manifest = fs.existsSync(manifestPath)
    ? loadJson(manifestPath)
    : buildManifest(memoryRoot, records, summary.lastCapturedAt || null);

  return {
    kind: 'runtime-delta',
    authoritative: false,
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    memoryRoot,
    runtimeRoot,
    shadowRoot,
    manifestPath,
    exists,
    manifest,
    runCount: summary.runCount,
    totalArtifacts: summary.totalArtifacts,
    lastCapturedAt: summary.lastCapturedAt,
    buckets: summary.buckets,
    runs: summary.runs,
  };
}

function getRuntimeRecallBundle(options) {
  const memoryRoot = requireMemoryRoot(options);
  const text = String(options.text || '').trim();
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const tokens = tokenizeText(text);
  const records = listRuntimeRecords({ memoryRoot }).map((record) => ({
    ...record,
    filePath: resolveRuntimeRunPath(memoryRoot, record.runId),
  }));
  const manifestPath = resolveRuntimeManifestPath(memoryRoot);
  const manifest = fs.existsSync(manifestPath)
    ? loadJson(manifestPath)
    : buildManifest(memoryRoot, records, records[0] ? records[0].capturedAt : null);
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
    disposable: true,
    rebuildableFrom: ['canon', 'captured-runtime-inputs'],
    memoryRoot,
    text,
    tokens,
    manifest,
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
