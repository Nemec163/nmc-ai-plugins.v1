'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { CURRENT_SCHEMA_VERSION } = require('./constants');

const RECORD_BLOCK_PATTERN =
  /<a id="([^"]+)"><\/a>\n### ([^\n]+)\n---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n<a id="|\s*$)/g;

function stripQuotes(value) {
  const trimmed = String(value == null ? '' : value).trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function titleCase(value) {
  return String(value || '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseArrayValue(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch (error) {
    return [];
  }
}

function parsePositiveInteger(value) {
  const trimmed = String(value == null ? '' : value).trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return parsed > 0 ? parsed : null;
}

function parseYamlStringArray(lines, startIndex) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const itemMatch = lines[index].match(/^  - (.*)$/);
    if (!itemMatch) {
      break;
    }

    items.push(stripQuotes(itemMatch[1]));
    index += 1;
  }

  return {
    items,
    nextIndex: index,
  };
}

function parsePendingBatch(content) {
  const frontmatter = {};
  let body = content;

  if (content.startsWith('---\n')) {
    const closingIndex = content.indexOf('\n---\n', 4);
    if (closingIndex !== -1) {
      const block = content.slice(4, closingIndex);
      body = content.slice(closingIndex + 5);

      for (const line of block.split('\n')) {
        const match = line.match(/^([a-z_]+):\s*(.*)$/);
        if (!match) {
          continue;
        }

        frontmatter[match[1]] = stripQuotes(match[2]);
      }
    }
  }

  const claims = [];
  const sections = body.split(/^## /m).slice(1);
  for (const section of sections) {
    const lines = section.split('\n');
    const claimId = stripQuotes(lines.shift());
    const claim = { claim_id: claimId };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const match = line.match(/^- ([a-z_]+):\s*(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1];
      const rawValue = match[2];
      if (key === 'tags' || key === 'acceptance' || key === 'feedback_refs') {
        claim[key] = parseArrayValue(rawValue);
      } else if (key === 'procedure_version') {
        claim.procedure_version = parsePositiveInteger(rawValue);
      } else if (key === 'version') {
        claim.version = parsePositiveInteger(rawValue);
      } else {
        claim[key] = stripQuotes(rawValue);
      }
    }

    claim.tags = Array.isArray(claim.tags) ? claim.tags : [];
    claim.acceptance = Array.isArray(claim.acceptance) ? claim.acceptance : [];
    claim.feedback_refs = Array.isArray(claim.feedback_refs) ? claim.feedback_refs : [];
    claims.push(claim);
  }

  return {
    frontmatter,
    claims,
  };
}

function parseRecordIds(content) {
  const ids = [];
  const pattern = /^\s*record_id:\s*"?([^\n"]+)"?\s*$/gm;

  for (const match of content.matchAll(pattern)) {
    ids.push(stripQuotes(match[1]));
  }

  return ids;
}

function parseRecordMetadata(block) {
  const lines = String(block || '').trim().split('\n');
  const metadata = {};

  for (let index = 0; index < lines.length; ) {
    const match = lines[index].match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (!match) {
      index += 1;
      continue;
    }

    const key = match[1];
    const rawValue = match[2] || '';

    if (key === 'evidence' || key === 'acceptance' || key === 'feedback_refs') {
      const parsed = parseYamlStringArray(lines, index + 1);
      metadata[key] = parsed.items;
      index = parsed.nextIndex;
      continue;
    }

    if (key === 'links') {
      const links = [];
      index += 1;
      while (index < lines.length) {
        const relMatch = lines[index].match(/^  - rel:\s*(.*)$/);
        if (!relMatch) {
          break;
        }

        const link = {
          rel: stripQuotes(relMatch[1]),
        };
        index += 1;
        while (index < lines.length) {
          const targetMatch = lines[index].match(/^    target:\s*(.*)$/);
          if (targetMatch) {
            link.target = stripQuotes(targetMatch[1]);
            index += 1;
            continue;
          }

          if (!/^\s+/.test(lines[index])) {
            break;
          }
          index += 1;
        }
        links.push(link);
      }
      metadata.links = links;
      continue;
    }

    if (key === 'tags') {
      metadata.tags = parseArrayValue(rawValue);
    } else if (key === 'version') {
      metadata.version = parsePositiveInteger(rawValue);
    } else {
      metadata[key] = stripQuotes(rawValue);
    }
    index += 1;
  }

  return metadata;
}

