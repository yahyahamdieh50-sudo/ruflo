# YAHIVO Store (local, unpublished)

A standalone, mobile-first hoodie storefront for YAHIVO. It has an admin area for products, orders, packing, delivery and tax, plus an AI shopping assistant.
It is a **new website, separate from www.yahivo.com**. It does not connect to or change the existing site's code, data or checkout.

> Status: runs locally only. Nothing is deployed, no services are bought, and no live settings are changed.

## Why this stack

The repository this lives in (`ruflo`) is an AI-orchestration toolkit. It has no storefront code, and www.yahivo.com could not be reached (DNS did not resolve), so no assets could be reused. The store is therefore a self-contained project:

| Piece | Choice | Why |
|---|---|---|
| Server | Node.js ≥ 22.13, built-in `node:http` | No framework or npm install needed to run; small attack surface |
| Database | Built-in `node:sqlite` (`data/yahivo.db`) | Transactions for stock and orders, a single file, easy to back up |
| Frontend | Vanilla ES modules + CSS, no build step | Fast to load, nothing to compile |
| Payments | Stripe Checkout (hosted page), **only when keys are set** | Card data never touches this server |
| AI assistant | Anthropic Claude via the official SDK, **only when `ANTHROPIC_API_KEY` is set** | Otherwise a clearly labelled demo mode |

The folder is self-contained (`examples/yahivo-store/`). You can move it into its own repository at any time.

## Run it locally

```bash
cd examples/yahivo-store
ADMIN_PASSWORD='choose-a-long-password' npm start
# Store:  http://localhost:4173
# Admin:  http://localhost:4173/admin
```

On first start the database is created with **sample products** (clearly bannered as sample data) and **empty settings**. Online ordering stays closed until you add at least one delivery zone and one payment option in the admin.

| Env var | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Enables `/admin` (12+ characters). Without it, the admin is disabled. |
| `PORT`, `HOST` | Default `4173`, `127.0.0.1` |
| `SITE_URL` | Public URL, e.g. `https://shop.yahivo.com`. Used for canonical/social links; `https://` also turns on secure cookies. |
| `ANTHROPIC_API_KEY` | Turns the assistant from demo to live (see below). |
| `YAHIVO_AI_MODEL` | Optional model override (default `claude-opus-5-5`). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Turn on card payments via Stripe Checkout. |
| `YAHIVO_DB` | Database file path (default `data/yahivo.db`). |
| `YAHIVO_SEED_SAMPLE=0` | Start with no sample products. |
| `TRUST_PROXY=1` | Only behind a reverse proxy: use `X-Forwarded-For` for rate limiting. |

Keep secrets in environment variables or an uncommitted `.env` that your process manager loads. They are only read on the server and never sent to the browser.

## Checks and tests

```bash
npm run check      # syntax, seed data, 500-line limit, no secret values in public/
npm test           # 29 unit + API tests (in-memory DB)
npm run test:e2e   # Playwright/Chromium: admin setup, desktop + mobile purchase, fulfilment, assistant
```

## What's included

**Storefront.** Homepage (hero, shop-by-style, featured, new arrivals, social band), collection and search with size, colour, style, price, in-stock and new filters plus sorting, and product pages (gallery, colour/size selection with live stock, low-stock and sold-out states, quantity, sticky add-to-cart on mobile, details/size/delivery/returns sections, share buttons). Also cart, checkout, order confirmation, order tracking (number + email), size guide, FAQs, shipping & returns, contact, privacy policy and 404.

**Totals before ordering.** The checkout shows items, the packing fee, the delivery fee (by zone, with an optional free-over threshold), tax (inclusive or exclusive, as configured) and the total. The server recomputes every price and refuses the order if the total the customer saw is out of date.

