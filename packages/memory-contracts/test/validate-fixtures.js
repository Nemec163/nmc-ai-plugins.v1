'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CURRENT_SCHEMA_VERSION,
  EXIT_CODES,
  isSupportedSchemaVersion,
  validateRecordBlock,
} = require('..');

const FIXTURE_ROOT = path.resolve(
  __dirname,
  '../../../nmc-memory-plugin/tests/fixtures/workspace/core'
);

const RECORD_FILE_ROOTS = [
  path.join(FIXTURE_ROOT, 'user'),
  path.join(FIXTURE_ROOT, 'agents'),
];

const RECORD_BLOCK_PATTERN = /<a id="([^"]+)"><\/a>\n### ([^\n]+)\n---\n(.*?)\n---\n/gs;

function walkMarkdownFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
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

function parseStringArray(lines, startIndex) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\S/.test(line)) {
      break;
    }

    const match = line.match(/^  - (.*)$/);
    if (match) {
      items.push(stripQuotes(match[1]));
    }

    index += 1;
  }

  return { items, nextIndex: index };
}

function parseLinks(lines, startIndex) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\S/.test(line)) {
      break;
    }

    const relMatch = line.match(/^  - rel:\s*(.*)$/);
    if (relMatch) {
      const link = {
        rel: stripQuotes(relMatch[1]),
      };

      index += 1;

      while (index < lines.length && /^\s+/.test(lines[index])) {
        const targetMatch = lines[index].match(/^    target:\s*(.*)$/);
        if (targetMatch) {
          link.target = stripQuotes(targetMatch[1]);
        }
        index += 1;
      }

      items.push(link);
      continue;
    }

    index += 1;
  }

  return { items, nextIndex: index };
}

function parseRecord(block) {
  const lines = block.trim().split('\n');
  const record = {};

  for (let index = 0; index < lines.length; ) {
    const match = lines[index].match(/^([a-z_]+):(?:\s*(.*))?$/);
    assert(match, `Unsupported record line: ${lines[index]}`);

    const key = match[1];
    const rawValue = match[2] || '';

    if (key === 'evidence') {
      const parsed = parseStringArray(lines, index + 1);
      record.evidence = parsed.items;
      index = parsed.nextIndex;
      continue;
    }

    if (key === 'links') {
      const parsed = parseLinks(lines, index + 1);
      record.links = parsed.items;
      index = parsed.nextIndex;
      continue;
    }

    record[key] = stripQuotes(rawValue);
    index += 1;
  }

  return record;
}

function main() {
  const failures = [];
  let validatedCount = 0;

  for (const filePath of RECORD_FILE_ROOTS.flatMap(walkMarkdownFiles)) {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(markdown);

    assert.equal(
      isSupportedSchemaVersion(frontmatter.schema_version),
      true,
      `${path.relative(FIXTURE_ROOT, filePath)} uses an unsupported schema version`
    );

    for (const match of markdown.matchAll(RECORD_BLOCK_PATTERN)) {
      const recordValidation = validateRecordBlock({
        anchorId: match[1],
        headingId: match[2],
        record: parseRecord(match[3]),
      });

      validatedCount += 1;

      if (!recordValidation.valid) {
        failures.push({
          file: path.relative(FIXTURE_ROOT, filePath),
          issues: recordValidation.issues,
        });
      }
    }
  }

  assert.equal(
    CURRENT_SCHEMA_VERSION,
    '1.0',
    'Unexpected shared contract schema version'
  );
  assert.equal(validatedCount, 6, 'Expected six canonical record fixtures');

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Invalid fixture record block in ${failure.file}`);
      for (const issue of failure.issues) {
        console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
      }
    }
    process.exit(EXIT_CODES.WARNING);
  }

  console.log(`Validated ${validatedCount} fixture record envelopes through @nmc/memory-contracts.`);
}

main();
