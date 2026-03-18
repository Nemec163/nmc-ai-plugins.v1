#!/usr/bin/env node
/**
 * Minimal file-first kanban tooling with no external dependencies.
 *
 * This intentionally supports only a strict subset of YAML front matter:
 *   key: value
 *   key: "quoted value"
 *   key: [a, b, "c"]
 */

import fs from "node:fs/promises";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SYSTEM_DIR = path.resolve(SCRIPT_DIR, "..");
const TASKS_DIR = path.resolve(
  process.env.KANBAN_TASKS_DIR ?? path.join(SYSTEM_DIR, "tasks", "active"),
);
const SETTINGS_PATH = path.join(TASKS_DIR, ".kanban.json");

const DEFAULT_STATUS_ORDER = ["backlog", "planned", "in_progress", "blocked", "review", "done"];
const DEFAULT_PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const DEFAULT_BOARD_AUTONOMY = ["full", "partial", "ask", "none"];
const DEFAULT_BOARD_GIT_FLOW = ["main", "pr"];
const DEFAULT_CANON_KEYS = [
  "id",
  "title",
  "status",
  "priority",
  "git_flow",
  "autonomy",
  "owner",
  "next_action",
  "blocked_reason",
  "tags",
  "created_at",
  "updated_at",
];
let STATUS_ORDER = [...DEFAULT_STATUS_ORDER];
let PRIORITY_ORDER = { ...DEFAULT_PRIORITY_ORDER };
let BOARD_AUTONOMY = new Set(DEFAULT_BOARD_AUTONOMY);
let TASK_AUTONOMY = new Set(["inherit", ...BOARD_AUTONOMY]);
let BOARD_GIT_FLOW = new Set(DEFAULT_BOARD_GIT_FLOW);
let TASK_GIT_FLOW = new Set(["inherit", ...BOARD_GIT_FLOW]);
let CANON_KEYS = [...DEFAULT_CANON_KEYS];

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" || item instanceof String);
}

function coerceStringArray(value, fallback) {
  if (isStringArray(value) && value.length) {
    return value;
  }

  return fallback;
}

function coercePriorityOrder(value) {
  if (isStringArray(value) && value.length) {
    return value.reduce((acc, item, index) => {
      acc[item] = index;
      return acc;
    }, {});
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return null;
}

function toSet(items, fallback) {
  const normalized = coerceStringArray(items, null);
  return normalized ? new Set(normalized) : new Set(fallback);
}

async function loadMaintainerContract() {
  try {
    const loaded = await import("@nmc/memory-maintainer");
    const contract = loaded.default ?? loaded;
    if (!contract || typeof contract !== "object") {
      return;
    }

    const priorityOrder = coercePriorityOrder(contract.KANBAN_PRIORITY);

    STATUS_ORDER = coerceStringArray(contract.KANBAN_STATUS, DEFAULT_STATUS_ORDER);
    PRIORITY_ORDER = {
      ...DEFAULT_PRIORITY_ORDER,
      ...(typeof priorityOrder === "object" && priorityOrder && !Array.isArray(priorityOrder)
        ? priorityOrder
        : {}),
    };
    BOARD_AUTONOMY = toSet(contract.BOARD_AUTONOMY, DEFAULT_BOARD_AUTONOMY);
    TASK_AUTONOMY = toSet(
      contract.TASK_AUTONOMY,
      ["inherit", ...Array.from(BOARD_AUTONOMY)],
    );
    BOARD_GIT_FLOW = toSet(contract.BOARD_GIT_FLOW, DEFAULT_BOARD_GIT_FLOW);
    TASK_GIT_FLOW = toSet(
      contract.TASK_GIT_FLOW,
      ["inherit", ...Array.from(BOARD_GIT_FLOW)],
    );
    CANON_KEYS = coerceStringArray(
      contract.TASK_CANON_FRONTMATTER_KEYS,
      DEFAULT_CANON_KEYS,
    );
  } catch {
    return;
  }
}

function nowIsoDate() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function readSettings() {
  try {
    const text = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      gitFlow: parsed?.gitFlow ?? "main",
      autonomy_default: parsed?.autonomy_default ?? "full",
      updated_at: parsed?.updated_at ?? null,
    };
  } catch {
    return { gitFlow: "main", autonomy_default: "full", updated_at: null };
  }
}

