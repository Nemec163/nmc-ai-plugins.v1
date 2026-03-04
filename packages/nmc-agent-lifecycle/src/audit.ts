import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class AuditLog {
  private path: string;

  constructor(stateDir: string) {
    this.path = join(stateDir, "audit", "events.ndjson");
    mkdirSync(dirname(this.path), { recursive: true });
  }

  write(event: {
    actor: string;
    action: string;
    target: string;
    outcome: "ok" | "error";
    details?: Record<string, unknown>;
  }) {
    const row = {
      ts: new Date().toISOString(),
      actor: event.actor,
      action: event.action,
      target: event.target,
      outcome: event.outcome,
      details: event.details ?? {},
    };
    appendFileSync(this.path, `${JSON.stringify(row)}\n`, "utf-8");
  }

  getPath(): string {
    return this.path;
  }
}
