'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CURRENT_SCHEMA_VERSION,
  EXIT_CODES,
} = require('../lib/load-contracts');
const {
  validateBatchFrontmatter,
  validateExtractedClaim,
  validateTranscriptEvent,
} = require('..');

const FIXTURE_ROOT = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/tests/fixtures'
);
const TRANSCRIPT_ROOT = path.join(FIXTURE_ROOT, 'transcripts');
const WORKSPACE_ROOT = path.join(FIXTURE_ROOT, 'workspace');
const INTAKE_FIXTURE_PATH = path.join(
  WORKSPACE_ROOT,
  'intake/pending/2026-03-05.md'
);

function walkFiles(rootDir, predicate) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripQuotes(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseBracketArray(value) {
  const trimmed = value.trim();

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner.split(',').map((item) => stripQuotes(item));
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return {};
  }

  const closingIndex = markdown.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return {};
  }

  const block = markdown.slice(4, closingIndex);
  const frontmatter = {};

  for (const line of block.split('\n')) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    frontmatter[match[1]] = stripQuotes(match[2]);
  }

  return frontmatter;
}

function parseClaims(markdown) {
  const matches = markdown.matchAll(
    /^## (claim-[0-9-]+)\n([\s\S]*?)(?=^## claim-[0-9-]+\n|(?![\s\S]))/gm
  );
  const claims = [];

  for (const match of matches) {
    const claim = {
      claim_id: match[1],
    };

    for (const line of match[2].trim().split('\n')) {
      const fieldMatch = line.match(/^- ([a-z_]+):\s*(.*)$/);
      if (!fieldMatch) {
        continue;
      }

      const key = fieldMatch[1];
      const rawValue = fieldMatch[2];
      claim[key] = key === 'tags' ? parseBracketArray(rawValue) : stripQuotes(rawValue);
    }

    claims.push(claim);
  }

  return claims;
}

function main() {
  const transcriptFiles = walkFiles(TRANSCRIPT_ROOT, (name) => name.endsWith('.jsonl'));
  const transcriptFailures = [];
  let transcriptEventCount = 0;

  for (const filePath of transcriptFiles) {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);

    for (const [index, line] of lines.entries()) {
      const validation = validateTranscriptEvent(JSON.parse(line));
      transcriptEventCount += 1;

      if (!validation.valid) {
        transcriptFailures.push({
          file: path.relative(FIXTURE_ROOT, filePath),
          index,
          issues: validation.issues,
        });
      }
    }
  }

  const intakeMarkdown = fs.readFileSync(INTAKE_FIXTURE_PATH, 'utf8');
  const frontmatter = parseFrontmatter(intakeMarkdown);
  const frontmatterValidation = validateBatchFrontmatter(frontmatter);
  const claimFailures = [];
  const claims = parseClaims(intakeMarkdown);

  assert.equal(frontmatter.schema_version, CURRENT_SCHEMA_VERSION, 'Unexpected intake fixture schema version');

  for (const claim of claims) {
    const claimValidation = validateExtractedClaim(claim);
    if (!claimValidation.valid) {
      claimFailures.push({
        claimId: claim.claim_id,
        issues: claimValidation.issues,
      });
    }
  }

  assert.equal(transcriptFiles.length, 2, 'Expected two transcript fixture files');
  assert.equal(transcriptEventCount, 16, 'Expected sixteen transcript fixture events');
  assert.equal(claims.length, 6, 'Expected six extracted claim fixtures');

  if (transcriptFailures.length > 0 || claimFailures.length > 0 || !frontmatterValidation.valid) {
    if (!frontmatterValidation.valid) {
      console.error('Invalid intake batch frontmatter');
      for (const issue of frontmatterValidation.issues) {
        console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
      }
    }

    for (const failure of transcriptFailures) {
      console.error(`Invalid transcript fixture event in ${failure.file}:${failure.index + 1}`);
      for (const issue of failure.issues) {
        console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
      }
    }

    for (const failure of claimFailures) {
      console.error(`Invalid extracted claim fixture ${failure.claimId}`);
      for (const issue of failure.issues) {
        console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
      }
    }

    process.exit(EXIT_CODES.WARNING);
  }

  console.log(
    `Validated ${transcriptEventCount} fixture transcript events and ${claims.length} claim envelopes through @nmc/memory-ingest.`
  );
}

main();
