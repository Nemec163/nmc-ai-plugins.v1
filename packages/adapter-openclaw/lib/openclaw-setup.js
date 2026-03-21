"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { PLUGIN_ID, PLUGIN_NAME } = require("./install-surface");
const { loadPackage } = require("./load-package");

const DEFAULT_BINDINGS = [];
const CANON_EXTRA_PATHS = [
  "core/user/timeline/**/*.md",
  "core/user/knowledge/*.md",
  "core/user/identity/*.md",
  "core/user/state/*.md",
  "core/agents/**/*.md",
];

let cachedMemoryAgents = null;
let cachedMemoryGateway = null;
let cachedMemoryWorkspace = null;

function loadMemoryAgents() {
  if (cachedMemoryAgents) {
    return cachedMemoryAgents;
  }

  cachedMemoryAgents = loadPackage("@nmc/memory-agents", [
    "../memory-agents",
    "../../memory-agents",
  ]);
  return cachedMemoryAgents;
}

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

function loadMemoryWorkspace() {
  if (cachedMemoryWorkspace) {
    return cachedMemoryWorkspace;
  }

  cachedMemoryWorkspace = loadPackage("@nmc/memory-workspace", [
    "../memory-workspace",
    "../../memory-workspace",
  ]);
  return cachedMemoryWorkspace;
}

function ensureDir(dirPath) {
  return loadMemoryWorkspace().ensureDir(dirPath);
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  return loadMemoryWorkspace().expandHome(inputPath);
}

function toConfigPath(inputPath) {
  return loadMemoryWorkspace().toConfigPath(inputPath);
}

function toPosixPath(inputPath) {
  return loadMemoryWorkspace().toPosixPath(inputPath);
}

function relativeWorkspacePath(baseDir, targetPath) {
  return loadMemoryWorkspace().relativeWorkspacePath(baseDir, targetPath);
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function getBundledSkillsRoot() {
  const ws = loadMemoryWorkspace();
  return ws.BUNDLED_SKILLS_ROOT || path.resolve(__dirname, "..", "skills");
}

function stripJsonComments(input) {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        output += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    output += char;
  }

  let cleaned = "";
  inString = false;
  escaped = false;

  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];

    if (inString) {
      cleaned += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      cleaned += char;
      continue;
    }

    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < output.length && /\s/.test(output[lookahead])) {
        lookahead += 1;
      }

      if (output[lookahead] === "}" || output[lookahead] === "]") {
        continue;
      }
    }

    cleaned += char;
  }

  return cleaned;
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, "utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return JSON.parse(stripJsonComments(raw));
  }
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildAgentConfig(agent, options) {
  const workspacePath = path.join(options.workspaceRoot, agent.id);
  const agentDirPath = path.join(options.stateDir, "agents", agent.id, "agent");
  const configAgent = {
    id: agent.id,
    name: agent.name,
    workspace: toConfigPath(workspacePath),
    agentDir: toConfigPath(agentDirPath),
    model: options.models[agent.id] || agent.model,
    identity: {
      name: agent.name,
      theme: agent.title,
      emoji: agent.emoji,
    },
    groupChat: {
      mentionPatterns: uniqueStrings([`@${agent.id}`, agent.id, agent.name]),
    },
  };

  if (agent.subagents.length > 0) {
    configAgent.subagents = {
      allowAgents: agent.subagents,
    };
  }

  if (agent.heartbeatConfig) {
    configAgent.heartbeat = agent.heartbeatConfig;
  }

  return configAgent;
}

function mergeAgent(existing, generated) {
  if (!existing) {
    return generated;
  }

  const merged = { ...existing };

  for (const [key, value] of Object.entries(generated)) {
    if (merged[key] == null) {
      merged[key] = value;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      merged[key] &&
      typeof merged[key] === "object" &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = { ...value, ...merged[key] };
      continue;
    }
  }

  if (generated.groupChat && existing.groupChat) {
    merged.groupChat = {
      ...generated.groupChat,
      ...existing.groupChat,
      mentionPatterns: uniqueStrings([
        ...(generated.groupChat.mentionPatterns || []),
        ...(existing.groupChat.mentionPatterns || []),
      ]),
    };
  }

  if (generated.subagents && existing.subagents) {
    merged.subagents = {
      ...generated.subagents,
      ...existing.subagents,
      allowAgents: uniqueStrings([
        ...(generated.subagents.allowAgents || []),
        ...(existing.subagents.allowAgents || []),
      ]),
    };
  }

  merged.workspace = generated.workspace;
  merged.agentDir = generated.agentDir;

  return merged;
}

