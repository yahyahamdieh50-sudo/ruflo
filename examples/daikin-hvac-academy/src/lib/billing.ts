import type Stripe from "stripe";
import { query, queryOne, uuid, audit } from "./db";
import { env } from "./env";
import { getStripe } from "./stripe";
import { formatUsd, type Plan } from "./plans";
import { sendPaymentFailedEmail, sendPaymentSuccessEmail } from "./emails";
import type { Tier } from "./entitlements";

export class BillingError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

interface BillingUser { id: string; email: string; name: string; stripe_customer_id: string | null; email_verified_at: string | null }

export async function ensureStripeCustomer(user: BillingUser): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const c = await getStripe().customers.create({ email: user.email, name: user.name, metadata: { user_id: user.id } });
  await query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2", [c.id, user.id]);
  return c.id;
}

const LIVE = ["active", "trialing", "past_due"];
export const getLiveSubscription = (userId: string) =>
  queryOne<{ stripe_subscription_id: string; plan_code: Tier; interval: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; pending_plan_code: Tier | null }>(
    `SELECT * FROM subscriptions WHERE user_id=$1 AND status IN ('active','trialing','past_due') ORDER BY created_at DESC LIMIT 1`, [userId]);

async function getPlan(code: Tier, interval: "month" | "year"): Promise<Plan> {
  const plan = await queryOne<Plan>("SELECT * FROM plans WHERE code=$1 AND interval=$2 AND active=true", [code, interval]);
  if (!plan) throw new BillingError("plan_unavailable");
  if (!plan.stripe_price_id) throw new BillingError("plan_not_synced", "Plan has not been synced to Stripe yet (Admin → Pricing).");
  return plan;
}

export async function createCheckoutSession(user: BillingUser, code: Tier, interval: "month" | "year", promoCode?: string): Promise<string> {
  if (!user.email_verified_at) throw new BillingError("email_unverified");
  if (await getLiveSubscription(user.id)) throw new BillingError("already_subscribed");
  const plan = await getPlan(code, interval);
  const customer = await ensureStripeCustomer(user);

  let discounts: Stripe.Checkout.SessionCreateParams["discounts"];
  if (promoCode) {
    const promo = await queryOne<{ stripe_promotion_code_id: string | null }>(
      "SELECT stripe_promotion_code_id FROM promo_codes WHERE lower(code)=lower($1) AND active=true", [promoCode.trim()]);
    if (!promo?.stripe_promotion_code_id) throw new BillingError("promo_invalid");
    discounts = [{ promotion_code: promo.stripe_promotion_code_id }];
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: plan.stripe_price_id!, quantity: 1 }],
    ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    automatic_tax: { enabled: env.stripeAutomaticTax },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    metadata: { user_id: user.id, plan_code: code },
    subscription_data: { metadata: { user_id: user.id, plan_code: code } },
    success_url: `${env.appUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${env.appUrl}/pricing?checkout=cancelled`,
  });
  if (!session.url) throw new BillingError("checkout_failed");
  return session.url;
}

export async function createPortalSession(user: BillingUser): Promise<string> {
  const customer = await ensureStripeCustomer(user);
  const s = await getStripe().billingPortal.sessions.create({ customer, return_url: `${env.appUrl}/dashboard/billing` });
  return s.url;
}

/** Upgrade → immediate with proration. Downgrade → scheduled for the end of the paid period. */
export async function changePlan(user: BillingUser, code: Tier, interval: "month" | "year") {
  const sub = await getLiveSubscription(user.id);
  if (!sub) throw new BillingError("no_subscription");
  const target = await getPlan(code, interval);
  const stripe = getStripe();
  const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const item = current.items.data[0];
  if (item.price.id === target.stripe_price_id) return { mode: "noop" as const };

  const isUpgrade = code === "pro" && sub.plan_code === "basic";
  if (isUpgrade) {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: item.id, price: target.stripe_price_id! }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });
    await audit(user.id, "billing.upgrade", sub.stripe_subscription_id, { to: code });
    return { mode: "immediate" as const };
  }

  // Downgrade (or interval switch): keep current entitlement until period end, then switch via a schedule.
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.stripe_subscription_id });
  const phase = schedule.phases[0];
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      { items: [{ price: item.price.id, quantity: 1 }], start_date: phase.start_date, end_date: phase.end_date },
      { items: [{ price: target.stripe_price_id!, quantity: 1 }] },
    ],
  });
  await query("UPDATE subscriptions SET pending_plan_code=$1, updated_at=now() WHERE stripe_subscription_id=$2", [code, sub.stripe_subscription_id]);
  await audit(user.id, "billing.downgrade_scheduled", sub.stripe_subscription_id, { to: code });
  return { mode: "scheduled" as const };
}