async function writeSettings(partial) {
  const current = await readSettings();
  const next = {
    ...current,
    ...partial,
    updated_at: nowIsoDate(),
  };
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (!s) return "";
  if (
    (s.startsWith("\"") && s.endsWith("\"")) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function parseArray(raw) {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return null;
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((item) => parseScalar(item));
}

function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: text };
  const fm = text.slice(4, end).trimEnd();
  const body = text.slice(end + 5);
  const meta = {};

  for (const line of fm.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    const arr = parseArray(raw);
    meta[key] = arr ?? parseScalar(raw);
  }

  return { meta, body };
}

function orderedFrontMatterKeys(meta) {
  const seen = new Set();
  const out = [];

  for (const key of CANON_KEYS) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) {
      out.push(key);
      seen.add(key);
    }
  }

  const extras = Object.keys(meta)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b));

  return out.concat(extras);
}

function renderFrontMatter(meta) {
  const lines = [];

  for (const key of orderedFrontMatterKeys(meta)) {
    const value = meta[key];
    if (Array.isArray(value)) {
      const items = value.map((item) => JSON.stringify(String(item)));
      lines.push(`${key}: [${items.join(", ")}]`);
      continue;
    }

    if (value === null) {
      lines.push(`${key}: null`);
      continue;
    }

    const scalar = String(value ?? "");
    const needsQuote = /[:\n\[\]\{\},#]|^\s|\s$/.test(scalar) || scalar === "";
    lines.push(`${key}: ${needsQuote ? JSON.stringify(scalar) : scalar}`);
  }

  return `---\n${lines.join("\n")}\n---\n`;
}

function normalizeTask(meta, settings) {
  const autonomy = meta.autonomy ?? "inherit";
  const gitFlow = meta.git_flow ?? "inherit";

  return {
    autonomy,
    git_flow: gitFlow,
    effective_autonomy:
      autonomy === "inherit" ? settings.autonomy_default ?? "full" : autonomy,
    effective_git_flow: gitFlow === "inherit" ? settings.gitFlow ?? "main" : gitFlow,
  };
}

async function readAllTasks() {
  let files;
  try {
    files = await fs.readdir(TASKS_DIR);
  } catch {
    return { tasks: [], settings: await readSettings() };
  }

  const settings = await readSettings();
  const tasks = [];

  for (const file of files) {
    if (!/^T-\d+.*\.md$/.test(file)) continue;
    const taskPath = path.join(TASKS_DIR, file);
    const text = await fs.readFile(taskPath, "utf8");
    const { meta, body } = parseFrontMatter(text);
    const normalized = normalizeTask(meta, settings);
    const id = meta.id ?? file.replace(/\.md$/, "");

    tasks.push({
      file,
      path: taskPath,
      id,
      meta,
      body,
      title: meta.title ?? "",
      status: meta.status ?? "backlog",
      priority: meta.priority ?? "P2",
      autonomy: normalized.autonomy,
      effective_autonomy: normalized.effective_autonomy,
      git_flow: normalized.git_flow,
      effective_git_flow: normalized.effective_git_flow,
      owner: meta.owner ?? null,
      next_action: meta.next_action ?? null,
      updated_at: meta.updated_at ?? "",
    });
  }

  return { tasks, settings };
}

function scoreTask(task) {
  const priority = PRIORITY_ORDER[task.priority] ?? 9;
  const updatedAt = task.updated_at || "0000-00-00";
  return `${String(priority).padStart(2, "0")}|${updatedAt}|${task.id}`;
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => scoreTask(a).localeCompare(scoreTask(b)));
}

function normalizeTaskMutation(existingMeta, partialMeta) {
  const next = { ...existingMeta, ...partialMeta };

  if (next.status === "done") {
    next.next_action = null;
    next.blocked_reason = null;
  } else if (next.status !== "blocked" && !Object.hasOwn(partialMeta, "blocked_reason")) {
    next.blocked_reason = null;
  }

  if (typeof next.next_action === "string" && next.next_action.trim() === "") {
    next.next_action = null;
  }
  if (typeof next.blocked_reason === "string" && next.blocked_reason.trim() === "") {
    next.blocked_reason = null;
  }
  if (typeof next.owner === "string" && next.owner.trim() === "") {
    next.owner = null;
  }

  next.updated_at = nowIsoDate();
  return next;
}

