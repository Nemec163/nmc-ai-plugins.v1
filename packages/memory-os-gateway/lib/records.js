'use strict';

const path = require('node:path');

const RECORD_BLOCK_PATTERN =
  /<a id="([^"]+)"><\/a>\n### ([^\n]+)\n---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n<a id="|\s*$)/g;

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

function parseRecordMetadata(block) {
  const lines = block.trim().split('\n');
  const record = {};

  for (let index = 0; index < lines.length; ) {
    const match = lines[index].match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (!match) {
      index += 1;
      continue;
    }

    const key = match[1];
    const rawValue = match[2] || '';

    if (key === 'evidence' || key === 'acceptance' || key === 'feedback_refs') {
      const parsed = parseStringArray(lines, index + 1);
      if (key === 'acceptance') {
        record.acceptance = parsed.items;
      } else if (key === 'feedback_refs') {
        record.feedback_refs = parsed.items;
      } else {
        record.evidence = parsed.items;
      }
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

function parseProjectionRecords(markdown) {
  const records = [];

  for (const match of markdown.matchAll(RECORD_BLOCK_PATTERN)) {
    records.push({
      anchorId: match[1],
      heading: match[2],
      metadata: parseRecordMetadata(match[3]),
      body: match[4].trim(),
    });
  }

  return records;
}

function ensurePathInsideRoot(rootPath, targetPath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes memory root: ${targetPath}`);
  }

  return resolvedTarget;
}

function toPosixRelative(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).split(path.sep).join('/');
}

function tokenizeText(input) {
  return Array.from(
    new Set(
      String(input || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

module.exports = {
  ensurePathInsideRoot,
  parseFrontmatter,
  parseProjectionRecords,
  stripQuotes,
  toPosixRelative,
  tokenizeText,
};
