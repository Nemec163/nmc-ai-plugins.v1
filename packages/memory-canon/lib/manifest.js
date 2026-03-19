'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CURRENT_SCHEMA_VERSION,
} = require('./constants');
const {
  RECORD_TYPE_PREFIXES,
  VALIDATION_ERROR_CODES,
} = require('./load-contracts');

function buildIssue(code, message, pathName) {
  return {
    code,
    message,
    path: pathName,
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSchemaVersionFromCanonContent(markdown) {
  const match = markdown.match(/^\s*schema_version:\s*"?([^\n"]+)"?\s*$/m);
  return match ? String(match[1]).trim() : CURRENT_SCHEMA_VERSION;
}

function readSchemaVersionFromWorkspace(memoryRoot, canonSystemFile) {
  const canonPath = canonSystemFile || path.join(memoryRoot, 'core/system/CANON.md');

  if (!fs.existsSync(canonPath)) {
    return CURRENT_SCHEMA_VERSION;
  }

  return readSchemaVersionFromCanonContent(fs.readFileSync(canonPath, 'utf8'));
}

function countRecordIdsByType(recordIds) {
  const counts = {
    events: 0,
    facts: 0,
    states: 0,
    identities: 0,
    competences: 0,
    procedures: 0,
  };

  for (const recordId of recordIds) {
    if (recordId.startsWith(`${RECORD_TYPE_PREFIXES.event}-`)) {
      counts.events += 1;
    } else if (recordId.startsWith(`${RECORD_TYPE_PREFIXES.fact}-`)) {
      counts.facts += 1;
    } else if (recordId.startsWith(`${RECORD_TYPE_PREFIXES.state}-`)) {
      counts.states += 1;
    } else if (recordId.startsWith(`${RECORD_TYPE_PREFIXES.identity}-`)) {
      counts.identities += 1;
    } else if (recordId.startsWith(`${RECORD_TYPE_PREFIXES.competence}-`)) {
      counts.competences += 1;
    } else if (recordId.startsWith(`${RECORD_TYPE_PREFIXES.procedure}-`)) {
      counts.procedures += 1;
    }
  }

  return counts;
}

function buildManifestSnapshot(options) {
  return {
    schema_version: options.schemaVersion,
    last_updated: options.lastUpdated,
    record_counts: options.recordCounts,
    checksums: options.checksums,
    edges_count: options.edgesCount,
  };
}

function serializeManifestSnapshot(manifest) {
  const lines = [
    '{',
    `  "schema_version": ${JSON.stringify(manifest.schema_version)},`,
    `  "last_updated": ${JSON.stringify(manifest.last_updated)},`,
    '  "record_counts": {',
    `    "events": ${manifest.record_counts.events},`,
    `    "facts": ${manifest.record_counts.facts},`,
    `    "states": ${manifest.record_counts.states},`,
    `    "identities": ${manifest.record_counts.identities},`,
    `    "competences": ${manifest.record_counts.competences},`,
    `    "procedures": ${manifest.record_counts.procedures}`,
    '  },',
    '  "checksums": {',
  ];

  const entries = Object.entries(manifest.checksums);
  entries.forEach(([relativePath, checksum], index) => {
    const suffix = index === entries.length - 1 ? '' : ',';
    lines.push(`    ${JSON.stringify(relativePath)}: ${JSON.stringify(checksum)}${suffix}`);
  });

  lines.push('  },');
  lines.push(`  "edges_count": ${manifest.edges_count}`);
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function validateManifestSnapshot(manifest) {
  const issues = [];

  if (!isPlainObject(manifest)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Manifest snapshot must be an object.',
          'manifest'
        ),
      ],
    };
  }

  if (!isNonEmptyString(manifest.schema_version)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'schema_version must be a non-empty string.',
        'schema_version'
      )
    );
  }

  if (!isNonEmptyString(manifest.last_updated)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'last_updated must be a non-empty string.',
        'last_updated'
      )
    );
  }

  if (!isPlainObject(manifest.record_counts)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_SHAPE,
        'record_counts must be an object.',
        'record_counts'
      )
    );
  }

  if (!isPlainObject(manifest.checksums)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_SHAPE,
        'checksums must be an object.',
        'checksums'
      )
    );
  }

  if (!Number.isInteger(manifest.edges_count) || manifest.edges_count < 0) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'edges_count must be a non-negative integer.',
        'edges_count'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = {
  buildManifestSnapshot,
  countRecordIdsByType,
  readSchemaVersionFromCanonContent,
  readSchemaVersionFromWorkspace,
  serializeManifestSnapshot,
  validateManifestSnapshot,
};
