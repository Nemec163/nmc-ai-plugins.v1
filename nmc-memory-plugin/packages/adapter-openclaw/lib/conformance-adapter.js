"use strict";

let cachedMemoryGateway = null;

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  getBundledSkillsRoot,
} = require("./openclaw-setup");

const OPENCLAW_ADAPTER_CAPABILITIES = Object.freeze({
  roleBundle: true,
  bootstrapRole: true,
  bootstrapWorkspace: true,
  canonicalRead: true,
  projectionRead: true,
  status: true,
  verify: true,
  writeOrchestration: true,
  cliStatus: true,
});

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

function createOpenClawConformanceAdapter(options = {}) {
  const pluginRoot = options.pluginRoot;
  if (!pluginRoot) {
    throw new Error("pluginRoot is required");
  }

  const gateway = loadMemoryGateway();
  const gatewayCliPath =
    options.gatewayCliPath ||
    path.resolve(__dirname, "..", "..", "memory-os-gateway", "bin", "memory-os-gateway.js");
  const sharedSkillsRoot = options.sharedSkillsRoot || getBundledSkillsRoot();

  return {
    name: "adapter-openclaw",
    capabilities: OPENCLAW_ADAPTER_CAPABILITIES,
    getRoleBundle(params) {
      return gateway.getRoleBundle(params);
    },
    bootstrap(params) {
      return gateway.bootstrap({
        ...params,
        systemTemplateRoot:
          options.systemTemplateRoot || path.join(pluginRoot, "templates", "workspace-system"),
        memoryTemplateRoot:
          options.memoryTemplateRoot || path.join(pluginRoot, "templates", "workspace-memory"),
        skillsSourceRoot: options.skillsSourceRoot || sharedSkillsRoot,
        sharedSkillsRoot:
          params.sharedSkillsRoot || options.sharedSkillsRoot || sharedSkillsRoot,
      });
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
      return gateway.propose(params);
    },
    feedback(params) {
      return gateway.feedback(params);
    },
    completeJob(params) {
      return gateway.completeJob(params);
    },
    invokeCli(args) {
      return spawnSync(process.execPath, [gatewayCliPath, ...args], {
        encoding: "utf8",
      });
    },
  };
}

module.exports = {
  OPENCLAW_ADAPTER_CAPABILITIES,
  createOpenClawConformanceAdapter,
};
