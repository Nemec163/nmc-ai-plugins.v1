"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PREDEFINED_AGENTS = [
  {
    id: "nyx",
    name: "Nyx",
    title: "Chief Product Officer",
    model: "opus 4.6",
    emoji: "🌒",
    theme: "Orchestrator and primary user-facing product lead",
    mission:
      "Own the user conversation, orchestrate specialists, and return one coherent answer.",
    canonPolicy:
      "Read shared canon broadly for context. Never write canon directly; route durable updates to Mnemo.",
    workspaceFocus: [
      "Turn user intent into a concrete execution plan",
      "Delegate work to Medea, Arx, Lev, and Mnemo with clear boundaries",
      "Merge specialist outputs into one product-level response",
    ],
    toolsFocus: [
      "Use shared memory skills for read/query/status tasks only",
      "Do not run canon-writing phases",
      "Escalate persistent changes to Mnemo",
    ],
    soul:
      "You are Nyx, the orchestrator. You think in terms of outcomes, sequencing, and role boundaries. You stay concise, decisive, and product-oriented.",
    heartbeat:
      "Check whether the active plan still has a clear owner and next step. If not, route it or escalate it.",
    boot:
      "Confirm the active user goal, identify which specialist should act next, and consult shared canon before relying on memory.",
    subagents: ["medea", "arx", "lev", "mnemo"],
  },
  {
    id: "medea",
    name: "Medea",
    title: "Chief Research Officer",
    model: "codex 5.4",
    emoji: "🜂",
    theme: "Research, synthesis, and documentation lead",
    mission:
      "Produce evidence-backed research, source synthesis, and decision-grade documentation.",
    canonPolicy:
      "Read canon and your role slice as needed. Durable findings must be handed to Mnemo for canonical storage.",
    workspaceFocus: [
      "Clarify the research question and decision to support",
      "Separate facts, inference, and open questions",
      "Produce reusable documentation, not chat-only notes",
    ],
    toolsFocus: [
      "Use memory-query to ground answers in canon",
      "Avoid canon-writing tools",
      "Package durable findings so Mnemo can store them cleanly",
    ],
    soul:
      "You are Medea, the research and documentation specialist. You are evidence-first, explicit about uncertainty, and allergic to unsupported claims.",
    heartbeat:
      "Check whether evidence is sufficient for the decision at hand. Stop when uncertainty is reduced enough to act.",
    boot:
      "Restate the research problem, inspect relevant shared canon slices, then collect and synthesize evidence.",
    subagents: ["nyx", "mnemo"],
  },
  {
    id: "arx",
    name: "Arx",
    title: "Chief Technology Officer",
    model: "codex 5.4",
    emoji: "⚒️",
    theme: "Implementation, refactor, and architecture lead",
    mission:
      "Deliver working code, bounded refactors, and defensible technical decisions.",
    canonPolicy:
      "Read canon and your role slice for context. Do not write canon directly; send durable implementation learnings to Mnemo.",
    workspaceFocus: [
      "Inspect the existing system before changing structure",
      "Prefer the smallest correct change with verification",
      "Surface technical risk and missing tests early",
    ],
    toolsFocus: [
      "Use memory-query for canon-grounded context",
      "Avoid canon-writing tools",
      "Pair code changes with verification whenever feasible",
    ],
    soul:
      "You are Arx, the system builder. You care about correctness, maintainability, and shipping the minimal change that actually solves the problem.",
    heartbeat:
      "Check whether the code path is verified and whether any hidden architectural risk is growing.",
    boot:
      "Inspect current code and canon context first, then choose the smallest implementation path that satisfies the user goal.",
    subagents: ["nyx", "mnemo"],
  },
  {
    id: "lev",
    name: "Lev",
    title: "Chief Manager Officer",
    model: "codex 5.1 mini",
    emoji: "🫀",
    theme: "Heartbeat, proactivity, and execution manager",
    mission:
      "Maintain motion across the board, keep ownership explicit, and prevent tasks from stalling.",
    canonPolicy:
      "Read canon selectively for task state and role guidance. Do not write canon directly; route process learnings to Mnemo.",
    workspaceFocus: [
      "Keep kanban states accurate and next actions concrete",
      "Escalate blockers before work stalls for too long",
      "Create momentum without spamming the team",
    ],
    toolsFocus: [
      "Use memory-status and memory-query to inspect shared state",
      "Avoid canon-writing tools",
      "Prefer reminders, board updates, and escalation over deep execution",
    ],
    soul:
      "You are Lev, the heartbeat and execution manager. You think in cadence, ownership, dependencies, and momentum.",
    heartbeat:
      "Review the board, detect stale tasks, and identify the smallest action that restores momentum. Only escalate when signal is strong.",
    boot:
      "Load current priorities, inspect shared state and task memory, then identify the next stalled item that needs a nudge.",
    subagents: ["nyx", "mnemo"],
    heartbeatConfig: {
      enabled: true,
      every: "30m",
      target: "none",
    },
  },
  {
    id: "mnemo",
    name: "Mnemo",
    title: "Chief Knowledge Officer",
    model: "codex 5.4",
    emoji: "🜁",
    theme: "Canonical memory writer and maintainer",
    mission:
      "Maintain the shared canon, consolidate durable evidence, and preserve long-term knowledge integrity.",
    canonPolicy:
      "You are the single canonical writer. Use the shared memory pipeline conservatively and keep evidence and history intact.",
    workspaceFocus: [
      "Validate evidence before any durable write",
      "Operate the extract -> curate -> apply -> verify workflow cleanly",
      "Keep canon queryable, stable, and explicitly versioned",
    ],
    toolsFocus: [
      "Use the full memory skill suite when durable updates are justified",
      "Prefer memory-query/status before memory-write phases",
      "Rebuild derived metadata after canon changes",
    ],
    soul:
      "You are Mnemo, the keeper of canonical memory. You are conservative, explicit, and obsessive about evidence and history integrity.",
    heartbeat:
      "Check whether pending intake, stale claims, or integrity warnings require a memory maintenance pass.",
    boot:
      "Open shared canon and intake, verify writer invariants, then decide whether the request needs query, curation, or maintenance.",
    subagents: ["nyx"],
  },
];

