'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  captureShadowRuntime,
  getRuntimeRecallBundle,
  getRuntimeDelta,
  listRuntimeRecords,
  resolveRuntimeManifestPath,
  resolveRuntimeRoot,
  resolveRuntimeRunPath,
  resolveRuntimeShadowRoot,
} = require('..');

const WORKSPACE_FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/workspace'
);

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memory-os-runtime-validate-'));
}

function hashCoreTree(memoryRoot) {
  const coreRoot = path.join(memoryRoot, 'core');
  const snapshot = {};
  const stack = [coreRoot];

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

function main() {
  const tempRoot = makeTempRoot();

  try {
    const memoryRoot = path.join(tempRoot, 'workspace');
    fs.cpSync(WORKSPACE_FIXTURE, memoryRoot, { recursive: true });

    const canonSnapshot = hashCoreTree(memoryRoot);
    const capture = captureShadowRuntime({
      memoryRoot,
      runId: 'codex-2026-03-18-001',
      source: 'memory-os-runtime-test',
      capturedAt: '2026-03-18T12:00:00Z',
      runtimeInputs: [
        {
          kind: 'transcript',
          sourceSession: 'codex-2026-03-18-001',
          path: 'transcripts/codex-2026-03-18-001.jsonl',
        },
      ],
      artifacts: {
        episodic: [
          {
            id: 'ep-001',
            summary: 'Observed a repeated hesitation before volatile-morning entries.',
            text: 'The agent observed hesitation before volatile-morning entries during the run.',
            observedAt: '2026-03-18T11:55:00Z',
            tags: ['trading', 'volatility'],
          },
        ],
        semanticCache: [
          {
            id: 'sc-001',
            summary: 'Volatile mornings map to slower confirmation-first guidance.',
            tags: ['cache', 'state'],
          },
        ],
        procedural: [
          {
            id: 'proc-001',
            summary: 'Start with confirmation checklist before suggesting momentum entries.',
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
    });

    assert.equal(capture.kind, 'runtime-shadow-capture');
    assert.equal(fs.existsSync(resolveRuntimeRoot(memoryRoot)), true);
    assert.equal(fs.existsSync(resolveRuntimeShadowRoot(memoryRoot)), true);
    assert.equal(fs.existsSync(resolveRuntimeRunPath(memoryRoot, 'codex-2026-03-18-001')), true);
    assert.equal(fs.existsSync(resolveRuntimeManifestPath(memoryRoot)), true);
    assert.equal(capture.record.authoritative, false);
    assert.equal(capture.record.namespace.mode, 'single-tenant-default');
    assert.equal(capture.record.namespace.actor.agentId, null);
    assert.equal(capture.record.runtimeInputs.length, 1);

    const runtimeDelta = getRuntimeDelta({
      memoryRoot,
      limit: 5,
    });
    assert.equal(runtimeDelta.exists, true);
    assert.equal(runtimeDelta.namespace.namespaceKey, 'default/default/default');
    assert.equal(runtimeDelta.runCount, 1);
    assert.equal(runtimeDelta.totalArtifacts, 7);
    assert.equal(runtimeDelta.buckets.episodic.count, 1);
    assert.equal(runtimeDelta.buckets.reflections.entries[0].id, 'rf-001');
    assert.equal(runtimeDelta.runs[0].runId, 'codex-2026-03-18-001');
    assert.equal(runtimeDelta.runs[0].namespace.namespaceKey, 'default/default/default');
    assert.equal(runtimeDelta.manifest.disposable, true);
    assert.equal(runtimeDelta.manifest.namespace.mode, 'single-tenant-default');
    assert.equal(runtimeDelta.manifest.reconciliation.strategy, 'content-addressed-runtime-manifest');
    assert.equal(typeof runtimeDelta.manifest.reconciliation.runContentDigest, 'string');
    assert.equal(runtimeDelta.reconciliation.status, 'ok');
    assert.equal(runtimeDelta.reconciliation.ok, true);

    const runtimeRecall = getRuntimeRecallBundle({
      memoryRoot,
      text: 'current volatile mornings',
      limit: 5,
    });
    assert.equal(runtimeRecall.kind, 'runtime-recall-bundle');
    assert.equal(runtimeRecall.authoritative, false);
    assert.equal(runtimeRecall.namespace.namespaceKey, 'default/default/default');
    assert.equal(runtimeRecall.shadowExists, true);
    assert.equal(runtimeRecall.buckets.retrievalTraces.entries[0].id, 'rt-001');
    assert.equal(runtimeRecall.hits[0].namespace.namespaceKey, 'default/default/default');
    assert.equal(runtimeRecall.freshnessBoundary.runtimeAuthoritative, false);
    assert.equal(runtimeRecall.reconciliation.status, 'ok');
    assert.equal(runtimeRecall.freshnessBoundary.runtimeReconciliationStatus, 'ok');

    const records = listRuntimeRecords({ memoryRoot });
    assert.equal(records.length, 1);
    assert.equal(records[0].counts.semanticCache, 1);
    assert.equal(records[0].namespace.namespaceKey, 'default/default/default');

    const scopedCapture = captureShadowRuntime({
      memoryRoot,
      tenantId: 'acme',
      spaceId: 'research',
      userId: 'nina',
      agentId: 'mnemo',
      roleId: 'reviewer',
      runId: 'codex-2026-03-18-002',
      source: 'memory-os-runtime-test',
      capturedAt: '2026-03-18T12:30:00Z',
      artifacts: {
        episodic: [
          {
            id: 'ep-002',
            summary: 'Scoped runtime capture stays isolated from the default namespace.',
          },
        ],
      },
    });
    assert.match(scopedCapture.runPath, /runtime\/shadow\/namespaces\/acme\/spaces\/research\/users\/nina/);

    const scopedRuntimeDelta = getRuntimeDelta({
      memoryRoot,
      tenantId: 'acme',
      spaceId: 'research',
      userId: 'nina',
      agentId: 'mnemo',
      roleId: 'reviewer',
    });
    assert.equal(scopedRuntimeDelta.namespace.namespaceKey, 'acme/research/nina');
    assert.equal(scopedRuntimeDelta.runCount, 1);
    assert.match(scopedRuntimeDelta.shadowRoot, /runtime\/shadow\/namespaces\/acme\/spaces\/research\/users\/nina/);
    assert.match(scopedRuntimeDelta.manifestPath, /runtime\/shadow\/namespaces\/acme\/spaces\/research\/users\/nina/);

    assert.deepEqual(hashCoreTree(memoryRoot), canonSnapshot);

    fs.rmSync(resolveRuntimeRoot(memoryRoot), { recursive: true, force: true });

    const emptyRuntimeDelta = getRuntimeDelta({ memoryRoot });
    assert.equal(emptyRuntimeDelta.exists, false);
    assert.equal(emptyRuntimeDelta.runCount, 0);
    assert.equal(emptyRuntimeDelta.totalArtifacts, 0);
    assert.deepEqual(hashCoreTree(memoryRoot), canonSnapshot);

    console.log(
      'Validated shadow runtime storage, runtime delta inspection, disposability, and canon isolation.'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