function parseExistingRecords(content) {
  const records = [];

  for (const match of String(content || '').matchAll(RECORD_BLOCK_PATTERN)) {
    records.push({
      anchorId: match[1],
      heading: match[2],
      metadata: parseRecordMetadata(match[3]),
      body: match[4].trim(),
    });
  }

  return records;
}

function latestRecordSuffix(memoryRoot, prefix, batchDate) {
  let next = 0;
  const canonRoots = ['core/user', 'core/agents'];

  for (const root of canonRoots) {
    const absoluteRoot = path.join(memoryRoot, root);
    if (!fs.existsSync(absoluteRoot)) {
      continue;
    }

    const queue = [absoluteRoot];
    while (queue.length > 0) {
      const current = queue.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.md')) {
          continue;
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        for (const recordId of parseRecordIds(content)) {
          const match = recordId.match(
            new RegExp(`^${escapeRegExp(prefix)}-${escapeRegExp(batchDate)}-(\\d+)$`)
          );
          if (!match) {
            continue;
          }

          next = Math.max(next, Number.parseInt(match[1], 10));
        }
      }
    }
  }

  return next;
}

function buildTimelineScaffold(batchDate, updatedAt) {
  return [
    '---',
    'layer: L2',
    `schema_version: ${JSON.stringify(CURRENT_SCHEMA_VERSION)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    '---',
    `# Timeline — ${batchDate}`,
    '',
  ].join('\n');
}

function buildKnowledgeScaffold(domain, updatedAt) {
  return [
    '---',
    'layer: L3',
    `domain: ${domain}`,
    `schema_version: ${JSON.stringify(CURRENT_SCHEMA_VERSION)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    '---',
    `# ${titleCase(domain)}`,
    '',
  ].join('\n');
}

