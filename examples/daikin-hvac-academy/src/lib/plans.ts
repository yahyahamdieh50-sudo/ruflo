import { query, uuid } from "./db";
import { env } from "./env";
import type { Tier } from "./entitlements";

export interface Plan {
  id: string; code: Tier; interval: "month" | "year"; name: string;
  price_usd_cents: number; active: boolean; stripe_price_id: string | null;
}

/** Starting prices (configurable by admin). Yearly plans start disabled. */
export const DEFAULT_PLANS: Omit<Plan, "id" | "stripe_price_id">[] = [
  { code: "basic", interval: "month", name: "Basic", price_usd_cents: 999, active: true },
  { code: "pro", interval: "month", name: "Pro", price_usd_cents: 2500, active: true },
  { code: "basic", interval: "year", name: "Basic (yearly)", price_usd_cents: 9990, active: false },
  { code: "pro", interval: "year", name: "Pro (yearly)", price_usd_cents: 25000, active: false },
];

export async function ensureDefaultPlans() {
  for (const p of DEFAULT_PLANS) {
    await query(
      "INSERT INTO plans (id,code,interval,name,price_usd_cents,active) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code, interval) DO NOTHING",
      [uuid(), p.code, p.interval, p.name, p.price_usd_cents, p.active],
    );
  }
}

export const listPlans = (onlyActive = false) =>
  query<Plan>(`SELECT * FROM plans ${onlyActive ? "WHERE active=true" : ""} ORDER BY price_usd_cents`);

export const formatUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

/** AED is display-only (billing is always USD). */
export const formatAed = (cents: number, rate = env.aedPerUsd) =>
  `AED ${((cents / 100) * rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
