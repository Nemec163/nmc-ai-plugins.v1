'use strict';

const ACTION_DEFINITIONS = Object.freeze({
  'inspect-proposal': {
    actionId: 'inspect-proposal',
    title: 'Inspect proposal receipt',
    description: 'Review a proposal receipt and confirm its handoff metadata before any retry.',
    targetKinds: ['proposal'],
    effect: 'advisory-receipt',
  },
  'inspect-job': {
    actionId: 'inspect-job',
    title: 'Inspect job receipt',
    description: 'Review a job receipt for drift, orphaning, or mismatched proposal references.',
    targetKinds: ['job'],
    effect: 'advisory-receipt',
  },
  'inspect-conflict': {
    actionId: 'inspect-conflict',
    title: 'Inspect conflict',
    description: 'Capture an operator review for a detected queue conflict without mutating receipts.',
    targetKinds: ['conflict'],
    effect: 'advisory-receipt',
  },
  'request-curator-review': {
    actionId: 'request-curator-review',
    title: 'Request curator review',
    description: 'Record that a proposal needs manual review or feedback before handoff continues.',
    targetKinds: ['proposal'],
    effect: 'advisory-receipt',
  },
  'request-handoff-reconcile': {
    actionId: 'request-handoff-reconcile',
    title: 'Request handoff reconcile',
    description: 'Record that proposal, job, or pending-batch handoff artifacts need reconciliation.',
    targetKinds: ['proposal', 'job', 'conflict'],
    effect: 'advisory-receipt',
  },
  'request-lock-review': {
    actionId: 'request-lock-review',
    title: 'Request lock review',
    description: 'Record that the active canon lock needs manual inspection by the promotion owner.',
    targetKinds: ['lock', 'conflict'],
    effect: 'advisory-receipt',
  },
});

function cloneAction(actionId) {
  const action = ACTION_DEFINITIONS[actionId];
  if (!action) {
    throw new Error(`Unknown intervention action: ${actionId}`);
  }

  return {
    actionId: action.actionId,
    title: action.title,
    description: action.description,
    targetKinds: action.targetKinds.slice(),
    effect: action.effect,
  };
}

function uniqueActions(actionIds) {
  return Array.from(new Set(actionIds.filter(Boolean))).map(cloneAction);
}

function listInterventionActions() {
  return Object.keys(ACTION_DEFINITIONS)
    .sort()
    .map(cloneAction);
}

function getInterventionAction(actionId) {
  return cloneAction(actionId);
}

function buildAvailableActionsForProposal(proposal) {
  const actionIds = ['inspect-proposal'];
  const pendingBatchNeedsReconcile =
    proposal.pendingBatchPath && !proposal.pendingBatchExists && !proposal.processedBatchExists;
  if (proposal.status === 'proposed' || proposal.status === 'feedback-recorded') {
    actionIds.push('request-curator-review');
  }
  if (
    proposal.status === 'ready-for-apply' ||
    proposal.status === 'ready-for-handoff' ||
    pendingBatchNeedsReconcile ||
    (proposal.jobPath && !proposal.jobExists)
  ) {
    actionIds.push('request-handoff-reconcile');
  }

  return uniqueActions(actionIds);
}

function buildAvailableActionsForJob(job) {
  const actionIds = ['inspect-job'];
  const pendingBatchNeedsReconcile =
    job.pendingBatchPath && !job.pendingBatchExists && !job.processedBatchExists;
  if (job.status === 'ready-for-handoff' || pendingBatchNeedsReconcile) {
    actionIds.push('request-handoff-reconcile');
  }

  return uniqueActions(actionIds);
}

function buildAvailableActionsForConflict(conflict) {
  const actionIds = ['inspect-conflict'];
  switch (conflict.code) {
    case 'missing-pending-batch':
    case 'missing-job-receipt':
    case 'proposal-job-mismatch':
    case 'ready-proposal-without-job':
    case 'orphan-job':
    case 'job-path-mismatch':
    case 'missing-job-pending-batch':
      actionIds.push('request-handoff-reconcile');
      break;
    case 'invalid-canon-lock':
    case 'orphan-active-lock':
      actionIds.push('request-lock-review');
      break;
    default:
      break;
  }

  return uniqueActions(actionIds);
}

function buildAvailableActionsForLock(lockState) {
  if (!lockState || !lockState.exists) {
    return [];
  }

  return uniqueActions(['request-lock-review']);
}

module.exports = {
  ACTION_DEFINITIONS,
  buildAvailableActionsForConflict,
  buildAvailableActionsForJob,
  buildAvailableActionsForLock,
  buildAvailableActionsForProposal,
  getInterventionAction,
  listInterventionActions,
};
