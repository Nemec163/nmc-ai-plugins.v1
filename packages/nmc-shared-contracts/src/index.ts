export type MemoryLayer =
  | "M0_core"
  | "M1_local"
  | "M2_domain"
  | "M3_shared"
  | "M4_global_facts"
  | "M5_audit_ops";

export type AccessLevel =
  | "A0_isolated"
  | "A1_worker"
  | "A2_domain_builder"
  | "A3_system_operator"
  | "A4_orchestrator_full";

export type DecayClass =
  | "permanent"
  | "stable"
  | "active"
  | "session"
  | "checkpoint";

export type FactRecord = {
  id: string;
  text: string;
  entity: string | null;
  key: string | null;
  value: string | null;
  category: "fact" | "decision" | "preference" | "checkpoint" | "other";
  source: string;
  scope: string;
  owner: string;
  layer: MemoryLayer;
  confidence: number;
  decay_class: DecayClass;
  valid_until: number | null;
  created_at: number;
  updated_at: number;
  version: number;
};

export type DecisionRecord = {
  id: string;
  subject: string;
  rationale: string;
  alternatives: string[];
  source: string;
  scope: string;
  confidence: number;
  created_at: number;
};

export type PromotionStatus = "pending" | "approved" | "rejected";

export type PromotionRecord = {
  id: string;
  from_layer: MemoryLayer;
  to_layer: MemoryLayer;
  candidate_id: string;
  requested_by: string;
  status: PromotionStatus;
  reviewer: string | null;
  reason: string;
  created_at: number;
  decided_at: number | null;
};

export type RecallHit = {
  layer: MemoryLayer;
  id: string;
  text: string;
  score: number;
  reason: string;
  citation: string;
  backend: "facts" | "qmd" | "vector";
};

export type AgentSpec = {
  agent_id: string;
  display_name: string;
  access_level: AccessLevel;
  domain_scopes: string[];
  heartbeat_every: string | null;
  tools_allowlist: string[];
};

export type NamespaceGrant = {
  principal: string;
  layer: MemoryLayer;
  scope: string;
  mode: "read" | "write" | "promote" | "admin";
};

export type AuditEvent = {
  ts: string;
  actor: string;
  action: string;
  target: string;
  outcome: "ok" | "error";
  details: Record<string, unknown>;
};

export const MEMORY_LAYERS: MemoryLayer[] = [
  "M0_core",
  "M1_local",
  "M2_domain",
  "M3_shared",
  "M4_global_facts",
  "M5_audit_ops",
];

export const ACCESS_LEVELS: AccessLevel[] = [
  "A0_isolated",
  "A1_worker",
  "A2_domain_builder",
  "A3_system_operator",
  "A4_orchestrator_full",
];

export const ACCESS_MATRIX: Record<
  AccessLevel,
  { read: MemoryLayer[]; write: MemoryLayer[]; promote: boolean }
> = {
  A0_isolated: {
    read: ["M0_core", "M1_local"],
    write: ["M1_local"],
    promote: false,
  },
  A1_worker: {
    read: ["M0_core", "M1_local", "M2_domain", "M3_shared"],
    write: ["M1_local"],
    promote: false,
  },
  A2_domain_builder: {
    read: ["M0_core", "M1_local", "M2_domain", "M3_shared", "M4_global_facts"],
    write: ["M1_local", "M2_domain"],
    promote: true,
  },
  A3_system_operator: {
    read: ["M0_core", "M1_local", "M2_domain", "M3_shared", "M4_global_facts", "M5_audit_ops"],
    write: ["M1_local", "M2_domain", "M3_shared", "M5_audit_ops"],
    promote: true,
  },
  A4_orchestrator_full: {
    read: MEMORY_LAYERS,
    write: MEMORY_LAYERS,
    promote: true,
  },
};

export function canRead(level: AccessLevel, layer: MemoryLayer): boolean {
  return ACCESS_MATRIX[level].read.includes(layer);
}

export function canWrite(level: AccessLevel, layer: MemoryLayer): boolean {
  return ACCESS_MATRIX[level].write.includes(layer);
}

export function canApprovePromotion(level: AccessLevel): boolean {
  return level === "A4_orchestrator_full";
}

export const DEFAULT_QMD_ALLOWLIST = [
  "system/docs",
  "system/policy",
  "system/tasks",
  "system/skills",
  "nmc/research",
];
