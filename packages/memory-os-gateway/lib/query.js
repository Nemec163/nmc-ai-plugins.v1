'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');
const { readManifestSnapshot } = require('./read');
const { parseProjectionRecords, tokenizeText, toPosixRelative } = require('./records');

const CURRENT_QUERY_PATTERN = /\b(now|today|current|currently|recent|recently)\b/i;
const PENDING_CLAIM_PATTERN = /^## (claim-[0-9-]+)\n([\s\S]*?)(?=^## |\Z)/gm;

function scoreText(haystack, tokens) {
  const normalized = haystack.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function pickSnippet(record) {
  if (record.metadata.summary) {
    return record.metadata.summary;
  }

  return record.body.split('\n')[0] || '';
}

function parsePendingClaims(markdown) {
  const claims = [];

  for (const match of markdown.matchAll(PENDING_CLAIM_PATTERN)) {
    claims.push({
      claimId: match[1],
      block: match[2].trim(),
    });
  }

  return claims;
}

function query(options) {
  const memoryRoot = path.resolve(options.memoryRoot);
  const text = String(options.text || '').trim();
  if (!text) {
    throw new Error('text is required');
  }

  const limit = Number.isInteger(options.limit) ? options.limit : 10;
  const tokens = tokenizeText(text);
  const includePending =
    options.includePending === true ||
    (options.includePending !== false && CURRENT_QUERY_PATTERN.test(text));

  const canon = loadMemoryCanon();
  const canonicalHits = [];

  for (const filePath of canon.listRecordFiles(memoryRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parseProjectionRecords(content);

    for (const record of records) {
      const score = scoreText(
        [
          record.heading,
          record.metadata.record_id,
          record.metadata.summary,
          record.body,
          toPosixRelative(memoryRoot, filePath),
        ]
          .filter(Boolean)
          .join('\n'),
        tokens
      );

      if (score === 0) {
        continue;
      }

      canonicalHits.push({
        score,
        recordId: record.metadata.record_id || null,
        type: record.metadata.type || null,
        status: record.metadata.status || null,
        summary: record.metadata.summary || '',
        filePath,
        relativePath: toPosixRelative(memoryRoot, filePath),
        snippet: pickSnippet(record),
      });
    }
  }

  canonicalHits.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return String(left.recordId || '').localeCompare(String(right.recordId || ''));
  });

  const runtimeDelta = [];
  if (includePending) {
    const pendingDir = path.join(memoryRoot, 'intake/pending');
    if (fs.existsSync(pendingDir)) {
      for (const entry of fs.readdirSync(pendingDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) {
          continue;
        }

        const filePath = path.join(pendingDir, entry.name);
        const content = fs.readFileSync(filePath, 'utf8');

        for (const claim of parsePendingClaims(content)) {
          const score = scoreText(claim.block, tokens);
          if (score === 0) {
            continue;
          }

          runtimeDelta.push({
            score,
            claimId: claim.claimId,
            filePath,
            relativePath: toPosixRelative(memoryRoot, filePath),
            snippet: claim.block.split('\n').find((line) => line.includes('- claim:')) || claim.block,
          });
        }
      }
    }
  }

  runtimeDelta.sort((left, right) => right.score - left.score || left.claimId.localeCompare(right.claimId));

  return {
    text,
    tokens,
    freshnessBoundary: {
      canonicalLastUpdated: readManifestSnapshot(memoryRoot)?.last_updated || null,
      runtimeDeltaIncluded: includePending,
    },
    canonicalHits: canonicalHits.slice(0, limit),
    runtimeDelta: runtimeDelta.slice(0, limit),
  };
}

module.exports = {
  query,
};
