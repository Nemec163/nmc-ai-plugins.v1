'use strict';

const { TASK_CANON_FRONTMATTER_KEYS } = require('./constants');

function parseKanbanScalar(raw) {
  const value = raw.trim();
  if (!value) return '';

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);

  return value;
}

function parseKanbanArray(raw) {
  const value = raw.trim();
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return null;
  }

  const inner = value.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner.split(',').map((item) => parseKanbanScalar(item));
}

function parseKanbanFrontMatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return { meta: {}, body: markdown };
  }

  const endIndex = markdown.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return { meta: {}, body: markdown };
  }

  const frontMatterText = markdown.slice(4, endIndex).trimEnd();
  const body = markdown.slice(endIndex + 5);
  const meta = {};

  for (const rawLine of frontMatterText.split('\n')) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const arrayValue = parseKanbanArray(rawValue);
    meta[key] = arrayValue !== null ? arrayValue : parseKanbanScalar(rawValue);
  }

  return { meta, body };
}

function orderedFrontMatterKeys(meta) {
  const seen = new Set();
  const keys = [];

  for (const key of TASK_CANON_FRONTMATTER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) {
      keys.push(key);
      seen.add(key);
    }
  }

  const extraKeys = Object.keys(meta)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b));

  return keys.concat(extraKeys);
}

function renderKanbanFrontMatter(meta) {
  const lines = [];

  for (const key of orderedFrontMatterKeys(meta)) {
    const value = meta[key];

    if (Array.isArray(value)) {
      const items = value.map((item) => JSON.stringify(String(item)));
      lines.push(`${key}: [${items.join(', ')}]`);
      continue;
    }

    if (value === null) {
      lines.push(`${key}: null`);
      continue;
    }

    const scalar = String(value ?? '');
    const needsQuote = /[:\n\[\]\{\},#]|^\s|\s$/.test(scalar) || scalar === '';
    lines.push(`${key}: ${needsQuote ? JSON.stringify(scalar) : scalar}`);
  }

  return `---\n${lines.join('\n')}\n---\n`;
}

module.exports = {
  orderedFrontMatterKeys,
  parseKanbanArray,
  parseKanbanFrontMatter,
  parseKanbanScalar,
  renderKanbanFrontMatter,
};
