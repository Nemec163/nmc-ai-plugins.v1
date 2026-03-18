'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { getInterventionAction, listInterventionActions } = require('./intervention-actions');
const { resolveMemoryRoot } = require('./paths');

const INTERVENTION_SCHEMA_VERSION = '1.0';
const INTERVENTION_ROOT_PATH = 'runtime/shadow/control-plane/interventions';
const OPEN_STATUSES = new Set(['requested', 'acknowledged']);

function resolveInterventionsRoot(memoryRoot) {
  return path.join(path.resolve(memoryRoot), INTERVENTION_ROOT_PATH);
}

function ensureInterventionsRoot(memoryRoot) {
  const dirPath = resolveInterventionsRoot(memoryRoot);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function listInterventionFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function formatTimestamp(value) {
  return value || new Date().toISOString();
}

function sanitizeIdentifier(value, fallbackPrefix) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized) {
    return normalized;
  }

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${fallbackPrefix}-${stamp}-${entropy}`;
}

function interventionFilePath(memoryRoot, interventionId) {
  return path.join(ensureInterventionsRoot(memoryRoot), `${interventionId}.json`);
}

function normalizeStatus(value) {
  const status = String(value || 'requested').trim();
  if (!['requested', 'acknowledged', 'resolved'].includes(status)) {
    throw new Error(`Unsupported intervention status: ${status}`);
  }

  return status;
}

function normalizeTarget(options = {}) {
  const kind = String(options.targetKind || '').trim();
  if (!['proposal', 'job', 'conflict', 'lock'].includes(kind)) {
    throw new Error('targetKind must be one of proposal, job, conflict, or lock');
  }

  const target = {
    kind,
    proposalId: options.proposalId || null,
    jobId: options.jobId || null,
    conflictCode: options.conflictCode || null,
    lockPath: options.lockPath || null,
    relativePath: options.relativePath || null,
  };

  if (kind === 'proposal' && !target.proposalId) {
    throw new Error('proposalId is required for proposal interventions');
  }
  if (kind === 'job' && !target.jobId) {
    throw new Error('jobId is required for job interventions');
  }
  if (kind === 'conflict' && !target.conflictCode) {
    throw new Error('conflictCode is required for conflict interventions');
  }
  if (kind === 'lock' && !target.lockPath) {
    throw new Error('lockPath is required for lock interventions');
  }

  return target;
}

function summarizeRecord(memoryRoot, record, filePath) {
  return {
    interventionId: record.interventionId,
    actionId: record.actionId,
    status: record.status,
    actor: record.actor || null,
    note: record.note || null,
    target: record.target,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resolvedAt: record.resolvedAt || null,
    relativePath: path.relative(memoryRoot, filePath).split(path.sep).join('/'),
  };
}

function getControlPlaneInterventions(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const dirPath = resolveInterventionsRoot(memoryRoot);
  const items = [];
  const errors = [];
  const byStatus = {};

  for (const filePath of listInterventionFiles(dirPath)) {
    try {
      const record = readJson(filePath);
      const summary = summarizeRecord(memoryRoot, record, filePath);
      items.push(summary);
      byStatus[summary.status] = (byStatus[summary.status] || 0) + 1;
    } catch (error) {
      errors.push({
        code: 'intervention-read-error',
        relativePath: path.relative(memoryRoot, filePath).split(path.sep).join('/'),
        message: error.message,
      });
    }
  }

  items.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

  return {
    kind: 'control-plane-interventions',
    schemaVersion: INTERVENTION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    memoryRoot,
    root: dirPath,
    availableActions: listInterventionActions(),
    summary: {
      totalCount: items.length,
      openCount: items.filter((item) => OPEN_STATUSES.has(item.status)).length,
      byStatus,
    },
    items,
    errors,
  };
}

function recordControlPlaneIntervention(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const action = getInterventionAction(String(options.action || '').trim());
  const target = normalizeTarget(options);

  if (!action.targetKinds.includes(target.kind)) {
    throw new Error(
      `Action ${action.actionId} cannot target ${target.kind}; expected ${action.targetKinds.join(', ')}`
    );
  }

  const interventionId = sanitizeIdentifier(
    options.interventionId,
    `intervention-${action.actionId}`
  );
  const filePath = interventionFilePath(memoryRoot, interventionId);
  const existing = fs.existsSync(filePath) ? readJson(filePath) : null;
  const status = normalizeStatus(options.status || (existing && existing.status));
  const now = formatTimestamp(options.updatedAt || options.requestedAt);

  const record = {
    kind: 'control-plane-intervention',
    schemaVersion: INTERVENTION_SCHEMA_VERSION,
    interventionId,
    actionId: action.actionId,
    status,
    actor:
      options.actor != null
        ? String(options.actor)
        : existing && existing.actor != null
          ? existing.actor
          : null,
    note:
      options.note != null
        ? String(options.note)
        : existing && existing.note != null
          ? existing.note
          : null,
    target,
    createdAt: existing && existing.createdAt ? existing.createdAt : formatTimestamp(options.requestedAt),
    updatedAt: now,
    resolvedAt: status === 'resolved' ? now : null,
    authority: {
      advisoryOnly: true,
      schedulerOwnedBy: '@nmc/memory-maintainer',
      promotionOwnedBy: '@nmc/memory-canon',
      queueMutationOwnedBy: 'outside-control-plane',
    },
  };

  writeJson(filePath, record);

  return {
    kind: 'control-plane-intervention',
    schemaVersion: INTERVENTION_SCHEMA_VERSION,
    memoryRoot,
    filePath,
    record: summarizeRecord(memoryRoot, record, filePath),
  };
}

module.exports = {
  getControlPlaneInterventions,
  interventions: getControlPlaneInterventions,
  recordControlPlaneIntervention,
  record_control_plane_intervention: recordControlPlaneIntervention,
  resolveInterventionsRoot,
};