export async function setCancelAtPeriodEnd(user: BillingUser, cancel: boolean) {
  const sub = await getLiveSubscription(user.id);
  if (!sub) throw new BillingError("no_subscription");
  await getStripe().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: cancel });
  await query("UPDATE subscriptions SET cancel_at_period_end=$1, updated_at=now() WHERE stripe_subscription_id=$2", [cancel, sub.stripe_subscription_id]);
  await audit(user.id, cancel ? "billing.cancel" : "billing.resume", sub.stripe_subscription_id);
}

/** Pull the latest state from Stripe (used by the "refresh" button if a webhook is delayed). */
export async function refreshFromStripe(user: BillingUser) {
  if (!user.stripe_customer_id) return;
  const list = await getStripe().subscriptions.list({ customer: user.stripe_customer_id, status: "all", limit: 10 });
  for (const s of list.data) await upsertSubscription(s);
}

// ── Admin: plan & promo sync ───────────────────────────────────────────
export async function syncPlanToStripe(planId: string) {
  const plan = await queryOne<Plan>("SELECT * FROM plans WHERE id=$1", [planId]);
  if (!plan) throw new BillingError("not_found");
  const stripe = getStripe();
  const key = `stripe_product_${plan.code}`;
  const setting = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key=$1", [key]);
  let productId = setting?.value;
  if (!productId) {
    const p = await stripe.products.create({ name: `Installation Academy — ${plan.code === "pro" ? "Pro" : "Basic"}`, metadata: { plan_code: plan.code } });
    productId = p.id;
    await query("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2", [key, JSON.stringify(productId)]);
  } else productId = typeof productId === "string" ? productId : String(productId);
  const price = await stripe.prices.create({
    product: productId, currency: "usd", unit_amount: plan.price_usd_cents,
    recurring: { interval: plan.interval }, metadata: { plan_code: plan.code },
  });
  if (plan.stripe_price_id) await stripe.prices.update(plan.stripe_price_id, { active: false }).catch(() => {});
  await query("UPDATE plans SET stripe_price_id=$1 WHERE id=$2", [price.id, planId]);
  return price.id;
}

export async function createPromo(i: { code: string; percentOff?: number; amountOffCents?: number; maxRedemptions?: number; expiresAt?: Date }, actorId: string) {
  if (!!i.percentOff === !!i.amountOffCents) throw new BillingError("promo_needs_one_discount");
  const code = i.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new BillingError("promo_code_invalid");
  const stripe = getStripe();
  const coupon = await stripe.coupons.create({
    duration: "once",
    ...(i.percentOff ? { percent_off: i.percentOff } : { amount_off: i.amountOffCents, currency: "usd" }),
  });
  const pc = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id }, code,
    max_redemptions: i.maxRedemptions, expires_at: i.expiresAt ? Math.floor(i.expiresAt.getTime() / 1000) : undefined,
  } as any); // `promotion` shape is the current API; older API versions used `coupon`
  await query(
    "INSERT INTO promo_codes (id,code,percent_off,amount_off_cents,max_redemptions,expires_at,stripe_coupon_id,stripe_promotion_code_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [uuid(), code, i.percentOff ?? null, i.amountOffCents ?? null, i.maxRedemptions ?? null, i.expiresAt?.toISOString() ?? null, coupon.id, pc.id],
  );
  await audit(actorId, "promo.create", code);
}

// ── Webhook processing ─────────────────────────────────────────────────
const iso = (sec?: number | null) => (sec ? new Date(sec * 1000).toISOString() : null);

