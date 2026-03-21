'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SESSION_SCHEMA_VERSION = '1.0';

function requireOption(options, key) {
  if (options[key] == null || options[key] === '') {
    throw new Error(`${key} is required`);
  }

  return options[key];
}

function normalizeMemoryRoot(memoryRoot) {
  return path.resolve(requireOption({ memoryRoot }, 'memoryRoot'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toPosixRelative(baseDir, targetPath) {
  return path.relative(baseDir, targetPath).split(path.sep).join('/');
}

function sessionsRoot(memoryRoot) {
  return path.join(memoryRoot, 'runtime/sessions');
}

function receiptsRoot(memoryRoot) {
  return path.join(sessionsRoot(memoryRoot), '_receipts');
}

function extractDateFromTimestamp(isoTimestamp) {
  const match = String(isoTimestamp || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function sha256Content(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }

  return messages.map((msg, index) => {
    if (msg == null || typeof msg !== 'object' || Array.isArray(msg)) {
      throw new Error(`messages[${index}] must be an object`);
    }

    const role = String(msg.role || '').trim();
    if (!role) {
      throw new Error(`messages[${index}].role is required`);
    }

    const content = msg.content == null ? '' : String(msg.content);
    const timestamp = String(msg.timestamp || '').trim();
    if (!timestamp) {
      throw new Error(`messages[${index}].timestamp is required`);
    }

    const normalized = { role, content, timestamp };
    if (msg.tokens != null && typeof msg.tokens === 'object') {
      normalized.tokens = msg.tokens;
    }
    if (msg.metadata != null && typeof msg.metadata === 'object') {
      normalized.metadata = msg.metadata;
    }

    return normalized;
  });
}

function captureSession(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const agent = requireOption(options, 'agent');
  const adapter = requireOption(options, 'adapter');
  const sessionId = requireOption(options, 'sessionId');
  const startedAt = requireOption(options, 'startedAt');
  const messages = validateMessages(options.messages);
  const capturedAt = options.capturedAt || new Date().toISOString();

  const date = extractDateFromTimestamp(startedAt);
  if (!date) {
    throw new Error('startedAt must be a valid ISO timestamp');
  }

  const agentDir = ensureDir(path.join(sessionsRoot(memoryRoot), agent));
  const fileName = `${date}-${adapter}-${sessionId}.jsonl`;
  const filePath = path.join(agentDir, fileName);
  const relativePath = toPosixRelative(memoryRoot, filePath);

  const header = {
    kind: 'session-header',
    schema_version: SESSION_SCHEMA_VERSION,
    agent,
    role_id: options.roleId || agent,
    adapter,
    session_id: sessionId,
    started_at: startedAt,
    captured_at: capturedAt,
    authoritative: false,
  };

  if (options.channel) {
    header.channel = options.channel;
  }
  if (options.source) {
    header.source = options.source;
  }
  if (options.namespace && typeof options.namespace === 'object') {
    header.namespace = options.namespace;
  }

  const lines = [JSON.stringify(header)];
  for (const msg of messages) {
    lines.push(JSON.stringify(msg));
  }
  lines.push('');

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

  return {
    kind: 'session-capture',
    path: filePath,
    relativePath,
    agent,
    adapter,
    sessionId,
    messageCount: messages.length,
  };
}

function parseSessionFileName(fileName) {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-([^-]+)-(.+)\.jsonl$/);
  if (!match) {
    return null;
  }

  return {
    date: match[1],
    adapter: match[2],
    sessionId: match[3],
  };
}

function listSessions(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const root = sessionsRoot(memoryRoot);

  if (!fs.existsSync(root)) {
    return [];
  }

  const results = [];
  const agentFilter = options.agent || null;
  const dateFilter = options.date || null;
  const adapterFilter = options.adapter || null;

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      continue;
    }

    const agentName = entry.name;
    if (agentFilter && agentName !== agentFilter) {
      continue;
    }

    const agentDir = path.join(root, agentName);
    const files = fs.readdirSync(agentDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.jsonl')) {
        continue;
      }

      const parsed = parseSessionFileName(file.name);
      if (!parsed) {
        continue;
      }

      if (dateFilter && parsed.date !== dateFilter) {
        continue;
      }
      if (adapterFilter && parsed.adapter !== adapterFilter) {
        continue;
      }

      const filePath = path.join(agentDir, file.name);
      const stat = fs.statSync(filePath);
      results.push({
        path: filePath,
        relativePath: toPosixRelative(memoryRoot, filePath),
        agent: agentName,
        adapter: parsed.adapter,
        sessionId: parsed.sessionId,
        date: parsed.date,
        size: stat.size,
      });
    }
  }

  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function readSession(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const sessionPath = requireOption(options, 'sessionPath');
  const filePath = path.isAbsolute(sessionPath)
    ? sessionPath
    : path.join(memoryRoot, sessionPath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    throw new Error(`Session file is empty: ${filePath}`);
  }

  const header = JSON.parse(lines[0]);
  if (header.kind !== 'session-header') {
    throw new Error(`Invalid session file: first line must be a session-header`);
  }

  const messages = [];
  for (let i = 1; i < lines.length; i += 1) {
    messages.push(JSON.parse(lines[i]));
  }

  return {
    header,
    messages,
    messageCount: messages.length,
  };
}

function markSessionsProcessed(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const date = requireOption(options, 'date');
  const sessionPaths = requireOption(options, 'sessionPaths');

  if (!Array.isArray(sessionPaths) || sessionPaths.length === 0) {
    throw new Error('sessionPaths must be a non-empty array');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must be in YYYY-MM-DD format');
  }

  const extractDir = ensureDir(path.join(receiptsRoot(memoryRoot), 'extract'));
  const receiptPath = path.join(extractDir, `${date}.json`);
  const relativeReceiptPath = toPosixRelative(memoryRoot, receiptPath);

  const receipt = {
    kind: 'session-extract-receipt',
    schema_version: SESSION_SCHEMA_VERSION,
    date,
    processed_at: new Date().toISOString(),
    extracted_by: options.extractedBy || 'memory-os-gateway/sessions',
    proposal_id: options.proposalId || null,
    session_count: sessionPaths.length,
    session_paths: sessionPaths.map((p) =>
      path.isAbsolute(p) ? toPosixRelative(memoryRoot, p) : p
    ),
  };

  writeJson(receiptPath, receipt);

  return {
    kind: 'sessions-processed',
    receiptPath: relativeReceiptPath,
    count: sessionPaths.length,
  };
}

function archiveSessions(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const before = requireOption(options, 'before');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    throw new Error('before must be in YYYY-MM-DD format');
  }

  const extractDir = path.join(receiptsRoot(memoryRoot), 'extract');
  if (!fs.existsSync(extractDir)) {
    return { kind: 'sessions-archived', cleared: 0, paths: [] };
  }

  const receiptFiles = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'));

  const processedDates = new Set();
  for (const rf of receiptFiles) {
    const dateMatch = rf.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (dateMatch && dateMatch[1] < before) {
      processedDates.add(dateMatch[1]);
    }
  }

  if (processedDates.size === 0) {
    return { kind: 'sessions-archived', cleared: 0, paths: [] };
  }

  const sessions = listSessions({ memoryRoot });
  const cleared = [];

  for (const session of sessions) {
    if (processedDates.has(session.date)) {
      fs.unlinkSync(session.path);
      cleared.push(session.relativePath);
    }
  }

  return {
    kind: 'sessions-archived',
    cleared: cleared.length,
    paths: cleared,
  };
}

