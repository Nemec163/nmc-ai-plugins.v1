"use strict";

let cachedMemoryContracts = null;

function loadMemoryContracts() {
  if (cachedMemoryContracts) {
    return cachedMemoryContracts;
  }

  try {
    cachedMemoryContracts = require("@nmc/memory-contracts");
    return cachedMemoryContracts;
  } catch (error) {
    if (
      error.code !== "MODULE_NOT_FOUND" ||
      !String(error.message || "").includes("@nmc/memory-contracts")
    ) {
      throw error;
    }

    cachedMemoryContracts = require("../../memory-contracts");
    return cachedMemoryContracts;
  }
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
