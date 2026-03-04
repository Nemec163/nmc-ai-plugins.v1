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

export function parseAccessLevel(value?: string): AccessLevel {
  if (value && ACCESS_LEVELS.includes(value as AccessLevel)) {
    return value as AccessLevel;
  }
  return "A1_worker";
}

export function canRead(level: AccessLevel, layer: MemoryLayer): boolean {
  return ACCESS_MATRIX[level].read.includes(layer);
}

export function canWrite(level: AccessLevel, layer: MemoryLayer): boolean {
  return ACCESS_MATRIX[level].write.includes(layer);
}

export function canPromote(level: AccessLevel): boolean {
  return ACCESS_MATRIX[level].promote;
}

export function canApprove(level: AccessLevel): boolean {
  return level === "A4_orchestrator_full";
}