export async function upsertSubscription(sub: Stripe.Subscription) {
  const s = sub as any;
  const item = s.items?.data?.[0];
  const priceId: string | undefined = item?.price?.id;
  const interval: string = item?.price?.recurring?.interval ?? "month";
  // Plan code: price metadata → our plans table → subscription metadata.
  let planCode: Tier | undefined = item?.price?.metadata?.plan_code ?? undefined;
  if (!planCode && priceId) planCode = (await queryOne<{ code: Tier }>("SELECT code FROM plans WHERE stripe_price_id=$1", [priceId]))?.code;
  planCode ??= s.metadata?.plan_code;
  if (planCode !== "basic" && planCode !== "pro") throw new Error(`Cannot resolve plan for subscription ${s.id}`);

  const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
  const user = await queryOne<{ id: string }>("SELECT id FROM users WHERE stripe_customer_id=$1", [customerId])
    ?? (s.metadata?.user_id ? await queryOne<{ id: string }>("SELECT id FROM users WHERE id=$1", [s.metadata.user_id]) : null);
  if (!user) throw new Error(`No user for Stripe customer ${customerId}`);
  if (s.metadata?.user_id === user.id) await query("UPDATE users SET stripe_customer_id=COALESCE(stripe_customer_id,$1) WHERE id=$2", [customerId, user.id]);

  const periodEnd = iso(item?.current_period_end ?? s.current_period_end);
  await query(
    `INSERT INTO subscriptions (id,user_id,stripe_subscription_id,plan_code,interval,status,current_period_end,cancel_at_period_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET plan_code=$4, interval=$5, status=$6, current_period_end=$7,
       cancel_at_period_end=$8, updated_at=now(),
       pending_plan_code=CASE WHEN subscriptions.pending_plan_code=$4 THEN NULL ELSE subscriptions.pending_plan_code END`,
    [uuid(), user.id, s.id, planCode, interval, s.status, periodEnd, !!(s.cancel_at_period_end || s.cancel_at)],
  );
  return user.id;
}

async function recordInvoice(inv: any, status: "paid" | "failed") {
  const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  const user = await queryOne<{ id: string; email: string }>("SELECT id,email FROM users WHERE stripe_customer_id=$1", [customerId]);
  const amount = status === "paid" ? inv.amount_paid : inv.amount_due;
  const prev = await queryOne<{ status: string }>("SELECT status FROM payments WHERE stripe_invoice_id=$1", [inv.id]);
  await query(
    `INSERT INTO payments (id,user_id,stripe_invoice_id,amount_cents,currency,status,hosted_invoice_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET status=$6, amount_cents=$4, hosted_invoice_url=$7`,
    [uuid(), user?.id ?? null, inv.id, amount ?? 0, inv.currency ?? "usd", status, inv.hosted_invoice_url ?? null],
  );
  if (!user || prev?.status === status) return;
  if (status === "paid") {
    const sub = await getLiveSubscription(user.id);
    await sendPaymentSuccessEmail(user.email, sub?.plan_code ?? "academy", formatUsd(amount ?? 0), inv.hosted_invoice_url);
  } else await sendPaymentFailedEmail(user.email);
}

export interface WebhookDeps { retrieveSubscription(id: string): Promise<Stripe.Subscription> }

/** Idempotent. Returns false if the event was already processed. */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<boolean> {
  try {
    await query("INSERT INTO stripe_events (id,type) VALUES ($1,$2)", [event.id, event.type]);
  } catch (e: any) {
    if (e?.code === "23505" || /duplicate key|unique/i.test(e?.message ?? "")) return false; // already processed
    throw e;
  }
  try {
    const obj = event.data.object as any;
    switch (event.type) {
      case "checkout.session.completed": {
        const userId = obj.client_reference_id ?? obj.metadata?.user_id;
        if (userId && obj.customer) await query("UPDATE users SET stripe_customer_id=COALESCE(stripe_customer_id,$1) WHERE id=$2", [obj.customer, userId]);
        if (obj.mode === "subscription" && obj.subscription) {
          await upsertSubscription(await deps.retrieveSubscription(typeof obj.subscription === "string" ? obj.subscription : obj.subscription.id));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSubscription(obj as Stripe.Subscription);
        break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await recordInvoice(obj, "paid");
        break;
      case "invoice.payment_failed":
        await recordInvoice(obj, "failed");
        break;
      default:
        break; // ignored event types are still recorded for idempotency
    }
    return true;
  } catch (e) {
    await query("DELETE FROM stripe_events WHERE id=$1", [event.id]); // let Stripe retry
    throw e;
  }
}
