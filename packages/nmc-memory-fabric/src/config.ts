import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { DEFAULT_QMD_ALLOWLIST } from "./qmd-store.js";
import { MEMORY_LAYERS, type AccessLevel, type MemoryLayer } from "./acl.js";
import { resolvePath } from "./utils.js";

export type FabricConfig = {
  stateDir: string;
  openclawConfigPath: string;
  workspaceRoot: string;
  autoRecall: boolean;
  autoCapture: boolean;
  autoRecallPrincipal: string;
  autoRecallActorLevel: AccessLevel;
  autoRecallLayers: MemoryLayer[];
  autoRecallMaxContextChars: number;
  embedding: {
    apiKey: string;
    model: string;
  };
  qmd: {
    enabled: boolean;
    paths: string[];
    exclude: string[];
  };
};

const DEFAULTS = {
  stateDir: join(homedir(), ".openclaw", "nmc-ai-plugins"),
  openclawConfigPath: join(homedir(), ".openclaw", "openclaw.json"),
  workspaceRoot: join(homedir(), ".openclaw", "workspace"),
  embeddingModel: "text-embedding-3-small",
  autoRecallPrincipal: "system:auto-recall",
  autoRecallActorLevel: "A4_orchestrator_full" as AccessLevel,
  autoRecallLayers: [
    "M1_local",
    "M2_domain",
    "M4_global_facts",
  ] as MemoryLayer[],
  autoRecallMaxContextChars: 1800,
};

const DEFAULT_EXCLUDES = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**"];

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) throw new Error(`Environment variable ${envVar} is not set`);
    return envValue;
  });
}

function readOpenClawMemoryConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    return parsed?.memory && typeof parsed.memory === "object"
      ? (parsed.memory as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function resolveQmdPath(input: string, workspaceRoot: string, openclawConfigPath: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === ".") return workspaceRoot;
  if (trimmed.startsWith("~/") || trimmed.startsWith("${") || isAbsolute(trimmed)) {
    return resolvePath(trimmed);
  }
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return resolvePath(join(dirname(openclawConfigPath), trimmed));
  }
  return resolvePath(join(workspaceRoot, trimmed));
}

export function parseConfig(raw: unknown): FabricConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    raw = {};
  }
  const cfg = raw as Record<string, unknown>;

  const stateDir = resolvePath(typeof cfg.stateDir === "string" ? cfg.stateDir : DEFAULTS.stateDir);
  const openclawConfigPath = resolvePath(
    typeof cfg.openclawConfigPath === "string" ? cfg.openclawConfigPath : DEFAULTS.openclawConfigPath,
  );
  const workspaceRoot = resolvePath(
    typeof cfg.workspaceRoot === "string" ? cfg.workspaceRoot : DEFAULTS.workspaceRoot,
  );
  const memoryCfg = readOpenClawMemoryConfig(openclawConfigPath);
  const memoryQmd = (memoryCfg.qmd ?? {}) as Record<string, unknown>;

  const embeddingRaw = (cfg.embedding ?? {}) as Record<string, unknown>;
  const embeddingApiKeyRaw = typeof embeddingRaw.apiKey === "string" ? embeddingRaw.apiKey : "${OPENAI_API_KEY}";
  const pluginQmd = (cfg.qmd ?? {}) as Record<string, unknown>;
  const autoRecallLayers = Array.isArray(cfg.autoRecallLayers)
    ? cfg.autoRecallLayers.filter(
        (v): v is MemoryLayer => typeof v === "string" && MEMORY_LAYERS.includes(v as MemoryLayer),
      )
    : DEFAULTS.autoRecallLayers;
  const autoRecallMaxContextChars = typeof cfg.autoRecallMaxContextChars === "number"
    ? Math.max(256, Math.min(6000, Math.trunc(cfg.autoRecallMaxContextChars)))
    : DEFAULTS.autoRecallMaxContextChars;

  const rawPaths = Array.isArray(pluginQmd.paths)
    ? pluginQmd.paths
    : Array.isArray(memoryQmd.paths)
      ? memoryQmd.paths
      : DEFAULT_QMD_ALLOWLIST;
  const rawExclude = Array.isArray(pluginQmd.exclude)
    ? pluginQmd.exclude
    : Array.isArray(memoryQmd.exclude)
      ? memoryQmd.exclude
      : DEFAULT_EXCLUDES;

  return {
    stateDir,
    openclawConfigPath,
    workspaceRoot,
    autoRecall: cfg.autoRecall !== false,
    autoCapture: cfg.autoCapture !== false,
    autoRecallPrincipal:
      typeof cfg.autoRecallPrincipal === "string" && cfg.autoRecallPrincipal.trim()
        ? cfg.autoRecallPrincipal.trim()
        : DEFAULTS.autoRecallPrincipal,
    autoRecallActorLevel:
      typeof cfg.autoRecallActorLevel === "string" && cfg.autoRecallActorLevel.trim()
        ? (cfg.autoRecallActorLevel.trim() as AccessLevel)
        : DEFAULTS.autoRecallActorLevel,
    autoRecallLayers: autoRecallLayers.length ? autoRecallLayers : DEFAULTS.autoRecallLayers,
    autoRecallMaxContextChars,
    embedding: {
      apiKey: resolveEnvVars(embeddingApiKeyRaw),
      model: typeof embeddingRaw.model === "string" ? embeddingRaw.model : DEFAULTS.embeddingModel,
    },
    qmd: {
      enabled:
        typeof pluginQmd.enabled === "boolean"
          ? (pluginQmd.enabled as boolean)
          : typeof memoryCfg.backend === "string"
            ? memoryCfg.backend === "qmd"
            : true,
      paths: (rawPaths as unknown[])
        .filter((v) => typeof v === "string")
        .map((v) => resolveQmdPath(v as string, workspaceRoot, openclawConfigPath)),
      exclude: (rawExclude as unknown[]).filter((v) => typeof v === "string").map((v) => v as string),
    },
  };
}
