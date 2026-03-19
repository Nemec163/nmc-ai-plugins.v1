'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { getQueryableReadIndex } = require('./read-index');
const { readManifestSnapshot } = require('./read');
const { tokenizeText, toPosixRelative } = require('./records');

const CURRENT_QUERY_PATTERN = /\b(now|today|current|currently|recent|recently)\b/i;
const PENDING_CLAIM_PATTERN = /^## (claim-[0-9-]+)\n([\s\S]*?)(?=^## |\Z)/gm;
const QUERY_RANKING_VERSION = '1';

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

function intersectTokens(sourceTokens, queryTokens) {
  const sourceSet = new Set(sourceTokens);
  return queryTokens.filter((token) => sourceSet.has(token));
}

function buildCanonicalRanking(record, matchedTokens, text) {
  const summaryMatches = intersectTokens(tokenizeText(record.summary), matchedTokens);
  const headingMatches = intersectTokens(tokenizeText(record.heading), matchedTokens);
  const pathMatches = intersectTokens(tokenizeText(record.relativePath), matchedTokens);
  const reasons = [];
  let total = matchedTokens.length * 10;

  reasons.push({
    code: 'token-overlap',
    weight: matchedTokens.length * 10,
    matchedTokens,
  });

  if (summaryMatches.length > 0) {
    const weight = summaryMatches.length * 3;
    total += weight;
    reasons.push({
      code: 'summary-match',
      weight,
      matchedTokens: summaryMatches,
    });
  }

  if (headingMatches.length > 0) {
    const weight = headingMatches.length * 2;
    total += weight;
    reasons.push({
      code: 'heading-match',
      weight,
      matchedTokens: headingMatches,
    });
  }

  if (pathMatches.length > 0) {
    total += pathMatches.length;
    reasons.push({
      code: 'path-match',
      weight: pathMatches.length,
      matchedTokens: pathMatches,
    });
  }

  if (record.relativePath.endsWith('/current.md')) {
    total += 2;
    reasons.push({
      code: 'current-projection',
      weight: 2,
    });
  }

  if (String(text || '').toLowerCase().includes(String(record.recordId || '').toLowerCase())) {
    total += 25;
    reasons.push({
      code: 'exact-record-id',
      weight: 25,
    });
  }

  return {
    version: QUERY_RANKING_VERSION,
    total,
    matchedTokens,
    reasons,
  };
}

function buildPendingRanking(claim, matchedTokens, includePending) {
  const reasons = [
    {
      code: 'token-overlap',
      weight: matchedTokens.length * 10,
      matchedTokens,
    },
  ];
  let total = matchedTokens.length * 10;

  if (includePending) {
    total += 2;
    reasons.push({
      code: 'pending-runtime-delta',
      weight: 2,
    });
  }

  return {
    version: QUERY_RANKING_VERSION,
    total,
    matchedTokens,
    reasons,
  };
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
  const readIndex = getQueryableReadIndex({
    memoryRoot,
    persist: options.persistReadIndex === true,
    rebuild: options.rebuildReadIndex !== false,
    builtAt: options.builtAt,
  });
  const canonicalHits = [];

  if (readIndex.index) {
    const postings = readIndex.index.postings || {};
    const recordsById = new Map(
      (readIndex.index.records || []).map((record) => [record.recordId, record])
    );
    const candidates = new Map();

    for (const token of tokens) {
      const matchedIds = postings[token] || [];

      for (const recordId of matchedIds) {
        if (!candidates.has(recordId)) {
          candidates.set(recordId, []);
        }

        candidates.get(recordId).push(token);
      }
    }

    for (const [recordId, matchedTokens] of candidates.entries()) {
      const record = recordsById.get(recordId);
      if (!record) {
        continue;
      }

      const ranking = buildCanonicalRanking(record, matchedTokens, text);
      canonicalHits.push({
        score: ranking.total,
        matchedTokens,
        recordId,
        type: record.type || null,
        status: record.status || null,
        summary: record.summary || '',
        filePath: path.join(memoryRoot, record.relativePath),
        relativePath: record.relativePath,
        snippet: record.snippet || '',
        authoritative: true,
        ranking,
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
          const matchedTokens = tokens.filter((token) =>
            String(claim.block || '').toLowerCase().includes(token)
          );
          if (matchedTokens.length === 0) {
            continue;
          }

          const ranking = buildPendingRanking(claim, matchedTokens, includePending);
          runtimeDelta.push({
            score: ranking.total,
            claimId: claim.claimId,
            filePath,
            relativePath: toPosixRelative(memoryRoot, filePath),
            snippet: claim.block.split('\n').find((line) => line.includes('- claim:')) || claim.block,
            authoritative: false,
            ranking,
          });
        }
      }
    }
  }

  runtimeDelta.sort((left, right) => right.score - left.score || left.claimId.localeCompare(right.claimId));

  return {
    text,
    tokens,
    contract: {
      kind: 'canonical-query',
      rankingVersion: QUERY_RANKING_VERSION,
      scopes: {
        canonical: true,
        pendingRuntimeDelta: includePending,
      },
    },
    readIndex: {
      path: readIndex.index ? readIndex.index.relativePath : readIndex.verification.relativePath,
      status: readIndex.verification.status,
      source: readIndex.source,
      builtAt: readIndex.verification.builtAt,
      persisted: readIndex.source === 'persisted' || readIndex.source === 'rebuilt-persisted',
      authoritative: false,
    },
    freshnessBoundary: {
      canonicalLastUpdated: readManifestSnapshot(memoryRoot)?.last_updated || null,
      runtimeDeltaIncluded: includePending,
    },
    canonicalHits: canonicalHits.slice(0, limit),
    pendingRuntimeDelta: runtimeDelta.slice(0, limit),
    runtimeDelta: runtimeDelta.slice(0, limit),
  };
}

module.exports = {
  query,
};