function buildStateScaffold(updatedAt, asOf) {
  return [
    '---',
    'layer: L5',
    `schema_version: ${JSON.stringify(CURRENT_SCHEMA_VERSION)}`,
    `as_of: ${JSON.stringify(asOf)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    '---',
    '# State: Current',
    '',
  ].join('\n');
}

function buildIdentityScaffold(updatedAt, asOf) {
  return [
    '---',
    'layer: L4',
    `schema_version: ${JSON.stringify(CURRENT_SCHEMA_VERSION)}`,
    `as_of: ${JSON.stringify(asOf)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    '---',
    '# Identity: Current',
    '',
  ].join('\n');
}

function buildIdentityChangelogScaffold(updatedAt) {
  return [
    '---',
    'layer: L4',
    `schema_version: ${JSON.stringify(CURRENT_SCHEMA_VERSION)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    '---',
    '# Identity Changelog',
    '',
  ].join('\n');
}

function buildCompetenceScaffold(role, section, updatedAt) {
  return [
    '---',
    `role: ${role}`,
    `type: ${section.toLowerCase()}`,
    `schema_version: ${JSON.stringify(CURRENT_SCHEMA_VERSION)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    '---',
    `# ${role} — ${titleCase(section)}`,
    '',
  ].join('\n');
}

function replaceFrontmatterValue(content, key, value) {
  const quotedValue = JSON.stringify(value);
  const pattern = new RegExp(`(^${escapeRegExp(key)}:\\s*).*$`, 'm');

  if (pattern.test(content)) {
    return content.replace(pattern, `$1${quotedValue}`);
  }

  const closingIndex = content.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return content;
  }

  return `${content.slice(0, closingIndex)}\n${key}: ${quotedValue}${content.slice(closingIndex)}`;
}

function serializeScalar(value) {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    if (/^(low|medium|high|active|deprecated|retracted|corrected)$/.test(value)) {
      return value;
    }
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

function serializeStringArray(lines, key, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return;
  }

  lines.push(`${key}:`);
  for (const value of values) {
    lines.push(`  - ${JSON.stringify(value)}`);
  }
}

function serializeRecord(record) {
  const lines = [
    `<a id="${record.record_id}"></a>`,
    `### ${record.record_id}`,
    '---',
    `record_id: ${record.record_id}`,
    `type: ${record.type}`,
    `summary: ${JSON.stringify(record.summary)}`,
    'evidence:',
  ];

  for (const evidence of record.evidence) {
    lines.push(`  - ${JSON.stringify(evidence)}`);
  }

  lines.push(`confidence: ${record.confidence}`);
  lines.push(`status: ${record.status}`);
  lines.push(`updated_at: ${JSON.stringify(record.updated_at)}`);

  if (record.as_of) {
    lines.push(`as_of: ${JSON.stringify(record.as_of)}`);
  }

  if (record.domain) {
    lines.push(`domain: ${record.domain}`);
  }

  if (record.role) {
    lines.push(`role: ${record.role}`);
  }

  if (record.procedure_key) {
    lines.push(`procedure_key: ${JSON.stringify(record.procedure_key)}`);
  }

  if (record.version) {
    lines.push(`version: ${serializeScalar(record.version)}`);
  }

  if (record.supersedes) {
    lines.push(`supersedes: ${JSON.stringify(record.supersedes)}`);
  }

  serializeStringArray(lines, 'acceptance', record.acceptance);
  serializeStringArray(lines, 'feedback_refs', record.feedback_refs);

  lines.push('links:');
  if (Array.isArray(record.links) && record.links.length > 0) {
    for (const link of record.links) {
      lines.push(`  - rel: ${link.rel}`);
      lines.push(`    target: ${JSON.stringify(link.target)}`);
    }
  }

  if (Array.isArray(record.tags) && record.tags.length > 0) {
    lines.push(`tags: ${JSON.stringify(record.tags)}`);
  }

  lines.push('---');
  lines.push(record.body);
  lines.push('');

  return lines.join('\n');
}

function toSerializableRecord(parsedRecord) {
  return {
    record_id: parsedRecord.metadata.record_id,
    type: parsedRecord.metadata.type,
    summary: parsedRecord.metadata.summary || '',
    evidence: [...(parsedRecord.metadata.evidence || [])],
    confidence: parsedRecord.metadata.confidence || 'medium',
    status: parsedRecord.metadata.status || 'active',
    updated_at: parsedRecord.metadata.updated_at || new Date().toISOString(),
    as_of: parsedRecord.metadata.as_of || null,
    domain: parsedRecord.metadata.domain || null,
    role: parsedRecord.metadata.role || null,
    procedure_key: parsedRecord.metadata.procedure_key || null,
    version: parsedRecord.metadata.version || null,
    supersedes: parsedRecord.metadata.supersedes || null,
    acceptance: [...(parsedRecord.metadata.acceptance || [])],
    feedback_refs: [...(parsedRecord.metadata.feedback_refs || [])],
    links: [...(parsedRecord.metadata.links || [])],
    tags: Array.isArray(parsedRecord.metadata.tags) ? [...parsedRecord.metadata.tags] : [],
    body: parsedRecord.body || '',
  };
}

function writeRecordsToFile(filePath, scaffold, records, options = {}) {
  ensureDir(path.dirname(filePath));
  const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : scaffold;
  const firstRecordIndex = existingContent.indexOf('<a id="');
  const header = (firstRecordIndex === -1
    ? existingContent
    : existingContent.slice(0, firstRecordIndex)
  ).trimEnd();
  const serializedRecords = records.map((candidate) => serializeRecord(candidate).trimEnd());
  let nextContent = header;
  if (serializedRecords.length > 0) {
    nextContent = `${header}\n\n${serializedRecords.join('\n\n')}\n`;
  } else {
    nextContent = `${header}\n`;
  }

  if (options.updatedAt) {
    nextContent = replaceFrontmatterValue(nextContent, 'updated_at', options.updatedAt);
  }

  if (options.asOf) {
    nextContent = replaceFrontmatterValue(nextContent, 'as_of', options.asOf);
  }

  fs.writeFileSync(filePath, nextContent, 'utf8');
}

function upsertRecordInFile(filePath, scaffold, record, options = {}) {
  const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : scaffold;
  const existingRecords = parseExistingRecords(existingContent).map(toSerializableRecord);
  const matchingIndex = existingRecords.findIndex(
    (candidate) => candidate.record_id === record.record_id
  );

  if (matchingIndex === -1) {
    existingRecords.push(record);
  } else {
    existingRecords[matchingIndex] = record;
  }

  writeRecordsToFile(filePath, scaffold, existingRecords, options);
}

function mutateRecordsInFile(filePath, scaffold, mutate, options = {}) {
  const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : scaffold;
  const existingRecords = parseExistingRecords(existingContent).map(toSerializableRecord);
  const nextRecords = mutate(existingRecords) || existingRecords;
  writeRecordsToFile(filePath, scaffold, nextRecords, options);
}

function selectCompetenceSection(claim) {
  const tags = Array.isArray(claim.tags) ? claim.tags.map((tag) => String(tag).toLowerCase()) : [];
  if (tags.includes('pitfall')) {
    return 'PITFALLS';
  }
  if (tags.includes('decision')) {
    return 'DECISIONS';
  }
  if (tags.includes('playbook')) {
    return 'PLAYBOOK';
  }
  return 'COURSE';
}

function tokenize(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function sharedTokenCount(left, right) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) {
      count += 1;
    }
  }
  return count;
}

