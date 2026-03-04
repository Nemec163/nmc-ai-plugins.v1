import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { MemoryLayer } from "./acl.js";
import { nowMs, nowSec, normalizeScope } from "./utils.js";

export type FactCategory =
  | "fact"
  | "decision"
  | "preference"
  | "checkpoint"
  | "other";

export type DecayClass =
  | "permanent"
  | "stable"
  | "active"
  | "session"
  | "checkpoint";

export type FactInput = {
  text: string;
  entity?: string | null;
  key?: string | null;
  value?: string | null;
  category?: FactCategory;
  source?: string;
  scope?: string;
  owner?: string;
  layer: MemoryLayer;
  confidence?: number;
  decayClass?: DecayClass;
  validUntil?: number | null;
  idempotencyKey?: string | null;
};

export type RecallRow = {
  id: string;
  text: string;
  score: number;
  reason: string;
  citation: string;
  layer: MemoryLayer;
  scope: string;
  backend: "facts";
};

export type StoreResult = {
  id: string;
  validUntil: number | null;
  created: boolean;
  idempotent: boolean;
  mutated: boolean;
  conflictId?: string;
};

export type ConflictRow = {
  id: string;
  existingFactId: string;
  entity: string | null;
  key: string | null;
  scope: string;
  existingValue: string | null;
  incomingValue: string | null;
  incomingText: string;
  detectedAt: number;
  status: "pending" | "resolved";
  resolution: "apply_incoming" | "keep_existing" | null;
  resolvedAt: number | null;
};

export type ConflictResolution = "apply_incoming" | "keep_existing";

export type ConflictResolveResult = {
  ok: boolean;
  applied: boolean;
  fact:
    | {
        id: string;
        text: string;
        layer: MemoryLayer;
        scope: string;
        owner: string;
        source: string;
        validUntil: number | null;
      }
    | null;
};

export type GrantRow = {
  principal: string;
  layer: MemoryLayer;
  scope: string;
  mode: "read" | "write" | "promote" | "admin";
  createdAt: number;
};

export type PrincipalGrantSummary = {
  principal: string;
  grants: number;
  layers: number;
  scopes: number;
  read: number;
  write: number;
  promote: number;
  admin: number;
};

export type PruneResult = {
  hardDeleted: number;
  hardDeletedIds: string[];
  softDecayed: number;
};

const TTL_DEFAULTS: Record<DecayClass, number | null> = {
  permanent: null,
  stable: 90 * 24 * 3600,
  active: 14 * 24 * 3600,
  session: 24 * 3600,
  checkpoint: 4 * 3600,
};

export class FactsStore {
  private db: Database.Database;