function getSessionsStatus(memoryRoot) {
  const root = sessionsRoot(memoryRoot);
  const exists = fs.existsSync(root);

  if (!exists) {
    return {
      exists: false,
      sessionsRoot: root,
      agentCount: 0,
      totalSessions: 0,
      todaySessions: 0,
      oldestUnprocessed: null,
      agents: {},
      receipts: {
        imports: 0,
        extracts: 0,
        lastExtractDate: null,
      },
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const sessions = listSessions({ memoryRoot });
  const agents = {};
  let todayCount = 0;

  for (const session of sessions) {
    agents[session.agent] = (agents[session.agent] || 0) + 1;
    if (session.date === today) {
      todayCount += 1;
    }
  }

  const extractDir = path.join(receiptsRoot(memoryRoot), 'extract');
  const importsDir = path.join(receiptsRoot(memoryRoot), 'imports');

  let extractCount = 0;
  let lastExtractDate = null;
  if (fs.existsSync(extractDir)) {
    const extractFiles = fs
      .readdirSync(extractDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.json'));
    extractCount = extractFiles.length;
    const extractDates = extractFiles
      .map((e) => e.name.replace('.json', ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    lastExtractDate = extractDates.length > 0 ? extractDates[extractDates.length - 1] : null;
  }

  let importCount = 0;
  if (fs.existsSync(importsDir)) {
    importCount = fs
      .readdirSync(importsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.json')).length;
  }

  const processedDates = new Set();
  if (fs.existsSync(extractDir)) {
    for (const e of fs.readdirSync(extractDir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.json')) {
        const d = e.name.replace('.json', '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          processedDates.add(d);
        }
      }
    }
  }

  let oldestUnprocessed = null;
  const sessionDates = [...new Set(sessions.map((s) => s.date))].sort();
  for (const d of sessionDates) {
    if (!processedDates.has(d)) {
      oldestUnprocessed = d;
      break;
    }
  }

  return {
    exists: true,
    sessionsRoot: root,
    agentCount: Object.keys(agents).length,
    totalSessions: sessions.length,
    todaySessions: todayCount,
    oldestUnprocessed,
    agents,
    receipts: {
      imports: importCount,
      extracts: extractCount,
      lastExtractDate,
    },
  };
}

function buildExtractSourceContract(options = {}) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const date = requireOption(options, 'date');

  const sessions = listSessions({ memoryRoot, date });
  const sessionEntries = [];
  let totalMessages = 0;

  for (const session of sessions) {
    const data = readSession({ memoryRoot, sessionPath: session.relativePath });
    sessionEntries.push({
      agent: session.agent,
      adapter: session.adapter,
      path: session.relativePath,
      messageCount: data.messageCount,
    });
    totalMessages += data.messageCount;
  }

  return {
    kind: 'extract-source-contract',
    date,
    sessions: sessionEntries,
    totalMessages,
    sessionPaths: sessions.map((s) => s.relativePath),
  };
}

module.exports = {
  captureSession,
  capture_session: captureSession,
  listSessions,
  list_sessions: listSessions,
  readSession,
  read_session: readSession,
  markSessionsProcessed,
  mark_sessions_processed: markSessionsProcessed,
  archiveSessions,
  archive_sessions: archiveSessions,
  getSessionsStatus,
  get_sessions_status: getSessionsStatus,
  buildExtractSourceContract,
  build_extract_source_contract: buildExtractSourceContract,
};
