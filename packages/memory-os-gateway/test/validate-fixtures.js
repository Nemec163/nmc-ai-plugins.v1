'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  bootstrap,
  buildReadIndex,
  compareProcedureVersions,
  captureRuntime,
  completeJob,
  feedback,
  getCanonicalCurrent,
  getHealth,
  getProjection,
  getRecallBundle,
  getRuntimeDelta,
  getRoleBundle,
  getStatus,
  inspectProcedure,
  listProcedures,
  propose,
  query,
  readReadIndex,
  readRecord,
  verify,
  verifyReadIndex,
} = require('..');
const { acquireCanonWriteLock, createPromoterInterface } = require('../../memory-canon');

const WORKSPACE_FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/workspace'
);
const FIXTURE_MEMORY_ROOT = WORKSPACE_FIXTURE;
const ADAPTER_ROOT = path.resolve(__dirname, '../../adapter-openclaw');
const ADAPTER_SKILLS_ROOT = path.resolve(__dirname, '../../adapter-openclaw/skills');
const CLI_PATH = path.resolve(__dirname, '../bin/memory-os-gateway.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memory-os-gateway-validate-'));
}

function hashCanonTree(memoryRoot) {
  const crypto = require('node:crypto');
  const canonRoot = path.join(memoryRoot, 'core');
  const snapshot = {};
  const stack = [canonRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      const relativePath = path.relative(memoryRoot, entryPath).split(path.sep).join('/');
      snapshot[relativePath] = crypto
        .createHash('sha1')
        .update(fs.readFileSync(entryPath))
        .digest('hex');
    }
  }

  return snapshot;
}

