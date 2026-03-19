'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { parseProjectionRecords, toPosixRelative } = require('./records');

const PROCEDURE_DIFF_VERSION = '1';

function normalizeMemoryRoot(memoryRoot) {
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function normalizeString(value) {
  const trimmed = String(value == null ? '' : value).trim();
  return trimmed ? trimmed : null;
}

function normalizePositiveInteger(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sortStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value)))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function compareNullable(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function normalizeProcedureRecord(record, filePath, relativePath) {
  const metadata = record.metadata || {};

  return {
    anchorId: record.anchorId,
    heading: record.heading,
    recordId: normalizeString(metadata.record_id),
    type: normalizeString(metadata.type),
    status: normalizeString(metadata.status),
    summary: String(metadata.summary || ''),
    confidence: normalizeString(metadata.confidence),
    updatedAt: normalizeString(metadata.updated_at),
    roleId: normalizeString(metadata.role),
    procedureKey: normalizeString(metadata.procedure_key),
    version: normalizePositiveInteger(metadata.version),
    supersedes: normalizeString(metadata.supersedes),
    evidence: sortStrings(metadata.evidence || []),
    acceptance: [...(metadata.acceptance || [])].map((value) => String(value)),
    feedbackRefs: [...(metadata.feedback_refs || [])].map((value) => String(value)),
    links: [...(metadata.links || [])].map((link) => ({
      rel: normalizeString(link.rel),
      target: normalizeString(link.target),
    })),
    body: String(record.body || ''),
    bodyLines: String(record.body || '').split('\n'),
    filePath,
    relativePath,
  };
}

function compareProcedureRecords(left, right) {
  return (
    compareNullable(left.roleId, right.roleId) ||
    compareNullable(left.procedureKey, right.procedureKey) ||
    (left.version || 0) - (right.version || 0) ||
    compareNullable(left.updatedAt, right.updatedAt) ||
    compareNullable(left.recordId, right.recordId)
  );
}

function collectProcedureRecords(memoryRoot) {
  const canon = loadMemoryCanon();
  const records = [];

  for (const filePath of canon.listRecordFiles(memoryRoot)) {
    const relativePath = toPosixRelative(memoryRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const record of parseProjectionRecords(content)) {
      if (record.metadata.type !== 'procedure') {
        continue;
      }

      records.push(normalizeProcedureRecord(record, filePath, relativePath));
    }
  }

  return records.sort(compareProcedureRecords);
}

function buildProcedureLineages(records) {
  const grouped = new Map();

  for (const record of records) {
    const groupKey = `${record.roleId || ''}::${record.procedureKey || record.recordId || ''}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        roleId: record.roleId,
        procedureKey: record.procedureKey,
        filePath: record.filePath,
        relativePath: record.relativePath,
        versions: [],
      });
    }

    grouped.get(groupKey).versions.push(record);
  }

  return Array.from(grouped.values())
    .map((lineage) => {
      const versions = lineage.versions.slice().sort(compareProcedureRecords);
      const activeVersions = versions.filter((record) => record.status === 'active');
      const currentVersion =
        activeVersions[activeVersions.length - 1] || versions[versions.length - 1] || null;
      const latestVersion = versions[versions.length - 1] || null;
      const lineagePathSource = currentVersion || latestVersion || null;

      return {
        ...lineage,
        filePath: lineagePathSource ? lineagePathSource.filePath : lineage.filePath,
        relativePath: lineagePathSource ? lineagePathSource.relativePath : lineage.relativePath,
        versionCount: versions.length,
        currentVersion,
        latestVersion,
        versions,
      };
    })
    .sort((left, right) => compareProcedureRecords(left, right));
}

function filterLineages(lineages, roleId) {
  if (!roleId) {
    return lineages;
  }

  return lineages.filter((lineage) => lineage.roleId === roleId);
}

function findProcedureLineage(lineages, options = {}) {
  const roleId = normalizeString(options.roleId);
  const procedureKey = normalizeString(options.procedureKey);
  const recordId = normalizeString(options.recordId);

  if (recordId) {
    const matched = lineages.find((lineage) =>
      lineage.versions.some((version) => version.recordId === recordId)
    );

    if (!matched) {
      throw new Error(`Procedure record not found: ${recordId}`);
    }

    if (roleId != null && matched.roleId !== roleId) {
      throw new Error(
        `Procedure record ${recordId} belongs to role ${matched.roleId || 'unknown'}, not ${roleId}`
      );
    }

    if (procedureKey != null && matched.procedureKey !== procedureKey) {
      throw new Error(
        `Procedure record ${recordId} belongs to procedure_key ${matched.procedureKey || 'unknown'}, not ${procedureKey}`
      );
    }

    return matched;
  }

  if (!procedureKey) {
    throw new Error('procedureKey or recordId is required');
  }

  const matches = lineages.filter(
    (lineage) =>
      lineage.procedureKey === procedureKey && (roleId == null || lineage.roleId === roleId)
  );

  if (matches.length === 0) {
    throw new Error(
      roleId
        ? `Procedure not found for role ${roleId}: ${procedureKey}`
        : `Procedure not found: ${procedureKey}`
    );
  }

  if (matches.length > 1) {
    const roles = matches.map((lineage) => lineage.roleId || '').sort().join(', ');
    throw new Error(
      `Procedure key is ambiguous across roles; provide roleId: ${procedureKey} (${roles})`
    );
  }

  return matches[0];
}

function createDiffView(record) {
  return {
    metadata: {
      recordId: record.recordId,
      roleId: record.roleId,
      procedureKey: record.procedureKey,
      version: record.version,
      status: record.status,
      summary: record.summary,
      confidence: record.confidence,
      updatedAt: record.updatedAt,
      supersedes: record.supersedes,
    },
    evidence: record.evidence,
    acceptance: record.acceptance,
    feedbackRefs: record.feedbackRefs,
    bodyLines: record.bodyLines,
  };
}

function createCatalogLineage(lineage) {
  const summarizeVersion = (record) =>
    record
      ? {
          recordId: record.recordId,
          version: record.version,
          status: record.status,
          updatedAt: record.updatedAt,
          summary: record.summary,
          supersedes: record.supersedes,
        }
      : null;

  return {
    roleId: lineage.roleId,
    procedureKey: lineage.procedureKey,
    filePath: lineage.filePath,
    relativePath: lineage.relativePath,
    versionCount: lineage.versionCount,
    currentVersion: summarizeVersion(lineage.currentVersion),
    latestVersion: summarizeVersion(lineage.latestVersion),
    versions: lineage.versions.map((record) => ({
      recordId: record.recordId,
      version: record.version,
      status: record.status,
      updatedAt: record.updatedAt,
      summary: record.summary,
      supersedes: record.supersedes,
    })),
  };
}

function listProcedures(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const roleId = normalizeString(options.roleId);
  const lineages = filterLineages(buildProcedureLineages(collectProcedureRecords(memoryRoot)), roleId);
  const allVersions = lineages.flatMap((lineage) => lineage.versions);

  return {
    kind: 'procedure-catalog',
    canonical: true,
    authoritative: true,
    memoryRoot,
    roleId,
    summary: {
      lineageCount: lineages.length,
      recordCount: allVersions.length,
      activeCount: allVersions.filter((record) => record.status === 'active').length,
      deprecatedCount: allVersions.filter((record) => record.status === 'deprecated').length,
      roles: sortStrings(lineages.map((lineage) => lineage.roleId).filter(Boolean)),
    },
    procedures: lineages.map(createCatalogLineage),
  };
}

function inspectProcedure(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const lineages = buildProcedureLineages(collectProcedureRecords(memoryRoot));
  const lineage = findProcedureLineage(lineages, options);

  return {
    kind: 'procedure-inspection',
    canonical: true,
    authoritative: true,
    memoryRoot,
    roleId: lineage.roleId,
    procedureKey: lineage.procedureKey,
    filePath: lineage.filePath,
    relativePath: lineage.relativePath,
    versionCount: lineage.versionCount,
    currentVersion: lineage.currentVersion,
    latestVersion: lineage.latestVersion,
    versions: lineage.versions.map((record) => ({
      ...record,
      diffView: createDiffView(record),
    })),
  };
}

function diffSequence(fromItems, toItems) {
  const rows = fromItems.length + 1;
  const cols = toItems.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let left = fromItems.length - 1; left >= 0; left -= 1) {
    for (let right = toItems.length - 1; right >= 0; right -= 1) {
      if (fromItems[left] === toItems[right]) {
        table[left][right] = table[left + 1][right + 1] + 1;
      } else {
        table[left][right] = Math.max(table[left + 1][right], table[left][right + 1]);
      }
    }
  }

  const changes = [];
  let left = 0;
  let right = 0;

  while (left < fromItems.length && right < toItems.length) {
    if (fromItems[left] === toItems[right]) {
      changes.push({ type: 'unchanged', value: fromItems[left] });
      left += 1;
      right += 1;
      continue;
    }

    if (table[left + 1][right] >= table[left][right + 1]) {
      changes.push({ type: 'removed', value: fromItems[left] });
      left += 1;
      continue;
    }

    changes.push({ type: 'added', value: toItems[right] });
    right += 1;
  }

  while (left < fromItems.length) {
    changes.push({ type: 'removed', value: fromItems[left] });
    left += 1;
  }

  while (right < toItems.length) {
    changes.push({ type: 'added', value: toItems[right] });
    right += 1;
  }

  return changes;
}

function diffMetadata(fromRecord, toRecord) {
  const fields = [
    'recordId',
    'version',
    'status',
    'summary',
    'confidence',
    'updatedAt',
    'supersedes',
  ];

  return fields
    .filter((field) => fromRecord[field] !== toRecord[field])
    .map((field) => ({
      field,
      from: fromRecord[field] == null ? null : fromRecord[field],
      to: toRecord[field] == null ? null : toRecord[field],
    }));
}

function resolveComparisonTarget(lineage, label, options = {}) {
  const recordId = normalizeString(options[`${label}RecordId`]);
  const version = normalizePositiveInteger(options[`${label}Version`]);

  if (recordId) {
    const matched = lineage.versions.find((record) => record.recordId === recordId);
    if (!matched) {
      throw new Error(`${label} procedure record not found in lineage: ${recordId}`);
    }

    return matched;
  }

  if (version != null) {
    const matched = lineage.versions.find((record) => record.version === version);
    if (!matched) {
      throw new Error(`${label} procedure version not found in lineage: ${version}`);
    }

    return matched;
  }

  throw new Error(`${label}Version or ${label}RecordId is required`);
}

function compareProcedureVersions(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const inspection = inspectProcedure({
    memoryRoot,
    roleId: options.roleId,
    procedureKey: options.procedureKey,
    recordId: options.recordId || options.fromRecordId || options.toRecordId,
  });
  const fromRecord = resolveComparisonTarget(inspection, 'from', options);
  const toRecord = resolveComparisonTarget(inspection, 'to', options);
  let direction = 'same';

  if (fromRecord.version != null && toRecord.version != null) {
    if (toRecord.version > fromRecord.version) {
      direction = 'forward';
    } else if (toRecord.version < fromRecord.version) {
      direction = 'rollback-view';
    }
  }

  return {
    kind: 'procedure-comparison',
    canonical: true,
    authoritative: true,
    diffVersion: PROCEDURE_DIFF_VERSION,
    memoryRoot,
    roleId: inspection.roleId,
    procedureKey: inspection.procedureKey,
    filePath: inspection.filePath,
    relativePath: inspection.relativePath,
    from: {
      ...fromRecord,
      diffView: createDiffView(fromRecord),
    },
    to: {
      ...toRecord,
      diffView: createDiffView(toRecord),
    },
    comparison: {
      sameLineage: true,
      direction,
      metadata: diffMetadata(fromRecord, toRecord),
      acceptance: diffSequence(fromRecord.acceptance, toRecord.acceptance),
      feedbackRefs: diffSequence(fromRecord.feedbackRefs, toRecord.feedbackRefs),
      bodyLines: diffSequence(fromRecord.bodyLines, toRecord.bodyLines),
    },
  };
}

module.exports = {
  PROCEDURE_DIFF_VERSION,
  compareProcedureVersions,
  compare_procedure_versions: compareProcedureVersions,
  inspectProcedure,
  inspect_procedure: inspectProcedure,
  listProcedures,
  list_procedures: listProcedures,
};