function groupAcceptedClaims(claims) {
  const accepted = claims
    .filter((claim) => String(claim.curator_decision || '').toLowerCase() === 'accept')
    .sort((left, right) => parseTimestamp(left.observed_at) - parseTimestamp(right.observed_at));
  const groups = [];
  const assigned = new Set();

  const byAgent = new Map();
  for (const claim of accepted) {
    const key = String(claim.source_agent || 'unknown');
    if (!byAgent.has(key)) {
      byAgent.set(key, []);
    }
    byAgent.get(key).push(claim);
  }

  for (const agentClaims of byAgent.values()) {
    const directEvents = agentClaims.filter(
      (claim) =>
        inferClaimType(claim) === 'event' ||
        claim.target_layer === 'L2' ||
        claim.target_domain === 'timeline'
    );

    for (const eventClaim of directEvents) {
      if (assigned.has(eventClaim.claim_id)) {
        continue;
      }

      const eventTokens = tokenize(eventClaim.claim);
      const group = [eventClaim];
      assigned.add(eventClaim.claim_id);

      for (const candidate of agentClaims) {
        if (assigned.has(candidate.claim_id) || candidate.claim_id === eventClaim.claim_id) {
          continue;
        }

        const candidateTokens = tokenize(candidate.claim);
        const sameHour =
          Math.abs(parseTimestamp(candidate.observed_at) - parseTimestamp(eventClaim.observed_at)) <=
          2 * 60 * 60 * 1000;
        const related =
          sharedTokenCount(eventTokens, candidateTokens) > 0 ||
          sharedTokenCount(new Set(eventClaim.tags || []), new Set(candidate.tags || [])) > 0 ||
          sameHour;

        if (related) {
          group.push(candidate);
          assigned.add(candidate.claim_id);
        }
      }

      groups.push(group.sort((left, right) => parseTimestamp(left.observed_at) - parseTimestamp(right.observed_at)));
    }

    const leftovers = agentClaims.filter((claim) => !assigned.has(claim.claim_id));
    if (leftovers.length > 0) {
      leftovers.forEach((claim) => assigned.add(claim.claim_id));
      groups.push(leftovers);
    }
  }

  return groups.sort((left, right) => parseTimestamp(left[0].observed_at) - parseTimestamp(right[0].observed_at));
}

function cleanSentence(value) {
  return String(value || '')
    .replace(/^On \d{4}-\d{2}-\d{2}\s+/i, '')
    .replace(/^The user (reports|reported|says|said|is currently|is)\s+/i, '')
    .replace(/^The /, '')
    .replace(/\.$/, '')
    .trim();
}

