import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type LifecycleConfig = {
  stateDir: string;
  openclawConfigPath: string;
  workspaceRoot: string;
  templatesDir: string;
  factsDbPath: string;
  vectorsPath: string;
};

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const v = process.env[name];
    if (!v) throw new Error(`Environment variable ${name} is not set`);
    return v;
  });
}

function resolvePath(input: string): string {
  const expanded = input.startsWith("~/") ? join(homedir(), input.slice(2)) : input;
  return resolve(resolveEnvVars(expanded));
}

export function parseConfig(raw: unknown, pluginRoot: string): LifecycleConfig {
  const cfg = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const stateDir = resolvePath(
    typeof cfg.stateDir === "string"
      ? cfg.stateDir
      : join(homedir(), ".openclaw", "nmc-ai-plugins"),
  );

  return {
    stateDir,
    openclawConfigPath: resolvePath(
      typeof cfg.openclawConfigPath === "string"
        ? cfg.openclawConfigPath
        : join(homedir(), ".openclaw", "openclaw.json"),
    ),
    workspaceRoot: resolvePath(
      typeof cfg.workspaceRoot === "string"
        ? cfg.workspaceRoot
        : join(homedir(), ".openclaw", "workspace"),
    ),
    templatesDir: resolvePath(
      typeof cfg.templatesDir === "string"
        ? cfg.templatesDir
        : join(pluginRoot, "..", "..", "..", "templates", "agent-md"),
    ),
    factsDbPath: resolvePath(
      typeof cfg.factsDbPath === "string"
        ? cfg.factsDbPath
        : join(stateDir, "memory", "facts.sqlite"),
    ),
    vectorsPath: resolvePath(
      typeof cfg.vectorsPath === "string"
        ? cfg.vectorsPath
        : join(stateDir, "memory", "vectors"),
    ),
  };
}
