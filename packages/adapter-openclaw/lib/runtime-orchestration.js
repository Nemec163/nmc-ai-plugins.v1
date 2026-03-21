"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { loadPackage } = require("./load-package");

let cachedMemoryGateway = null;

function loadMemoryGateway() {
  if (cachedMemoryGateway) {
    return cachedMemoryGateway;
  }

  cachedMemoryGateway = loadPackage("memory-os-gateway", [
    "../memory-os-gateway",
    "../../memory-os-gateway",
  ]);
  return cachedMemoryGateway;
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

function sha256Content(content) {
  return "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
}

function syncSessions(options = {}) {
  const gateway = loadMemoryGateway();
  const openclawStateDir = path.resolve(
    requireOption(options, "openclawStateDir"),
  );
  const memoryRoot = path.resolve(requireOption(options, "memoryRoot"));
  const dateFilter = options.date || null;
  const agentFilter = options.agents || null;

  const agentsDir = path.join(openclawStateDir, "agents");
  if (!fs.existsSync(agentsDir)) {
    return { kind: "sync-sessions", imported: 0, skipped: 0, sessions: [] };
  }

  const agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true });
  const results = [];
  let imported = 0;
  let skipped = 0;

  for (const agentEntry of agentEntries) {
    if (!agentEntry.isDirectory()) {
      continue;
    }

    const agentName = agentEntry.name;
    if (agentFilter && !agentFilter.includes(agentName)) {
      continue;
    }

    const sessionsDir = path.join(agentsDir, agentName, "sessions");
    if (!fs.existsSync(sessionsDir)) {
      continue;
    }

    const sessionFiles = fs
      .readdirSync(sessionsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"));

    for (const sessionFile of sessionFiles) {
      const sourcePath = path.join(sessionsDir, sessionFile.name);
      const content = fs.readFileSync(sourcePath, "utf8");
      const lines = content.split("\n").filter((l) => l.trim());

      if (lines.length === 0) {
        continue;
      }

      let header;
      try {
        header = JSON.parse(lines[0]);
      } catch {
        continue;
      }

      const sessionId =
        header.session_id || sessionFile.name.replace(".jsonl", "");
      const startedAt = header.started_at || "";
      const dateMatch = startedAt.match(/^(\d{4}-\d{2}-\d{2})/);
      const sessionDate = dateMatch
        ? dateMatch[1]
        : sessionFile.name.match(/^(\d{4}-\d{2}-\d{2})/)
          ? sessionFile.name.match(/^(\d{4}-\d{2}-\d{2})/)[1]
          : new Date().toISOString().slice(0, 10);

      if (dateFilter && sessionDate !== dateFilter) {
        continue;
      }

      const contentDigest = sha256Content(content);

      const importsDir = path.join(
        memoryRoot,
        "runtime/sessions/_receipts/imports",
      );
      const receiptFileName = `${sessionDate}-openclaw-${sessionId}.json`;
      const receiptPath = path.join(importsDir, receiptFileName);

      if (fs.existsSync(receiptPath)) {
        try {
          const existingReceipt = JSON.parse(
            fs.readFileSync(receiptPath, "utf8"),
          );
          if (existingReceipt.content_digest === contentDigest) {
            skipped += 1;
            continue;
          }
        } catch {
          // receipt corrupt, re-import
        }
      }

      const targetFileName = `${sessionDate}-openclaw-${sessionId}.jsonl`;
      const targetDir = path.join(memoryRoot, "runtime/sessions", agentName);
      fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, targetFileName);
      fs.writeFileSync(targetPath, content, "utf8");

      fs.mkdirSync(importsDir, { recursive: true });
      const receipt = {
        kind: "session-import-receipt",
        source_path: sourcePath,
        target_path: toPosixPath(
          path.relative(memoryRoot, targetPath) || targetPath,
        ),
        adapter: "openclaw",
        agent: agentName,
        session_id: sessionId,
        content_digest: contentDigest,
        imported_at: new Date().toISOString(),
      };
      fs.writeFileSync(
        receiptPath,
        JSON.stringify(receipt, null, 2) + "\n",
        "utf8",
      );

      imported += 1;
      results.push({
        agent: agentName,
        sessionId,
        date: sessionDate,
        targetPath: receipt.target_path,
      });
    }
  }

  return { kind: "sync-sessions", imported, skipped, sessions: results };
}

module.exports = {
  completeOpenClawHandoff,
  createOpenClawOrchestrationAdapter,
  getOpenClawOrchestrationContext,
  getOpenClawRecallBundle,
  proposeOpenClawResults,
  recordOpenClawFeedback,
  resolveOpenClawRoleContext,
  syncSessions,
};
