"use strict";

const path = require("node:path");

let cachedMemoryGateway = null;

function loadMemoryGateway() {
  if (cachedMemoryGateway) {
    return cachedMemoryGateway;
  }

  try {
    cachedMemoryGateway = require("memory-os-gateway");
    return cachedMemoryGateway;
  } catch (error) {
    if (
      error.code !== "MODULE_NOT_FOUND" ||
      !String(error.message || "").includes("memory-os-gateway")
    ) {
      throw error;
    }

    cachedMemoryGateway = require("../../memory-os-gateway");
    return cachedMemoryGateway;
  }
}

function requireOption(options, key) {
  if (options[key] == null || options[key] === "") {
    throw new Error(`${key} is required`);
  }

  return options[key];
}

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

function relativeWorkspacePath(baseDir, targetPath) {
  return toPosixPath(path.relative(baseDir, targetPath) || ".");
}

function resolveOpenClawRoleContext(options = {}) {
  const roleId = requireOption(options, "roleId");
  const memoryRoot = path.resolve(requireOption(options, "memoryRoot"));
  const defaultSystemRoot =
    path.basename(memoryRoot) === "memory" &&
    path.basename(path.dirname(memoryRoot)) === "system"
      ? path.join(memoryRoot, "..")
      : path.join(memoryRoot, "system");
  const systemRoot = path.resolve(options.systemRoot || defaultSystemRoot);
  const workspaceDir = options.workspaceDir
    ? path.resolve(options.workspaceDir)
    : path.resolve(systemRoot, "..", roleId);
  const sharedSkillsRoot = path.resolve(
    options.sharedSkillsRoot || path.join(systemRoot, "skills"),
  );
  const installDate =
    options.installDate || new Date().toISOString().slice(0, 10);
  const memoryPath =
    options.memoryPath || relativeWorkspacePath(workspaceDir, memoryRoot);
  const systemPath =
    options.systemPath || relativeWorkspacePath(workspaceDir, systemRoot);

  return {
    roleId,
    memoryRoot,
    systemRoot,
    workspaceDir,
    sharedSkillsRoot,
    installDate,
    memoryPath,
    systemPath,
    maintainer: {
      systemRoot,
      sharedSkillsRoot,
      tasksRoot: path.join(systemRoot, "tasks"),
      boardDefaultsPath: path.join(systemRoot, "tasks", "active", ".kanban.json"),
      policyRoot: path.join(systemRoot, "policy"),
      scriptsRoot: path.join(systemRoot, "scripts"),
      docsRoot: path.join(systemRoot, "docs"),
    },
  };
}

function getOpenClawOrchestrationContext(options = {}) {
  const gateway = loadMemoryGateway();
  const context = resolveOpenClawRoleContext(options);
  const roleBundle = gateway.getRoleBundle({
    roleId: context.roleId,
    installDate: context.installDate,
    memoryPath: context.memoryPath,
    systemPath: context.systemPath,
  });
  const recallBundle = gateway.getRecallBundle({
    memoryRoot: context.memoryRoot,
    roleId: context.roleId,
    installDate: context.installDate,
    memoryPath: context.memoryPath,
    systemPath: context.systemPath,
    text: options.text,
    limit: options.limit,
    includePending: options.includePending,
  });
  const canonicalCurrent =
    recallBundle.canonicalCurrent || recallBundle.canonical || null;
  const runtimeRaw =
    recallBundle.runtime || recallBundle.runtimeRecall || recallBundle.runtimeDelta || null;
  const runtime =
    runtimeRaw && runtimeRaw.byBucket && !runtimeRaw.buckets
      ? {
          ...runtimeRaw,
          buckets: runtimeRaw.byBucket,
        }
      : runtimeRaw;

  return {
    kind: "openclaw-orchestration-context",
    adapter: "adapter-openclaw",
    authoritative: false,
    executionMode: "runtime-backed",
    role: roleBundle.manifest,
    roleBundle,
    recallBundle,
    canonicalCurrent,
    runtime,
    freshnessBoundary: {
      ...recallBundle.freshnessBoundary,
      runtimeAuthoritative: false,
    },
    workspace: {
      workspaceDir: context.workspaceDir,
      memoryRoot: context.memoryRoot,
      systemRoot: context.systemRoot,
      sharedSkillsRoot: context.sharedSkillsRoot,
      memoryPath: context.memoryPath,
      systemPath: context.systemPath,
    },
    maintainer: context.maintainer,
  };
}

function getOpenClawRecallBundle(options = {}) {
  return getOpenClawOrchestrationContext(options);
}

function proposeOpenClawResults(options = {}) {
  const gateway = loadMemoryGateway();

  return gateway.propose({
    memoryRoot: path.resolve(requireOption(options, "memoryRoot")),
    proposalId: options.proposalId,
    batchDate: requireOption(options, "batchDate"),
    claims: requireOption(options, "claims"),
    source: options.source || "adapter-openclaw",
    generatedBy: options.generatedBy || "adapter-openclaw/runtime-orchestration",
    createdAt: options.createdAt,
  });
}

function recordOpenClawFeedback(options = {}) {
  const gateway = loadMemoryGateway();

  return gateway.feedback({
    memoryRoot: path.resolve(requireOption(options, "memoryRoot")),
    proposalId: requireOption(options, "proposalId"),
    feedback: options.feedback || options.entries,
    updatedAt: options.updatedAt,
  });
}

function completeOpenClawHandoff(options = {}) {
  const gateway = loadMemoryGateway();

  return gateway.completeJob({
    memoryRoot: path.resolve(requireOption(options, "memoryRoot")),
    proposalId: requireOption(options, "proposalId"),
    jobId: options.jobId,
    holder: options.holder,
    operation: options.operation,
    completedAt: options.completedAt,
  });
}

function createOpenClawOrchestrationAdapter() {
  const gateway = loadMemoryGateway();

  return {
    name: "adapter-openclaw-orchestration",
    authoritative: false,
    bootstrapRole(params) {
      return gateway.bootstrapRole(params);
    },
    getRoleBundle(params) {
      return gateway.getRoleBundle(params);
    },
    getRecallBundle(params) {
      return getOpenClawRecallBundle(params);
    },
    getOrchestrationContext(params) {
      return getOpenClawOrchestrationContext(params);
    },
    getStatus(params) {
      return gateway.getStatus(params);
    },
    propose(params) {
      return proposeOpenClawResults(params);
    },
    feedback(params) {
      return recordOpenClawFeedback(params);
    },
    completeJob(params) {
      return completeOpenClawHandoff(params);
    },
  };
}

module.exports = {
  completeOpenClawHandoff,
  createOpenClawOrchestrationAdapter,
  getOpenClawOrchestrationContext,
  getOpenClawRecallBundle,
  proposeOpenClawResults,
  recordOpenClawFeedback,
  resolveOpenClawRoleContext,
};