  constructor(private dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        entity TEXT,
        key TEXT,
        value TEXT,
        category TEXT NOT NULL DEFAULT 'other',
        source TEXT NOT NULL DEFAULT 'manual',
        scope TEXT NOT NULL DEFAULT 'global',
        owner TEXT NOT NULL DEFAULT 'system',
        layer TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        decay_class TEXT NOT NULL DEFAULT 'stable',
        valid_until INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        last_access_at INTEGER
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
        text,
        entity,
        key,
        value,
        category,
        source,
        scope,
        content=facts,
        content_rowid=rowid,
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, text, entity, key, value, category, source, scope)
        VALUES (new.rowid, new.text, new.entity, new.key, new.value, new.category, new.source, new.scope);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, text, entity, key, value, category, source, scope)
        VALUES ('delete', old.rowid, old.text, old.entity, old.key, old.value, old.category, old.source, old.scope);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, text, entity, key, value, category, source, scope)
        VALUES ('delete', old.rowid, old.text, old.entity, old.key, old.value, old.category, old.source, old.scope);
        INSERT INTO facts_fts(rowid, text, entity, key, value, category, source, scope)
        VALUES (new.rowid, new.text, new.entity, new.key, new.value, new.category, new.source, new.scope);
      END;

      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY,
        from_layer TEXT NOT NULL,
        to_layer TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL,
        reviewer TEXT,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        decided_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS acl_grants (
        id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        layer TEXT NOT NULL,
        scope TEXT NOT NULL,
        mode TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(principal, layer, scope, mode)
      );

      CREATE INDEX IF NOT EXISTS idx_facts_scope ON facts(scope);
      CREATE INDEX IF NOT EXISTS idx_facts_owner ON facts(owner);
      CREATE INDEX IF NOT EXISTS idx_facts_layer ON facts(layer);
      CREATE INDEX IF NOT EXISTS idx_facts_valid_until ON facts(valid_until);
      CREATE INDEX IF NOT EXISTS idx_facts_natural_key
        ON facts(lower(entity), lower(key), scope, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
      CREATE INDEX IF NOT EXISTS idx_acl_principal ON acl_grants(principal);
      CREATE INDEX IF NOT EXISTS idx_acl_lookup
        ON acl_grants(principal, layer, mode, scope);
    `);

    this.ensureColumn("facts", "idempotency_key", "TEXT");

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_facts_idempotency_key
        ON facts(idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS fact_conflicts (
        id TEXT PRIMARY KEY,
        existing_fact_id TEXT NOT NULL,
        entity TEXT,
        key TEXT,
        scope TEXT NOT NULL,
        existing_value TEXT,
        incoming_value TEXT,
        incoming_text TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE INDEX IF NOT EXISTS idx_fact_conflicts_status
        ON fact_conflicts(status, detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fact_conflicts_existing_status
        ON fact_conflicts(existing_fact_id, status);
    `);
    this.ensureColumn("fact_conflicts", "resolution", "TEXT");
    this.ensureColumn("fact_conflicts", "resolved_at", "INTEGER");
  }

  private ensureColumn(table: string, column: string, sqlType: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const hasColumn = columns.some((row) => row.name === column);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
    }
  }

  private sameValue(a: string | null | undefined, b: string | null | undefined): boolean {
    return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  }

  private findByIdempotencyKey(key: string): { id: string; valid_until: number | null } | null {
    const row = this.db
      .prepare(`SELECT id, valid_until FROM facts WHERE idempotency_key = ? LIMIT 1`)
      .get(key) as { id: string; valid_until: number | null } | undefined;
    return row ?? null;
  }

  private findByNaturalKey(entity: string, key: string, scope: string): {
    id: string;
    text: string;
    value: string | null;
    valid_until: number | null;
  } | null {
    const row = this.db
      .prepare(
        `
        SELECT id, text, value, valid_until
        FROM facts
        WHERE lower(entity) = ?
          AND lower(key) = ?
          AND scope = ?
          AND (valid_until IS NULL OR valid_until > ?)
        ORDER BY confidence DESC, updated_at DESC
        LIMIT 1
      `,
      )
      .get(entity.toLowerCase(), key.toLowerCase(), scope, nowSec()) as
      | { id: string; text: string; value: string | null; valid_until: number | null }
      | undefined;
    return row ?? null;
  }

  store(input: FactInput): StoreResult {
    const normalizedScope = normalizeScope(input.scope);
    const createdAt = nowMs();
    const decayClass = input.decayClass ?? "stable";
    const ttl = TTL_DEFAULTS[decayClass];
    const validUntil =
      input.validUntil !== undefined
        ? input.validUntil
        : ttl
          ? nowSec() + ttl
          : null;
    const idempotencyKey = input.idempotencyKey?.trim() || null;

    if (idempotencyKey) {
      const existing = this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          id: existing.id,
          validUntil: existing.valid_until,
          created: false,
          idempotent: true,
          mutated: false,
        };
      }
    }

    if (input.entity && input.key) {
      const existing = this.findByNaturalKey(input.entity, input.key, normalizedScope);
      if (existing) {
        const sameByValue = input.value !== undefined && this.sameValue(existing.value, input.value);
        const sameByText = this.sameValue(existing.text, input.text);

        if (sameByValue || sameByText) {
          const nextValidUntil = input.validUntil !== undefined ? input.validUntil : existing.valid_until;
          this.db
            .prepare(
              `
              UPDATE facts
              SET text = ?, value = ?, source = ?, owner = ?, confidence = ?,
                  decay_class = ?, valid_until = ?, updated_at = ?, version = version + 1,
                  idempotency_key = COALESCE(?, idempotency_key)
              WHERE id = ?
            `,
            )
            .run(
              input.text,
              input.value ?? null,
              input.source ?? "manual",
              input.owner ?? "system",
              input.confidence ?? 1,
              decayClass,
              nextValidUntil,
              createdAt,
              idempotencyKey,
              existing.id,
            );
          return {
            id: existing.id,
            validUntil: nextValidUntil,
            created: false,
            idempotent: true,
            mutated: true,
          };
        }

        const conflictId = randomUUID();
        const duplicateConflict = this.db
          .prepare(
            `
            SELECT id
            FROM fact_conflicts
            WHERE existing_fact_id = ?
              AND status = 'pending'
              AND lower(incoming_text) = lower(?)
            LIMIT 1
          `,
          )
          .get(existing.id, input.text) as { id: string } | undefined;
        if (duplicateConflict?.id) {
          return {
            id: existing.id,
            validUntil: existing.valid_until,
            created: false,
            idempotent: false,
            mutated: false,
            conflictId: duplicateConflict.id,
          };
        }

        this.db
          .prepare(
            `
            INSERT INTO fact_conflicts (
              id, existing_fact_id, entity, key, scope, existing_value, incoming_value,
              incoming_text, detected_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          `,
          )
          .run(
            conflictId,
            existing.id,
            input.entity,
            input.key,
            normalizedScope,
            existing.value,
            input.value ?? null,
            input.text,
            createdAt,
          );

        return {
          id: existing.id,
          validUntil: existing.valid_until,
          created: false,
          idempotent: false,
          mutated: false,
          conflictId,
        };
      }
    }

    const id = randomUUID();

    this.db
      .prepare(
        `INSERT INTO facts (
          id, text, entity, key, value, category, source, scope, owner, layer,
          confidence, decay_class, valid_until, created_at, updated_at, version, last_access_at, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        id,
        input.text,
        input.entity ?? null,
        input.key ?? null,
        input.value ?? null,
        input.category ?? "other",
        input.source ?? "manual",
        normalizedScope,
        input.owner ?? "system",
        input.layer,
        input.confidence ?? 1,
        decayClass,
        validUntil,
        createdAt,
        createdAt,
        nowSec(),
        idempotencyKey,
      );

    return {
      id,
      validUntil,
      created: true,
      idempotent: false,
      mutated: true,
    };
  }

  exactLookup(entity: string, key?: string, scope?: string): RecallRow[] {
    const params: unknown[] = [entity.toLowerCase()];
    let where = `lower(entity) = ?`;
    if (key) {
      where += ` AND lower(key) = ?`;
      params.push(key.toLowerCase());
    }
    if (scope) {
      where += ` AND scope = ?`;
      params.push(normalizeScope(scope));
    }

    where += ` AND (valid_until IS NULL OR valid_until > ?)`;
    params.push(nowSec());

    const rows = this.db
      .prepare(`
        SELECT id, text, layer, source, confidence, scope
        FROM facts
        WHERE ${where}
        ORDER BY confidence DESC, updated_at DESC
        LIMIT 20
      `)
      .all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as string,
      text: row.text as string,
      layer: row.layer as MemoryLayer,
      scope: row.scope as string,
      score: row.confidence as number,
      reason: "exact",
      citation: `facts:${row.id as string}`,
      backend: "facts" as const,
    }));
  }

  search(query: string, scope: string | undefined, limit = 5): RecallRow[] {
    const safeQuery = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => `"${w}"`)
      .join(" OR ");

    if (!safeQuery) return [];

    const params: Record<string, unknown> = {
      query: safeQuery,
      now: nowSec(),
      limit: limit * 2,
    };

    const scopeFilter = scope ? "AND f.scope = @scope" : "";
    if (scope) params.scope = normalizeScope(scope);

    const rows = this.db
      .prepare(
        `
        SELECT f.id, f.text, f.layer, f.scope, f.source, f.confidence, rank
        FROM facts f
        JOIN facts_fts fts ON f.rowid = fts.rowid
        WHERE facts_fts MATCH @query
          ${scopeFilter}
          AND (f.valid_until IS NULL OR f.valid_until > @now)
        ORDER BY rank
        LIMIT @limit
      `,
      )
      .all(params) as Array<Record<string, unknown>>;

    if (!rows.length) return [];

    const minRank = Math.min(...rows.map((r) => r.rank as number));
    const maxRank = Math.max(...rows.map((r) => r.rank as number));
    const range = maxRank - minRank || 1;

    const out = rows
      .map((row) => {
        const normalized = 1 - ((row.rank as number) - minRank) / range;
        const score = normalized * 0.75 + ((row.confidence as number) || 1) * 0.25;
        return {
          id: row.id as string,
          text: row.text as string,
          layer: row.layer as MemoryLayer,
          scope: row.scope as string,
          score,
          reason: "fts",
          citation: `facts:${row.id as string}`,
          backend: "facts" as const,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const tx = this.db.transaction((ids: string[]) => {
      const ts = nowSec();
      const updatedAt = nowMs();
      const readStmt = this.db.prepare(
        `SELECT decay_class, valid_until FROM facts WHERE id = ?`,
      );
      const writeStmt = this.db.prepare(
        `UPDATE facts SET last_access_at = ?, valid_until = ?, updated_at = ? WHERE id = ?`,
      );
      for (const id of ids) {
        const row = readStmt.get(id) as
          | {
              decay_class: DecayClass;
              valid_until: number | null;
            }
          | undefined;
        if (!row) continue;

        let nextValidUntil = row.valid_until;
        if (row.decay_class === "stable" || row.decay_class === "active") {
          const ttl = TTL_DEFAULTS[row.decay_class];
          if (ttl) {
            nextValidUntil = Math.max(row.valid_until ?? 0, ts + ttl);
          }
        }
        writeStmt.run(ts, nextValidUntil, updatedAt, id);
      }
    });
    tx(out.map((i) => i.id));

    return out;
  }

  getFact(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`SELECT * FROM facts WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ?? null;
  }

  createPromotion(input: {
    fromLayer: MemoryLayer;
    toLayer: MemoryLayer;
    candidateId: string;
    requestedBy: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    reviewer?: string | null;
  }): string {
    const id = randomUUID();
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO promotions (
          id, from_layer, to_layer, candidate_id, requested_by, status,
          reviewer, reason, created_at, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.fromLayer,
        input.toLayer,
        input.candidateId,
        input.requestedBy,
        input.status,
        input.reviewer ?? null,
        input.reason,
        ts,
        input.status === "pending" ? null : ts,
      );
    return id;
  }

  decidePromotion(id: string, decision: "approved" | "rejected", reviewer: string, reason: string): boolean {
    const row = this.db
      .prepare(`SELECT candidate_id, to_layer FROM promotions WHERE id = ?`)
      .get(id) as { candidate_id: string; to_layer: MemoryLayer } | undefined;
    if (!row) return false;

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE promotions SET status = ?, reviewer = ?, reason = ?, decided_at = ? WHERE id = ?`,
        )
        .run(decision, reviewer, reason, nowMs(), id);

      if (decision === "approved") {
        this.db
          .prepare(`UPDATE facts SET layer = ?, updated_at = ?, version = version + 1 WHERE id = ?`)
          .run(row.to_layer, nowMs(), row.candidate_id);
      }
    });
    tx();
    return true;
  }

  prune(mode: "hard" | "soft" | "both"): PruneResult {
    const now = nowSec();
    let hardDeleted = 0;
    let hardDeletedIds: string[] = [];
    let softDecayed = 0;

    if (mode === "hard" || mode === "both") {
      hardDeletedIds = (
        this.db
          .prepare(`SELECT id FROM facts WHERE valid_until IS NOT NULL AND valid_until < ?`)
          .all(now) as Array<{ id: string }>
      ).map((row) => row.id);
      const res = this.db
        .prepare(`DELETE FROM facts WHERE valid_until IS NOT NULL AND valid_until < ?`)
        .run(now);
      hardDeleted = res.changes;
    }

    if (mode === "soft" || mode === "both") {
      const res = this.db
        .prepare(
          `UPDATE facts
           SET confidence = MAX(0.05, confidence * 0.9), updated_at = ?
           WHERE valid_until IS NOT NULL
             AND valid_until > ?
             AND last_access_at IS NOT NULL
             AND (? - last_access_at) > 7 * 24 * 3600`,
        )
        .run(nowMs(), now, now);
      softDecayed = res.changes;
    }

    return { hardDeleted, hardDeletedIds, softDecayed };
  }

  deleteByOwner(owner: string): number {
    const res = this.db.prepare(`DELETE FROM facts WHERE owner = ?`).run(owner);
    return res.changes;
  }

  upsertGrant(principal: string, layer: MemoryLayer, scope: string, mode: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO acl_grants (id, principal, layer, scope, mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), principal, layer, normalizeScope(scope), mode, nowMs());
  }

  deleteGrants(principal: string): number {
    const res = this.db.prepare(`DELETE FROM acl_grants WHERE principal = ?`).run(principal);
    return res.changes;
  }

  hasGrant(
    principal: string | undefined,
    layer: MemoryLayer,
    scope: string | undefined,
    mode: "read" | "write" | "promote" | "admin",
  ): boolean {
    if (!principal || !principal.trim()) return false;
    const normalizedScope = normalizeScope(scope);
    const row = this.db
      .prepare(
        `
        SELECT 1
        FROM acl_grants
        WHERE principal = ?
          AND layer = ?
          AND mode IN ('admin', ?)
          AND scope IN (?, 'global', '*')
        LIMIT 1
      `,
      )
      .get(principal.trim(), layer, mode, normalizedScope);
    return Boolean(row);
  }

  listGrants(principal: string): GrantRow[] {
    const rows = this.db
      .prepare(
        `
        SELECT principal, layer, scope, mode, created_at
        FROM acl_grants
        WHERE principal = ?
        ORDER BY layer ASC, mode ASC, scope ASC
      `,
      )
      .all(principal.trim()) as Array<{
      principal: string;
      layer: MemoryLayer;
      scope: string;
      mode: "read" | "write" | "promote" | "admin";
      created_at: number;
    }>;

    return rows.map((row) => ({
      principal: row.principal,
      layer: row.layer,
      scope: row.scope,
      mode: row.mode,
      createdAt: row.created_at,
    }));
  }

  listPrincipals(limit = 200): PrincipalGrantSummary[] {
    const normalizedLimit = Math.max(1, Math.min(limit, 2000));
    const rows = this.db
      .prepare(
        `
        SELECT
          principal,
          COUNT(*) as grants,
          COUNT(DISTINCT layer) as layers,
          COUNT(DISTINCT scope) as scopes,
          SUM(CASE WHEN mode = 'read' THEN 1 ELSE 0 END) as read_cnt,
          SUM(CASE WHEN mode = 'write' THEN 1 ELSE 0 END) as write_cnt,
          SUM(CASE WHEN mode = 'promote' THEN 1 ELSE 0 END) as promote_cnt,
          SUM(CASE WHEN mode = 'admin' THEN 1 ELSE 0 END) as admin_cnt
        FROM acl_grants
        GROUP BY principal
        ORDER BY principal ASC
        LIMIT ?
      `,
      )
      .all(normalizedLimit) as Array<{
      principal: string;
      grants: number;
      layers: number;
      scopes: number;
      read_cnt: number;
      write_cnt: number;
      promote_cnt: number;
      admin_cnt: number;
    }>;

    return rows.map((row) => ({
      principal: row.principal,
      grants: row.grants,
      layers: row.layers,
      scopes: row.scopes,
      read: row.read_cnt,
      write: row.write_cnt,
      promote: row.promote_cnt,
      admin: row.admin_cnt,
    }));
  }

  listConflicts(limit = 20, status: "pending" | "resolved" | "all" = "pending"): ConflictRow[] {
    const normalizedLimit = Math.max(1, Math.min(limit, 200));
    const rows = (status === "all"
      ? this.db
          .prepare(
            `
            SELECT id, existing_fact_id, entity, key, scope, existing_value, incoming_value, incoming_text, detected_at, status, resolution, resolved_at
            FROM fact_conflicts
            ORDER BY detected_at DESC
            LIMIT ?
          `,
          )
          .all(normalizedLimit)
      : this.db
          .prepare(
            `
            SELECT id, existing_fact_id, entity, key, scope, existing_value, incoming_value, incoming_text, detected_at, status, resolution, resolved_at
            FROM fact_conflicts
            WHERE status = ?
            ORDER BY detected_at DESC
            LIMIT ?
          `,
          )
          .all(status, normalizedLimit)) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as string,
      existingFactId: row.existing_fact_id as string,
      entity: row.entity ? String(row.entity) : null,
      key: row.key ? String(row.key) : null,
      scope: row.scope as string,
      existingValue: row.existing_value ? String(row.existing_value) : null,
      incomingValue: row.incoming_value ? String(row.incoming_value) : null,
      incomingText: row.incoming_text as string,
      detectedAt: row.detected_at as number,
      status: row.status as "pending" | "resolved",
      resolution: (row.resolution as "apply_incoming" | "keep_existing" | null) ?? null,
      resolvedAt: (row.resolved_at as number | null) ?? null,
    }));
  }

  resolveConflict(id: string, resolution: ConflictResolution = "apply_incoming"): ConflictResolveResult {
    const row = this.db
      .prepare(
        `
        SELECT id, existing_fact_id, incoming_text, incoming_value, status
        FROM fact_conflicts
        WHERE id = ?
        LIMIT 1
      `,
      )
      .get(id) as
      | {
          id: string;
          existing_fact_id: string;
          incoming_text: string;
          incoming_value: string | null;
          status: "pending" | "resolved";
        }
      | undefined;

    if (!row || row.status !== "pending") {
      return { ok: false, applied: false, fact: null };
    }

    const tsMs = nowMs();
    let applied = false;

    const tx = this.db.transaction(() => {
      if (resolution === "apply_incoming") {
        const applyRes = this.db
          .prepare(
            `
            UPDATE facts
            SET text = ?, value = ?, updated_at = ?, version = version + 1
            WHERE id = ?
          `,
          )
          .run(row.incoming_text, row.incoming_value, tsMs, row.existing_fact_id);
        applied = applyRes.changes > 0;
      }

      this.db
        .prepare(
          `
          UPDATE fact_conflicts
          SET status = 'resolved', resolution = ?, resolved_at = ?
          WHERE id = ? AND status = 'pending'
        `,
        )
        .run(resolution, tsMs, id);
    });
    tx();

    const fact = this.db
      .prepare(
        `
        SELECT id, text, layer, scope, owner, source, valid_until
        FROM facts
        WHERE id = ?
        LIMIT 1
      `,
      )
      .get(row.existing_fact_id) as
      | {
          id: string;
          text: string;
          layer: MemoryLayer;
          scope: string;
          owner: string;
          source: string;
          valid_until: number | null;
        }
      | undefined;

    return {
      ok: true,
      applied,
      fact: fact
        ? {
            id: fact.id,
            text: fact.text,
            layer: fact.layer,
            scope: fact.scope,
            owner: fact.owner,
            source: fact.source,
            validUntil: fact.valid_until,
          }
        : null,
    };
  }

  activeFactRows(
    ids: string[],
  ): Map<string, { id: string; text: string; layer: MemoryLayer; scope: string }> {
    const cleaned = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!cleaned.length) return new Map<string, { id: string; text: string; layer: MemoryLayer; scope: string }>();
    const now = nowSec();
    const chunkSize = 200;
    const out = new Map<string, { id: string; text: string; layer: MemoryLayer; scope: string }>();

    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `
          SELECT id, text, layer, scope
          FROM facts
          WHERE id IN (${placeholders})
            AND (valid_until IS NULL OR valid_until > ?)
        `,
        )
        .all(...chunk, now) as Array<{
        id: string;
        text: string;
        layer: MemoryLayer;
        scope: string;
      }>;
      for (const row of rows) {
        out.set(row.id, {
          id: row.id,
          text: row.text,
          layer: row.layer,
          scope: row.scope,
        });
      }
    }

    return out;
  }

  createNightlyBackfillPromotions(maxCandidates = 100): number {
    const rows = this.db
      .prepare(
        `
        SELECT f.id AS candidate_id, f.layer AS from_layer
        FROM facts f
        WHERE f.layer IN ('M2_domain', 'M3_shared')
          AND f.confidence >= 0.85
          AND (f.valid_until IS NULL OR f.valid_until > ?)
          AND NOT EXISTS (
            SELECT 1
            FROM promotions p
            WHERE p.candidate_id = f.id
              AND p.to_layer = 'M4_global_facts'
              AND p.status IN ('pending', 'approved')
          )
        ORDER BY f.confidence DESC, f.updated_at DESC
        LIMIT ?
      `,
      )
      .all(nowSec(), Math.max(1, Math.min(maxCandidates, 500))) as Array<{
      candidate_id: string;
      from_layer: MemoryLayer;
    }>;

    if (!rows.length) return 0;

    const insert = this.db.prepare(
      `
      INSERT INTO promotions (
        id, from_layer, to_layer, candidate_id, requested_by, status, reviewer, reason, created_at, decided_at
      ) VALUES (?, ?, 'M4_global_facts', ?, 'nightly_backfill', 'pending', NULL, ?, ?, NULL)
    `,
    );

    const tx = this.db.transaction(() => {
      const ts = nowMs();
      let created = 0;
      for (const row of rows) {
        insert.run(
          randomUUID(),
          row.from_layer,
          row.candidate_id,
          "nightly extract/backfill candidate",
          ts,
        );
        created += 1;
      }
      return created;
    });

    return tx();
  }

  stats(): Record<string, unknown> {
    const total = this.db.prepare(`SELECT COUNT(*) as n FROM facts`).get() as { n: number };
    const byLayerRows = this.db
      .prepare(`SELECT layer, COUNT(*) as n FROM facts GROUP BY layer`)
      .all() as Array<{ layer: string; n: number }>;
    const byLayer: Record<string, number> = {};
    for (const row of byLayerRows) {
      byLayer[row.layer] = row.n;
    }

    const pendingPromotions = this.db
      .prepare(`SELECT COUNT(*) as n FROM promotions WHERE status = 'pending'`)
      .get() as { n: number };

    const pendingConflicts = this.db
      .prepare(`SELECT COUNT(*) as n FROM fact_conflicts WHERE status = 'pending'`)
      .get() as { n: number };

    return {
      totalFacts: total.n,
      byLayer,
      pendingPromotions: pendingPromotions.n,
      pendingConflicts: pendingConflicts.n,
      dbPath: this.dbPath,
    };
  }

  close(): void {
    this.db.close();
  }
}