function writeProcedureUpdateBatch(memoryRoot) {
  fs.writeFileSync(
    path.join(memoryRoot, 'intake/pending/2026-03-19.md'),
    [
      '---',
      'batch_date: "2026-03-19"',
      'schema_version: "1.0"',
      'generated_by: "gateway-procedure-fixture"',
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
}

function main() {
  const packageProbeRoot = makeTempRoot();
  try {
    const packageLinkRoot = path.join(packageProbeRoot, 'node_modules');
    fs.mkdirSync(packageLinkRoot, { recursive: true });
    fs.symlinkSync(
      path.resolve(__dirname, '..'),
      path.join(packageLinkRoot, 'memory-os-gateway'),
      'dir'
    );

    const packageExportProbe = spawnSync(
      process.execPath,
      [
        '-e',
        'const assert = require("node:assert/strict"); const gateway = require("memory-os-gateway"); assert.equal(typeof gateway.getOpsSnapshot, "undefined"); assert.equal(typeof gateway.inspectOps, "undefined"); assert.equal(typeof gateway.inspect_ops, "undefined"); try { require("memory-os-gateway/ops"); console.error("expected memory-os-gateway/ops to stay unexported"); process.exit(1); } catch (error) { if (error && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") { process.exit(0); } console.error(error && error.stack ? error.stack : String(error)); process.exit(2); }',
      ],
      {
        cwd: packageProbeRoot,
        encoding: 'utf8',
      }
    );
    assert.equal(packageExportProbe.status, 0, packageExportProbe.stderr);
  } finally {
    fs.rmSync(packageProbeRoot, { recursive: true, force: true });
  }

  const record = readRecord({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    recordId: 'fct-2026-03-05-001',
  });
  assert.equal(record.relativePath, 'core/user/knowledge/work.md');
  assert.equal(record.namespace.namespaceKey, 'default/default/default');
  assert.equal(record.record.type, 'fact');
  assert.match(record.record.body, /high-volatility conditions/);

  const projection = getProjection({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    projectionPath: 'core/user/state/current.md',
  });
  assert.equal(projection.frontmatter.layer, 'L5');
  assert.equal(projection.namespace.mode, 'single-tenant-default');
  assert.equal(projection.records.length, 1);
  assert.equal(projection.records[0].recordId, 'st-2026-03-05-001');

  const current = getCanonicalCurrent({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(current.manifest.record_counts.events, 2);
  assert.equal(current.namespace.namespaceKey, 'default/default/default');
  assert.equal(current.manifest.record_counts.procedures, 1);
  assert.equal(current.projections.identity.records.length, 0);
  assert.equal(current.projections.state.records[0].recordId, 'st-2026-03-05-001');

  const procedures = listProcedures({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(procedures.kind, 'procedure-catalog');
  assert.equal(procedures.summary.lineageCount, 1);
  assert.equal(procedures.summary.recordCount, 1);
  assert.equal(procedures.summary.activeCount, 1);
  assert.equal(procedures.procedures[0].procedureKey, 'volatile-open-confirmation-checklist');
  assert.equal(procedures.procedures[0].currentVersion.recordId, 'prc-2026-03-05-001');

  const procedureInspection = inspectProcedure({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    roleId: 'trader',
    procedureKey: 'volatile-open-confirmation-checklist',
  });
  assert.equal(procedureInspection.kind, 'procedure-inspection');
  assert.equal(procedureInspection.versionCount, 1);
  assert.equal(procedureInspection.currentVersion.recordId, 'prc-2026-03-05-001');
  assert.equal(procedureInspection.currentVersion.evidenceLinkage.summary.feedbackRefCount, 1);
  assert.equal(procedureInspection.currentVersion.evidenceLinkage.summary.resolvedFeedbackCount, 0);
  assert.equal(procedureInspection.currentVersion.evidenceLinkage.summary.missingFeedbackCount, 1);
  assert.equal(
    procedureInspection.currentVersion.evidenceLinkage.feedbackRefs[0].error,
    'missing-runtime-run'
  );
  assert.deepEqual(procedureInspection.versions[0].diffView.acceptance, [
    'Wait for confirmation after the initial fakeout before calling a momentum entry.',
    'Prefer slower confirmation-based entries during volatile opens.',
  ]);
  assert.equal(
    inspectProcedure({
      memoryRoot: FIXTURE_MEMORY_ROOT,
      recordId: 'prc-2026-03-05-001',
    }).procedureKey,
    'volatile-open-confirmation-checklist'
  );
  assert.throws(
    () =>
      inspectProcedure({
        memoryRoot: FIXTURE_MEMORY_ROOT,
        recordId: 'prc-2026-03-05-001',
        procedureKey: 'wrong-procedure-key',
      }),
    /belongs to procedure_key/
  );

  const roleBundle = getRoleBundle({
    roleId: 'mnemo',
    installDate: '2026-03-18',
    memoryPath: '../system/memory',
    systemPath: '../system',
  });
  assert.equal(roleBundle.manifest.id, 'mnemo');
  assert.equal(typeof roleBundle.files['BOOT.md'], 'string');

  const search = query({
    memoryRoot: FIXTURE_MEMORY_ROOT,
    text: 'What is the current approach on volatile mornings?',
  });
  assert.equal(search.namespace.namespaceKey, 'default/default/default');
  assert.equal(search.contract.rankingVersion, '1');
  assert.equal(search.readIndex.status, 'ok');
  assert.equal(search.readIndex.namespace.namespaceKey, 'default/default/default');
  assert.equal(search.readIndex.persisted, true);
  assert.equal(search.freshnessBoundary.runtimeDeltaIncluded, true);
  assert.equal(search.canonicalHits[0].recordId, 'st-2026-03-05-001');
  assert.equal(search.canonicalHits[0].authoritative, true);
  assert.equal(search.canonicalHits[0].namespace.namespaceKey, 'default/default/default');
  assert.equal(
    search.canonicalHits[0].ranking.reasons.some((reason) => reason.code === 'current-projection'),
    true
  );
  assert.equal(
    search.runtimeDelta.some((hit) => hit.claimId === 'claim-20260305-003'),
    true
  );

  const status = getStatus({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(status.namespace.namespaceKey, 'default/default/default');
  assert.equal(status.manifest.recordCounts.events, 2);
  assert.equal(status.manifest.recordCounts.procedures, 1);
  assert.equal(status.intake.pendingFiles, 1);
  assert.equal(status.intake.backlogAlert, false);
  assert.equal(status.runtime.shadowExists, false);
  assert.equal(status.runtime.namespace.namespaceKey, 'default/default/default');
  assert.equal(status.runtime.runCount, 0);
  assert.equal(status.readIndex.status, 'ok');
  assert.equal(status.readIndex.namespace.namespaceKey, 'default/default/default');
  assert.equal(status.manifest.receipt.status, 'ok');
  assert.equal(status.readIndex.receipt.status, 'ok');
  assert.equal(status.runtime.receipt.status, 'not-captured');
  assert.equal(status.verificationProvenance.receipts.canonVerify.status, 'ok');

  const health = getHealth({
    memoryRoot: FIXTURE_MEMORY_ROOT,
  });
  assert.equal(health.status, 'healthy');
  assert.equal(health.checks.some((check) => check.name === 'verify-script' && check.ok), true);
  assert.equal(
    health.warnings.includes('Manifest verify receipt is missing and verify provenance is incomplete.'),
    false
  );

  const verifyRoot = makeTempRoot();
  try {
    const verifyWorkspaceRoot = path.join(verifyRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, verifyWorkspaceRoot, { recursive: true });
    const verification = verify({
      memoryRoot: verifyWorkspaceRoot,
      updatedAt: '2026-03-18T00:00:00Z',
      today: '2026-03-18',
    });
    assert.equal(verification.status, 'ok');
    assert.equal(verification.edgesCount, 6);
    assert.equal(verification.manifest.record_counts.facts, 2);
    assert.equal(verification.manifest.record_counts.procedures, 1);
    assert.equal(verification.reconciliation.strategy, 'content-addressed-graph-rebuild');
    assert.equal(verification.manifest.reconciliation.strategy, 'content-addressed-graph-rebuild');
    assert.equal(verification.receipt.surface, 'canon-verify');
    assert.equal(verification.receipt.action, 'verify');
    assert.equal(verification.verificationProvenance.receipts.canonVerify.exists, true);
    assert.equal(
      verification.verificationProvenance.receipts.canonVerify.evidence.recordChecksumDigest,
      verification.reconciliation.record_checksum_digest
    );
    assert.equal(
      verification.verificationProvenance.receipts.readIndex.status,
      'ok'
    );
  } finally {
    fs.rmSync(verifyRoot, { recursive: true, force: true });
  }

  const runtimeRoot = makeTempRoot();
  try {
    const runtimeWorkspaceRoot = path.join(runtimeRoot, 'workspace');
    const artifactsFile = path.join(runtimeRoot, 'runtime-artifacts.json');
    const inputsFile = path.join(runtimeRoot, 'runtime-inputs.json');
    fs.cpSync(WORKSPACE_FIXTURE, runtimeWorkspaceRoot, { recursive: true });
    const canonSnapshot = hashCanonTree(runtimeWorkspaceRoot);

    fs.writeFileSync(
      artifactsFile,
      `${JSON.stringify(
        {
          episodic: [
            {
              id: 'ep-001',
              summary: 'Observed a repeated hesitation before volatile-morning entries.',
              text: 'Observed hesitation before volatile-morning entries during the run.',
              observedAt: '2026-03-18T11:55:00Z',
              tags: ['trading', 'volatility'],
            },
          ],
          semanticCache: [
            {
              id: 'sc-001',
              summary: 'Volatile mornings map to slower confirmation-first guidance.',
            },
          ],
          procedural: [
            {
              id: 'proc-001',
              summary: 'Start with a confirmation checklist before suggesting momentum entries.',
            },
          ],
          procedureFeedback: [
            {
              id: 'pf-001',
              summary: 'The confirmation checklist reduced contradictory guidance in this run.',
            },
          ],
          retrievalTraces: [
            {
              id: 'rt-001',
              summary: 'Retrieved current state and pending claims before answering.',
            },
          ],
          triggers: [
            {
              id: 'tr-001',
              summary: 'Current-question phrasing triggered volatile-morning recall flow.',
            },
          ],
          reflections: [
            {
              id: 'rf-001',
              summary: 'Runtime memory should stay inspectable and non-authoritative.',
            },
          ],
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    fs.writeFileSync(
      inputsFile,
      `${JSON.stringify(
        [
          {
            kind: 'transcript',
            sourceSession: 'codex-2026-03-18-001',
            path: 'transcripts/codex-2026-03-18-001.jsonl',
          },
        ],
        null,
        2
      )}\n`,
      'utf8'
    );

    const capture = captureRuntime({
      memoryRoot: runtimeWorkspaceRoot,
      runId: 'trader-2026-03-05-abc',
      source: 'gateway-test',
      capturedAt: '2026-03-18T12:00:00Z',
      runtimeInputs: JSON.parse(fs.readFileSync(inputsFile, 'utf8')),
      artifacts: JSON.parse(fs.readFileSync(artifactsFile, 'utf8')),
    });
    assert.equal(capture.record.authoritative, false);
    assert.equal(capture.record.namespace.actor.agentId, null);
    assert.equal(capture.record.namespace.actor.roleId, null);
    assert.equal(fs.existsSync(capture.runPath), true);
    assert.equal(capture.receipt.surface, 'runtime-summary');
    assert.equal(capture.receipt.action, 'reconcile');
    assert.equal(capture.receipt.evidence.runCount, 1);

    const runtimeDelta = getRuntimeDelta({
      memoryRoot: runtimeWorkspaceRoot,
      limit: 5,
    });
    assert.equal(runtimeDelta.exists, true);
    assert.equal(runtimeDelta.namespace.namespaceKey, 'default/default/default');
    assert.equal(runtimeDelta.runCount, 1);
    assert.equal(runtimeDelta.totalArtifacts, 7);
    assert.equal(runtimeDelta.buckets.episodic.count, 1);
    assert.equal(runtimeDelta.buckets.procedureFeedback.entries[0].id, 'pf-001');
    assert.equal(runtimeDelta.runs[0].namespace.actor.roleId, null);

    const runtimeInspection = inspectProcedure({
      memoryRoot: runtimeWorkspaceRoot,
      roleId: 'trader',
      procedureKey: 'volatile-open-confirmation-checklist',
    });
    assert.equal(runtimeInspection.currentVersion.evidenceLinkage.summary.resolvedFeedbackCount, 1);
    assert.equal(runtimeInspection.currentVersion.evidenceLinkage.linkedRuns[0].runId, 'trader-2026-03-05-abc');
    assert.equal(
      runtimeInspection.currentVersion.evidenceLinkage.linkedArtifacts.procedureFeedback[0].id,
      'pf-001'
    );
    assert.equal(
      runtimeInspection.currentVersion.evidenceLinkage.linkedArtifacts.procedural[0].id,
      'proc-001'
    );

    const recallBundle = getRecallBundle({
      memoryRoot: runtimeWorkspaceRoot,
      roleId: 'mnemo',
      installDate: '2026-03-18',
      text: 'What is the current approach on volatile mornings?',
      limit: 5,
    });
    assert.equal(recallBundle.kind, 'recall-bundle');
    assert.equal(recallBundle.authoritative, false);
    assert.equal(recallBundle.namespace.namespaceKey, 'default/default/default');
    assert.equal(recallBundle.contract.version, '1');
    assert.equal(recallBundle.freshnessBoundary.runtimeAuthoritative, false);
    assert.equal(recallBundle.roleBundle.manifest.id, 'mnemo');
    assert.equal(recallBundle.canonicalRecall.authoritative, true);
    assert.equal(recallBundle.canonicalRecall.namespace.namespaceKey, 'default/default/default');
    assert.equal(recallBundle.pendingRecall.authoritative, false);
    assert.equal(recallBundle.pendingRecall.namespace.namespaceKey, 'default/default/default');
    assert.equal(recallBundle.procedureRecall.kind, 'procedure-aware-recall');
    assert.equal(recallBundle.procedureRecall.canonicalCurrent.authoritative, true);
    assert.equal(recallBundle.procedureRecall.runtimeArtifacts.authoritative, false);
    assert.equal(recallBundle.procedureRecall.canonicalCurrent.hits[0].recordId, 'prc-2026-03-05-001');
    assert.equal(
      recallBundle.procedureRecall.canonicalCurrent.hits[0].procedureSurface.classification,
      'canonical-current-procedure'
    );
    assert.equal(
      recallBundle.procedureRecall.canonicalCurrent.hits[0].procedureSurface.evidenceLinkage.summary.resolvedFeedbackCount,
      1
    );
    assert.equal(
      recallBundle.procedureRecall.canonicalCurrent.hits[0].procedureSurface.evidenceLinkage.linkedRuns[0].runId,
      'trader-2026-03-05-abc'
    );
    assert.equal(
      recallBundle.procedureRecall.runtimeArtifacts.buckets.procedural[0].id,
      'proc-001'
    );
    assert.equal(
      recallBundle.procedureRecall.runtimeArtifacts.buckets.procedureFeedback[0].id,
      'pf-001'
    );
    assert.equal(recallBundle.topHits.length > 0, true);
    assert.equal(
      ['canonical', 'pending-runtime-delta', 'runtime-shadow'].includes(recallBundle.topHits[0].sourceKind),
      true
    );
    assert.equal(recallBundle.topHits[0].namespace.namespaceKey, 'default/default/default');
    assert.equal(
      recallBundle.topHits.some(
        (hit) =>
          hit.procedureSurface &&
          hit.procedureSurface.classification === 'canonical-current-procedure'
      ),
      true
    );
    assert.equal(recallBundle.runtimeDelta.buckets.retrievalTraces.entries[0].id, 'rt-001');
    assert.equal(recallBundle.query.runtimeDelta.length > 0, true);

    const canonicalCurrent = getCanonicalCurrent({
      memoryRoot: runtimeWorkspaceRoot,
    });
    assert.equal(canonicalCurrent.kind, 'canonical-current');
    assert.equal(canonicalCurrent.projections.state.records[0].recordId, 'st-2026-03-05-001');

    const runtimeStatus = getStatus({
      memoryRoot: runtimeWorkspaceRoot,
    });
    assert.equal(runtimeStatus.runtime.shadowExists, true);
    assert.equal(runtimeStatus.runtime.namespace.namespaceKey, 'default/default/default');
    assert.equal(runtimeStatus.runtime.runCount, 1);
    assert.equal(runtimeStatus.runtime.totalArtifacts, 7);
    assert.equal(runtimeStatus.runtime.receipt.exists, true);
    assert.equal(runtimeStatus.runtime.receipt.action, 'reconcile');
    assert.equal(runtimeStatus.verificationProvenance.receipts.runtimeSummary.exists, true);
    assert.deepEqual(hashCanonTree(runtimeWorkspaceRoot), canonSnapshot);

    const cliCaptureResult = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'capture-runtime',
        '--memory-root',
        runtimeWorkspaceRoot,
        '--run-id',
        'codex-2026-03-18-cli',
        '--source',
        'gateway-cli-test',
        '--captured-at',
        '2026-03-18T13:00:00Z',
        '--artifacts-file',
        artifactsFile,
        '--runtime-inputs-file',
        inputsFile,
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliCaptureResult.status, 0, cliCaptureResult.stderr);
    assert.equal(JSON.parse(cliCaptureResult.stdout).record.runId, 'codex-2026-03-18-cli');

    const cliRuntimeDeltaResult = spawnSync(
      process.execPath,
      [CLI_PATH, 'get-runtime-delta', '--memory-root', runtimeWorkspaceRoot],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliRuntimeDeltaResult.status, 0, cliRuntimeDeltaResult.stderr);
    assert.equal(JSON.parse(cliRuntimeDeltaResult.stdout).runCount, 2);

    const cliRecallBundleResult = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'get-recall-bundle',
        '--memory-root',
        runtimeWorkspaceRoot,
        '--role-id',
        'mnemo',
        '--install-date',
        '2026-03-18',
        '--text',
        'What is the current approach on volatile mornings?',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliRecallBundleResult.status, 0, cliRecallBundleResult.stderr);
    assert.equal(JSON.parse(cliRecallBundleResult.stdout).roleBundle.manifest.id, 'mnemo');
    assert.deepEqual(hashCanonTree(runtimeWorkspaceRoot), canonSnapshot);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }

  const readIndexRoot = makeTempRoot();
  try {
    const readIndexWorkspaceRoot = path.join(readIndexRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, readIndexWorkspaceRoot, { recursive: true });

    const initialVerification = verifyReadIndex({
      memoryRoot: readIndexWorkspaceRoot,
    });
    assert.equal(initialVerification.status, 'ok');
    assert.equal(initialVerification.receipt.exists, true);
    assert.equal(initialVerification.receipt.action, 'verify');

    const builtIndex = buildReadIndex({
      memoryRoot: readIndexWorkspaceRoot,
      builtAt: '2026-03-18T15:00:00Z',
    });
    assert.equal(fs.existsSync(builtIndex.path), true);
    assert.equal(builtIndex.namespace.namespaceKey, 'default/default/default');
    assert.equal(builtIndex.stats.recordCount, 7);
    assert.equal(builtIndex.receipt.surface, 'derived-read-index');
    assert.equal(builtIndex.receipt.action, 'build');
    assert.equal(readReadIndex({ memoryRoot: readIndexWorkspaceRoot }).builtAt, '2026-03-18T15:00:00Z');
    assert.equal(
      readReadIndex({ memoryRoot: readIndexWorkspaceRoot }).namespace.namespaceKey,
      'default/default/default'
    );

    const verifiedIndex = verifyReadIndex({
      memoryRoot: readIndexWorkspaceRoot,
    });
    assert.equal(verifiedIndex.status, 'ok');
    assert.equal(verifiedIndex.namespace.namespaceKey, 'default/default/default');
    assert.equal(verifiedIndex.stats.recordCount, 7);
    assert.equal(verifiedIndex.receipt.action, 'verify');
    assert.equal(verifiedIndex.receipt.evidence.manifestAligned, true);

    const scopedIndex = buildReadIndex({
      memoryRoot: readIndexWorkspaceRoot,
      tenantId: 'acme',
      spaceId: 'research',
      userId: 'nina',
      builtAt: '2026-03-18T15:30:00Z',
    });
    assert.equal(scopedIndex.namespace.namespaceKey, 'acme/research/nina');
    assert.match(scopedIndex.path, /core\/meta\/namespaces\/acme\/spaces\/research\/users\/nina\/read-index\.json$/);

    const scopedQuery = query({
      memoryRoot: readIndexWorkspaceRoot,
      tenantId: 'acme',
      spaceId: 'research',
      userId: 'nina',
      text: 'volatile mornings current approach',
    });
    assert.equal(scopedQuery.namespace.namespaceKey, 'acme/research/nina');
    assert.equal(scopedQuery.readIndex.namespace.namespaceKey, 'acme/research/nina');
    assert.equal(scopedQuery.canonicalHits[0].recordId, 'st-2026-03-05-001');

    const indexedQuery = query({
      memoryRoot: readIndexWorkspaceRoot,
      text: 'volatile mornings current approach',
    });
    assert.equal(indexedQuery.contract.rankingVersion, '1');
    assert.equal(indexedQuery.readIndex.status, 'ok');
    assert.equal(indexedQuery.readIndex.source, 'persisted');
    assert.equal(indexedQuery.canonicalHits[0].recordId, 'st-2026-03-05-001');
    assert.equal(indexedQuery.canonicalHits[0].ranking.total > 0, true);

    const indexedStatus = getStatus({
      memoryRoot: readIndexWorkspaceRoot,
    });
    assert.equal(indexedStatus.readIndex.status, 'ok');
    assert.equal(indexedStatus.readIndex.recordCount, 7);
    assert.equal(indexedStatus.manifest.reconciliation.strategy, 'content-addressed-graph-rebuild');
    assert.equal(indexedStatus.manifest.reconciliationFresh, true);
    assert.equal(typeof indexedStatus.readIndex.sourceContentFingerprint, 'string');
    assert.equal(indexedStatus.readIndex.sourceReconciliationFresh, true);
    assert.equal(indexedStatus.readIndex.receipt.exists, true);
    assert.equal(indexedStatus.readIndex.receipt.action, 'verify');
    assert.equal(indexedStatus.verificationProvenance.receipts.readIndex.exists, true);

    fs.appendFileSync(
      path.join(readIndexWorkspaceRoot, 'core/user/knowledge/work.md'),
      '\n<!-- read-index drift fixture -->\n',
      'utf8'
    );

    const staleVerification = verifyReadIndex({
      memoryRoot: readIndexWorkspaceRoot,
    });
    assert.equal(staleVerification.status, 'stale');
    assert.equal(
      staleVerification.reasons.some((reason) => reason.code === 'content-fingerprint-mismatch'),
      true
    );
    assert.equal(staleVerification.reasons.some((reason) => reason.code === 'checksum-mismatch'), true);
    assert.equal(staleVerification.source.reconciliationFresh, false);

    const staleStatus = getStatus({
      memoryRoot: readIndexWorkspaceRoot,
    });
    assert.equal(staleStatus.manifest.reconciliationFresh, false);
    assert.equal(staleStatus.readIndex.sourceReconciliationFresh, false);
    assert.equal(staleStatus.readIndex.receipt.exists, true);

    const staleHealth = getHealth({
      memoryRoot: readIndexWorkspaceRoot,
    });
    assert.equal(
      staleHealth.warnings.includes('Manifest reconciliation evidence is stale and verify should be rerun.'),
      true
    );

    const rebuiltQuery = query({
      memoryRoot: readIndexWorkspaceRoot,
      text: 'volatile mornings current approach',
    });
    assert.equal(rebuiltQuery.readIndex.status, 'rebuilt-ephemeral');

    const cliBuildIndex = spawnSync(
      process.execPath,
      [CLI_PATH, 'build-read-index', '--memory-root', readIndexWorkspaceRoot, '--built-at', '2026-03-18T16:00:00Z'],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliBuildIndex.status, 0, cliBuildIndex.stderr);
    assert.equal(JSON.parse(cliBuildIndex.stdout).builtAt, '2026-03-18T16:00:00Z');
    assert.equal(JSON.parse(cliBuildIndex.stdout).receipt.action, 'build');

    const cliVerifyIndex = spawnSync(
      process.execPath,
      [CLI_PATH, 'verify-read-index', '--memory-root', readIndexWorkspaceRoot],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliVerifyIndex.status, 0, cliVerifyIndex.stderr);
    assert.equal(JSON.parse(cliVerifyIndex.stdout).status, 'ok');
    assert.equal(JSON.parse(cliVerifyIndex.stdout).receipt.action, 'verify');
  } finally {
    fs.rmSync(readIndexRoot, { recursive: true, force: true });
  }

  const orchestrationRoot = makeTempRoot();
  try {
    const orchestrationWorkspaceRoot = path.join(orchestrationRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, orchestrationWorkspaceRoot, { recursive: true });

    const submission = propose({
      memoryRoot: orchestrationWorkspaceRoot,
      batchDate: '2026-03-18',
      proposalId: 'proposal-2026-03-18-fixture',
      source: 'gateway-test',
      claims: [
        {
          claim_id: 'claim-20260318-001',
          source_session: 'codex-2026-03-18-001',
          source_agent: 'mnemo',
          observed_at: '2026-03-18T12:00:00Z',
          confidence: 'high',
          tags: ['memory', 'gateway'],
          target_layer: 'L3',
          target_domain: 'work',
          claim:
            'The gateway write path should queue reviewed claims before the core promoter owns canon serialization.',
        },
      ],
    });
    assert.equal(submission.status, 'proposed');
    assert.equal(fs.existsSync(submission.proposalPath), true);

    const feedbackEntry = feedback({
      memoryRoot: orchestrationWorkspaceRoot,
      proposalId: submission.proposalId,
      feedback: [
        {
          claim_id: 'claim-20260318-001',
          curator_decision: 'accept',
          curator_notes: 'Pipeline-compatible handoff fixture.',
          actor: 'fixture-reviewer',
        },
      ],
    });
    assert.equal(feedbackEntry.status, 'ready-for-apply');
    assert.equal(
      fs.existsSync(path.join(orchestrationWorkspaceRoot, 'intake/pending/2026-03-18.md')),
      true
    );
    assert.match(
      fs.readFileSync(
        path.join(orchestrationWorkspaceRoot, 'intake/pending/2026-03-18.md'),
        'utf8'
      ),
      /curator_decision: "accept"/
    );

    const completed = completeJob({
      memoryRoot: orchestrationWorkspaceRoot,
      proposalId: submission.proposalId,
      holder: 'gateway-test',
    });
    assert.equal(completed.status, 'ready-for-handoff');
    assert.equal(fs.existsSync(completed.receiptPath), true);
    assert.equal(
      completed.receipt.write_path.lock_path.endsWith('core/meta/canon-write.lock.json'),
      true
    );
    assert.equal(
      completed.receipt.write_path.promotion_request.operation,
      'core-promoter'
    );

    acquireCanonWriteLock({
      memoryRoot: orchestrationWorkspaceRoot,
      holder: 'ops-lock-holder',
      operation: 'core-promoter',
      acquiredAt: '2026-03-18T14:00:00Z',
    });

    fs.writeFileSync(
      path.join(orchestrationWorkspaceRoot, 'intake/jobs/orphan-job.json'),
      `${JSON.stringify(
        {
          kind: 'job',
          schema_version: completed.receipt.schema_version,
          job_id: 'orphan-job',
          proposal_id: 'proposal-missing',
          batch_date: '2026-03-18',
          created_at: '2026-03-18T14:00:00Z',
          updated_at: '2026-03-18T14:00:00Z',
          status: 'ready-for-handoff',
          authoritative: false,
          pending_batch_path: 'intake/pending/2026-03-18.md',
          write_path: {
            implementation: 'core-promoter',
            single_writer: completed.receipt.write_path.single_writer,
            promotion_request: completed.receipt.write_path.promotion_request,
            lock_path: completed.receipt.write_path.lock_path,
            lock: completed.receipt.write_path.lock,
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    );

  } finally {
    fs.rmSync(orchestrationRoot, { recursive: true, force: true });
  }

  const appliedHandoffRoot = makeTempRoot();
  try {
    const appliedWorkspaceRoot = path.join(appliedHandoffRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, appliedWorkspaceRoot, { recursive: true });

    const submission = propose({
      memoryRoot: appliedWorkspaceRoot,
      batchDate: '2026-03-18',
      proposalId: 'proposal-2026-03-18-applied',
      source: 'gateway-applied-fixture',
      claims: [
        {
          claim_id: 'claim-20260318-apply-001',
          source_session: 'gateway-2026-03-18-apply',
          source_agent: 'mnemo',
          observed_at: '2026-03-18T15:00:00Z',
          confidence: 'high',
          tags: ['gateway', 'handoff'],
          target_layer: 'L3',
          target_domain: 'work',
          claim: 'Applied handoff receipts should converge after promotion.',
        },
      ],
    });
    feedback({
      memoryRoot: appliedWorkspaceRoot,
      proposalId: submission.proposalId,
      feedback: [
        {
          claim_id: 'claim-20260318-apply-001',
          curator_decision: 'accept',
          curator_notes: 'Approve applied-state reconciliation fixture.',
          actor: 'fixture-reviewer',
        },
      ],
    });
    completeJob({
      memoryRoot: appliedWorkspaceRoot,
      proposalId: submission.proposalId,
      holder: 'gateway-applied-test',
    });

    const promoter = createPromoterInterface();
    const promotion = promoter.promote({
      type: 'canon-write',
      memory_root: appliedWorkspaceRoot,
      writer: promoter.single_writer,
      holder: 'gateway-applied-test',
      operation: 'core-promoter',
      batch_date: '2026-03-18',
    });
    const proposalReceipt = JSON.parse(
      fs.readFileSync(
        path.join(appliedWorkspaceRoot, 'intake/proposals/proposal-2026-03-18-applied.json'),
        'utf8'
      )
    );
    const jobReceipt = JSON.parse(
      fs.readFileSync(
        path.join(appliedWorkspaceRoot, 'intake/jobs/proposal-2026-03-18-applied-apply.json'),
        'utf8'
      )
    );

    assert.equal(proposalReceipt.status, 'applied');
    assert.equal(proposalReceipt.pending_batch_path, null);
    assert.equal(proposalReceipt.processed_batch_path, 'intake/processed/2026-03-18.md');
    assert.equal(jobReceipt.status, 'applied');
    assert.equal(jobReceipt.pending_batch_path, null);
    assert.equal(jobReceipt.processed_batch_path, 'intake/processed/2026-03-18.md');
    assert.equal(jobReceipt.promotion_result.processedBatchPath, 'intake/processed/2026-03-18.md');
    assert.equal(promotion.receiptUpdates.proposalsUpdated, 1);
    assert.equal(promotion.receiptUpdates.jobsUpdated, 1);
  } finally {
    fs.rmSync(appliedHandoffRoot, { recursive: true, force: true });
  }

  const procedureInspectionRoot = makeTempRoot();
  try {
    const procedureWorkspaceRoot = path.join(procedureInspectionRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, procedureWorkspaceRoot, { recursive: true });
    writeProcedureUpdateBatch(procedureWorkspaceRoot);
    captureRuntime({
      memoryRoot: procedureWorkspaceRoot,
      runId: 'trader-2026-03-19-xyz',
      source: 'gateway-procedure-fixture',
      capturedAt: '2026-03-19T09:30:00Z',
      artifacts: {
        procedural: [
          {
            id: 'proc-002',
            summary: 'Escalate to confirmation-first guidance when the open is volatile.',
          },
        ],
        procedureFeedback: [
          {
            id: 'pf-002',
            summary: 'Explicit fakeout checks reduced premature momentum guidance.',
          },
        ],
      },
      runtimeInputs: [
        {
          kind: 'transcript',
          sourceSession: 'trader-2026-03-19-xyz',
        },
      ],
    });

    const promoter = createPromoterInterface();
    promoter.promote({
      type: 'canon-write',
      memory_root: procedureWorkspaceRoot,
      writer: promoter.single_writer,
      holder: 'gateway-procedure-fixture',
      operation: 'core-promoter',
      batch_date: '2026-03-19',
    });

    const updatedInspection = inspectProcedure({
      memoryRoot: procedureWorkspaceRoot,
      roleId: 'trader',
      procedureKey: 'volatile-open-confirmation-checklist',
    });
    assert.equal(updatedInspection.versionCount, 2);
    assert.equal(updatedInspection.currentVersion.version, 2);
    assert.equal(updatedInspection.latestVersion.recordId, 'prc-2026-03-19-001');
    assert.equal(updatedInspection.versions[0].status, 'deprecated');
    assert.equal(updatedInspection.versions[1].feedbackRefs[0].includes('pf-002'), true);
    assert.equal(updatedInspection.currentVersion.evidenceLinkage.summary.resolvedFeedbackCount, 1);
    assert.equal(updatedInspection.currentVersion.evidenceLinkage.linkedRuns[0].runId, 'trader-2026-03-19-xyz');
    assert.equal(
      updatedInspection.currentVersion.evidenceLinkage.linkedArtifacts.procedureFeedback[0].id,
      'pf-002'
    );
    assert.equal(
      updatedInspection.currentVersion.evidenceLinkage.linkedArtifacts.procedural[0].id,
      'proc-002'
    );

    const comparison = compareProcedureVersions({
      memoryRoot: procedureWorkspaceRoot,
      roleId: 'trader',
      procedureKey: 'volatile-open-confirmation-checklist',
      fromVersion: 1,
      toVersion: 2,
    });
    assert.equal(comparison.kind, 'procedure-comparison');
    assert.equal(comparison.comparison.direction, 'forward');
    assert.equal(
      comparison.comparison.metadata.some(
        (change) => change.field === 'version' && change.from === 1 && change.to === 2
      ),
      true
    );
    assert.equal(
      comparison.comparison.acceptance.some(
        (change) =>
          change.type === 'added' &&
          change.value === 'Escalate to confirmation-first guidance when the open is volatile.'
      ),
      true
    );
    assert.equal(
      comparison.comparison.bodyLines.some(
        (change) =>
          change.type === 'added' &&
          change.value ===
            '- Wait for fakeout confirmation before calling momentum continuation.'
      ),
      true
    );
    assert.equal(
      compareProcedureVersions({
        memoryRoot: procedureWorkspaceRoot,
        roleId: 'trader',
        procedureKey: 'volatile-open-confirmation-checklist',
        fromVersion: 2,
        toVersion: 2,
      }).comparison.direction,
      'same'
    );
    assert.equal(
      compareProcedureVersions({
        memoryRoot: procedureWorkspaceRoot,
        roleId: 'trader',
        procedureKey: 'volatile-open-confirmation-checklist',
        fromVersion: 2,
        toVersion: 1,
      }).comparison.direction,
      'rollback-view'
    );

    const cliProcedureListResult = spawnSync(
      process.execPath,
      [CLI_PATH, 'list-procedures', '--memory-root', procedureWorkspaceRoot],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliProcedureListResult.status, 0, cliProcedureListResult.stderr);
    assert.equal(JSON.parse(cliProcedureListResult.stdout).summary.recordCount, 2);

    const cliProcedureCompareResult = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'compare-procedure-versions',
        '--memory-root',
        procedureWorkspaceRoot,
        '--role-id',
        'trader',
        '--procedure-key',
        'volatile-open-confirmation-checklist',
        '--from-version',
        '1',
        '--to-version',
        '2',
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliProcedureCompareResult.status, 0, cliProcedureCompareResult.stderr);
    assert.equal(JSON.parse(cliProcedureCompareResult.stdout).diffVersion, '1');
  } finally {
    fs.rmSync(procedureInspectionRoot, { recursive: true, force: true });
  }

  const bootstrapRoot = makeTempRoot();
  try {
    const result = bootstrap({
      stateDir: path.join(bootstrapRoot, 'state'),
      workspaceRoot: path.join(bootstrapRoot, 'workspace'),
      systemRoot: path.join(bootstrapRoot, 'workspace', 'system'),
      memoryRoot: path.join(bootstrapRoot, 'workspace', 'system', 'memory'),
      systemTemplateRoot: path.join(ADAPTER_ROOT, 'templates', 'workspace-system'),
      memoryTemplateRoot: path.join(ADAPTER_ROOT, 'templates', 'workspace-memory'),
      skillsSourceRoot: ADAPTER_SKILLS_ROOT,
      installDate: '2026-03-18',
    });

    assert.equal(result.agents.length, 5);
    assert.equal(fs.existsSync(path.join(bootstrapRoot, 'workspace', 'nyx', 'BOOT.md')), true);
    assert.equal(
      fs.lstatSync(path.join(bootstrapRoot, 'workspace', 'system', 'skills', 'memory-query')).isSymbolicLink(),
      true
    );
  } finally {
    fs.rmSync(bootstrapRoot, { recursive: true, force: true });
  }

  const cliResult = spawnSync(process.execPath, [CLI_PATH, 'status', '--memory-root', FIXTURE_MEMORY_ROOT], {
    encoding: 'utf8',
  });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).manifest.recordCounts.events, 2);

  const cliHelp = spawnSync(process.execPath, [CLI_PATH, 'help'], {
    encoding: 'utf8',
  });
  assert.equal(cliHelp.status, 1, cliHelp.stderr);
  assert.equal(cliHelp.stderr.includes('ops-snapshot'), false);

  const cliOpsResult = spawnSync(
    process.execPath,
    [CLI_PATH, 'ops-snapshot', '--memory-root', FIXTURE_MEMORY_ROOT, '--skip-verify'],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(cliOpsResult.status, 1);
  assert.equal(cliOpsResult.stderr.includes('Unknown command: ops-snapshot'), true);

  const cliWriteRoot = makeTempRoot();
  try {
    const cliWorkspaceRoot = path.join(cliWriteRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, cliWorkspaceRoot, { recursive: true });
    const claimsFile = path.join(cliWriteRoot, 'claims.json');
    fs.writeFileSync(
      claimsFile,
      JSON.stringify(
        [
          {
            claim_id: 'claim-20260318-002',
            source_session: 'cli-2026-03-18-001',
            source_agent: 'mnemo',
            observed_at: '2026-03-18T13:00:00Z',
            confidence: 'medium',
            tags: ['cli'],
            target_layer: 'L3',
            target_domain: 'preferences',
            claim: 'CLI orchestration should write proposals without direct canon access.',
          },
        ],
        null,
        2
      )
    );

    const cliPropose = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'propose',
        '--memory-root',
        cliWorkspaceRoot,
        '--batch-date',
        '2026-03-18',
        '--claims-file',
        claimsFile,
      ],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(cliPropose.status, 0, cliPropose.stderr);
    assert.equal(JSON.parse(cliPropose.stdout).status, 'proposed');
  } finally {
    fs.rmSync(cliWriteRoot, { recursive: true, force: true });
  }

  console.log(
    'Validated read, bootstrap, shadow runtime, safe write orchestration, query, status, verify, health, and CLI flows through memory-os-gateway.'
  );
}

main();
