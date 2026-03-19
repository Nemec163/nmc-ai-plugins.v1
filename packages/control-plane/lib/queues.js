'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  buildAvailableActionsForConflict,
  buildAvailableActionsForJob,
  buildAvailableActionsForLock,
  buildAvailableActionsForProposal,
} = require('./intervention-actions');
const { loadGateway, loadMemoryCanon } = require('./load-deps');
const { resolveMemoryRoot } = require('./paths');

function toPosixRelative(root, targetPath) {
  return path.relative(root, targetPath).split(path.sep).join('/');
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

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

function fileExists(memoryRoot, relativePath) {
  if (!relativePath) {
    return false;
  }

  return fs.existsSync(path.join(memoryRoot, relativePath));
}

function summarizeProposal(memoryRoot, filePath) {
  const proposal = readJsonFile(filePath);
  const claims = Array.isArray(proposal.claims) ? proposal.claims : [];
  const reviewedClaims = claims.filter(
    (claim) => typeof claim.curator_decision === 'string' && claim.curator_decision.trim()
  ).length;
  const relativePath = toPosixRelative(memoryRoot, filePath);

  return {
    proposalId: proposal.proposal_id || path.basename(filePath, '.json'),
    batchDate: proposal.batch_date || null,
    status: proposal.status || null,
    createdAt: proposal.created_at || null,
    updatedAt: proposal.updated_at || null,
    appliedAt: proposal.applied_at || null,
    source: proposal.source || null,
    generatedBy: proposal.generated_by || null,
    claimsCount: claims.length,
    reviewedClaims,
    feedbackCount: Array.isArray(proposal.feedback) ? proposal.feedback.length : 0,
    pendingBatchPath: proposal.pending_batch_path || null,
    pendingBatchExists: fileExists(memoryRoot, proposal.pending_batch_path),
    processedBatchPath: proposal.processed_batch_path || null,
    processedBatchExists: fileExists(memoryRoot, proposal.processed_batch_path),
    jobPath: proposal.job_path || null,
    jobExists: fileExists(memoryRoot, proposal.job_path),
    relativePath,
  };
}

function summarizeJob(memoryRoot, filePath) {
  const job = readJsonFile(filePath);
  const relativePath = toPosixRelative(memoryRoot, filePath);
  const writePath = job.write_path || {};

  return {
    jobId: job.job_id || path.basename(filePath, '.json'),
    proposalId: job.proposal_id || null,
    batchDate: job.batch_date || null,
    status: job.status || null,
    createdAt: job.created_at || null,
    updatedAt: job.updated_at || null,
    appliedAt: job.applied_at || null,
    authoritative: Boolean(job.authoritative),
    pendingBatchPath: job.pending_batch_path || null,
    pendingBatchExists: fileExists(memoryRoot, job.pending_batch_path),
    processedBatchPath: job.processed_batch_path || null,
    processedBatchExists: fileExists(memoryRoot, job.processed_batch_path),
    operation: writePath.implementation || null,
    singleWriter: writePath.single_writer || null,
    lockPath: writePath.lock_path || null,
    lockHolder: writePath.lock ? writePath.lock.holder || null : null,
    lockOperation: writePath.lock ? writePath.lock.operation || null : null,
    relativePath,
  };
}

function loadCollection(memoryRoot, dirPath, summarize, errorCode) {
  const items = [];
  const errors = [];

  for (const filePath of listJsonFiles(dirPath)) {
    try {
      items.push(summarize(memoryRoot, filePath));
    } catch (error) {
      errors.push({
        code: errorCode,
        relativePath: toPosixRelative(memoryRoot, filePath),
        message: error.message,
      });
    }
  }

  return { items, errors };
}

function buildConflicts(proposals, proposalErrors, jobs, jobErrors, lockState) {
  const conflicts = [];
  const proposalById = new Map(proposals.map((proposal) => [proposal.proposalId, proposal]));
  const jobById = new Map(jobs.map((job) => [job.jobId, job]));
  const jobByRelativePath = new Map(jobs.map((job) => [job.relativePath, job]));

  for (const error of proposalErrors) {
    conflicts.push({
      code: 'proposal-read-error',
      severity: 'warning',
      message: `Unable to inspect proposal receipt ${error.relativePath}: ${error.message}`,
      proposalPath: error.relativePath,
    });
  }

  for (const error of jobErrors) {
    conflicts.push({
      code: 'job-read-error',
      severity: 'warning',
      message: `Unable to inspect job receipt ${error.relativePath}: ${error.message}`,
      jobPath: error.relativePath,
    });
  }

  for (const proposal of proposals) {
    if (
      proposal.pendingBatchPath &&
      !proposal.pendingBatchExists &&
      !proposal.processedBatchExists
    ) {
      conflicts.push({
        code: 'missing-pending-batch',
        severity: 'warning',
        message: `Proposal ${proposal.proposalId} points to a missing pending batch.`,
        proposalId: proposal.proposalId,
        pendingBatchPath: proposal.pendingBatchPath,
      });
    }

    if (proposal.jobPath && !proposal.jobExists) {
      conflicts.push({
        code: 'missing-job-receipt',
        severity: 'warning',
        message: `Proposal ${proposal.proposalId} points to a missing job receipt.`,
        proposalId: proposal.proposalId,
        jobPath: proposal.jobPath,
      });
      continue;
    }

    if (proposal.jobPath) {
      const job = jobByRelativePath.get(proposal.jobPath);
      if (job && job.proposalId !== proposal.proposalId) {
        conflicts.push({
          code: 'proposal-job-mismatch',
          severity: 'warning',
          message: `Proposal ${proposal.proposalId} points to job ${job.jobId}, but the receipt references ${job.proposalId}.`,
          proposalId: proposal.proposalId,
          jobId: job.jobId,
        });
      }
    }

    if (proposal.status === 'ready-for-handoff' && !proposal.jobPath) {
      conflicts.push({
        code: 'ready-proposal-without-job',
        severity: 'warning',
        message: `Proposal ${proposal.proposalId} is ready for handoff but has no job receipt.`,
        proposalId: proposal.proposalId,
      });
    }
  }

  for (const job of jobs) {
    const proposal = proposalById.get(job.proposalId);
    if (!proposal) {
      conflicts.push({
        code: 'orphan-job',
        severity: 'warning',
        message: `Job ${job.jobId} references missing proposal ${job.proposalId}.`,
        jobId: job.jobId,
        proposalId: job.proposalId,
      });
      continue;
    }

    if (proposal.jobPath && proposal.jobPath !== job.relativePath) {
      conflicts.push({
        code: 'job-path-mismatch',
        severity: 'warning',
        message: `Proposal ${proposal.proposalId} points to ${proposal.jobPath}, but job receipt is stored at ${job.relativePath}.`,
        proposalId: proposal.proposalId,
        jobId: job.jobId,
      });
    }

    if (job.pendingBatchPath && !job.pendingBatchExists && !job.processedBatchExists) {
      conflicts.push({
        code: 'missing-job-pending-batch',
        severity: 'warning',
        message: `Job ${job.jobId} points to a missing pending batch.`,
        jobId: job.jobId,
        pendingBatchPath: job.pendingBatchPath,
      });
    }
  }

  if (lockState.exists && lockState.validation && !lockState.validation.valid) {
    conflicts.push({
      code: 'invalid-canon-lock',
      severity: 'alert',
      message: 'Active canon write lock is invalid.',
      lockPath: lockState.path,
      issues: lockState.validation.issues,
    });
  }

  if (lockState.exists) {
    const referencedByJob = jobs.some((job) => job.lockPath === lockState.path);
    if (!referencedByJob && jobById.size > 0) {
      conflicts.push({
        code: 'orphan-active-lock',
        severity: 'warning',
        message: 'Active canon write lock is not referenced by any inspected job receipt.',
        lockPath: lockState.path,
      });
    }
  }

  return conflicts.map((conflict) => ({
    ...conflict,
    availableActions: buildAvailableActionsForConflict(conflict),
  }));
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

function incrementCount(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = (map[normalized] || 0) + 1;
}

function readQueueSections(options = {}) {
  if (options.gatewaySections) {
    return options.gatewaySections;
  }

  const gateway = loadGateway();
  const memoryRoot = resolveMemoryRoot(options);

  return {
    statusSection: readSection(() => gateway.getStatus({ memoryRoot })),
    healthSection: readSection(() => gateway.getHealth({ memoryRoot })),
    verifySection: options.skipVerify
      ? { ok: true, value: null }
      : readSection(() =>
          gateway.verify({
            memoryRoot,
            updatedAt: options.updatedAt,
            today: options.today,
          })
        ),
  };
}

function getControlPlaneQueues(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const proposalsDir = path.join(memoryRoot, 'intake/proposals');
  const jobsDir = path.join(memoryRoot, 'intake/jobs');
  const canon = loadMemoryCanon();
  const sections = readQueueSections(options);

  const proposals = loadCollection(
    memoryRoot,
    proposalsDir,
    summarizeProposal,
    'proposal-read-error'
  );
  const jobs = loadCollection(memoryRoot, jobsDir, summarizeJob, 'job-read-error');

  const activeLock = canon.readCanonWriteLock(memoryRoot);
  const lockState = {
    exists: Boolean(activeLock),
    path: canon.resolveCanonLockPath(memoryRoot),
    lock: activeLock ? activeLock.lock : null,
    validation: activeLock ? activeLock.validation : null,
  };
  lockState.availableActions = buildAvailableActionsForLock(lockState);

  const sectionErrors = {
    status: sections.statusSection.ok ? null : sections.statusSection.error,
    health: sections.healthSection.ok ? null : sections.healthSection.error,
    verify: sections.verifySection.ok ? null : sections.verifySection.error,
  };

  const conflicts = buildConflicts(
    proposals.items,
    proposals.errors,
    jobs.items,
    jobs.errors,
    lockState
  );
  const degradedMode = buildDegradedMode(
    sections.statusSection.ok ? sections.statusSection.value : null,
    sections.healthSection.ok ? sections.healthSection.value : null,
    sections.verifySection.ok ? sections.verifySection.value : null,
    conflicts,
    sectionErrors
  );

  const proposalStatusCounts = {};
  const jobStatusCounts = {};
  const conflictSeverityCounts = {};
  const conflictCodeCounts = {};

  const proposalItems = proposals.items.map((proposal) => {
    incrementCount(proposalStatusCounts, proposal.status);
    return {
      ...proposal,
      availableActions: buildAvailableActionsForProposal(proposal),
    };
  });
  const jobItems = jobs.items.map((job) => {
    incrementCount(jobStatusCounts, job.status);
    return {
      ...job,
      availableActions: buildAvailableActionsForJob(job),
    };
  });

  for (const conflict of conflicts) {
    incrementCount(conflictSeverityCounts, conflict.severity);
    incrementCount(conflictCodeCounts, conflict.code);
  }

  return {
    kind: 'control-plane-queues',
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    memoryRoot,
    proposals: {
      count: proposalItems.length,
      byStatus: proposalStatusCounts,
      readyForApply: proposalItems.filter((proposal) => proposal.status === 'ready-for-apply')
        .length,
      readyForHandoff: proposalItems.filter(
        (proposal) => proposal.status === 'ready-for-handoff'
      ).length,
      items: proposalItems,
      errors: proposals.errors,
    },
    jobs: {
      count: jobItems.length,
      byStatus: jobStatusCounts,
      readyForHandoff: jobItems.filter((job) => job.status === 'ready-for-handoff').length,
      items: jobItems,
      errors: jobs.errors,
    },
    conflicts: {
      count: conflicts.length,
      bySeverity: conflictSeverityCounts,
      byCode: conflictCodeCounts,
      items: conflicts,
    },
    lock: lockState,
    backlog: sections.statusSection.ok
      ? {
          pendingFiles: sections.statusSection.value.intake.pendingFiles,
          oldestPending: sections.statusSection.value.intake.oldestPending,
          oldestPendingAgeDays: sections.statusSection.value.intake.oldestPendingAgeDays,
          backlogAlert: sections.statusSection.value.intake.backlogAlert,
        }
      : null,
    degradedMode,
  };
}

module.exports = {
  controlPlaneQueues: getControlPlaneQueues,
  getControlPlaneQueues,
  queues: getControlPlaneQueues,
};