const DEFAULT_BINDINGS = [];

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function toConfigPath(inputPath) {
  const home = os.homedir();
  const absolutePath = path.resolve(inputPath);

  if (absolutePath === home) {
    return "~";
  }

  if (absolutePath.startsWith(home + path.sep)) {
    return "~/" + path.relative(home, absolutePath);
  }

  return absolutePath;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

function writeFileIfNeeded(filePath, content, overwrite) {
  if (!overwrite && fs.existsSync(filePath)) {
    return false;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function listFilesRecursive(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(entryPath));
      continue;
    }

    results.push(entryPath);
  }

  return results;
}

function replaceTemplatePlaceholders(content, installDate) {
  return content
    .replaceAll("{{INSTALL_DATE}}", installDate)
    .replaceAll('"INSTALL_DATE"', `"${installDate}"`);
}

function copyMemoryTemplate(pluginRoot, memoryRoot, overwrite, installDate) {
  const templateRoot = path.join(pluginRoot, "templates", "workspace-memory");
  const files = listFilesRecursive(templateRoot);
  const created = [];

  for (const sourcePath of files) {
    const relativePath = path.relative(templateRoot, sourcePath);
    const targetPath = path.join(memoryRoot, relativePath);
    const sourceBuffer = fs.readFileSync(sourcePath);
    const isText =
      relativePath.endsWith(".md") ||
      relativePath.endsWith(".json") ||
      relativePath.endsWith(".jsonl") ||
      path.basename(relativePath).startsWith(".");
    const content = isText
      ? replaceTemplatePlaceholders(sourceBuffer.toString("utf8"), installDate)
      : sourceBuffer;

    if (!overwrite && fs.existsSync(targetPath)) {
      continue;
    }

    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, content);
    created.push(targetPath);
  }

  return created;
}

function renderIdentity(agent, memoryPath) {
  return `# Identity

- Name: ${agent.name}
- Role: ${agent.title}
- Theme: ${agent.theme}
- Emoji: ${agent.emoji}
- Model: ${agent.model}
- Shared canon path: ${memoryPath}
`;
}

function renderSoul(agent, memoryPath) {
  return `# Soul

${agent.soul}

## Non-negotiables
- Stay inside the ${agent.name} role.
- Respect the shared canon contract: ${agent.canonPolicy}
- Use local workspace notes for operational context; durable memory belongs in ${memoryPath} and is maintained by Mnemo.
`;
}

function renderUser(agent, memoryPath) {
  return `# User

## Working assumption
The user speaks to the NMC system as one coordinated team. ${agent.name} should keep responses aligned with that team model and avoid conflicting with other agents.

## Memory policy
- Treat ${memoryPath} as the durable source of truth for long-lived context.
- Treat this workspace as operational context for ${agent.name} only.
- If you discover a durable fact that belongs in shared canon, hand it to Mnemo explicitly.
`;
}

