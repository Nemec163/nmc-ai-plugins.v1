'use strict';

const { VALIDATION_ERROR_CODES, validateSchemaVersion } = require('./load-contracts');
const {
  CLAIM_CONFIDENCE_LEVELS,
  CLAIM_ID_PATTERN,
  REQUIRED_BATCH_FRONTMATTER_FIELDS,
  TARGET_LAYERS,
} = require('./constants');

function buildIssue(code, message, path) {
  return {
    code,
    message,
    path,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateTime(value) {
  return (
    isNonEmptyString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isBatchDate(value) {
  return isNonEmptyString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateStringArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `${path} must be a non-empty array.`,
        path
      ),
    ];
  }

  const issues = [];

  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      issues.push(
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_COLLECTION_ITEM,
          `${path} entries must be non-empty strings.`,
          `${path}[${index}]`
        )
      );
    }
  });

  return issues;
}

function validateBatchFrontmatter(frontmatter) {
  const issues = [];

  if (!isPlainObject(frontmatter)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Batch frontmatter must be an object.',
          'frontmatter'
        ),
      ],
    };
  }

  for (const field of REQUIRED_BATCH_FRONTMATTER_FIELDS) {
    if (!(field in frontmatter)) {
      issues.push(
        buildIssue(
          VALIDATION_ERROR_CODES.MISSING_FIELD,
          `Missing required field: ${field}`,
          field
        )
      );
    }
  }

  if ('batch_date' in frontmatter && !isBatchDate(frontmatter.batch_date)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'batch_date must use the YYYY-MM-DD format.',
        'batch_date'
      )
    );
  }

  if ('generated_by' in frontmatter && !isNonEmptyString(frontmatter.generated_by)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'generated_by must be a non-empty string.',
        'generated_by'
      )
    );
  }

  if ('schema_version' in frontmatter) {
    issues.push(...validateSchemaVersion(frontmatter.schema_version).issues);
  }

  if ('updated_at' in frontmatter && !isIsoDateTime(frontmatter.updated_at)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'updated_at must be an RFC3339 UTC datetime string.',
        'updated_at'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateExtractedClaim(claim) {
  const issues = [];

  if (!isPlainObject(claim)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Extracted claim must be an object.',
          'claim'
        ),
      ],
    };
  }

  if (!isNonEmptyString(claim.claim_id) || !CLAIM_ID_PATTERN.test(claim.claim_id)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'claim_id must match the claim-YYYYMMDD-NNN format.',
        'claim_id'
      )
    );
  }

  if (!isNonEmptyString(claim.source_session)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'source_session must be a non-empty string.',
        'source_session'
      )
    );
  }

  if (!isNonEmptyString(claim.source_agent)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'source_agent must be a non-empty string.',
        'source_agent'
      )
    );
  }

  if (!isIsoDateTime(claim.observed_at)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'observed_at must be an RFC3339 UTC datetime string.',
        'observed_at'
      )
    );
  }

  if (!CLAIM_CONFIDENCE_LEVELS.includes(claim.confidence)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `confidence must be one of: ${CLAIM_CONFIDENCE_LEVELS.join(', ')}.`,
        'confidence'
      )
    );
  }

  issues.push(...validateStringArray(claim.tags, 'tags'));

  if (!TARGET_LAYERS.includes(claim.target_layer)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `target_layer must be one of: ${TARGET_LAYERS.join(', ')}.`,
        'target_layer'
      )
    );
  }

  if (!isNonEmptyString(claim.target_domain)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'target_domain must be a non-empty string.',
        'target_domain'
      )
    );
  }

  if (!isNonEmptyString(claim.claim)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISSING_FIELD,
        'claim must be a non-empty string.',
        'claim'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = {
  validateBatchFrontmatter,
  validateExtractedClaim,
};
