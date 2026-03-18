'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let cachedMemoryGateway = null;

const CODEX_ADAPTER_CAPABILITIES = Object.freeze({
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

function getCodexRunClaims(options = {}) {
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

function bootstrapCodexRole(options = {}) {
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

function attachCodexRole(options = {}) {
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
    adapter: 'adapter-codex',
    executionMode: 'single-thread',
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

function getCodexRoleBundleIntake(options = {}) {
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

function proposeCodexResults(options = {}) {
  const gateway = loadMemoryGateway();
  return gateway.propose({
    memoryRoot: path.resolve(requireOption(options, 'memoryRoot')),
    proposalId: options.proposalId,
    batchDate: requireOption(options, 'batchDate'),
    claims: getCodexRunClaims(options),
    source: options.source || 'adapter-codex',
    generatedBy: options.generatedBy || 'adapter-codex/single-run',
    createdAt: options.createdAt,
  });
}

function recordCodexFeedback(options = {}) {
  const gateway = loadMemoryGateway();
  return gateway.feedback({
    memoryRoot: path.resolve(requireOption(options, 'memoryRoot')),
    proposalId: requireOption(options, 'proposalId'),
    feedback: options.feedback || options.entries,
    updatedAt: options.updatedAt,
  });
}

function completeCodexHandoff(options = {}) {
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

function runCodexSingleThread(options = {}) {
  const gateway = loadMemoryGateway();
  const operation = requireOption(options, 'operation');

  if (!READ_ONLY_EXECUTION_OPERATIONS.includes(operation)) {
    throw new Error(`Unsupported codex operation: ${operation}`);
  }

  const bootstrap = bootstrapCodexRole(options);
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
      throw new Error(`Unsupported codex operation: ${operation}`);
  }

  return {
    kind: 'single-thread-run',
    adapter: 'adapter-codex',
    executionMode: 'single-thread',
    readOnly: true,
    operation,
    role: bootstrap.role,
    workspace: bootstrap.workspace,
    result,
  };
}

function runCodexSingleThreadHandoff(options = {}) {
  const bootstrap = bootstrapCodexRole(options);
  const intake = getCodexRoleBundleIntake(options);
  const memoryRoot = path.resolve(requireOption(options, 'memoryRoot'));
  const submission = proposeCodexResults({
    ...options,
    memoryRoot,
  });

  let review = null;
  let reviewedClaims = submission.proposal.claims || [];
  if (Array.isArray(options.feedback) && options.feedback.length > 0) {
    review = recordCodexFeedback({
      memoryRoot,
      proposalId: submission.proposalId,
      feedback: options.feedback,
      updatedAt: options.updatedAt,
    });
    reviewedClaims = review.proposal.claims || [];
  }

  if (!hasReviewedClaims(reviewedClaims)) {
    throw new Error(
      'Codex single-run handoff requires reviewed claims or explicit feedback before completion'
    );
  }

  const completion = completeCodexHandoff({
    memoryRoot,
    proposalId: submission.proposalId,
    jobId: options.jobId,
    holder: options.holder || `adapter-codex:${intake.role.id}`,
    operation: options.operation,
    completedAt: options.completedAt,
  });

  return {
    kind: 'single-thread-handoff',
    adapter: 'adapter-codex',
    executionMode: 'single-thread',
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

function createCodexConformanceAdapter(options = {}) {
  const gateway = loadMemoryGateway();
  const gatewayCliPath =
    options.gatewayCliPath ||
    path.resolve(__dirname, '..', '..', 'memory-os-gateway', 'bin', 'memory-os-gateway.js');

  return {
    name: 'adapter-codex',
    capabilities: CODEX_ADAPTER_CAPABILITIES,
    getRoleBundle(params) {
      return gateway.getRoleBundle(params);
    },
    bootstrap(params) {
      return bootstrapCodexRole(params);
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
      return proposeCodexResults(params);
    },
    feedback(params) {
      return recordCodexFeedback(params);
    },
    completeJob(params) {
      return completeCodexHandoff(params);
    },
    invokeCli(args) {
      return spawnSync(process.execPath, [gatewayCliPath, ...args], {
        encoding: 'utf8',
      });
    },
  };
}

module.exports = {
  CODEX_ADAPTER_CAPABILITIES,
  READ_ONLY_EXECUTION_OPERATIONS,
  attachCodexRole,
  bootstrapCodexRole,
  completeCodexHandoff,
  createCodexConformanceAdapter,
  getCodexRoleBundleIntake,
  proposeCodexResults,
  recordCodexFeedback,
  runCodexSingleThread,
  runCodexSingleThreadHandoff,
};
