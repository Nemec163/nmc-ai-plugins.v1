'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadMemoryCanon } = require('./load-deps');

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function serializeScalar(value) {
  return JSON.stringify(value == null ? '' : value);
}

function serializeArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function formatTimestamp(value) {
  return value || new Date().toISOString();
}

function normalizeBatchDate(value) {
  const batchDate = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) {
    throw new Error('batchDate must be in YYYY-MM-DD format');
  }

  return batchDate;
}

function normalizeClaimId(batchDate, value, index) {
  const claimId = String(value || '').trim();
  if (claimId) {
    return claimId;
  }

  return `claim-${batchDate.replace(/-/g, '')}-${String(index + 1).padStart(3, '0')}`;
}

function normalizeOptionalPositiveInteger(value, fieldName) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer when provided`);
  }

  return parsed;
}

function normalizeClaims(batchDate, claims) {
  if (!Array.isArray(claims) || claims.length === 0) {
    throw new Error('claims must be a non-empty array');
  }

  return claims.map((claim, index) => {
    if (claim == null || typeof claim !== 'object' || Array.isArray(claim)) {
      throw new Error(`claims[${index}] must be an object`);
    }

    const normalized = {
      claim_id: normalizeClaimId(batchDate, claim.claim_id, index),
      source_session: String(claim.source_session || '').trim(),
      source_agent: String(claim.source_agent || '').trim(),
      observed_at: String(claim.observed_at || '').trim(),
      confidence: String(claim.confidence || '').trim(),
      tags: Array.isArray(claim.tags) ? claim.tags.map((tag) => String(tag)) : [],
      target_layer: String(claim.target_layer || '').trim(),
      target_domain: String(claim.target_domain || '').trim(),
      claim: String(claim.claim || '').trim(),
      curator_decision:
        claim.curator_decision == null ? null : String(claim.curator_decision).trim(),
      curator_notes:
        claim.curator_notes == null ? null : String(claim.curator_notes).trim(),
      target_type: claim.target_type == null ? null : String(claim.target_type).trim(),
      target_file: claim.target_file == null ? null : String(claim.target_file).trim(),
      draft_record_id:
        claim.draft_record_id == null ? null : String(claim.draft_record_id).trim(),
      draft_summary:
        claim.draft_summary == null ? null : String(claim.draft_summary).trim(),
      procedure_key:
        claim.procedure_key == null ? null : String(claim.procedure_key).trim(),
      procedure_version: normalizeOptionalPositiveInteger(
        claim.procedure_version,
        `claims[${index}].procedure_version`
      ),
      acceptance: Array.isArray(claim.acceptance)
        ? claim.acceptance.map((entry) => String(entry).trim()).filter(Boolean)
        : [],
      feedback_refs: Array.isArray(claim.feedback_refs)
        ? claim.feedback_refs.map((entry) => String(entry).trim()).filter(Boolean)
        : [],
      supersedes: claim.supersedes == null ? null : String(claim.supersedes).trim(),
    };

    for (const field of [
      'source_session',
      'source_agent',
      'observed_at',
      'confidence',
      'target_layer',
      'target_domain',
      'claim',
    ]) {
      if (!normalized[field]) {
        throw new Error(`claims[${index}].${field} is required`);
      }
    }

    return normalized;
  });
}

function proposalDirectories(memoryRoot) {
  return {
    proposals: ensureDir(path.join(memoryRoot, 'intake/proposals')),
    jobs: ensureDir(path.join(memoryRoot, 'intake/jobs')),
    pending: ensureDir(path.join(memoryRoot, 'intake/pending')),
  };
}

function proposalPath(memoryRoot, proposalId) {
  return path.join(proposalDirectories(memoryRoot).proposals, `${proposalId}.json`);
}

function jobPath(memoryRoot, jobId) {
  return path.join(proposalDirectories(memoryRoot).jobs, `${jobId}.json`);
}

function buildProposalId(batchDate) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `proposal-${batchDate}-${stamp}`;
}

function loadProposal(memoryRoot, proposalId) {
  const filePath = proposalPath(memoryRoot, proposalId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  return {
    filePath,
    proposal: readJson(filePath),
  };
}

function normalizeFeedbackEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('feedback entries must be a non-empty array');
  }

  return entries.map((entry, index) => {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`feedback[${index}] must be an object`);
    }

    const claimId = String(entry.claim_id || '').trim();
    const curatorDecision = String(entry.curator_decision || '').trim();
    if (!claimId) {
      throw new Error(`feedback[${index}].claim_id is required`);
    }
    if (!curatorDecision) {
      throw new Error(`feedback[${index}].curator_decision is required`);
    }

    return {
      claim_id: claimId,
      curator_decision: curatorDecision,
      curator_notes: entry.curator_notes == null ? '' : String(entry.curator_notes),
      feedback_at: formatTimestamp(entry.feedback_at),
      actor: entry.actor == null ? null : String(entry.actor),
    };
  });
}

function mergeFeedbackIntoClaims(claims, entries) {
  const feedbackByClaim = new Map(entries.map((entry) => [entry.claim_id, entry]));
  return claims.map((claim) => {
    const feedback = feedbackByClaim.get(claim.claim_id);
    if (!feedback) {
      return claim;
    }

    return {
      ...claim,
      curator_decision: feedback.curator_decision,
      curator_notes: feedback.curator_notes,
    };
  });
}

function allClaimsReviewed(claims) {
  return claims.every(
    (claim) => typeof claim.curator_decision === 'string' && claim.curator_decision
  );
}

function renderPendingBatch(proposal) {
  const lines = [
    '---',
    `batch_date: ${serializeScalar(proposal.batch_date)}`,
    `schema_version: ${serializeScalar(proposal.schema_version)}`,
    `generated_by: ${serializeScalar(proposal.generated_by)}`,
    `updated_at: ${serializeScalar(proposal.updated_at)}`,
    '---',
    `# Extracted Claims - ${proposal.batch_date}`,
    '',
  ];

  for (const claim of proposal.claims) {
    lines.push(`## ${claim.claim_id}`);
    lines.push(`- source_session: ${serializeScalar(claim.source_session)}`);
    lines.push(`- source_agent: ${serializeScalar(claim.source_agent)}`);
    lines.push(`- observed_at: ${serializeScalar(claim.observed_at)}`);
    lines.push(`- confidence: ${serializeScalar(claim.confidence)}`);
    lines.push(`- tags: ${serializeArray(claim.tags)}`);
    lines.push(`- target_layer: ${serializeScalar(claim.target_layer)}`);
    lines.push(`- target_domain: ${serializeScalar(claim.target_domain)}`);
    if (claim.target_type) {
      lines.push(`- target_type: ${serializeScalar(claim.target_type)}`);
    }
    if (claim.target_file) {
      lines.push(`- target_file: ${serializeScalar(claim.target_file)}`);
    }
    if (claim.draft_record_id) {
      lines.push(`- draft_record_id: ${serializeScalar(claim.draft_record_id)}`);
    }
    if (claim.draft_summary) {
      lines.push(`- draft_summary: ${serializeScalar(claim.draft_summary)}`);
    }
    if (claim.procedure_key) {
      lines.push(`- procedure_key: ${serializeScalar(claim.procedure_key)}`);
    }
    if (Number.isInteger(claim.procedure_version) && claim.procedure_version > 0) {
      lines.push(`- procedure_version: ${claim.procedure_version}`);
    }
    if (Array.isArray(claim.acceptance) && claim.acceptance.length > 0) {
      lines.push(`- acceptance: ${serializeArray(claim.acceptance)}`);
    }
    if (Array.isArray(claim.feedback_refs) && claim.feedback_refs.length > 0) {
      lines.push(`- feedback_refs: ${serializeArray(claim.feedback_refs)}`);
    }
    if (claim.supersedes) {
      lines.push(`- supersedes: ${serializeScalar(claim.supersedes)}`);
    }
    lines.push(`- claim: ${serializeScalar(claim.claim)}`);
    lines.push(`- curator_decision: ${serializeScalar(claim.curator_decision || '')}`);
    lines.push(`- curator_notes: ${serializeScalar(claim.curator_notes || '')}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function writePendingBatch(memoryRoot, proposal) {
  const pendingRelativePath = `intake/pending/${proposal.batch_date}.md`;
  const pendingPath = path.join(memoryRoot, pendingRelativePath);
  fs.writeFileSync(pendingPath, renderPendingBatch(proposal), 'utf8');
  return {
    path: pendingPath,
    relativePath: pendingRelativePath,
  };
}

function propose(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const batchDate = normalizeBatchDate(requireOption(options, 'batchDate'));
  const now = formatTimestamp(options.createdAt);
  const proposalId = String(options.proposalId || buildProposalId(batchDate)).trim();
  const claims = normalizeClaims(batchDate, options.claims);
  const filePath = proposalPath(memoryRoot, proposalId);

  if (fs.existsSync(filePath)) {
    throw new Error(`Proposal already exists: ${proposalId}`);
  }

  const canon = loadMemoryCanon();
  const proposal = {
    kind: 'proposal',
    schema_version: canon.CURRENT_SCHEMA_VERSION,
    proposal_id: proposalId,
    batch_date: batchDate,
    generated_by: options.generatedBy || 'memory-os-gateway/propose',
    source: options.source || null,
    created_at: now,
    updated_at: now,
    status: 'proposed',
    claims,
    feedback: [],
    pending_batch_path: null,
    job_path: null,
  };

  writeJson(filePath, proposal);

  return {
    kind: 'proposal',
    memoryRoot,
    proposalId,
    proposalPath: filePath,
    status: proposal.status,
    proposal,
  };
}

function feedback(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const proposalId = requireOption(options, 'proposalId');
  const { filePath, proposal } = loadProposal(memoryRoot, proposalId);
  const entries = normalizeFeedbackEntries(options.feedback || options.entries);
  const now = formatTimestamp(options.updatedAt);
  const mergedClaims = mergeFeedbackIntoClaims(proposal.claims || [], entries);
  const reviewed = allClaimsReviewed(mergedClaims);

  proposal.claims = mergedClaims;
  proposal.feedback = [...(proposal.feedback || []), ...entries];
  proposal.updated_at = now;
  proposal.status = reviewed ? 'ready-for-apply' : 'feedback-recorded';

  let pendingBatch = null;
  if (reviewed) {
    proposal.pending_batch_path = `intake/pending/${proposal.batch_date}.md`;
    pendingBatch = writePendingBatch(memoryRoot, proposal);
  }

  writeJson(filePath, proposal);

  return {
    kind: 'feedback',
    memoryRoot,
    proposalId,
    proposalPath: filePath,
    status: proposal.status,
    reviewed,
    pendingBatch,
    proposal,
  };
}

function completeJob(options) {
  const memoryRoot = normalizeMemoryRoot(options.memoryRoot);
  const proposalId = requireOption(options, 'proposalId');
  const { filePath, proposal } = loadProposal(memoryRoot, proposalId);
  const canon = loadMemoryCanon();
  const now = formatTimestamp(options.completedAt);

  if (!allClaimsReviewed(proposal.claims || [])) {
    throw new Error(`Proposal ${proposalId} is not fully reviewed`);
  }

  let pendingBatch = null;
  if (proposal.pending_batch_path) {
    const pendingPath = path.join(memoryRoot, proposal.pending_batch_path);
    if (fs.existsSync(pendingPath)) {
      pendingBatch = {
        path: pendingPath,
        relativePath: proposal.pending_batch_path,
      };
    }
  }
  if (!pendingBatch) {
    pendingBatch = writePendingBatch(memoryRoot, proposal);
    proposal.pending_batch_path = pendingBatch.relativePath;
  }

  const operation = options.operation || 'core-promoter';
  const holder = options.holder || `gateway:${proposalId}`;
  const promotionRequest = {
    type: 'canon-write',
    memory_root: memoryRoot,
    writer: canon.CANON_SINGLE_WRITER,
    operation,
    batch_date: proposal.batch_date,
    pending_batch_path: pendingBatch.relativePath,
  };
  const promotionValidation = canon.validatePromotionRequest(promotionRequest);
  if (!promotionValidation.valid) {
    throw new Error(
      `Invalid promotion request: ${promotionValidation.issues
        .map((issue) => issue.message)
        .join(' ')}`
    );
  }

  const lock = canon.createCanonWriteLock({
    writer: promotionRequest.writer,
    operation,
    holder,
    acquiredAt: now,
  });
  const lockPath = canon.resolveCanonLockPath(memoryRoot);
  const lockValidation = canon.validateCanonWriteLock(lock);
  if (!lockValidation.valid) {
    throw new Error(
      `Invalid write lock scaffold: ${lockValidation.issues
        .map((issue) => issue.message)
        .join(' ')}`
    );
  }

  const jobId = String(options.jobId || `${proposalId}-apply`).trim();
  const receipt = {
    kind: 'job',
    schema_version: canon.CURRENT_SCHEMA_VERSION,
    job_id: jobId,
    proposal_id: proposalId,
    batch_date: proposal.batch_date,
    created_at: now,
    updated_at: now,
    status: 'ready-for-handoff',
    authoritative: false,
    pending_batch_path: pendingBatch.relativePath,
    write_path: {
      implementation: operation,
      single_writer: canon.CANON_SINGLE_WRITER,
      promotion_request: promotionRequest,
      lock_path: lockPath,
      lock,
    },
  };
  const receiptPath = jobPath(memoryRoot, jobId);
  writeJson(receiptPath, receipt);

  proposal.updated_at = now;
  proposal.status = 'ready-for-handoff';
  proposal.job_path = path.relative(memoryRoot, receiptPath).split(path.sep).join('/');
  writeJson(filePath, proposal);

  return {
    kind: 'job-completion',
    memoryRoot,
    proposalId,
    jobId,
    proposalPath: filePath,
    receiptPath,
    status: receipt.status,
    proposal,
    receipt,
    pendingBatch,
  };
}

module.exports = {
  completeJob,
  complete_job: completeJob,
  feedback,
  propose,
};
