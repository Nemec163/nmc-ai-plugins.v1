'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CANON_SINGLE_WRITER,
  buildManifestSnapshot,
  createCanonWriteLock,
  createPromoterInterface,
  resolveCanonLockPath,
  validateCanonWriteLock,
  validateGraphEdge,
  validateManifestSnapshot,
  validatePromotionRequest,
  verifyCanonWorkspace,
} = require('..');

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

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-canon-fixture-'));
  const workspaceCopy = path.join(tempRoot, 'workspace');

  try {
    copyDirectory(WORKSPACE_ROOT, workspaceCopy);

    const verification = verifyCanonWorkspace({
      memoryRoot: workspaceCopy,
      updatedAt: '2026-03-17T00:00:00Z',
      today: '2026-03-17',
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
      acquiredAt: '2026-03-17T00:00:00Z',
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
        operation: 'legacy-apply',
      }).valid,
      true
    );

    const promoter = createPromoterInterface();
    assert.equal(promoter.single_writer, CANON_SINGLE_WRITER);

    console.log(
      'Validated 6 canonical record fixtures and rebuilt 6 graph edges through @nmc/memory-canon.'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
