'use strict';

const {
  CONFIDENCE_LEVELS,
  RECORD_STATUSES_BY_TYPE,
  RECORD_TYPES,
  RECORD_TYPE_PREFIXES,
  REQUIRED_RECORD_FIELDS,
  VALIDATION_ERROR_CODES,
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

function isPositiveIntegerLike(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10) > 0;
  }

  return false;
}

function isKnownRecordType(value) {
  return RECORD_TYPES.includes(value);
}

function prependPath(prefix, issues) {
  return issues.map((issue) => ({
    ...issue,
    path: `${prefix}.${issue.path}`,
  }));
}

function validateLink(link, index) {
  const issues = [];
  const path = `links[${index}]`;

  if (!isPlainObject(link)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_SHAPE,
        'Link must be an object.',
        path
      )
    );
    return issues;
  }

  if (!isNonEmptyString(link.rel)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Link rel must be a non-empty string.',
        `${path}.rel`
      )
    );
  }

  if (!isNonEmptyString(link.target)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Link target must be a non-empty string.',
        `${path}.target`
      )
    );
  }

  return issues;
}

function validateStringArrayField(record, fieldName, issues, options = {}) {
  if (!(fieldName in record)) {
    if (options.required) {
      issues.push(
        buildIssue(
          VALIDATION_ERROR_CODES.MISSING_FIELD,
          `Missing required field: ${fieldName}`,
          fieldName
        )
      );
    }
    return;
  }

  if (!Array.isArray(record[fieldName]) || record[fieldName].length === 0) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `${fieldName} must be a non-empty array.`,
        fieldName
      )
    );
    return;
  }

  record[fieldName].forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      issues.push(
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_COLLECTION_ITEM,
          `${fieldName} entries must be non-empty strings.`,
          `${fieldName}[${index}]`
        )
      );
    }
  });
}

function validateProcedureRecord(record, issues) {
  if (!isNonEmptyString(record.role)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'role is required for procedure records.',
        'role'
      )
    );
  }

  if (!isNonEmptyString(record.procedure_key)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'procedure_key is required for procedure records.',
        'procedure_key'
      )
    );
  }

  if (!isPositiveIntegerLike(record.version)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'version must be a positive integer for procedure records.',
        'version'
      )
    );
  }

  validateStringArrayField(record, 'acceptance', issues, { required: true });
  validateStringArrayField(record, 'feedback_refs', issues);
}

function validateRecordEnvelope(record) {
  const issues = [];

  if (!isPlainObject(record)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Record envelope must be an object.',
          'record'
        ),
      ],
    };
  }

  for (const field of REQUIRED_RECORD_FIELDS) {
    if (!(field in record)) {
      issues.push(
        buildIssue(
          VALIDATION_ERROR_CODES.MISSING_FIELD,
          `Missing required field: ${field}`,
          field
        )
      );
    }
  }

  if (isNonEmptyString(record.record_id)) {
    if (isKnownRecordType(record.type)) {
      const expectedPrefix = RECORD_TYPE_PREFIXES[record.type];
      if (expectedPrefix && !record.record_id.startsWith(`${expectedPrefix}-`)) {
        issues.push(
          buildIssue(
            VALIDATION_ERROR_CODES.INVALID_VALUE,
            `record_id must start with ${expectedPrefix}- for type ${record.type}.`,
            'record_id'
          )
        );
      }
    }
  } else if ('record_id' in record) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'record_id must be a non-empty string.',
        'record_id'
      )
    );
  }

  if (!isKnownRecordType(record.type)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `Unknown record type: ${String(record.type)}`,
        'type'
      )
    );
  }

  if ('summary' in record && !isNonEmptyString(record.summary)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'summary must be a non-empty string.',
        'summary'
      )
    );
  }

  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'evidence must be a non-empty array.',
        'evidence'
      )
    );
  } else {
    record.evidence.forEach((entry, index) => {
      if (!isNonEmptyString(entry)) {
        issues.push(
          buildIssue(
            VALIDATION_ERROR_CODES.INVALID_COLLECTION_ITEM,
            'evidence entries must be non-empty strings.',
            `evidence[${index}]`
          )
        );
      }
    });
  }

  if (!CONFIDENCE_LEVELS.includes(record.confidence)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `Unknown confidence level: ${String(record.confidence)}`,
        'confidence'
      )
    );
  }

  if (!isNonEmptyString(record.updated_at)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'updated_at must be a non-empty string.',
        'updated_at'
      )
    );
  }

  const allowedStatuses = RECORD_STATUSES_BY_TYPE[record.type];
  if (!allowedStatuses || !allowedStatuses.includes(record.status)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        `Invalid status ${String(record.status)} for type ${String(record.type)}.`,
        'status'
      )
    );
  }

  if (!Array.isArray(record.links)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'links must be an array.',
        'links'
      )
    );
  } else {
    record.links.forEach((link, index) => {
      issues.push(...validateLink(link, index));
    });
  }

  if (record.type === 'procedure') {
    validateProcedureRecord(record, issues);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateRecordBlock(block) {
  if (!isPlainObject(block)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Record block must be an object.',
          'block'
        ),
      ],
    };
  }

  const issues = [];
  const recordValidation = validateRecordEnvelope(block.record);
  issues.push(...prependPath('record', recordValidation.issues));

  const recordId = block.record && block.record.record_id;

  if (!isNonEmptyString(block.anchorId)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'anchorId must be a non-empty string.',
        'anchorId'
      )
    );
  } else if (isNonEmptyString(recordId) && block.anchorId !== recordId) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISMATCHED_RECORD_ID,
        'anchorId must match record.record_id.',
        'anchorId'
      )
    );
  }

  if (!isNonEmptyString(block.headingId)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'headingId must be a non-empty string.',
        'headingId'
      )
    );
  } else if (isNonEmptyString(recordId) && block.headingId !== recordId) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.MISMATCHED_RECORD_ID,
        'headingId must match record.record_id.',
        'headingId'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = {
  isKnownRecordType,
  validateRecordBlock,
  validateRecordEnvelope,
};
