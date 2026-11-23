import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null = null;

export const stripeConfigured = () => !!env.stripeKey;

export function getStripe(): Stripe {
  if (!env.stripeKey) throw new Error("STRIPE_NOT_CONFIGURED");
  client ??= new Stripe(env.stripeKey, { appInfo: { name: "installation-academy", version: "0.1.0" } });
  return client;
}
