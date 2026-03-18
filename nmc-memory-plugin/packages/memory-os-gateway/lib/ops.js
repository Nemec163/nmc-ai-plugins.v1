'use strict';

const { getHealth } = require('./health');
const { getCanonicalCurrent } = require('./read');
const { getStatus } = require('./status');
const { verify } = require('./verify');
const { getHandoffState, normalizeMemoryRoot } = require('./handoff');

function readSection(readFn) {
  try {
    return {
      ok: true,
      value: readFn(),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error.message,
      },
    };
  }
}

function buildDegradedMode(statusReport, healthReport, verifyReport, conflicts, sectionErrors) {
  const reasons = [];

  if (statusReport && statusReport.intake && statusReport.intake.backlogAlert) {
    reasons.push('pending-intake-backlog');
  }

  if (statusReport && statusReport.retention && statusReport.retention.retentionAlert) {
    reasons.push('processed-intake-retention');
  }

  if (healthReport && Array.isArray(healthReport.warnings)) {
    for (const warning of healthReport.warnings) {
      reasons.push(warning);
    }
  }

  if (verifyReport && verifyReport.status === 'warning') {
    reasons.push('verify-warning');
  }

  for (const conflict of conflicts) {
    reasons.push(conflict.code);
  }

  for (const [section, error] of Object.entries(sectionErrors)) {
    if (error) {
      reasons.push(`${section}-error`);
    }
  }

  return {
    active: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
  };
}

function getOpsSnapshot(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);

  const statusSection = readSection(() => getStatus({ memoryRoot }));
  const healthSection = readSection(() => getHealth({ memoryRoot }));
  const verifySection = options.skipVerify
    ? { ok: true, value: null }
    : readSection(() =>
        verify({
          memoryRoot,
          updatedAt: options.updatedAt,
          today: options.today,
        })
      );
  const currentSection = readSection(() => getCanonicalCurrent({ memoryRoot }));
  const handoff = getHandoffState({ memoryRoot });

  const sectionErrors = {
    status: statusSection.ok ? null : statusSection.error,
    health: healthSection.ok ? null : healthSection.error,
    verify: verifySection.ok ? null : verifySection.error,
    current: currentSection.ok ? null : currentSection.error,
  };

  const degradedMode = buildDegradedMode(
    statusSection.ok ? statusSection.value : null,
    healthSection.ok ? healthSection.value : null,
    verifySection.ok ? verifySection.value : null,
    handoff.conflicts,
    sectionErrors
  );

  return {
    kind: 'ops-snapshot',
    temporary: true,
    deprecated: true,
    migrationScope: 'phase-2.5',
    releaseBoundary: {
      supported: false,
      status: 'compatibility-only-bridge',
      replacementPackage: 'control-plane',
      replacementCli: 'memory-control-plane',
      replacementCommands: [
        'snapshot',
        'queues',
        'health',
        'analytics',
        'audits',
        'runtime-inspector',
      ],
      compatibilityShell: 'nmc-memory-plugin',
    },
    generatedAt: new Date().toISOString(),
    memoryRoot,
    proposals: handoff.proposals,
    jobs: handoff.jobs,
    lock: handoff.lock,
    conflicts: handoff.conflicts,
    backlog: statusSection.ok
      ? {
          pendingFiles: statusSection.value.intake.pendingFiles,
          oldestPending: statusSection.value.intake.oldestPending,
          oldestPendingAgeDays: statusSection.value.intake.oldestPendingAgeDays,
          backlogAlert: statusSection.value.intake.backlogAlert,
        }
      : null,
    degradedMode,
    status: statusSection.ok
      ? statusSection.value
      : { status: 'error', error: statusSection.error.message },
    health: healthSection.ok
      ? healthSection.value
      : { status: 'error', error: healthSection.error.message },
    verify: verifySection.ok
      ? verifySection.value
      : { status: 'error', error: verifySection.error.message },
    current: currentSection.ok
      ? currentSection.value
      : { status: 'error', error: currentSection.error.message },
  };
}

module.exports = {
  getOpsSnapshot,
  inspectOps: getOpsSnapshot,
  inspect_ops: getOpsSnapshot,
};
