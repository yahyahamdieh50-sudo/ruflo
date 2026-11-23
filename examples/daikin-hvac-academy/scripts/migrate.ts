import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Schema applied.");
}
main().catch((e) => { console.error(e); process.exit(1); });
