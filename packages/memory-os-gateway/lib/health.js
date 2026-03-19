'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon, loadMemoryScripts } = require('./load-deps');
const { getStatus } = require('./status');

function getHealth(options) {
  const memoryRoot = path.resolve(options.memoryRoot);
  const canon = loadMemoryCanon();
  const scripts = loadMemoryScripts().scripts;
  const status = getStatus({ memoryRoot });

  const checks = [
    {
      name: 'memory-root',
      ok: fs.existsSync(memoryRoot),
      detail: memoryRoot,
    },
    {
      name: 'canon-system',
      ok: fs.existsSync(path.join(memoryRoot, canon.CANON_SYSTEM_FILE)),
      detail: path.join(memoryRoot, canon.CANON_SYSTEM_FILE),
    },
    {
      name: 'manifest',
      ok: status.manifest.exists,
      detail: status.manifest.path,
    },
    {
      name: 'verify-script',
      ok: fs.existsSync(scripts.verify),
      detail: scripts.verify,
    },
    {
      name: 'status-script',
      ok: fs.existsSync(scripts.status),
      detail: scripts.status,
    },
  ];

  const warnings = [];
  if (!status.manifest.exists) {
    warnings.push('Manifest is missing.');
  }
  if (status.intake.backlogAlert) {
    warnings.push('Pending intake backlog is older than 7 days.');
  }
  if (status.retention.retentionAlert) {
    warnings.push('Processed intake retention window exceeded 90 days.');
  }
  if (status.readIndex.exists && !status.readIndex.sourceFresh) {
    warnings.push('Persisted read index is stale and should be rebuilt.');
  }

  const ok = checks.every((check) => check.ok) && status.overall.status === 'OK';

  return {
    ok,
    status: ok ? 'healthy' : 'degraded',
    checks,
    warnings,
    statusReport: status,
  };
}

module.exports = {
  getHealth,
  health: getHealth,
};
