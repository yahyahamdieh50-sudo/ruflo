import { seedAll } from "../src/lib/seed";
import { getDb } from "../src/lib/db";

async function main() {
  const demo = (process.argv.includes("--demo") || process.env.SEED_DEMO_USERS === "true") && process.env.NODE_ENV !== "production";
  await seedAll({ adminEmail: process.env.SEED_ADMIN_EMAIL, adminPassword: process.env.SEED_ADMIN_PASSWORD, demoUsers: demo });
  console.log(`Seed complete${demo ? " (demo users: free@/basic@/pro@/instructor@demo.test, password DemoPass-12345 — dev only)" : ""}.`);
  await (getDb() as any).end?.();
}
main().catch((e) => { console.error(e); process.exit(1); });
