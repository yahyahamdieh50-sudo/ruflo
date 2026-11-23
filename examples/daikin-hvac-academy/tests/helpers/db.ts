import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { newDb } from "pg-mem";
import { setDb, type Queryable } from "@/lib/db";

process.env.APP_SECRET ||= "test-secret-test-secret-test-secret-123456";
process.env.APP_URL ||= "http://localhost:3000";

const schema = () => fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
let realPool: Pool | undefined;

/**
 * Fresh database with the real schema applied.
 * - default: in-memory PostgreSQL emulation (pg-mem) — no services needed
 * - TEST_DATABASE_URL set: a real PostgreSQL (schema `public` is DROPPED and recreated — use a throwaway DB)
 */
export async function makeTestDb(): Promise<Queryable> {
  if (process.env.TEST_DATABASE_URL) {
    realPool ??= new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
    await realPool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await realPool.query(schema());
    setDb(realPool as unknown as Queryable);
    return realPool as unknown as Queryable;
  }
  const mem = newDb();
  const { Pool: MemPool } = mem.adapters.createPg();
  const pool = new MemPool() as unknown as Queryable;
  await pool.query(schema());
  setDb(pool);
  return pool;
}