async function writeTask(task, partialMeta, newBody = task.body) {
  const meta = normalizeTaskMutation(task.meta, partialMeta);
  const out = renderFrontMatter(meta) + newBody.replace(/^\n+/, "\n");
  await fs.writeFile(task.path, out, "utf8");
  return meta;
}

function arg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function has(flag) {
  return process.argv.includes(flag);
}

function requireChoice(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

async function findTask(id) {
  const { tasks } = await readAllTasks();
  const task = tasks.find((item) => item.id === id || item.file.startsWith(id));
  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }
  return task;
}

async function cmdSummary() {
  const { tasks, settings } = await readAllTasks();
  const byOwnerStatus = {};

  for (const task of tasks) {
    const key = `${task.owner ?? "unassigned"}:${task.status}`;
    byOwnerStatus[key] = (byOwnerStatus[key] ?? 0) + 1;
  }

  const totals = { total: tasks.length };
  for (const status of STATUS_ORDER) {
    totals[status] = tasks.filter((task) => task.status === status).length;
  }

  const payload = {
    systemDir: SYSTEM_DIR,
    tasksDir: TASKS_DIR,
    settings,
    totals,
    byOwnerStatus,
  };

  if (has("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Kanban @ ${SYSTEM_DIR}`);
  console.log(`Autonomy default: ${settings.autonomy_default}`);
  console.log(`Git flow default: ${settings.gitFlow}`);
  console.log("Totals:", totals);
}

async function cmdSettings() {
  const settings = await readSettings();
  if (has("--json")) {
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  console.log(`gitFlow=${settings.gitFlow}`);
  console.log(`autonomy_default=${settings.autonomy_default}`);
  if (settings.updated_at) {
    console.log(`updated_at=${settings.updated_at}`);
  }
}

async function cmdList() {
  const { tasks, settings } = await readAllTasks();
  const owner = arg("--owner");
  const status = arg("--status");
  const filtered = sortTasks(tasks).filter((task) => {
    if (owner && task.owner !== owner) return false;
    if (status && task.status !== status) return false;
    return true;
  });

  if (has("--json")) {
    console.log(
      JSON.stringify(
        {
          settings,
          items: filtered.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            autonomy: task.autonomy,
            effective_autonomy: task.effective_autonomy,
            git_flow: task.git_flow,
            effective_git_flow: task.effective_git_flow,
            owner: task.owner,
            next_action: task.next_action,
            blocked_reason: task.meta.blocked_reason ?? null,
            file: task.file,
            updated_at: task.updated_at,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const taskStatus of STATUS_ORDER) {
    const group = filtered.filter((task) => task.status === taskStatus);
    if (!group.length) continue;
    console.log(`\n## ${taskStatus}`);
    for (const task of group) {
      console.log(
        `- ${task.id} [${task.priority}] (${task.owner ?? "unassigned"}) ${task.title}`,
      );
      if (task.next_action) {
        console.log(`  next: ${task.next_action}`);
      }
      console.log(
        `  autonomy: ${task.autonomy} -> ${task.effective_autonomy}, git: ${task.git_flow} -> ${task.effective_git_flow}`,
      );
    }
  }
}

async function cmdNext() {
  const { tasks, settings } = await readAllTasks();
  const owner = arg("--owner");
  const pool = owner ? tasks.filter((task) => task.owner === owner) : tasks;
  const ordered = sortTasks(pool);
  const pick =
    ordered.find((task) => task.status === "in_progress") ??
    ordered.find((task) => task.status === "planned") ??
    null;

  const payload = pick
    ? {
        id: pick.id,
        title: pick.title,
        status: pick.status,
        priority: pick.priority,
        autonomy: pick.autonomy,
        effective_autonomy: pick.effective_autonomy,
        git_flow: pick.git_flow,
        effective_git_flow: pick.effective_git_flow,
        owner: pick.owner,
        next_action: pick.next_action,
        blocked_reason: pick.meta.blocked_reason ?? null,
        file: pick.file,
        settings,
      }
    : null;

  if (has("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(
    payload
      ? `${payload.id} ${payload.title} :: ${payload.next_action || "(no next_action)"}`
      : "NO_TASK",
  );
}

async function cmdSetStatus() {
  const id = process.argv[3];
  const status = process.argv[4];
  if (!id || !status) {
    throw new Error("Usage: set-status <id> <status>");
  }
  if (!STATUS_ORDER.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const task = await findTask(id);
  await writeTask(task, { status });
  console.log("OK");
}

async function cmdSetNext() {
  const id = process.argv[3];
  if (!id) {
    throw new Error("Usage: set-next <id> <next_action...>");
  }
  const nextAction = process.argv.slice(4).join(" ").trim() || null;
  const task = await findTask(id);
  await writeTask(task, { next_action: nextAction });
  console.log("OK");
}

async function cmdSetOwner() {
  const id = process.argv[3];
  const owner = process.argv[4];
  if (!id) {
    throw new Error("Usage: set-owner <id> <owner>");
  }
  const task = await findTask(id);
  await writeTask(task, { owner: owner ?? null });
  console.log("OK");
}

async function cmdSetBlockedReason() {
  const id = process.argv[3];
  if (!id) {
    throw new Error("Usage: set-blocked-reason <id> <blocked_reason...>");
  }
  const reason = process.argv.slice(4).join(" ").trim() || null;
  const task = await findTask(id);
  await writeTask(task, { blocked_reason: reason, status: reason ? "blocked" : task.status });
  console.log("OK");
}

async function cmdSetAutonomy() {
  const id = process.argv[3];
  const autonomy = process.argv[4];
  if (!id || !autonomy) {
    throw new Error("Usage: set-autonomy <id> <inherit|full|partial|ask|none>");
  }
  requireChoice(autonomy, TASK_AUTONOMY, "autonomy");
  const task = await findTask(id);
  await writeTask(task, { autonomy });
  console.log("OK");
}

async function cmdSetGitFlow() {
  const id = process.argv[3];
  const gitFlow = process.argv[4];
  if (!id || !gitFlow) {
    throw new Error("Usage: set-git-flow <id> <inherit|main|pr>");
  }
  requireChoice(gitFlow, TASK_GIT_FLOW, "git_flow");
  const task = await findTask(id);
  await writeTask(task, { git_flow: gitFlow });
  console.log("OK");
}

async function cmdSetBoardAutonomy() {
  const autonomy = process.argv[3];
  if (!autonomy) {
    throw new Error("Usage: set-board-autonomy <full|partial|ask|none>");
  }
  requireChoice(autonomy, BOARD_AUTONOMY, "board autonomy");
  await writeSettings({ autonomy_default: autonomy });
  console.log("OK");
}

async function cmdSetBoardGitFlow() {
  const gitFlow = process.argv[3];
  if (!gitFlow) {
    throw new Error("Usage: set-board-git-flow <main|pr>");
  }
  requireChoice(gitFlow, BOARD_GIT_FLOW, "board gitFlow");
  await writeSettings({ gitFlow });
  console.log("OK");
}

async function main() {
  await loadMaintainerContract();

  const cmd = process.argv[2];
  switch (cmd) {
    case "summary":
      return cmdSummary();
    case "settings":
      return cmdSettings();
    case "list":
      return cmdList();
    case "next":
      return cmdNext();
    case "set-status":
      return cmdSetStatus();
    case "set-next":
      return cmdSetNext();
    case "set-owner":
      return cmdSetOwner();
    case "set-blocked-reason":
      return cmdSetBlockedReason();
    case "set-autonomy":
      return cmdSetAutonomy();
    case "set-git-flow":
      return cmdSetGitFlow();
    case "set-board-autonomy":
      return cmdSetBoardAutonomy();
    case "set-board-git-flow":
      return cmdSetBoardGitFlow();
    default:
      console.error(
        "Usage: kanban.mjs <summary|settings|list|next|set-status|set-next|set-owner|set-blocked-reason|set-autonomy|set-git-flow|set-board-autonomy|set-board-git-flow> [--json] [--owner <id>] [--status <status>]",
      );
      process.exit(2);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
