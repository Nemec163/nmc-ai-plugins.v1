'use strict';

const SCHEMA_VERSION = '1.0';

const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([SCHEMA_VERSION]);

const RECORD_TYPES = Object.freeze([
  'event',
  'fact',
  'state',
  'identity',
  'competence',
]);

const RECORD_TYPE_PREFIXES = Object.freeze({
  event: 'evt',
  fact: 'fct',
  state: 'st',
  identity: 'id',
  competence: 'cmp',
});

const CONFIDENCE_LEVELS = Object.freeze([
  'low',
  'medium',
  'high',
]);

const RECORD_STATUSES_BY_TYPE = Object.freeze({
  event: Object.freeze(['active', 'corrected', 'retracted']),
  fact: Object.freeze(['active', 'deprecated', 'retracted']),
  state: Object.freeze(['active', 'deprecated', 'retracted']),
  identity: Object.freeze(['active', 'deprecated', 'retracted']),
  competence: Object.freeze(['active', 'deprecated', 'retracted']),
});

const REQUIRED_RECORD_FIELDS = Object.freeze([
  'record_id',
  'type',
  'summary',
  'evidence',
  'confidence',
  'status',
  'updated_at',
  'links',
]);

const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  WARNING: 1,
  MISSING_DEPENDENCY: 2,
});

const VALIDATION_ERROR_CODES = Object.freeze({
  INVALID_COLLECTION_ITEM: 'invalid-collection-item',
  INVALID_SHAPE: 'invalid-shape',
  INVALID_VALUE: 'invalid-value',
  MISMATCHED_RECORD_ID: 'mismatched-record-id',
  MISSING_FIELD: 'missing-field',
  UNSUPPORTED_SCHEMA_VERSION: 'unsupported-schema-version',
});

module.exports = {
  CONFIDENCE_LEVELS,
  EXIT_CODES,
  RECORD_STATUSES_BY_TYPE,
  RECORD_TYPES,
  RECORD_TYPE_PREFIXES,
  REQUIRED_RECORD_FIELDS,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  VALIDATION_ERROR_CODES,
};