function parseBinding(rawBinding) {
  const [agentId, matchSpec] = rawBinding.split("=");
  if (!agentId || !matchSpec) {
    throw new Error(
      `invalid binding "${rawBinding}". Use agent=channel[:accountId[:peerId]]`,
    );
  }

  const [channel, accountId, peerId] = matchSpec.split(":");
  if (!channel) {
    throw new Error(
      `invalid binding "${rawBinding}". Use agent=channel[:accountId[:peerId]]`,
    );
  }

  const match = { channel };
  if (accountId) {
    match.accountId = accountId;
  }
  if (peerId) {
    match.peerId = peerId;
  }

  return { agentId, match };
}

function bindingKey(binding) {
  return JSON.stringify(binding);
}

function canonExtraPathsForWorkspace(workspaceRoot, memoryRoot) {
  const referenceWorkspace = path.join(
    workspaceRoot,
    loadMemoryAgents().PREDEFINED_AGENTS[0].id,
  );
  const memoryRelativePath = relativeWorkspacePath(referenceWorkspace, memoryRoot);
  return CANON_EXTRA_PATHS.map((relativePath) =>
    toPosixPath(path.posix.join(memoryRelativePath, relativePath)),
  );
}

function updateConfig(options) {
  const config = readConfig(options.configPath);
  const original = fs.existsSync(options.configPath)
    ? fs.readFileSync(options.configPath, "utf8")
    : null;
  const originalParsed = original === null ? null : `${JSON.stringify(config, null, 2)}\n`;

  config.agents = config.agents || {};
  config.agents.defaults =
    config.agents.defaults &&
    typeof config.agents.defaults === "object" &&
    !Array.isArray(config.agents.defaults)
      ? config.agents.defaults
      : {};
  config.agents.list = Array.isArray(config.agents.list) ? config.agents.list : [];
  config.bindings = Array.isArray(config.bindings) ? config.bindings : [];

  const existingDefault = config.agents.list.find((agent) => agent && agent.default);
  const nextAgents = [];
  const seenIds = new Set();

  for (const current of config.agents.list) {
    if (!current || !current.id || seenIds.has(current.id)) {
      continue;
    }
    seenIds.add(current.id);
    nextAgents.push(current);
  }

  for (const agent of loadMemoryAgents().PREDEFINED_AGENTS) {
    const generated = buildAgentConfig(agent, options);
    const existingIndex = nextAgents.findIndex((item) => item.id === agent.id);

    if (existingIndex === -1) {
      if (!existingDefault && agent.id === "nyx") {
        generated.default = true;
      }
      nextAgents.push(generated);
      continue;
    }

    nextAgents[existingIndex] = mergeAgent(nextAgents[existingIndex], generated);
  }

  config.agents.list = nextAgents;

  const existingMemorySearch =
    config.agents.defaults.memorySearch &&
    typeof config.agents.defaults.memorySearch === "object" &&
    !Array.isArray(config.agents.defaults.memorySearch)
      ? config.agents.defaults.memorySearch
      : {};
  config.agents.defaults.memorySearch = {
    ...existingMemorySearch,
    extraPaths: uniqueStrings([
      ...(Array.isArray(existingMemorySearch.extraPaths)
        ? existingMemorySearch.extraPaths
        : []),
      ...canonExtraPathsForWorkspace(options.workspaceRoot, options.memoryRoot),
    ]),
  };

  config.skills =
    config.skills && typeof config.skills === "object" && !Array.isArray(config.skills)
      ? config.skills
      : {};
  config.skills.load =
    config.skills.load &&
    typeof config.skills.load === "object" &&
    !Array.isArray(config.skills.load)
      ? config.skills.load
      : {};
  config.skills.load.extraDirs = uniqueStrings([
    ...(Array.isArray(config.skills.load.extraDirs) ? config.skills.load.extraDirs : []),
    toConfigPath(path.join(options.systemRoot, "skills")),
  ]);

  const generatedBindings = [
    ...DEFAULT_BINDINGS,
    ...options.bindings.map(parseBinding),
  ];
  const bindingMap = new Map(config.bindings.map((binding) => [bindingKey(binding), binding]));

  for (const binding of generatedBindings) {
    bindingMap.set(bindingKey(binding), binding);
  }

  config.bindings = Array.from(bindingMap.values());

  ensureDir(path.dirname(options.configPath));
  const nextSerialized = `${JSON.stringify(config, null, 2)}\n`;
  const changed = originalParsed !== nextSerialized;

  if (original !== null && changed) {
    fs.writeFileSync(`${options.configPath}.bak`, original, "utf8");
  }

  if (changed) {
    fs.writeFileSync(options.configPath, nextSerialized, "utf8");
  }

  return {
    path: options.configPath,
    backedUp: original !== null && changed,
    changed,
    agentCount: config.agents.list.length,
    bindingCount: config.bindings.length,
  };
}

