'use strict';

const { SCHEMA_VERSION } = require('./load-contracts');

const CANON_SYSTEM_FILE = 'core/system/CANON.md';
const CANON_RECORD_ROOTS = Object.freeze([
  'core/user',
  'core/agents',
]);
const CANON_FILE_ROOTS = Object.freeze([
  'core/system',
  'core/user',
  'core/agents',
]);
const CANON_MANIFEST_FILE = 'manifest.json';
const CANON_GRAPH_FILE = 'graph/edges.jsonl';
const CANON_SINGLE_WRITER = 'mnemo';
const CANON_LOCK_FILE = 'canon-write.lock.json';
const CANON_LOCK_MODES = Object.freeze(['exclusive-write']);
const CANON_LAYOUT_CONTRACT = Object.freeze({
  systemFile: CANON_SYSTEM_FILE,
  recordRoots: CANON_RECORD_ROOTS,
  fileRoots: CANON_FILE_ROOTS,
  manifestFile: CANON_MANIFEST_FILE,
  graphFile: CANON_GRAPH_FILE,
});
const PROMOTER_REQUEST_TYPES = Object.freeze(['canon-write']);
const PROMOTER_IMPLEMENTATIONS = Object.freeze([
  'legacy-apply',
  'core-promoter',
]);

module.exports = {
  CANON_FILE_ROOTS,
  CANON_GRAPH_FILE,
  CANON_LAYOUT_CONTRACT,
  CANON_LOCK_FILE,
  CANON_LOCK_MODES,
  CANON_MANIFEST_FILE,
  CANON_RECORD_ROOTS,
  CANON_SINGLE_WRITER,
  CANON_SYSTEM_FILE,
  CURRENT_SCHEMA_VERSION: SCHEMA_VERSION,
  PROMOTER_IMPLEMENTATIONS,
  PROMOTER_REQUEST_TYPES,
};