function sentenceCase(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildEventSummary(group) {
  const direct = group.find((claim) => claim.target_layer === 'L2' || claim.target_domain === 'timeline');
  if (direct) {
    return sentenceCase(cleanSentence(direct.claim));
  }

  const primary = group.find((claim) => claim.target_layer === 'L5') || group[0];
  return sentenceCase(cleanSentence(primary.claim));
}

function buildEventBody(group) {
  const lines = [];
  for (const claim of group) {
    if (claim.target_layer === 'agent') {
      continue;
    }
    const line = sentenceCase(cleanSentence(claim.claim));
    if (line && !lines.includes(line)) {
      lines.push(line);
    }
  }

  if (lines.length === 0) {
    lines.push(sentenceCase(cleanSentence(group[0].claim)));
  }

  return `${lines.join(' ')}.`;
}

function strongestConfidence(claims) {
  const scores = new Map([
    ['low', 1],
    ['medium', 2],
    ['high', 3],
  ]);

  let winner = 'medium';
  let bestScore = 0;

  for (const claim of claims) {
    const confidence = String(claim.confidence || '').toLowerCase();
    const score = scores.get(confidence) || 0;
    if (score > bestScore) {
      bestScore = score;
      winner = confidence;
    }
  }

  return winner;
}

function inferClaimType(claim) {
  if (claim.target_type) {
    return String(claim.target_type).toLowerCase();
  }
  if (claim.target_layer === 'agent') {
    const tags = Array.isArray(claim.tags) ? claim.tags.map((tag) => String(tag).toLowerCase()) : [];
    if (
      tags.includes('playbook') ||
      tags.includes('procedure') ||
      isNonEmptyString(claim.procedure_key) ||
      (Array.isArray(claim.acceptance) && claim.acceptance.length > 0)
    ) {
      return 'procedure';
    }
    return 'competence';
  }
  if (claim.target_layer === 'L5' || claim.target_domain === 'state') {
    return 'state';
  }
  if (claim.target_layer === 'L4' || claim.target_domain === 'identity') {
    return 'identity';
  }
  if (claim.target_layer === 'L2' || claim.target_domain === 'timeline') {
    return 'event';
  }
  return 'fact';
}

function buildRecordSummary(claim, type) {
  if (claim.draft_summary) {
    return String(claim.draft_summary);
  }
  const cleaned = sentenceCase(cleanSentence(claim.claim));

  if (type === 'competence') {
    return cleaned.replace(/^Trader role should remember that\s+/i, '').replace(/^Should remember that\s+/i, '');
  }

  return cleaned;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildProcedureAcceptance(claim) {
  const acceptance = Array.isArray(claim.acceptance)
    ? claim.acceptance.map((entry) => String(entry).trim()).filter(Boolean)
    : [];

  if (acceptance.length > 0) {
    return acceptance;
  }

  return [sentenceCase(cleanSentence(claim.claim))];
}

function buildProcedureBody(claim, record) {
  const lines = [
    `${sentenceCase(cleanSentence(claim.claim))}.`,
    '',
    'Acceptance criteria:',
  ];

  for (const criterion of record.acceptance) {
    lines.push(`- ${criterion}`);
  }

  return lines.join('\n');
}

function buildRecordBody(claim) {
  return `${sentenceCase(cleanSentence(claim.claim))}.`;
}

function resolveProcedureKey(claim) {
  if (isNonEmptyString(claim.procedure_key)) {
    return String(claim.procedure_key).trim();
  }

  return slugify(cleanSentence(claim.claim));
}

function getLatestProcedureRecord(filePath, procedureKey) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const existingRecords = parseExistingRecords(fs.readFileSync(filePath, 'utf8'))
    .map(toSerializableRecord)
    .filter(
      (record) =>
        record.type === 'procedure' &&
        record.procedure_key === procedureKey &&
        typeof record.version === 'number'
    )
    .sort((left, right) => right.version - left.version || parseTimestamp(right.updated_at) - parseTimestamp(left.updated_at));

  return existingRecords[0] || null;
}

function targetPathForRecord(memoryRoot, claim, type) {
  if (claim.target_file) {
    const rawTarget = String(claim.target_file).trim().replace(/^["']|["']$/g, '');
    const normalized = rawTarget.startsWith('core/')
      ? rawTarget
      : rawTarget.startsWith('agents/')
      ? `core/${rawTarget}`
      : rawTarget;
    return path.join(memoryRoot, normalized);
  }

  if (type === 'event') {
    const batchDate = String(claim.batch_date);
    const [year, month, day] = batchDate.split('-');
    return path.join(memoryRoot, 'core/user/timeline', year, month, `${day}.md`);
  }

  if (type === 'fact') {
    return path.join(memoryRoot, 'core/user/knowledge', `${claim.target_domain}.md`);
  }

  if (type === 'state') {
    return path.join(memoryRoot, 'core/user/state/current.md');
  }

  if (type === 'identity') {
    return path.join(memoryRoot, 'core/user/identity/current.md');
  }

  if (type === 'procedure') {
    return path.join(memoryRoot, 'core/agents', claim.target_domain, 'PLAYBOOK.md');
  }

  const section = selectCompetenceSection(claim);
  return path.join(memoryRoot, 'core/agents', claim.target_domain, `${section}.md`);
}

function buildScaffold(memoryRoot, filePath, claim, type, updatedAt) {
  const relativePath = path.relative(memoryRoot, filePath).split(path.sep).join('/');

  if (relativePath.startsWith('core/user/timeline/')) {
    return buildTimelineScaffold(claim.batch_date, updatedAt);
  }

  if (relativePath.startsWith('core/user/knowledge/')) {
    return buildKnowledgeScaffold(claim.target_domain, updatedAt);
  }

  if (relativePath === 'core/user/state/current.md') {
    return buildStateScaffold(updatedAt, claim.observed_at || updatedAt);
  }

  if (relativePath === 'core/user/identity/current.md') {
    return buildIdentityScaffold(updatedAt, claim.observed_at || updatedAt);
  }

  if (relativePath === 'core/user/identity/changelog.md') {
    return buildIdentityChangelogScaffold(updatedAt);
  }

  if (type === 'competence' || type === 'procedure') {
    return buildCompetenceScaffold(claim.target_domain, path.basename(filePath, '.md'), updatedAt);
  }

  return '';
}

function movePendingBatch(memoryRoot, pendingRelativePath) {
  const pendingPath = path.join(memoryRoot, pendingRelativePath);
  if (!fs.existsSync(pendingPath)) {
    return null;
  }

  const processedPath = path.join(memoryRoot, 'intake/processed', path.basename(pendingRelativePath));
  ensureDir(path.dirname(processedPath));
  fs.renameSync(pendingPath, processedPath);

  return {
    pendingPath,
    processedPath,
    processedRelativePath: path.relative(memoryRoot, processedPath).split(path.sep).join('/'),
  };
}

function promoteCanonBatch(request) {
  const memoryRoot = path.resolve(request.memory_root);
  const batchDate = String(request.batch_date || '').trim();
  const pendingRelativePath = request.pending_batch_path || `intake/pending/${batchDate}.md`;
  const pendingPath = path.join(memoryRoot, pendingRelativePath);

  if (!batchDate) {
    throw new Error('batch_date is required for canon promotion.');
  }

  if (!fs.existsSync(pendingPath)) {
    throw new Error(`Pending batch not found: ${pendingRelativePath}`);
  }

  const parsed = parsePendingBatch(fs.readFileSync(pendingPath, 'utf8'));
  const groups = groupAcceptedClaims(parsed.claims).map((group) =>
    group.map((claim) => ({
      ...claim,
      batch_date: batchDate,
    }))
  );

  const nextIds = {
    evt: latestRecordSuffix(memoryRoot, 'evt', batchDate),
    fct: latestRecordSuffix(memoryRoot, 'fct', batchDate),
    st: latestRecordSuffix(memoryRoot, 'st', batchDate),
    id: latestRecordSuffix(memoryRoot, 'id', batchDate),
    cmp: latestRecordSuffix(memoryRoot, 'cmp', batchDate),
    prc: latestRecordSuffix(memoryRoot, 'prc', batchDate),
  };

  const filesTouched = new Set();
  const writtenRecords = [];
  const eventByClaimId = new Map();

  groups.forEach((group) => {
    const updatedAt = group.reduce((latest, claim) => {
      return parseTimestamp(claim.observed_at) > parseTimestamp(latest) ? claim.observed_at : latest;
    }, group[0].observed_at || request.updated_at || new Date().toISOString());
    const eventClaim = group.find((claim) => claim.target_layer === 'L2' || claim.target_domain === 'timeline') || group[0];
    const eventId =
      eventClaim.draft_record_id ||
      `evt-${batchDate}-${String(++nextIds.evt).padStart(3, '0')}`;
    const eventRecord = {
      record_id: eventId,
      type: 'event',
      summary: buildEventSummary(group),
      evidence: group
        .filter((claim) => !['competence', 'procedure'].includes(inferClaimType(claim)))
        .map((claim) => `intake/pending/${batchDate}.md#${claim.claim_id}`),
      confidence: strongestConfidence(group),
      status: 'active',
      updated_at: updatedAt,
      links: [],
      body: buildEventBody(group),
    };

    const eventPath = targetPathForRecord(memoryRoot, eventClaim, 'event');
    const eventScaffold = buildScaffold(memoryRoot, eventPath, eventClaim, 'event', updatedAt);
    upsertRecordInFile(eventPath, eventScaffold, eventRecord, { updatedAt });
    filesTouched.add(eventPath);
    writtenRecords.push({ path: eventPath, record: eventRecord });

    for (const claim of group) {
      eventByClaimId.set(claim.claim_id, {
        eventId,
        eventPath,
        group,
      });
    }
  });

  for (const claim of parsed.claims) {
    if (String(claim.curator_decision || '').toLowerCase() !== 'accept') {
      continue;
    }

    const type = inferClaimType(claim);
    if (type === 'event') {
      continue;
    }

    const prefix = {
      fact: 'fct',
      state: 'st',
      identity: 'id',
      competence: 'cmp',
      procedure: 'prc',
    }[type];
    const eventInfo = eventByClaimId.get(claim.claim_id) || null;
    const recordId =
      claim.draft_record_id ||
      `${prefix}-${batchDate}-${String(++nextIds[prefix]).padStart(3, '0')}`;
    const record = {
      record_id: recordId,
      type,
      summary: buildRecordSummary(claim, type),
      evidence: [`intake/pending/${batchDate}.md#${claim.claim_id}`],
      confidence: strongestConfidence(eventInfo ? eventInfo.group : [claim]),
      status: 'active',
      updated_at: claim.observed_at || request.updated_at || new Date().toISOString(),
      links: eventInfo && type !== 'procedure'
        ? [
            {
              rel: 'derived_from',
              target: eventInfo.eventId,
            },
          ]
        : [],
      body: buildRecordBody(claim),
    };

    if (type === 'state' || type === 'identity') {
      record.as_of = claim.observed_at || request.updated_at || new Date().toISOString();
    }
    if (type === 'fact') {
      record.domain = claim.target_domain;
    }
    if (type === 'competence') {
      record.role = claim.target_domain;
      record.domain = claim.tags && claim.tags[0] ? String(claim.tags[0]) : claim.target_domain;
    }
    if (type === 'procedure') {
      const filePath = targetPathForRecord(memoryRoot, { ...claim, batch_date: batchDate }, type);
      const procedureKey = resolveProcedureKey(claim);
      const previousVersion = getLatestProcedureRecord(filePath, procedureKey);
      const procedureVersion =
        claim.procedure_version ||
        claim.version ||
        (previousVersion ? previousVersion.version + 1 : 1);

      record.role = claim.target_domain;
      record.procedure_key = procedureKey;
      record.version = procedureVersion;
      record.acceptance = buildProcedureAcceptance(claim);
      record.feedback_refs = Array.isArray(claim.feedback_refs)
        ? claim.feedback_refs.map((entry) => String(entry)).filter(Boolean)
        : [];
      if (claim.supersedes) {
        record.supersedes = String(claim.supersedes);
      } else if (previousVersion && previousVersion.record_id !== record.record_id) {
        record.supersedes = previousVersion.record_id;
      }
      if (record.supersedes) {
        record.links.push({
          rel: 'supersedes',
          target: record.supersedes,
        });
      }
      record.body = buildProcedureBody(claim, record);
    }

    const filePath = targetPathForRecord(memoryRoot, { ...claim, batch_date: batchDate }, type);
    const scaffold = buildScaffold(memoryRoot, filePath, { ...claim, batch_date: batchDate }, type, record.updated_at);

    if (type === 'procedure' && record.supersedes) {
      mutateRecordsInFile(
        filePath,
        scaffold,
        (existingRecords) =>
          existingRecords.map((existingRecord) => {
            if (existingRecord.record_id !== record.supersedes) {
              return existingRecord;
            }

            return {
              ...existingRecord,
              status: 'deprecated',
              updated_at: record.updated_at,
            };
          }),
        {
          updatedAt: record.updated_at,
        }
      );
    }

    upsertRecordInFile(filePath, scaffold, record, {
      updatedAt: record.updated_at,
      asOf: record.as_of,
    });
    filesTouched.add(filePath);
    writtenRecords.push({ path: filePath, record });

    if (type === 'identity') {
      const changelogPath = path.join(memoryRoot, 'core/user/identity/changelog.md');
      const changelogScaffold = buildIdentityChangelogScaffold(record.updated_at);
      upsertRecordInFile(changelogPath, changelogScaffold, record, {
        updatedAt: record.updated_at,
      });
      filesTouched.add(changelogPath);
      writtenRecords.push({ path: changelogPath, record });
    }
  }

  for (const recordEntry of writtenRecords) {
    if (recordEntry.record.type !== 'event') {
      continue;
    }

    const related = writtenRecords.filter((candidate) =>
      candidate.record.links.some(
        (link) => link.rel === 'derived_from' && link.target === recordEntry.record.record_id
      )
    );

    if (related.some((candidate) => candidate.record.type === 'state')) {
      recordEntry.record.links = related
        .filter((candidate) => candidate.record.type === 'state')
        .slice(0, 1)
        .map((candidate) => ({
          rel: 'caused',
          target: candidate.record.record_id,
        }));
    } else if (related.some((candidate) => candidate.record.type === 'fact')) {
      recordEntry.record.links = related
        .filter((candidate) => candidate.record.type === 'fact')
        .slice(0, 1)
        .map((candidate) => ({
          rel: 'supports',
          target: candidate.record.record_id,
        }));
    }

    const matchingClaim = parsed.claims.find((claim) => {
      const eventInfo = eventByClaimId.get(claim.claim_id);
      return eventInfo && eventInfo.eventId === recordEntry.record.record_id;
    });
    const scaffold = buildScaffold(
      memoryRoot,
      recordEntry.path,
      { ...matchingClaim, batch_date: batchDate },
      'event',
      recordEntry.record.updated_at
    );
    upsertRecordInFile(recordEntry.path, scaffold, recordEntry.record, {
      updatedAt: recordEntry.record.updated_at,
    });
  }

  const movedBatch = movePendingBatch(memoryRoot, pendingRelativePath);
  const checkpointPath = path.join(memoryRoot, 'intake/_checkpoint.yaml');
  if (fs.existsSync(checkpointPath)) {
    fs.rmSync(checkpointPath);
  }

  return {
    implementation: 'core-promoter',
    batchDate,
    pendingBatchPath: pendingRelativePath,
    processedBatchPath: movedBatch ? movedBatch.processedRelativePath : null,
    filesTouched: Array.from(filesTouched)
      .map((filePath) => path.relative(memoryRoot, filePath).split(path.sep).join('/'))
      .sort(),
    recordsWritten: writtenRecords.map((entry) => ({
      path: path.relative(memoryRoot, entry.path).split(path.sep).join('/'),
      record_id: entry.record.record_id,
      type: entry.record.type,
    })),
  };
}

module.exports = {
  parseExistingRecords,
  parsePendingBatch,
  promoteCanonBatch,
};