function normalizeOptions(rawOptions = {}) {
  const stateDir = path.resolve(
    expandHome(rawOptions.stateDir || path.join(os.homedir(), ".openclaw")),
  );
  const workspaceRoot = path.resolve(
    expandHome(rawOptions.workspaceRoot || path.join(stateDir, "workspace")),
  );
  const systemRoot = path.resolve(
    expandHome(rawOptions.systemRoot || path.join(workspaceRoot, "system")),
  );
  const memoryRoot = path.resolve(
    expandHome(rawOptions.memoryRoot || path.join(systemRoot, "memory")),
  );
  const sharedSkillsRoot = path.join(systemRoot, "skills");
  const configPath = path.resolve(
    expandHome(rawOptions.configPath || path.join(stateDir, "openclaw.json")),
  );

  return {
    pluginRoot: rawOptions.pluginRoot,
    stateDir,
    workspaceRoot,
    systemRoot,
    memoryRoot,
    sharedSkillsRoot,
    configPath,
    overwrite: Boolean(rawOptions.overwrite),
    writeConfig: rawOptions.writeConfig !== false,
    bindings: Array.isArray(rawOptions.bindings) ? rawOptions.bindings : [],
    models: rawOptions.models || {},
    installDate: rawOptions.installDate || utcDate(),
  };
}

function setupOpenClaw(rawOptions = {}) {
  if (!rawOptions.pluginRoot) {
    throw new Error("pluginRoot is required");
  }

  const memoryGateway = loadMemoryGateway();
  const options = normalizeOptions(rawOptions);
  const bootstrapResult = memoryGateway.bootstrap({
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
    systemRoot: options.systemRoot,
    memoryRoot: options.memoryRoot,
    sharedSkillsRoot: options.sharedSkillsRoot,
    systemTemplateRoot: loadMemoryWorkspace().BUNDLED_SYSTEM_TEMPLATE_ROOT || path.join(options.pluginRoot, "templates", "workspace-system"),
    memoryTemplateRoot: loadMemoryWorkspace().BUNDLED_MEMORY_TEMPLATE_ROOT || path.join(options.pluginRoot, "templates", "workspace-memory"),
    skillsSourceRoot: getBundledSkillsRoot(),
    installDate: options.installDate,
    overwrite: options.overwrite,
  });
  const config = options.writeConfig ? updateConfig(options) : null;

  return {
    ...bootstrapResult,
    config,
  };
}

function inferStateDirFromPluginRoot(pluginRoot) {
  const parentDir = path.dirname(pluginRoot);
  if (path.basename(parentDir) !== "extensions") {
    return null;
  }

  return path.dirname(parentDir);
}

function pluginRuntimeConfig(api) {
  if (!api || !api.config || !api.config.plugins || !api.config.plugins.entries) {
    return {};
  }

  const entry = api.config.plugins.entries[PLUGIN_ID];
  if (!entry || !entry.config || typeof entry.config !== "object") {
    return {};
  }

  return entry.config;
}

function resolveAutoSetupOptions(api, pluginRoot) {
  const config = pluginRuntimeConfig(api);
  if (config.autoSetup === false) {
    return null;
  }

  const stateDir = expandHome(
    config.stateDir || process.env.OPENCLAW_STATE_DIR || inferStateDirFromPluginRoot(pluginRoot),
  );
  if (!stateDir) {
    return null;
  }

  return {
    pluginRoot,
    stateDir,
    workspaceRoot: config.workspaceRoot,
    systemRoot: config.systemRoot,
    memoryRoot: config.memoryRoot,
    configPath: config.configPath,
    overwrite: config.overwrite === true,
    writeConfig: config.writeConfig !== false,
    bindings: Array.isArray(config.bindings) ? config.bindings : [],
    models: config.models && typeof config.models === "object" ? config.models : {},
  };
}

function maybeAutoSetup(api, pluginRoot) {
  const options = resolveAutoSetupOptions(api, pluginRoot);
  if (!options) {
    return null;
  }

  return setupOpenClaw(options);
}

