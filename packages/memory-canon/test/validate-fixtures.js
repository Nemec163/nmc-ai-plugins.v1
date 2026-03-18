'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  acquireCanonWriteLock,
  CANON_SINGLE_WRITER,
  buildManifestSnapshot,
  createCanonWriteLock,
  createPromoterInterface,
  readCanonWriteLock,
  releaseCanonWriteLock,
  resolveCanonLockPath,
  validateCanonWriteLock,
  validateGraphEdge,
  validateManifestSnapshot,
  validatePromotionRequest,
  verifyCanonWorkspace,
} = require('..');
const { parseProjectionRecords } = require('../../memory-os-gateway/lib/records');

const FIXTURE_ROOT = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/tests/fixtures'
);
const WORKSPACE_ROOT = path.join(FIXTURE_ROOT, 'workspace');
const GOLDEN_ROOT = path.join(
  __dirname,
  '../../../nmc-memory-plugin/tests/golden'
);

function copyDirectory(sourceDir, targetDir) {
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function loadGoldenChecksums(filePath) {
  const checksums = {};
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const [relativePath, checksum] = line.split('\t');
    checksums[relativePath] = checksum;
  }

  return checksums;
}

function normalizeRecords(memoryRoot, relativePath) {
  const filePath = path.join(memoryRoot, relativePath);
  const content = fs.readFileSync(filePath, 'utf8');

  return parseProjectionRecords(content).map((record) => ({
    anchorId: record.anchorId,
    recordId: record.metadata.record_id || null,
    type: record.metadata.type || null,
    confidence: record.metadata.confidence || null,
    status: record.metadata.status || null,
    evidence: [...(record.metadata.evidence || [])].sort(),
    links: [...(record.metadata.links || [])]
      .map((link) => ({
        rel: link.rel,
        target: link.target,
      }))
      .sort((left, right) => {
        const leftKey = `${left.rel}:${left.target}`;
        const rightKey = `${right.rel}:${right.target}`;
        return leftKey.localeCompare(rightKey);
      }),
  }));
}

