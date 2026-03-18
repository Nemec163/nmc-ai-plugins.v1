"use strict";

const PLUGIN_ID = "nmc-memory-plugin";
const PLUGIN_NAME = "NMC Memory Plugin";

const INSTALL_SURFACES = Object.freeze({
  ADAPTER: "adapter-package",
  COMPATIBILITY_SHELL: "compatibility-shell",
});

const PLUGIN_MANIFEST_BASE = Object.freeze({
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  version: "0.1.0",
  description:
    "Persistent human-like memory system for OpenClaw with a git-backed canon, consolidation pipeline, and query skills.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      autoSetup: {
        type: "boolean",
        default: true,
        description:
          "Automatically scaffold shared memory, shared skills, and predefined agent workspaces when the plugin first loads.",
      },
      stateDir: {
        type: "string",
        description: "Override the OpenClaw state directory used for bootstrap.",
      },
      workspaceRoot: {
        type: "string",
        description:
          "Override the workspace root that will contain per-agent workspaces and the shared system directory.",
      },
      systemRoot: {
        type: "string",
        description:
          "Override the shared system root that will contain memory, skills, tasks, policy, docs, and scripts.",
      },
      memoryRoot: {
        type: "string",
        description:
          "Override the shared canonical memory root. Defaults to <systemRoot>/memory.",
      },
      configPath: {
        type: "string",
        description: "Override the openclaw.json path used during bootstrap.",
      },
      overwrite: {
        type: "boolean",
        default: false,
        description: "Allow auto-setup to overwrite managed files and symlinks.",
      },
      writeConfig: {
        type: "boolean",
        default: true,
        description:
          "Allow auto-setup to write managed agent and skill configuration into openclaw.json.",
      },
      bindings: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Optional setup bindings in agent=channel[:accountId[:peerId]] form.",
      },
      models: {
        type: "object",
        additionalProperties: false,
        properties: {
          nyx: { type: "string" },
          medea: { type: "string" },
          arx: { type: "string" },
          lev: { type: "string" },
          mnemo: { type: "string" },
        },
      },
    },
  },
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSurface(surface) {
  if (
    surface === INSTALL_SURFACES.ADAPTER ||
    surface === INSTALL_SURFACES.COMPATIBILITY_SHELL
  ) {
    return surface;
  }

  throw new Error(`Unsupported install surface: ${surface}`);
}

function getSkillRoot(surface) {
  if (surface === INSTALL_SURFACES.ADAPTER) {
    return "./skills";
  }

  return "packages/adapter-openclaw/skills";
}

function getOpenClawExtensionEntry(surface) {
  if (surface === INSTALL_SURFACES.ADAPTER) {
    return "./plugin.js";
  }

  return "./index.js";
}

function createOpenClawPluginManifest(surface = INSTALL_SURFACES.ADAPTER) {
  const normalizedSurface = normalizeSurface(surface);
  const manifest = cloneJson(PLUGIN_MANIFEST_BASE);
  manifest.skills = [getSkillRoot(normalizedSurface)];
  return manifest;
}

function createOpenClawPackageMetadata(surface = INSTALL_SURFACES.ADAPTER) {
  return {
    extensions: [getOpenClawExtensionEntry(normalizeSurface(surface))],
  };
}

module.exports = {
  INSTALL_SURFACES,
  PLUGIN_ID,
  PLUGIN_NAME,
  createOpenClawPackageMetadata,
  createOpenClawPluginManifest,
  getOpenClawExtensionEntry,
};
