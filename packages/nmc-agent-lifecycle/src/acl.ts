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

export const ACCESS_LEVELS: AccessLevel[] = [
  "A0_isolated",
  "A1_worker",
  "A2_domain_builder",
  "A3_system_operator",
  "A4_orchestrator_full",
];

export function parseAccessLevel(value: string | undefined): AccessLevel {
  if (value && ACCESS_LEVELS.includes(value as AccessLevel)) {
    return value as AccessLevel;
  }
  return "A1_worker";
}

export function grantsForLevel(level: AccessLevel): Array<{ layer: MemoryLayer; mode: "read" | "write" | "promote" | "admin" }> {
  switch (level) {
    case "A0_isolated":
      return [
        { layer: "M0_core", mode: "read" },
        { layer: "M1_local", mode: "read" },
        { layer: "M1_local", mode: "write" },
      ];
    case "A1_worker":
      return [
        { layer: "M0_core", mode: "read" },
        { layer: "M1_local", mode: "read" },
        { layer: "M1_local", mode: "write" },
        { layer: "M2_domain", mode: "read" },
        { layer: "M3_shared", mode: "read" },
      ];
    case "A2_domain_builder":
      return [
        { layer: "M0_core", mode: "read" },
        { layer: "M1_local", mode: "read" },
        { layer: "M1_local", mode: "write" },
        { layer: "M2_domain", mode: "read" },
        { layer: "M2_domain", mode: "write" },
        { layer: "M3_shared", mode: "read" },
        { layer: "M4_global_facts", mode: "read" },
        { layer: "M4_global_facts", mode: "promote" },
      ];
    case "A3_system_operator":
      return [
        { layer: "M0_core", mode: "read" },
        { layer: "M1_local", mode: "read" },
        { layer: "M1_local", mode: "write" },
        { layer: "M2_domain", mode: "read" },
        { layer: "M2_domain", mode: "write" },
        { layer: "M3_shared", mode: "read" },
        { layer: "M3_shared", mode: "write" },
        { layer: "M4_global_facts", mode: "read" },
        { layer: "M4_global_facts", mode: "promote" },
        { layer: "M5_audit_ops", mode: "write" },
      ];
    case "A4_orchestrator_full":
      return [
        { layer: "M0_core", mode: "admin" },
        { layer: "M1_local", mode: "admin" },
        { layer: "M2_domain", mode: "admin" },
        { layer: "M3_shared", mode: "admin" },
        { layer: "M4_global_facts", mode: "admin" },
        { layer: "M5_audit_ops", mode: "admin" },
      ];
  }
}