function blankWritableCanon(memoryRoot) {
  const targets = [
    'core/user/timeline/2026/03/05.md',
    'core/user/knowledge/work.md',
    'core/user/knowledge/preferences.md',
    'core/user/state/current.md',
    'core/agents/trader/PITFALLS.md',
  ];

  targets.forEach((relativePath) => {
    const filePath = path.join(memoryRoot, relativePath);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  });

  const processedPath = path.join(memoryRoot, 'intake/processed/2026-03-05.md');
  if (fs.existsSync(processedPath)) {
    fs.rmSync(processedPath);
  }

  fs.writeFileSync(
    path.join(memoryRoot, 'core/meta/manifest.json'),
    '{\n  "schema_version": "1.0",\n  "last_updated": null,\n  "record_counts": {\n    "events": 0,\n    "facts": 0,\n    "states": 0,\n    "identities": 0,\n    "competences": 0\n  },\n  "checksums": {},\n  "edges_count": 0\n}\n',
    'utf8'
  );
  fs.writeFileSync(path.join(memoryRoot, 'core/meta/graph/edges.jsonl'), '', 'utf8');
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-canon-fixture-'));
  const workspaceCopy = path.join(tempRoot, 'workspace');
  const promotionCopy = path.join(tempRoot, 'promotion-workspace');

  try {
    copyDirectory(WORKSPACE_ROOT, workspaceCopy);
    copyDirectory(WORKSPACE_ROOT, promotionCopy);

    const verification = verifyCanonWorkspace({
      memoryRoot: workspaceCopy,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });

    assert.deepEqual(verification.recordCounts, {
      events: 2,
      facts: 2,
      states: 1,
      identities: 0,
      competences: 1,
    });
    assert.equal(verification.edgesCount, 6);
    assert.equal(verification.warningCount, 0);

    const manifestValidation = validateManifestSnapshot(verification.manifest);
    assert.equal(manifestValidation.valid, true, 'Expected derived manifest to validate');
    assert.deepEqual(
      verification.manifest.checksums,
      loadGoldenChecksums(path.join(GOLDEN_ROOT, 'canonical-file-checksums.txt'))
    );

    const derivedManifest = buildManifestSnapshot({
      schemaVersion: verification.manifest.schema_version,
      lastUpdated: verification.manifest.last_updated,
      recordCounts: verification.recordCounts,
      checksums: verification.manifest.checksums,
      edgesCount: verification.edgesCount,
    });
    assert.equal(validateManifestSnapshot(derivedManifest).valid, true);

    const lockPath = resolveCanonLockPath(workspaceCopy);
    assert.equal(
      lockPath.endsWith('core/meta/canon-write.lock.json'),
      true,
      'Expected lock path to resolve inside core/meta'
    );

    const lock = createCanonWriteLock({
      holder: 'fixture-test',
      acquiredAt: '2026-03-18T00:00:00Z',
    });
    assert.equal(lock.writer, CANON_SINGLE_WRITER);
    assert.equal(validateCanonWriteLock(lock).valid, true);

    assert.equal(
      validateGraphEdge({
        src: 'evt-2026-03-05-001',
        rel: 'caused',
        dst: 'st-2026-03-05-001',
      }).valid,
      true
    );

    assert.equal(
      validatePromotionRequest({
        type: 'canon-write',
        memory_root: workspaceCopy,
        writer: CANON_SINGLE_WRITER,
        operation: 'core-promoter',
      }).valid,
      true
    );

    const promoter = createPromoterInterface();
    assert.equal(promoter.single_writer, CANON_SINGLE_WRITER);

    const directAcquire = acquireCanonWriteLock({
      memoryRoot: workspaceCopy,
      holder: 'fixture-lock-helper',
      acquiredAt: '2026-03-18T00:00:30Z',
      operation: 'core-promoter',
    });
    assert.equal(directAcquire.path, lockPath);
    assert.equal(readCanonWriteLock(workspaceCopy).lock.holder, 'fixture-lock-helper');
    assert.equal(
      releaseCanonWriteLock({
        memoryRoot: workspaceCopy,
        expectedHolder: 'fixture-lock-helper',
      }).released,
      true
    );
    assert.equal(readCanonWriteLock(workspaceCopy), null);

    const request = {
      type: 'canon-write',
      memory_root: workspaceCopy,
      writer: CANON_SINGLE_WRITER,
      operation: 'core-promoter',
      holder: 'fixture-test',
    };
    const acquired = promoter.acquireLock(request);
    assert.equal(acquired.acquired, true);
    assert.equal(fs.existsSync(lockPath), true);

    const secondAcquire = promoter.acquireLock(request);
    assert.equal(secondAcquire.acquired, false);
    assert.equal(secondAcquire.existingLock.holder, 'fixture-test');

    const released = promoter.releaseLock(request);
    assert.equal(released.released, true);
    assert.equal(fs.existsSync(lockPath), false);

    blankWritableCanon(promotionCopy);

    const promoted = promoter.promote({
      type: 'canon-write',
      memory_root: promotionCopy,
      writer: CANON_SINGLE_WRITER,
      holder: 'fixture-promoter',
      operation: 'core-promoter',
      batch_date: '2026-03-05',
    });
    assert.equal(promoted.promoted, true);
    assert.equal(
      fs.existsSync(path.join(promotionCopy, 'intake/processed/2026-03-05.md')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(promotionCopy, 'intake/pending/2026-03-05.md')),
      false
    );

    const expectedPaths = [
      'core/user/timeline/2026/03/05.md',
      'core/user/knowledge/work.md',
      'core/user/knowledge/preferences.md',
      'core/user/state/current.md',
      'core/agents/trader/PITFALLS.md',
    ];

    expectedPaths.forEach((relativePath) => {
      assert.deepEqual(
        normalizeRecords(promotionCopy, relativePath),
        normalizeRecords(WORKSPACE_ROOT, relativePath),
        `Expected normalized promoted records to match frozen fixture for ${relativePath}`
      );
    });

    const promotedVerification = verifyCanonWorkspace({
      memoryRoot: promotionCopy,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    const expectedVerification = verifyCanonWorkspace({
      memoryRoot: workspaceCopy,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });

    assert.deepEqual(promotedVerification.recordCounts, expectedVerification.recordCounts);
    assert.equal(promotedVerification.edgesCount, expectedVerification.edgesCount);
    assert.equal(
      fs.readFileSync(path.join(promotionCopy, 'core/meta/graph/edges.jsonl'), 'utf8'),
      fs.readFileSync(path.join(workspaceCopy, 'core/meta/graph/edges.jsonl'), 'utf8')
    );

    console.log(
      'Validated 6 canonical record fixtures and rebuilt 6 graph edges through @nmc/memory-canon.'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
