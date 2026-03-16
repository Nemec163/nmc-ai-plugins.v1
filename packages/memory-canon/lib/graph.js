'use strict';

const { VALIDATION_ERROR_CODES } = require('./load-contracts');

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

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function extractRecordIdsFromContent(markdown) {
  const ids = [];
  const pattern = /^\s*record_id:\s*"?([^\n"]+)"?\s*$/gm;

  for (const match of markdown.matchAll(pattern)) {
    ids.push(stripQuotes(match[1]));
  }

  return ids;
}

function extractLinksFromContent(markdown) {
  const lines = markdown.split('\n');
  const links = [];
  let inYaml = false;
  let blockId = '';
  let inLinks = false;
  let pendingRel = '';
  let pendingTarget = '';

  function flushPending() {
    if (blockId && pendingRel && pendingTarget) {
      links.push({
        src: blockId,
        rel: pendingRel,
        dst: pendingTarget,
      });
    }

    pendingRel = '';
    pendingTarget = '';
  }

  for (const line of lines) {
    if (/^---\s*$/.test(line)) {
      if (!inYaml) {
        inYaml = true;
        blockId = '';
        inLinks = false;
        pendingRel = '';
        pendingTarget = '';
      } else {
        flushPending();
        inYaml = false;
        inLinks = false;
      }
      continue;
    }

    if (!inYaml) {
      continue;
    }

    const recordIdMatch = line.match(/^\s*record_id:\s*(.*)$/);
    if (recordIdMatch) {
      blockId = stripQuotes(recordIdMatch[1]);
      continue;
    }

    if (/^\s*links:\s*$/.test(line)) {
      inLinks = true;
      pendingRel = '';
      pendingTarget = '';
      continue;
    }

    if (inLinks && /^[^\s-][^:]*:\s*/.test(line)) {
      flushPending();
      inLinks = false;
      continue;
    }

    const relMatch = inLinks && line.match(/^\s*-\s*rel:\s*(.*)$/);
    if (relMatch) {
      flushPending();
      pendingRel = stripQuotes(relMatch[1]);
      pendingTarget = '';
      continue;
    }

    const targetMatch = inLinks && line.match(/^\s*target:\s*(.*)$/);
    if (targetMatch) {
      pendingTarget = stripQuotes(targetMatch[1]);
      flushPending();
    }
  }

  return links;
}

function validateGraphEdge(edge) {
  const issues = [];

  if (!isPlainObject(edge)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          VALIDATION_ERROR_CODES.INVALID_SHAPE,
          'Graph edge must be an object.',
          'edge'
        ),
      ],
    };
  }

  if (!isNonEmptyString(edge.src)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Graph edge src must be a non-empty string.',
        'src'
      )
    );
  }

  if (!isNonEmptyString(edge.rel)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Graph edge rel must be a non-empty string.',
        'rel'
      )
    );
  }

  if (!isNonEmptyString(edge.dst)) {
    issues.push(
      buildIssue(
        VALIDATION_ERROR_CODES.INVALID_VALUE,
        'Graph edge dst must be a non-empty string.',
        'dst'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function serializeGraphEdge(edge, batchDate) {
  return JSON.stringify({
    batch: batchDate,
    src: edge.src,
    rel: edge.rel,
    dst: edge.dst,
    at: batchDate,
  });
}

module.exports = {
  extractLinksFromContent,
  extractRecordIdsFromContent,
  serializeGraphEdge,
  validateGraphEdge,
};
