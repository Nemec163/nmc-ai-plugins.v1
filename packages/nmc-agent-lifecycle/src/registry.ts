import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { AccessLevel } from "./acl.js";

export type AgentEntry = {
  agent_id: string;
  display_name: string;
  access_level: AccessLevel;
  domain_scopes: string[];
  heartbeat_every: string | null;
  tools_allowlist: string[];
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
};

export type RegistryData = {
  version: number;
  updated_at: string;
  agents: Record<string, AgentEntry>;
};

export class AgentRegistry {
  readonly path: string;

  constructor(stateDir: string) {
    this.path = join(stateDir, "registry", "agents.json");
    mkdirSync(dirname(this.path), { recursive: true });
    if (!existsSync(this.path)) {
      this.save({ version: 1, updated_at: new Date().toISOString(), agents: {} });
    }
  }

  load(): RegistryData {
    const raw = readFileSync(this.path, "utf-8");
    return JSON.parse(raw) as RegistryData;
  }

  save(data: RegistryData): void {
    data.updated_at = new Date().toISOString();
    writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  }

  upsert(entry: AgentEntry): AgentEntry {
    const data = this.load();
    data.agents[entry.agent_id] = {
      ...entry,
      updated_at: new Date().toISOString(),
    };
    this.save(data);
    return data.agents[entry.agent_id];
  }

  markDeleted(agentId: string): boolean {
    const data = this.load();
    const existing = data.agents[agentId];
    if (!existing) return false;
    if (existing.status === "deleted") {
      return true;
    }
    existing.status = "deleted";
    existing.updated_at = new Date().toISOString();
    data.agents[agentId] = existing;
    this.save(data);
    return true;
  }

  get(agentId: string): AgentEntry | null {
    const data = this.load();
    return data.agents[agentId] ?? null;
  }

  list(includeDeleted = false): AgentEntry[] {
    const data = this.load();
    const items = Object.values(data.agents);
    return includeDeleted ? items : items.filter((v) => v.status !== "deleted");
  }

  delete(agentId: string): boolean {
    const data = this.load();
    if (!data.agents[agentId]) return false;
    delete data.agents[agentId];
    this.save(data);
    return true;
  }
}
