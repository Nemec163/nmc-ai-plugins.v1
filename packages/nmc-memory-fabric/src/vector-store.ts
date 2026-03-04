import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import OpenAI from "openai";
import { MemoryLayer } from "./acl.js";
import { escapeSqlLiteral, nowSec } from "./utils.js";

const TABLE_NAME = "memory_vectors";

export type VectorHit = {
  id: string;
  text: string;
  score: number;
  layer: MemoryLayer;
  scope: string;
  owner: string;
  reason: string;
  citation: string;
  backend: "vector";
};

export class Embeddings {
  private client: OpenAI;
  constructor(private apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const out = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return out.data[0].embedding;
  }
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private dbPath: string, private dimensions = 1536) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  private async ensureInit(): Promise<void> {
    if (this.table) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.init();
    return this.initPromise;
  }

  private async init(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const names = await this.db.tableNames();
    if (names.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
      return;
    }

    this.table = await this.db.createTable(TABLE_NAME, [
      {
        id: "__schema__",
        text: "",
        vector: new Array(this.dimensions).fill(0),
        layer: "M3_shared",
        scope: "global",
        owner: "system",
        source: "schema",
        validUntil: null,
        updatedAtSec: 0,
        createdAt: 0,
      },
    ]);
    await this.table.delete('id = "__schema__"');
  }

  async store(input: {
    id: string;
    text: string;
    vector: number[];
    layer: MemoryLayer;
    scope: string;
    owner: string;
    source: string;
    validUntil?: number | null;
  }): Promise<string> {
    await this.ensureInit();
    await this.table!.delete(`id = '${escapeSqlLiteral(input.id)}'`);
    await this.table!.add([
      {
        id: input.id,
        text: input.text,
        vector: input.vector,
        layer: input.layer,
        scope: input.scope,
        owner: input.owner,
        source: input.source,
        validUntil: input.validUntil ?? null,
        updatedAtSec: nowSec(),
        createdAt: Date.now(),
      },
    ]);
    return input.id;
  }

  async search(vector: number[], limit = 5, scope?: string): Promise<VectorHit[]> {
    await this.ensureInit();
    let query = this.table!.vectorSearch(vector).limit(limit * 2);
    const now = nowSec();

    const rows = await query.toArray();

    return rows
      .filter((row) => {
        const validUntil = typeof row.validUntil === "number" ? row.validUntil : null;
        if (validUntil !== null && validUntil <= now) return false;
        return !scope || row.scope === scope || row.scope === "global";
      })
      .map((row) => {
        const distance = row._distance ?? 0;
        const score = 1 / (1 + distance);
        return {
          id: row.id as string,
          text: row.text as string,
          score,
          layer: row.layer as MemoryLayer,
          scope: row.scope as string,
          owner: row.owner as string,
          reason: "semantic",
          citation: `vector:${row.id as string}`,
          backend: "vector" as const,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async deleteByIds(ids: string[]): Promise<number> {
    await this.ensureInit();
    const cleaned = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!cleaned.length) return 0;
    const before = await this.table!.countRows();
    const chunkSize = 200;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const expr = chunk.map((id) => `id = '${escapeSqlLiteral(id)}'`).join(" OR ");
      await this.table!.delete(expr);
    }
    const after = await this.table!.countRows();
    return Math.max(0, before - after);
  }

  async pruneExpired(now = nowSec()): Promise<number> {
    await this.ensureInit();
    const before = await this.table!.countRows();
    await this.table!.delete(`validUntil IS NOT NULL AND validUntil < ${now}`);
    const after = await this.table!.countRows();
    return Math.max(0, before - after);
  }

  async deleteByOwner(owner: string): Promise<number> {
    await this.ensureInit();
    const before = await this.table!.countRows();
    await this.table!.delete(`owner = '${escapeSqlLiteral(owner)}'`);
    const after = await this.table!.countRows();
    return Math.max(0, before - after);
  }

  async count(): Promise<number> {
    await this.ensureInit();
    return this.table!.countRows();
  }
}
