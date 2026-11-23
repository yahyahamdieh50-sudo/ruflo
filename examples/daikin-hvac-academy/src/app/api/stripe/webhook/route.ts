import { getStripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { handleStripeEvent } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Entitlements change ONLY here (signature-verified), never from the browser redirect. */
export async function POST(req: Request) {
  if (!env.stripeKey || !env.stripeWebhookSecret) return new Response("Stripe webhook not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  const stripe = getStripe();
  let event;
  try { event = stripe.webhooks.constructEvent(await req.text(), sig, env.stripeWebhookSecret); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  try {
    await handleStripeEvent(event, { retrieveSubscription: (id) => stripe.subscriptions.retrieve(id) });
    return Response.json({ received: true });
  } catch (e) {
    console.error("[stripe-webhook]", event.type, (e as Error).message);
    return new Response("Processing error", { status: 500 }); // Stripe will retry
  }
}