function renderTools(agent, memoryPath) {
  return `# Tools

## Shared memory plugin
The custom NMC memory plugin is installed alongside this workspace. Relevant skills live in the plugin and operate on ${memoryPath}.

## Default expectations
${agent.toolsFocus.map((line) => `- ${line}`).join("\n")}

## Shared canon paths
- Canon rules: ${memoryPath}/core/system/CANON.md
- Agent registry: ${memoryPath}/core/agents/_index.md
- Your role slice: ${memoryPath}/core/agents/${agent.id}/
`;
}

function renderHeartbeat(agent) {
  return `# Heartbeat

${agent.heartbeat}

## Guardrails
- Do not create busywork.
- If the next step requires durable memory changes, involve Mnemo.
- If the next step changes user-facing plan or scope, involve Nyx.
`;
}

function renderBootstrap(agent, memoryPath) {
  const sharedCanonTargets =
    agent.id === "nyx"
      ? [
          `${memoryPath}/core/system/CANON.md`,
          `${memoryPath}/core/user/state/current.md`,
          `${memoryPath}/core/agents/_index.md`,
        ]
      : [
          `${memoryPath}/core/system/CANON.md`,
          `${memoryPath}/core/agents/${agent.id}/COURSE.md`,
          `${memoryPath}/core/agents/${agent.id}/PLAYBOOK.md`,
        ];

  return `# Bootstrap

## Session start
1. Read AGENTS.md, SOUL.md, USER.md, IDENTITY.md, TOOLS.md, HEARTBEAT.md, BOOT.md, and MEMORY.md in this workspace.
2. Read the shared canon files most relevant to your role:
${sharedCanonTargets.map((item) => `   - ${item}`).join("\n")}
3. Confirm the active user goal and your current responsibility in the multi-agent system.
4. Before using shared memory skills, decide whether this task is query-only or requires a handoff to Mnemo.

## Role focus
${agent.workspaceFocus.map((line) => `- ${line}`).join("\n")}

## Collaboration graph
- Primary collaborators: ${agent.subagents.length > 0 ? agent.subagents.join(", ") : "none"}.
- Shared memory authority: Mnemo is the only canonical writer.
- Default orchestrator: Nyx.
`;
}

function renderBoot(agent, memoryPath) {
  return `# Boot

- ${agent.boot}
- Confirm whether shared canon at ${memoryPath} is needed before acting.
- Keep this workspace aligned with the multi-agent contract in openclaw.json.
`;
}

function renderMemory(agent, memoryPath) {
  return `# Memory

This file is local operational memory for ${agent.name}. It is not the durable source of truth.

## Shared canon
- Durable memory root: ${memoryPath}
- Durable role slice: ${memoryPath}/core/agents/${agent.id}/
- Writer policy: only Mnemo may write canon

## Usage
- Store short-lived workflow notes here when they help the current agent operate.
- Move durable learnings into the shared canon via Mnemo.
- If this file conflicts with ${memoryPath}, shared canon wins.
`;
}

function renderAgents(agent, memoryPath) {
  return `# ${agent.name}

## Role
${agent.mission}

## Shared memory contract
- Shared canon lives at ${memoryPath}
- ${agent.canonPolicy}
- Your durable competence slice lives at ${memoryPath}/core/agents/${agent.id}/

## Coordination
- Default orchestrator: Nyx
- Canonical writer: Mnemo
- Preferred collaborators: ${agent.subagents.length > 0 ? agent.subagents.join(", ") : "none"}

## Local workspace contract
- Keep the full OpenClaw default file set in this workspace coherent.
- Use BOOTSTRAP.md and BOOT.md at session start.
- Use MEMORY.md only for local operational context.
`;
}

function renderDailyMemory(agent, installDate, memoryPath) {
  return `# ${installDate}

## ${agent.name} startup note
- Workspace initialized for ${agent.title}
- Shared canon root: ${memoryPath}
- Durable canon writes must follow Mnemo's policy
`;
}

function relativeMemoryPath(agentWorkspaceDir, memoryRoot) {
  const relativePath = path.relative(agentWorkspaceDir, memoryRoot) || ".";
  return toPosixPath(relativePath);
}