function addCommanderOptions(command) {
  return command
    .option("--state-dir <path>", "OpenClaw state directory")
    .option("--workspace-root <path>", "Workspace root that will contain <agent>/ and system/")
    .option("--system-root <path>", "Shared system root that will contain memory, skills, tasks, policy, and scripts")
    .option("--memory-root <path>", "Shared memory workspace path")
    .option("--config-path <path>", "Path to openclaw.json")
    .option("--overwrite", "Overwrite managed files if they already exist")
    .option("--no-config", "Do not update openclaw.json")
    .option(
      "--bind <agent=channel[:accountId[:peerId]]>",
      "Add a routing binding for an agent; repeatable",
      (value, previous) => {
        previous.push(value);
        return previous;
      },
      [],
    )
    .option("--model-nyx <model>", "Override the default model for Nyx")
    .option("--model-medea <model>", "Override the default model for Medea")
    .option("--model-arx <model>", "Override the default model for Arx")
    .option("--model-lev <model>", "Override the default model for Lev")
    .option("--model-mnemo <model>", "Override the default model for Mnemo");
}

function optionsFromCommander(options, pluginRoot) {
  return {
    pluginRoot,
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
    systemRoot: options.systemRoot,
    memoryRoot: options.memoryRoot,
    configPath: options.configPath,
    overwrite: options.overwrite,
    writeConfig: options.config,
    bindings: options.bind,
    models: {
      nyx: options.modelNyx,
      medea: options.modelMedea,
      arx: options.modelArx,
      lev: options.modelLev,
      mnemo: options.modelMnemo,
    },
  };
}

function printSummary(result) {
  const lines = [
    "MemoryOS OpenClaw setup summary",
    `State dir: ${result.stateDir}`,
    `Workspace root: ${result.workspaceRoot}`,
    `Shared system root: ${result.systemRoot}`,
    `Shared memory root: ${result.memoryRoot}`,
    `Shared system files created: ${result.systemCreated.length}`,
    `Shared memory files created: ${result.memoryCreated.length}`,
  ];

  for (const agent of result.agents) {
    lines.push(
      `Agent ${agent.id}: ${agent.workspaceDir} (${agent.created.length} files created)`,
    );
  }

  if (result.config) {
    lines.push(
      `Config updated: ${result.config.path} (${result.config.agentCount} agents, ${result.config.bindingCount} bindings, changed: ${result.config.changed ? "yes" : "no"})`,
    );
    lines.push(
      `Config backup: ${result.config.backedUp ? `${result.config.path}.bak` : "not needed"}`,
    );
  } else {
    lines.push("Config updated: no");
  }

  lines.push(`Shared skill links created: ${result.sharedSkills.created.length}`);

  return lines.join("\n");
}

function log(api, level, message) {
  if (api && api.logger && typeof api.logger[level] === "function") {
    api.logger[level](message);
    return;
  }

  if (level === "error") {
    console.error(message);
    return;
  }

  console.log(message);
}

function registerOpenClawPlugin(api, pluginRoot) {
  if (api && typeof api.registerCli === "function") {
    api.registerCli(
      ({ program }) => {
        const memoryos = program
          .command("memoryos")
          .description("MemoryOS OpenClaw adapter utilities");

        addCommanderOptions(
          memoryos
            .command("setup")
            .description(
              "Scaffold MemoryOS shared system and OpenClaw agent workspaces",
            ),
        ).action((options) => {
          const result = setupOpenClaw(optionsFromCommander(options, pluginRoot));
          console.log(printSummary(result));
        });
      },
      { commands: ["memoryos"] },
    );
  }

  if (api && typeof api.registerService === "function") {
    api.registerService({
      name: "memoryos-openclaw-bootstrap",
      start() {
        try {
          const result = maybeAutoSetup(api, pluginRoot);
          if (!result) {
            return;
          }

          const createdCount =
            result.memoryCreated.length +
            result.sharedSkills.created.length +
            result.agentState.reduce((sum, agent) => sum + agent.created.length, 0) +
            result.agents.reduce((sum, agent) => sum + agent.created.length, 0);
          if (createdCount > 0 || (result.config && result.config.changed)) {
            log(
              api,
              "info",
              `[${PLUGIN_ID}] bootstrap completed for ${result.workspaceRoot}`,
            );
          }
        } catch (error) {
          log(api, "error", `[${PLUGIN_ID}] bootstrap failed: ${error.message}`);
        }
      },
    });
  }
}

module.exports = {
  PLUGIN_ID,
  PLUGIN_NAME,
  addCommanderOptions,
  maybeAutoSetup,
  optionsFromCommander,
  printSummary,
  registerOpenClawPlugin,
  resolveAutoSetupOptions,
  setupOpenClaw,
  getBundledSkillsRoot,
};

Object.defineProperty(module.exports, "PREDEFINED_AGENTS", {
  enumerable: true,
  get() {
    return loadMemoryAgents().PREDEFINED_AGENTS;
  },
});
