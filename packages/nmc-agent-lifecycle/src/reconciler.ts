import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AgentEntry } from "./registry.js";

export function reconcileOpenclawConfig(configPath: string, agents: AgentEntry[]): { changed: boolean; count: number } {
  if (!existsSync(configPath)) {
    throw new Error(`openclaw config not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (!parsed.agents || typeof parsed.agents !== "object") {
    parsed.agents = {};
  }
  const agentsObj = parsed.agents as Record<string, unknown>;
  if (!Array.isArray(agentsObj.list)) {
    agentsObj.list = [];
  }

  const list = agentsObj.list as Array<Record<string, unknown>>;
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of list) {
    if (typeof entry.id === "string") {
      byId.set(entry.id, entry);
    }
  }

  for (const agent of agents) {
    if (agent.status === "deleted") {
      byId.delete(agent.agent_id);
      continue;
    }

    const existing = byId.get(agent.agent_id) ?? { id: agent.agent_id };
    existing.name = agent.display_name;
    existing.accessLevel = agent.access_level;
    existing.domainScopes = agent.domain_scopes;
    existing.heartbeat = agent.heartbeat_every ? { every: agent.heartbeat_every } : { every: "0" };
    existing.toolsAllowlist = agent.tools_allowlist;
    existing.nmcManaged = true;
    byId.set(agent.agent_id, existing);
  }

  const nextList = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  agentsObj.list = nextList;

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (nextRaw === raw) {
    return { changed: false, count: nextList.length };
  }

  writeFileSync(configPath, nextRaw, "utf-8");
  return { changed: true, count: nextList.length };
}
