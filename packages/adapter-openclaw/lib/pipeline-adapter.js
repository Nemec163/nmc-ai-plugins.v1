"use strict";

let cachedMemoryContracts = null;

const { loadPackage } = require("./load-package");

function loadMemoryContracts() {
  if (cachedMemoryContracts) {
    return cachedMemoryContracts;
  }

  cachedMemoryContracts = loadPackage("@nmc/memory-contracts", [
    "../memory-contracts",
    "../../memory-contracts",
  ]);
  return cachedMemoryContracts;
}

function buildOpenClawInvocation(phase, options = {}) {
  const date = String(options.date || "").trim();
  if (!date) {
    throw new Error("date is required");
  }

  const llmRunner = String(
    options.llmRunner || options.command || process.env.OPENCLAW_BIN || "openclaw"
  ).trim();
  if (!llmRunner) {
    throw new Error("llmRunner is required");
  }

  return {
    command: llmRunner,
    args: ["skill", "run", `memory-${phase}`, "--date", date],
  };
}

function createOpenClawPipelineAdapter() {
  const adapter = {
    runExtract(options) {
      return buildOpenClawInvocation("extract", options);
    },
    runCurate(options) {
      return buildOpenClawInvocation("curate", options);
    },
    runApply(options) {
      return buildOpenClawInvocation("apply", options);
    },
  };

  const validation = loadMemoryContracts().validatePipelineAdapter(adapter);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  return adapter;
}

module.exports = {
  buildOpenClawInvocation,
  createOpenClawPipelineAdapter,
};
