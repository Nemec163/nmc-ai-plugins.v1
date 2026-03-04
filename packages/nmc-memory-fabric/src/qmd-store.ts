import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { MemoryLayer } from "./acl.js";
import { normalizeScope } from "./utils.js";

export const DEFAULT_QMD_ALLOWLIST = [
  ".",
  "system/docs",
  "system/policy",
  "system/tasks",
  "system/skills",
  "nmc/research",
];

export type QmdHit = {
  id: string;
  text: string;
  score: number;
  layer: MemoryLayer;
  reason: string;
  citation: string;
  scope: string;
  backend: "qmd";
};

function normalizeFsPath(input: string): string {
  return input.replace(/\\/g, "/");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeFsPath(pattern);
  let out = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      out += ".*";
      i += 1;
      continue;
    }
    if (ch === "*") {
      out += "[^/]*";
      continue;
    }
    if (ch === "?") {
      out += ".";
      continue;
    }
    if ("\\^$+?.()|{}[]".includes(ch)) {
      out += `\\${ch}`;
      continue;
    }
    out += ch;
  }
  return new RegExp(`^${out}$`);
}

function walkFiles(root: string, out: Set<string>, excludes: RegExp[]): void {
  if (!existsSync(root)) return;
  const rootNorm = normalizeFsPath(root);
  if (excludes.some((re) => re.test(rootNorm) || re.test(`${rootNorm}/`))) return;

  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(root, entry.name);
    const pNorm = normalizeFsPath(p);
    if (excludes.some((re) => re.test(pNorm) || re.test(`${pNorm}/`))) {
      continue;
    }
    if (entry.isDirectory()) {
      walkFiles(p, out, excludes);
      continue;
    }
    const ext = entry.name.toLowerCase();
    if (ext.endsWith(".md") || ext.endsWith(".txt") || ext.endsWith(".adoc") || ext.endsWith(".rst")) {
      out.add(p);
    }
  }
}

export class QmdStore {
  private excludeRegExp: RegExp[];
  constructor(private allowPaths: string[], private workspaceRoot: string, excludePatterns: string[] = []) {
    this.excludeRegExp = excludePatterns.map((pattern) => globToRegExp(pattern));
  }

  private tryNativeSearch(query: string, limit: number): QmdHit[] | null {
    try {
      const stdout = execFileSync(
        "openclaw",
        ["memory", "search", query, "--limit", String(limit), "--json"],
        {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          env: process.env,
        },
      );
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      const rows = Array.isArray(parsed.results)
        ? (parsed.results as Array<Record<string, unknown>>)
        : Array.isArray(parsed.items)
          ? (parsed.items as Array<Record<string, unknown>>)
          : [];
      if (!rows.length) return [];
      return rows.slice(0, limit).map((row, idx) => ({
        id: String(row.id ?? `qmd-native-${idx}`),
        text: String(row.text ?? row.content ?? row.snippet ?? ""),
        score:
          typeof row.score === "number"
            ? row.score
            : typeof row.rank === "number"
              ? 1 / (1 + Math.max(0, row.rank))
              : 0.5,
        layer: "M3_shared",
        reason: "qmd_native",
        citation: String(row.citation ?? row.path ?? row.id ?? `qmd-native-${idx}`),
        scope: normalizeScope(String(row.scope ?? "global")),
        backend: "qmd",
      }));
    } catch {
      return null;
    }
  }

  search(query: string, limit = 5): QmdHit[] {
    const native = this.tryNativeSearch(query, limit);
    if (native) return native;

    const files = new Set<string>();
    for (const p of this.allowPaths) {
      walkFiles(p, files, this.excludeRegExp);
    }

    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (!words.length) return [];

    const results: QmdHit[] = [];

    for (const file of files) {
      let content: string;
      try {
        const st = statSync(file);
        if (st.size > 512 * 1024) continue;
        content = readFileSync(file, "utf-8");
      } catch {
        continue;
      }

      const lowered = content.toLowerCase();
      let hits = 0;
      for (const w of words) {
        if (lowered.includes(w)) hits++;
      }
      if (!hits) continue;

      const score = hits / words.length;
      const preview = content.slice(0, 280).replace(/\s+/g, " ").trim();
      const rel = relative(this.workspaceRoot, file);

      results.push({
        id: `qmd:${rel}`,
        text: preview || basename(file),
        score,
        layer: "M3_shared",
        reason: "qmd_text",
        citation: `qmd:${rel}`,
        scope: "global",
        backend: "qmd",
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
