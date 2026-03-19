'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let cachedMemoryGateway = null;

const CLAUDE_ADAPTER_CAPABILITIES = Object.freeze({
  roleBundle: true,
  bootstrapRole: true,
  canonicalRead: true,
  projectionRead: true,
  status: true,
  verify: true,
  writeOrchestration: true,
  cliStatus: true,
});

const READ_ONLY_EXECUTION_OPERATIONS = Object.freeze([
  'status',
  'verify',
  'read-record',
  'get-projection',
  'get-canonical-current',
]);

function loadMemoryGateway() {
  if (cachedMemoryGateway) {
    return cachedMemoryGateway;
  }

  try {
    cachedMemoryGateway = require('memory-os-gateway');
    return cachedMemoryGateway;
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes('memory-os-gateway')
    ) {
      throw error;
    }

    cachedMemoryGateway = require('../../memory-os-gateway');
    return cachedMemoryGateway;
  }
}

function requireOption(options, key) {
  if (options[key] == null || options[key] === '') {
    throw new Error(`${key} is required`);
  }

  return options[key];
}

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function relativeWorkspacePath(baseDir, targetPath) {
  return toPosixPath(path.relative(baseDir, targetPath) || '.');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function hasReviewedClaims(claims) {
  return Array.isArray(claims) && claims.every((claim) => {
    const decision = claim && typeof claim === 'object' ? claim.curator_decision : null;
    return typeof decision === 'string' && decision.trim().length > 0;
  });
}

function getClaudeRunClaims(options = {}) {
  const claims = options.claims || options.results;
  if (!Array.isArray(claims) || claims.length === 0) {
    throw new Error('claims or results must be a non-empty array');
  }

  return claims;
}

function resolveRoleContext(options = {}) {
  const roleId = requireOption(options, 'roleId');
  const workspaceDir = path.resolve(requireOption(options, 'workspaceDir'));
  const systemRoot = path.resolve(requireOption(options, 'systemRoot'));
  const memoryRoot = path.resolve(requireOption(options, 'memoryRoot'));
  const sharedSkillsRoot = path.resolve(
    options.sharedSkillsRoot || path.join(systemRoot, 'skills')
  );
  const installDate = options.installDate || new Date().toISOString().slice(0, 10);

  return {
    roleId,
    workspaceDir,
    systemRoot,
    memoryRoot,
    sharedSkillsRoot,
    installDate,
  };
}

function bootstrapClaudeRole(options = {}) {
  const gateway = loadMemoryGateway();
  const context = resolveRoleContext(options);

  ensureDir(context.systemRoot);
  ensureDir(context.memoryRoot);
  ensureDir(context.sharedSkillsRoot);

  return gateway.bootstrapRole({
    ...options,
    roleId: context.roleId,
    workspaceDir: context.workspaceDir,
    systemRoot: context.systemRoot,
    memoryRoot: context.memoryRoot,
    sharedSkillsRoot: context.sharedSkillsRoot,
    installDate: context.installDate,
  });
}

function attachClaudeRole(options = {}) {
  const gateway = loadMemoryGateway();
  const context = resolveRoleContext(options);
  const memoryPath =
    options.memoryPath ||
    relativeWorkspacePath(context.workspaceDir, context.memoryRoot);
  const systemPath =
    options.systemPath ||
    relativeWorkspacePath(context.workspaceDir, context.systemRoot);
  const bundle = gateway.getRoleBundle({
    roleId: context.roleId,
    installDate: context.installDate,
    memoryPath,
    systemPath,
  });
  const bootPath = path.join(context.workspaceDir, 'BOOT.md');
  const skillsPath = path.join(context.workspaceDir, 'skills');
  const systemLinkPath = path.join(context.workspaceDir, 'system');

  return {
    kind: 'role-attachment',
    adapter: 'adapter-claude',
    executionMode: 'session',
    readOnly: true,
    role: bundle.manifest,
    bundle,
    workspace: {
      workspaceDir: context.workspaceDir,
      bootPath,
      bootExists: fs.existsSync(bootPath),
      skillsPath,
      skillsLinked: fs.existsSync(skillsPath),
      systemPath: systemLinkPath,
      systemLinked: fs.existsSync(systemLinkPath),
    },
    systemRoot: context.systemRoot,
    memoryRoot: context.memoryRoot,
    sharedSkillsRoot: context.sharedSkillsRoot,
  };
}

function getClaudeRoleBundleIntake(options = {}) {
  const gateway = loadMemoryGateway();
  const context = resolveRoleContext(options);
  const memoryPath =
    options.memoryPath ||
    relativeWorkspacePath(context.workspaceDir, context.memoryRoot);
  const systemPath =
    options.systemPath ||
    relativeWorkspacePath(context.workspaceDir, context.systemRoot);
  const bundle = gateway.getRoleBundle({
    roleId: context.roleId,
    installDate: context.installDate,
    memoryPath,
    systemPath,
  });

  return {
    kind: 'role-bundle',
    role: bundle.manifest,
    files: Object.keys(bundle.files).sort(),
    memoryPath,
    systemPath,
  };
}

function proposeClaudeResults(options = {}) {
  const gateway = loadMemoryGateway();
  return gateway.propose({
    memoryRoot: path.resolve(requireOption(options, 'memoryRoot')),
    proposalId: options.proposalId,
    batchDate: requireOption(options, 'batchDate'),
    claims: getClaudeRunClaims(options),
    source: options.source || 'adapter-claude',
    generatedBy: options.generatedBy || 'adapter-claude/session',
    createdAt: options.createdAt,
  });
}

function recordClaudeFeedback(options = {}) {
  const gateway = loadMemoryGateway();
  return gateway.feedback({
    memoryRoot: path.resolve(requireOption(options, 'memoryRoot')),
    proposalId: requireOption(options, 'proposalId'),
    feedback: options.feedback || options.entries,
    updatedAt: options.updatedAt,
  });
}

function completeClaudeHandoff(options = {}) {
  const gateway = loadMemoryGateway();
  return gateway.completeJob({
    memoryRoot: path.resolve(requireOption(options, 'memoryRoot')),
    proposalId: requireOption(options, 'proposalId'),
    jobId: options.jobId,
    holder: options.holder,
    operation: options.operation,
    completedAt: options.completedAt,
  });
}

function runClaudeSession(options = {}) {
  const gateway = loadMemoryGateway();
  const operation = requireOption(options, 'operation');

  if (!READ_ONLY_EXECUTION_OPERATIONS.includes(operation)) {
    throw new Error(`Unsupported claude operation: ${operation}`);
  }

  const bootstrap = bootstrapClaudeRole(options);
  const memoryRoot = path.resolve(requireOption(options, 'memoryRoot'));
  let result;

  switch (operation) {
    case 'status':
      result = gateway.getStatus({ memoryRoot });
      break;
    case 'verify':
      result = gateway.verify({
        memoryRoot,
        updatedAt: options.updatedAt,
        today: options.today,
      });
      break;
    case 'read-record':
      result = gateway.readRecord({
        memoryRoot,
        recordId: requireOption(options, 'recordId'),
      });
      break;
    case 'get-projection':
      result = gateway.getProjection({
        memoryRoot,
        projectionPath: requireOption(options, 'projectionPath'),
      });
      break;
    case 'get-canonical-current':
      result = gateway.getCanonicalCurrent({ memoryRoot });
      break;
    default:
      throw new Error(`Unsupported claude operation: ${operation}`);
  }

  return {
    kind: 'session-run',
    adapter: 'adapter-claude',
    executionMode: 'session',
    readOnly: true,
    operation,
    role: bootstrap.role,
    workspace: bootstrap.workspace,
    result,
  };
}

function runClaudeSessionHandoff(options = {}) {
  const bootstrap = bootstrapClaudeRole(options);
  const intake = getClaudeRoleBundleIntake(options);
  const memoryRoot = path.resolve(requireOption(options, 'memoryRoot'));
  const submission = proposeClaudeResults({
    ...options,
    memoryRoot,
  });

  let review = null;
  let reviewedClaims = submission.proposal.claims || [];
  if (Array.isArray(options.feedback) && options.feedback.length > 0) {
    review = recordClaudeFeedback({
      memoryRoot,
      proposalId: submission.proposalId,
      feedback: options.feedback,
      updatedAt: options.updatedAt,
    });
    reviewedClaims = review.proposal.claims || [];
  }

  if (!hasReviewedClaims(reviewedClaims)) {
    throw new Error(
      'Claude session handoff requires reviewed claims or explicit feedback before completion'
    );
  }

  const completion = completeClaudeHandoff({
    memoryRoot,
    proposalId: submission.proposalId,
    jobId: options.jobId,
    holder: options.holder || `adapter-claude:${intake.role.id}`,
    operation: options.operation,
    completedAt: options.completedAt,
  });

  return {
    kind: 'session-handoff',
    adapter: 'adapter-claude',
    executionMode: 'session',
    readOnly: false,
    intake,
    role: bootstrap.role,
    workspace: bootstrap.workspace,
    submission,
    review,
    completion,
    status: completion.status,
  };
}

function createClaudeConformanceAdapter(options = {}) {
  const gateway = loadMemoryGateway();
  const gatewayCliPath =
    options.gatewayCliPath ||
    path.resolve(__dirname, '..', '..', 'memory-os-gateway', 'bin', 'memory-os-gateway.js');

  return {
    name: 'adapter-claude',
    capabilities: CLAUDE_ADAPTER_CAPABILITIES,
    getRoleBundle(params) {
      return gateway.getRoleBundle(params);
    },
    bootstrap(params) {
      return bootstrapClaudeRole(params);
    },
    readRecord(params) {
      return gateway.readRecord(params);
    },
    getProjection(params) {
      return gateway.getProjection(params);
    },
    getCanonicalCurrent(params) {
      return gateway.getCanonicalCurrent(params);
    },
    getStatus(params) {
      return gateway.getStatus(params);
    },
    verify(params) {
      return gateway.verify(params);
    },
    propose(params) {
      return proposeClaudeResults(params);
    },
    feedback(params) {
      return recordClaudeFeedback(params);
    },
    completeJob(params) {
      return completeClaudeHandoff(params);
    },
    invokeCli(args) {
      return spawnSync(process.execPath, [gatewayCliPath, ...args], {
        encoding: 'utf8',
      });
    },
  };
}

module.exports = {
  CLAUDE_ADAPTER_CAPABILITIES,
  READ_ONLY_EXECUTION_OPERATIONS,
  attachClaudeRole,
  bootstrapClaudeRole,
  completeClaudeHandoff,
  createClaudeConformanceAdapter,
  getClaudeRoleBundleIntake,
  proposeClaudeResults,
  recordClaudeFeedback,
  runClaudeSession,
  runClaudeSessionHandoff,
};
