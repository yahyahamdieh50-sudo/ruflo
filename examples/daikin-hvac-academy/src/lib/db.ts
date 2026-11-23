import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { randomUUID } from "node:crypto";
import { env } from "./env";

/** Minimal surface shared by pg.Pool and the pg-mem adapter used in tests. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  connect?(): Promise<PoolClient>;
}

const g = globalThis as unknown as { __pool?: Queryable };

export function getDb(): Queryable {
  if (!g.__pool) {
    g.__pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    }) as unknown as Queryable;
  }
  return g.__pool;
}

/** Tests inject a pg-mem backed pool here. */
export function setDb(db: Queryable | undefined) {
  g.__pool = db;
}

export const uuid = () => randomUUID();

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await getDb().query(text, params);
  return r.rows as T[];
}

export async function queryOne<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run statements atomically. Falls back to sequential execution if the driver has no client pooling. */
export async function tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  const db = getDb();
  if (!db.connect) return fn(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client as unknown as Queryable);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function audit(actorId: string | null, action: string, entity?: string, details?: unknown) {
  await query("INSERT INTO audit_log (id, actor_id, action, entity, details) VALUES ($1,$2,$3,$4,$5)", [
    uuid(), actorId, action, entity ?? null, details ? JSON.stringify(details) : null,
  ]);
}
