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
  '../../../tests/fixtures'
);
const WORKSPACE_ROOT = path.join(FIXTURE_ROOT, 'workspace');
const GOLDEN_ROOT = path.join(
  __dirname,
  '../../../tests/golden'
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
    'core/agents/trader/PLAYBOOK.md',
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
    '{\n  "schema_version": "1.0",\n  "last_updated": null,\n  "record_counts": {\n    "events": 0,\n    "facts": 0,\n    "states": 0,\n    "identities": 0,\n    "competences": 0,\n    "procedures": 0\n  },\n  "checksums": {},\n  "edges_count": 0\n}\n',
    'utf8'
  );
  fs.writeFileSync(path.join(memoryRoot, 'core/meta/graph/edges.jsonl'), '', 'utf8');
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-canon-fixture-'));
  const workspaceCopy = path.join(tempRoot, 'workspace');
  const promotionCopy = path.join(tempRoot, 'promotion-workspace');
  const procedureUpdateCopy = path.join(tempRoot, 'procedure-update-workspace');

  try {
    copyDirectory(WORKSPACE_ROOT, workspaceCopy);
    copyDirectory(WORKSPACE_ROOT, promotionCopy);
    copyDirectory(WORKSPACE_ROOT, procedureUpdateCopy);

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
      procedures: 1,
    });
    assert.equal(verification.edgesCount, 6);
    assert.equal(verification.warningCount, 0);
    assert.equal(verification.reconciliation.strategy, 'content-addressed-graph-rebuild');
    assert.equal(verification.reconciliation.changed, false);
    assert.deepEqual(verification.reconciliation.reasons, []);
    assert.equal(typeof verification.reconciliation.record_checksum_digest, 'string');
    assert.equal(typeof verification.reconciliation.edges_digest, 'string');

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
      reconciliation: verification.manifest.reconciliation,
    });
    assert.equal(validateManifestSnapshot(derivedManifest).valid, true);

    const repeatedVerification = verifyCanonWorkspace({
      memoryRoot: workspaceCopy,
      updatedAt: '2026-03-18T01:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(repeatedVerification.reconciliation.changed, false);
    assert.deepEqual(repeatedVerification.reconciliation.reasons, []);

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
      'core/agents/trader/PLAYBOOK.md',
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

    const linkRemovalCopy = path.join(tempRoot, 'link-removal-workspace');
    copyDirectory(WORKSPACE_ROOT, linkRemovalCopy);
    verifyCanonWorkspace({
      memoryRoot: linkRemovalCopy,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    const workKnowledgePath = path.join(linkRemovalCopy, 'core/user/knowledge/work.md');
    fs.writeFileSync(
      workKnowledgePath,
      fs
        .readFileSync(workKnowledgePath, 'utf8')
        .replace('links:\n  - rel: derived_from\n    target: "evt-2026-03-05-001"\n', ''),
      'utf8'
    );
    const reconciledAfterLinkRemoval = verifyCanonWorkspace({
      memoryRoot: linkRemovalCopy,
      updatedAt: '2026-03-18T02:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(reconciledAfterLinkRemoval.edgesCount, 5);
    assert.equal(
      fs
        .readFileSync(path.join(linkRemovalCopy, 'core/meta/graph/edges.jsonl'), 'utf8')
        .includes('"src":"fct-2026-03-05-001","rel":"derived_from","dst":"evt-2026-03-05-001"'),
      false
    );
    assert.equal(
      reconciledAfterLinkRemoval.reconciliation.reasons.some(
        (reason) => reason.code === 'record-content-changed'
      ),
      true
    );

    fs.writeFileSync(
      path.join(procedureUpdateCopy, 'intake/pending/2026-03-19.md'),
      [
        '---',
        'batch_date: "2026-03-19"',
        'schema_version: "1.0"',
        'generated_by: "procedure-version-fixture"',
        'updated_at: "2026-03-19T09:30:00Z"',
        '---',
        '# Extracted Claims - 2026-03-19',
        '',
        '## claim-20260319-001',
        '- source_session: "trader-2026-03-19-xyz"',
        '- source_agent: "trader"',
        '- observed_at: "2026-03-19T09:30:00Z"',
        '- confidence: "high"',
        '- tags: ["trading", "playbook", "procedure"]',
        '- target_layer: "agent"',
        '- target_domain: "trader"',
        '- target_type: "procedure"',
        '- procedure_key: "volatile-open-confirmation-checklist"',
        '- acceptance: ["Wait for fakeout confirmation before calling momentum continuation.", "Escalate to confirmation-first guidance when the open is volatile."]',
        '- feedback_refs: ["runtime/shadow/runs/trader-2026-03-19-xyz.json#procedureFeedback/pf-002"]',
        '- claim: "Tighten the confirmation-first checklist so volatile opens require an explicit fakeout check before momentum guidance."',
        '- curator_decision: "accept"',
        '- curator_notes: "Promote runtime feedback into v2 of the playbook procedure."',
        '',
      ].join('\n'),
      'utf8'
    );

    promoter.promote({
      type: 'canon-write',
      memory_root: procedureUpdateCopy,
      writer: CANON_SINGLE_WRITER,
      holder: 'fixture-procedure-promoter',
      operation: 'core-promoter',
      batch_date: '2026-03-19',
    });

    const procedureRecords = parseProjectionRecords(
      fs.readFileSync(path.join(procedureUpdateCopy, 'core/agents/trader/PLAYBOOK.md'), 'utf8')
    ).map((record) => record.metadata);
    const version1 = procedureRecords.find((record) => record.record_id === 'prc-2026-03-05-001');
    const version2 = procedureRecords.find((record) => record.record_id === 'prc-2026-03-19-001');

    assert.equal(version1.status, 'deprecated');
    assert.equal(version2.type, 'procedure');
    assert.equal(version2.procedure_key, 'volatile-open-confirmation-checklist');
    assert.equal(version2.version, '2');
    assert.equal(version2.supersedes, 'prc-2026-03-05-001');
    assert.deepEqual(version2.feedback_refs, [
      'runtime/shadow/runs/trader-2026-03-19-xyz.json#procedureFeedback/pf-002',
    ]);

    console.log(
      'Validated 7 canonical record fixtures and rebuilt 6 graph edges through @nmc/memory-canon.'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
