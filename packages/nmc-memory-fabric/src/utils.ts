import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const v = process.env[name];
    if (!v) {
      throw new Error(`Environment variable ${name} is not set`);
    }
    return v;
  });
}

export function expandHome(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

export function resolvePath(input: string): string {
  return resolve(expandEnvVars(expandHome(input)));
}

export function nowMs(): number {
  return Date.now();
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeScope(scope?: string): string {
  if (!scope || !scope.trim()) {
    return "global";
  }
  return scope.trim().toLowerCase();
}

export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function uniqBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