**Admin (`/admin`).**
- **Dashboard:** order counts, integration status (what is and isn't connected) and the launch checklist.
- **Products:** add, edit, hide or delete products; price; sizes; colours with swatches; stock per colour and size; photo upload (JPEG/PNG/WebP, checked by file signature, max 5 MB) or image URLs.
- **Orders:** filter and search; status flow **Received → Preparing → Packed → Handed to courier → Delivered** (or **Cancelled**, which returns stock); courier and tracking number; packing notes; payment status; internal notes; full history.
- **Delivery & couriers:** zones (country + areas such as emirates, fee, free-over, estimate) and couriers (name, tracking link template, phone, notes).
- **Packing:** options with fees, customer description and internal materials.
- **Tax:** name, rate, prices include or exclude tax, whether delivery and packing are taxable, registration number, and a **"confirmed by me/my accountant"** flag.
- **Payments**, **Store info & social**, **Policies & FAQs**, **Size guide**, **Analytics**.

### Courier workflow (manual, no courier API connected)

1. Admin → Delivery & couriers: add each courier you use. A tracking link such as `https://courier.example/track?n={tracking}` is optional.
2. When packing an order, set the status to **Preparing**, then **Packed**, and record the packing notes.
3. When the courier collects it, choose the courier, enter the tracking number and set **Handed to courier**. The app requires a courier before this status.
4. The customer's order page shows the courier, tracking number and tracking link.
5. When the courier confirms delivery, set **Delivered**.

## Payments

- **No payment provider is configured**, so no payment method is shown to customers.
- **Placeholder:** Admin → Payments → *"Allow order requests without online payment"*. Customers can then submit an order that is clearly labelled as unpaid. You contact them, arrange payment, and mark the order *Paid*. Turn this off when a real provider is live.
- **Stripe (card payments):**
  1. Create a Stripe account for the business and complete activation for the UAE / AED.
  2. Set `STRIPE_SECRET_KEY` (use test mode `sk_test_…` first).
  3. In the Stripe dashboard, add a webhook endpoint `https://<your-domain>/api/stripe/webhook` for the events `checkout.session.completed` and `checkout.session.expired`, then set `STRIPE_WEBHOOK_SECRET`.
  4. Place a test order with Stripe's test cards and confirm it is marked *Paid* in the admin before going live.
- The site never collects or stores card numbers. Other local providers (for example Network International, Telr, Tap or Checkout.com) can be added as an adapter like `lib/stripe.mjs`.

## AI assistant

- **Demo mode (current):** rule-based answers built only from your store data, labelled *"Demo mode"* in the chat. It recommends in-stock hoodies by style, colour, size and budget, and answers delivery, packing, tax, returns and sizing questions from your settings. Anything else gets *"I'm not confident…"* plus your contact channel. It cannot see orders and points customers to Track order.
- **Live mode:** set `ANTHROPIC_API_KEY`, run `npm install` once in this folder (installs the optional `@anthropic-ai/sdk`), then restart. The model receives only the verified store data and is instructed not to invent details, stock, dates, tax treatment or order status. Product links are checked against your real catalog. If the API fails, the assistant falls back to demo answers.

## Deploying later (not done)

1. Host on any Node 22 server or container (for example a small VPS, Render, Railway or Fly.io) with a **persistent disk** for `data/` and `public/uploads/`.
2. Put it behind HTTPS (most hosts do this automatically). Set `SITE_URL=https://your-domain`, `HOST=0.0.0.0`, and `TRUST_PROXY=1` if behind a proxy.
3. **Custom domain:** keep www.yahivo.com as it is if you want the sites separate. Use a subdomain such as `shop.yahivo.com`: add the DNS record your host gives you (usually a `CNAME` to the host) at your domain registrar, then add the domain in the host's dashboard.
4. Back up `data/yahivo.db` regularly.

## Launch checklist

Admin → Dashboard shows this live. Today, everything below is still needed from you:

- [ ] **Products:** real hoodie names, descriptions, materials, fit, **prices**, sizes, colours and **stock**, then delete or unpublish the SAMPLE items
- [ ] **Product photos** and the **YAHIVO logo** (the site uses a placeholder wordmark and illustrations)
- [ ] **Delivery zones and fees** and the delivery estimates you can promise
- [ ] **Couriers** you use (for the manual tracking workflow)
- [ ] **Packing options**, fees and materials
- [ ] **Tax settings**, confirmed with your accountant. Nothing is assumed; tax is off.
- [ ] **Payment provider** (Stripe keys or another provider). Decide whether to keep the pay-later placeholder.
- [ ] **Contact details** (email, WhatsApp, phone, address, hours)
- [ ] **Social profile URLs** for Facebook, Instagram and TikTok. The links you sent are the Facebook Accounts Centre/settings page and the Instagram home page, not profile pages, so they were not added. TikTok was not provided.
- [ ] **Shipping policy**, **returns/exchanges policy**, privacy contact email, and a legal review of the privacy page
- [ ] **Size guide measurements**
- [ ] Optional: `ANTHROPIC_API_KEY` for the live assistant; a GA4 ID (update the privacy policy and cookie consent if you enable it)
- [ ] A real social share image (the current `public/img/og-default.png` is a placeholder wordmark)
