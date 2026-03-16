'use strict';

const SOURCE_KINDS = Object.freeze({
  TRANSCRIPT: 'transcript',
});

const TRANSCRIPT_ROLES = Object.freeze([
  'assistant',
  'user',
]);

const CLAIM_CONFIDENCE_LEVELS = Object.freeze([
  'high',
  'medium',
  'low',
]);

const TARGET_LAYERS = Object.freeze([
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'agent',
]);

const CLAIM_ID_PATTERN = /^claim-\d{8}-\d{3,}$/;

const REQUIRED_BATCH_FRONTMATTER_FIELDS = Object.freeze([
  'batch_date',
  'generated_by',
  'schema_version',
  'updated_at',
]);

module.exports = {
  CLAIM_CONFIDENCE_LEVELS,
  CLAIM_ID_PATTERN,
  REQUIRED_BATCH_FRONTMATTER_FIELDS,
  SOURCE_KINDS,
  TARGET_LAYERS,
  TRANSCRIPT_ROLES,
};