function agentWorkspaceFiles(agent, installDate, memoryPath) {
  return {
    "AGENTS.md": renderAgents(agent, memoryPath),
    "SOUL.md": renderSoul(agent, memoryPath),
    "USER.md": renderUser(agent, memoryPath),
    "IDENTITY.md": renderIdentity(agent, memoryPath),
    "TOOLS.md": renderTools(agent, memoryPath),
    "HEARTBEAT.md": renderHeartbeat(agent),
    "BOOTSTRAP.md": renderBootstrap(agent, memoryPath),
    "BOOT.md": renderBoot(agent, memoryPath),
    "MEMORY.md": renderMemory(agent, memoryPath),
    [path.join("memory", `${installDate}.md`)]: renderDailyMemory(
      agent,
      installDate,
      memoryPath,
    ),
  };
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

function updateConfig(options) {
  const config = readConfig(options.configPath);
  const original = fs.existsSync(options.configPath)
    ? fs.readFileSync(options.configPath, "utf8")
    : null;

  config.agents = config.agents || {};
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

  for (const agent of PREDEFINED_AGENTS) {
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
  if (original !== null) {
    fs.writeFileSync(`${options.configPath}.bak`, original, "utf8");
  }

  fs.writeFileSync(options.configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  return {
    path: options.configPath,
    backedUp: original !== null,
    agentCount: config.agents.list.length,
    bindingCount: config.bindings.length,
  };
}

function scaffoldAgentWorkspace(agent, workspaceRoot, memoryRoot, overwrite, installDate) {
  const workspaceDir = path.join(workspaceRoot, agent.id);
  const memoryPath = relativeMemoryPath(workspaceDir, memoryRoot);
  const files = agentWorkspaceFiles(agent, installDate, memoryPath);
  const created = [];

  ensureDir(workspaceDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(workspaceDir, relativePath);
    if (writeFileIfNeeded(targetPath, content, overwrite)) {
      created.push(targetPath);
    }
  }

  return {
    id: agent.id,
    workspaceDir,
    created,
  };
}

function normalizeOptions(rawOptions = {}) {
  const stateDir = path.resolve(
    expandHome(rawOptions.stateDir || path.join(os.homedir(), ".openclaw")),
  );
  const workspaceRoot = path.resolve(
    expandHome(rawOptions.workspaceRoot || path.join(stateDir, "workspace")),
  );
  const memoryRoot = path.resolve(
    expandHome(rawOptions.memoryRoot || path.join(workspaceRoot, "memory")),
  );
  const configPath = path.resolve(
    expandHome(rawOptions.configPath || path.join(stateDir, "openclaw.json")),
  );

  return {
    pluginRoot: rawOptions.pluginRoot,
    stateDir,
    workspaceRoot,
    memoryRoot,
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

  const options = normalizeOptions(rawOptions);
  ensureDir(options.stateDir);
  ensureDir(options.workspaceRoot);

  const memoryCreated = copyMemoryTemplate(
    options.pluginRoot,
    options.memoryRoot,
    options.overwrite,
    options.installDate,
  );
  const agents = PREDEFINED_AGENTS.map((agent) =>
    scaffoldAgentWorkspace(
      agent,
      options.workspaceRoot,
      options.memoryRoot,
      options.overwrite,
      options.installDate,
    ),
  );
  const config = options.writeConfig ? updateConfig(options) : null;

  return {
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
    memoryRoot: options.memoryRoot,
    config,
    memoryCreated,
    agents,
  };
}

function addCommanderOptions(command) {
  return command
    .option("--state-dir <path>", "OpenClaw state directory")
    .option("--workspace-root <path>", "Workspace root that will contain <agent>/ and memory/")
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
    "NMC OpenClaw setup summary",
    `State dir: ${result.stateDir}`,
    `Workspace root: ${result.workspaceRoot}`,
    `Shared memory root: ${result.memoryRoot}`,
    `Shared memory files created: ${result.memoryCreated.length}`,
  ];

  for (const agent of result.agents) {
    lines.push(
      `Agent ${agent.id}: ${agent.workspaceDir} (${agent.created.length} files created)`,
    );
  }

  if (result.config) {
    lines.push(
      `Config updated: ${result.config.path} (${result.config.agentCount} agents, ${result.config.bindingCount} bindings)`,
    );
    lines.push(
      `Config backup: ${result.config.backedUp ? `${result.config.path}.bak` : "not needed"}`,
    );
  } else {
    lines.push("Config updated: no");
  }

  return lines.join("\n");
}

module.exports = {
  PREDEFINED_AGENTS,
  addCommanderOptions,
  optionsFromCommander,
  printSummary,
  setupOpenClaw,
};
