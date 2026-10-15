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
| Payments | Network International N-Genius or Stripe Checkout (hosted pages), **only when keys are set** | Card data never touches this server |
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
| `ZIINA_API_TOKEN` | Turn on Ziina payments (test mode). |
| `ZIINA_LIVE=1` | Switch Ziina from test mode to live payments (only after a successful test payment). |
| `NGENIUS_API_KEY`, `NGENIUS_OUTLET_REF` | Turn on card payments via Network International N-Genius (sandbox by default). |
| `NGENIUS_API_BASE`, `NGENIUS_REALM` | Live API base URL and realm name from your Network International onboarding. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Turn on card payments via Stripe Checkout. |
| `YAHIVO_DB` | Database file path (default `data/yahivo.db`). |
| `YAHIVO_UPLOADS` | Folder for photos uploaded in the admin (default `public/uploads`). Point it at the persistent disk in production. |
| `YAHIVO_SEED` | Catalogue loaded into a new, empty database: `yahivo` (default, your real products), `sample` (test data) or `none`. |
| `TRUST_PROXY=1` | Only behind a reverse proxy: use `X-Forwarded-For` for rate limiting. |

Keep secrets in a private `.env` file: copy `.env.example` to `.env` and fill it in. `npm start` loads it automatically, and it is git-ignored. Never paste keys into chat, email or the website files. If a key is ever exposed, revoke it at the provider and create a new one. They are only read on the server and never sent to the browser.

## Checks and tests

```bash
npm run check      # syntax, seed data, 500-line limit, no secret values in public/
npm test           # 41 unit + API tests (in-memory DB, mocked Ziina / N-Genius)
npm run test:e2e   # Playwright/Chromium: admin setup, desktop + mobile purchase, fulfilment, slip/CSV/privacy, assistant
```

## What's included

**Storefront.** Homepage (hero, shop-by-style, featured, new arrivals, social band), collection and search with size, colour, style, price, in-stock and new filters plus sorting, and product pages (gallery, colour/size selection with live stock, low-stock and sold-out states, quantity, sticky add-to-cart on mobile, details/size/delivery/returns sections, share buttons). Also cart, checkout, order confirmation, order tracking (number + email), size guide, FAQs, shipping & returns, contact, privacy policy and 404.

**Totals before ordering.** The checkout shows items, the packing fee, the delivery fee (by zone, with an optional free-over threshold), tax (inclusive or exclusive, as configured) and the total. The server recomputes every price and refuses the order if the total the customer saw is out of date.

**Admin (`/admin`).**
- **Dashboard:** order counts, integration status (what is and isn't connected) and the launch checklist.
- **Products:** add, edit, hide or delete products; price; sizes; colours with swatches; stock per colour and size; photo upload (JPEG/PNG/WebP, checked by file signature, max 5 MB) or image URLs.
- **Orders:** filter and search; **Export CSV** for your courier or packing team (respects the current filter; contains customer addresses — keep it private); a printable **packing slip** per order (no prices; tick boxes for packer/checker); **Remove customer data** on delivered/cancelled orders for privacy requests (keeps items, totals and tax); status flow **Received → Preparing → Packed → Handed to courier → Delivered** (or **Cancelled**, which returns stock); courier and tracking number; packing notes; payment status; internal notes; full history.
- **Delivery & couriers:** zones (country + areas such as emirates, fee, free-over, estimate) and couriers (name, tracking link template, phone, notes).
- **Packing:** options with fees, customer description and internal materials.
- **Tax:** name, rate, prices include or exclude tax, whether delivery and packing are taxable, registration number, and a **"confirmed by me/my accountant"** flag.
- **Payments**, **Store info & social**, **Policies & FAQs**, **Size guide**, **Analytics**.

### Courier workflow (manual, no courier API connected)

The store is set up with **iMile** as its cash-on-delivery courier. iMile collects the cash from the customer and pays it to you weekly. Mark the order **Paid** once the payout arrives.

1. Admin → Delivery & couriers: add each courier you use. A tracking link such as `https://courier.example/track?n={tracking}` is optional.
2. When packing an order, set the status to **Preparing**, then **Packed**, and record the packing notes.
3. When the courier collects it, choose the courier, enter the tracking number and set **Handed to courier**. The app requires a courier before this status.
4. The customer's order page shows the courier, tracking number and tracking link.
5. When the courier confirms delivery, set **Delivered**.

## Your catalogue (imported 2026-10-14)

`data/seed/products.yahivo.json` holds your hoodies. Names, AED prices, colours, descriptions, materials, fit, care and measurements were read (read-only) from your Shopify store. Nothing was changed on Shopify. A new database starts with this catalogue (set `YAHIVO_SEED=sample` for test data). If you already ran the store with sample data, delete `data/yahivo.db` once to reload it.

- **Published (11):** YAHIVO Crown Graphic (Black / Klein Blue / White), "Mine" and "Yours" couples hoodies, Pink Ride, Script Pink / Apricot, Oversize Fleeced Hoodie ×2 (YAHIVO logo) and Brooklyn Varsity, plus Arabic Typography, Coffee Graphic and Logo Oversized Fleece. These last three looked sold out in the recording, but Shopify lists them as available, so they are on sale with the same 10-per-size stock.
- **Published with your photos (3), rights confirmed by you on 2026-10-14:** Peace (Light Green, AED 183.61), Just Do It (Light Gray, AED 172.26) and Tom and Jerry (White and Black, AED 153.52). Keep your licence paperwork for these on file.
- **Not added:** the white Maserati hoodie isn't in your Shopify store or the recording, so its price is unknown. Add it in Admin → Products once you've set a price. The Spider-Man piece is a T-shirt, and this store only sells hoodies.
- **Still hidden (9), until you confirm you hold the rights:** these designs use third-party brands or characters (Nike, adidas, Toyota, BMW, Maserati, Pink Panther, Bugs Bunny, Tom & Jerry, the Simpsons, Joker) or a real person's portrait. Selling them without a licence is a legal risk, and payment providers generally prohibit it. Admin → Products → tick **Published** to show one.
- **Not imported:** the 5 T-shirts (Essential Cotton ×3, Rebel Rabbit, Unisex Oversized) because this store sells hoodies only.
- **Sizes:** S, M, L, XL on all live hoodies (confirmed by you). **Stock:** 10 per size for every available colour (from you). It goes down automatically with each order and back up if you cancel. Adjust it any time in Admin → Products. Shopify also offers 2XL (and 3XL on some designs). Add those in Admin → Products if you stock them.
- **From Shopify:** descriptions, fabric and weight (350 gsm fleece, 380 gsm and 430 gsm heavyweight), fit, care, and measurements. Coffee Graphic is Light Gray, and Script comes in two colours, Pink and Apricot. Shopify's delivery estimate ("7–9 business days, including production") was left out because it describes print-on-demand. Add your own estimate per zone if you want one.
- **Photos** are still cropped from the recording (about 400px). Shopify's image CDN is blocked in the build environment, so the 1400px originals could not be downloaded. Upload them in Admin → Products. Brooklyn Varsity, Logo Oversized Fleece and Script Apricot have no photo and show an illustration.
- **Logo:** your logo is used in the header, footer, favicon and social share image (`public/img/logo-*.png`).

## Payments

**Current setup: cash on delivery.** No online payment is active. Customers place the order and pay cash when it's delivered; nothing is charged online. The confirmation page shows the exact amount to have ready. You confirm the order with the customer, make sure whoever delivers collects the cash, then mark the order **Paid** in Admin → Orders. Delivery: **Dubai AED 15**, **rest of UAE AED 25** (Admin → Delivery to change).

- **No payment provider is configured**, so no payment method is shown to customers.
- **Ziina (your provider):**
  1. Finish Ziina business verification. Your Ziina app shows **"Resubmit documents"**, so the account isn't verified yet; payments can't go live until Ziina approves it.
  2. In Ziina, create an **API key** with the payment-intent permission (`write_payment_intents`).
  3. Set `ZIINA_API_TOKEN` on the server (never in the website files or chat). The store runs Ziina in **test mode** (`test: true`, test cards) until you also set `ZIINA_LIVE=1`.
  4. Customers pay on Ziina's own page. On return, the server asks Ziina for the payment and marks the order **Paid** only if Ziina reports `completed` **and** the amount matches. Admin → order → *Check payment with Ziina* re-checks manually.
  5. ⚠️ Built from Ziina's public API docs and tested against a mocked Ziina, not your account. Make a test payment, then one live payment of a small amount, before launch. If a customer abandons the payment page, the order stays *Awaiting payment* with stock reserved; cancel it to release the stock.
- **Network International N-Genius (UAE card acquirer, recommended for AED):**
  1. Get an N-Genius Online merchant account from Network International. In the N-Genius portal, create a **Service Account API key** and note your **Outlet reference**.
  2. Set `NGENIUS_API_KEY` and `NGENIUS_OUTLET_REF`. Without `NGENIUS_API_BASE` the store uses the **sandbox** (`https://api-gateway.sandbox.ngenius-payments.com`). For live payments, set `NGENIUS_API_BASE` (and `NGENIUS_REALM`, if your onboarding pack specifies one) to the values Network International gives you.
  3. Customers are sent to Network International's hosted payment page. On return, the server asks N-Genius for the payment state and marks the order **Paid** only if the provider confirms payment **and** the amount matches. The redirect itself is never trusted. Admin → order → *Check payment with Network International* re-checks manually.
  4. ⚠️ This adapter was built from the public N-Genius docs and tested against a mocked provider, **not** a real sandbox account. Make a sandbox payment (and a failed one) before going live. If a customer abandons the payment page, the order stays *Awaiting payment* with its stock reserved; cancel it in the admin to release the stock.
- **Cash on delivery:** Admin → Payments → *"Offer cash on delivery"* (on). Customers order without paying online and pay cash on delivery. Mark the order *Paid* once the cash is collected. You can keep it on alongside an online provider.
- **Stripe (card payments):**
  1. Create a Stripe account for the business and complete activation for the UAE / AED.
  2. Set `STRIPE_SECRET_KEY` (use test mode `sk_test_…` first).
  3. In the Stripe dashboard, add a webhook endpoint `https://<your-domain>/api/stripe/webhook` for the events `checkout.session.completed` and `checkout.session.expired`, then set `STRIPE_WEBHOOK_SECRET`.
  4. Place a test order with Stripe's test cards and confirm it is marked *Paid* in the admin before going live.
- The site never collects or stores card numbers. Other local providers (for example Network International, Telr, Tap or Checkout.com) can be added as an adapter like `lib/stripe.mjs`.

## AI customer support

The chat ("Ask AI" button, bottom right) is the store's first line of customer support, 24/7. It is labelled as an AI assistant everywhere: chat header, Contact page, order page and FAQ.

- **What it does:** recommends in-stock hoodies by style, colour, size and budget, and answers sizing, delivery, payment (cash on delivery), packing, tax and returns questions from your store data. It also **checks order status** once the customer gives their order number (YH-1001) **and** the email used at checkout. This is the same check as the Track order page and shares its rate limit (10 checks per 10 minutes per device). It shows status, items, total, payment and courier/tracking, never the address.
- **Cancels orders by itself:** a verified customer can cancel an order while it is still **Received** (and unpaid). The AI explains what will be cancelled and the customer must reply exactly `CANCEL YH-1001`. The store's own code then cancels it and returns the stock; the AI model never executes anything itself. Packed or shipped orders, refunds, exchanges and address changes go to you via WhatsApp/phone/email.
- **AI admin assistant (Admin → AI assistant):** you type plain requests: "what do I need to pack today?", "mark YH-1003 packed", "YH-1003 shipped with iMile 6031225370927", "YH-1003 paid", "cancel YH-1003", "set Crown black M stock to 5", "low stock". It lists the changes with checkboxes and **nothing changes until you press Confirm**. Every change is re-checked against live data when you confirm, and recorded in the order history as "admin (via AI assistant)".
- **Daily summary:** the admin Dashboard opens with today's summary: new orders, what to pack, parcels waiting for iMile, delivered orders whose cash isn't marked paid, and low or sold-out stock. It is computed from your data, so it never guesses.
- **Basic mode (current):** automatic rule-based answers built only from your store data, labelled *"Basic mode"*. It works with no API key.
- **Full AI mode:** add `ANTHROPIC_API_KEY` to the Render environment (or `.env` locally) and redeploy; `npm install` already installs the AI library. Answers then come from Claude (`claude-opus-5-5` by default), still grounded only in your store data and the verified order lookup. Cost is roughly 1 US cent per answer (about $4 per million input tokens and $20 per million output tokens; the store data is cached between messages). To make it about 10 times cheaper, set `YAHIVO_AI_MODEL=claude-haiku-5-5`. If the AI service fails, the chat falls back to basic answers.

## Going live on Render at shop.yahivo.com (not done yet)

Chosen setup: [Render](https://render.com) **Starter** web service plus a 1 GB persistent disk, about US$7.25/month. Check Render's pricing page for the current price. The store stays separate from www.yahivo.com. Only one DNS record is added for the `shop` subdomain.

**1. Before you start:** merge the pull request so the store is on your `main` branch. Pick an admin password of 12+ characters and keep it private.

**2. Create the service** (Render dashboard → **New** → **Web Service** → connect GitHub → `yahyahamdieh50-sudo/ruflo`):

| Setting | Value |
|---|---|
| Branch | `main` |
| Root Directory | `examples/yahivo-store` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Starter** (free instances can't have a disk, and orders would be lost) |

**3. Add a disk** (Advanced → **Add Disk**): name `data`, mount path `/var/data`, size 1 GB.

**4. Environment variables** (Advanced → **Add Environment Variable**):

| Key | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `HOST` | `0.0.0.0` |
| `SITE_URL` | `https://shop.yahivo.com` |
| `TRUST_PROXY` | `1` |
| `YAHIVO_DB` | `/var/data/yahivo.db` |
| `YAHIVO_UPLOADS` | `/var/data/uploads` |
| `ADMIN_PASSWORD` | your admin password (never share it or put it in GitHub) |

Leave out the payment and AI keys until you're ready. The store runs with cash on delivery and the demo assistant.

**5. Deploy:** click **Create Web Service**. After a few minutes, check it at the `…onrender.com` address Render shows. Log in at `/admin` and check the products, delivery fees and policies.

**6. Connect shop.yahivo.com:**
1. In Render: service → **Settings** → **Custom Domains** → **Add** → `shop.yahivo.com`. Render shows a target such as `yahivo-store.onrender.com`.
2. Where yahivo.com's DNS is managed (for example Shopify admin → **Settings → Domains → yahivo.com → Domain settings → Edit DNS settings**), add one record: type **CNAME**, name `shop`, value = the Render target. Don't change any other record. www.yahivo.com keeps working as before.
3. Back in Render, click **Verify**. Render issues the HTTPS certificate automatically. This can take from a few minutes up to an hour.

**Good to know**
- With a disk attached, each update has a short restart (seconds) instead of a seamless switch-over.
- Back up regularly. Render keeps disk snapshots (see your service's **Disks** page), and you can also download the orders CSV from the admin each week.
- Updates: anything merged into `main` deploys automatically.

## Launch checklist

Admin → Dashboard shows this live. Today, everything below is still needed from you:

- [x] Product names, prices, colours, descriptions, materials and care (from Shopify)
- [x] YAHIVO logo
- [x] Sizes (S–XL) on live hoodies
- [x] Delivery zones and fees (Dubai AED 15, rest of UAE AED 25)
- [x] Stock: 10 per size per available colour
- [x] Contact: +971 52 586 6612 (phone and WhatsApp)
- [x] Contact email and address, shipping and returns policies (adapted from Shopify), and a size guide for S–XL
- [ ] **Original product photos** (current ones are low-resolution crops)
- [ ] **Decide on the 9 hidden designs** (third-party brands/characters/portrait). Keep licences on file for the 3 you published
- [ ] **Delivery estimates** you can promise (optional)
- [x] Courier: **iMile** for cash on delivery. The tracking link uses parcelsapp.com because iMile's own site has no public link format. Estimated cost is about AED 10 per parcel plus about 3% COD fee (minimum AED 2), paid out weekly, from third-party sources.
- [x] iMile account opened (2026-10-14)
- [ ] **Get iMile's rate card and weekly cash payout terms** in writing, from the app or your account manager. Change the tracking link in Admin → Delivery if iMile gives you its own
- [ ] **Packing options**, fees and materials
- [ ] **Tax settings**, confirmed with your accountant. Nothing is assumed; tax is off.
- [ ] **Ziina**: finish account verification, create an API key, set `ZIINA_API_TOKEN`, run a test payment, then set `ZIINA_LIVE=1`. Optional: cash on delivery works without it.
- [ ] Optional: opening hours
- [ ] **Social profile URLs** for Facebook, Instagram and TikTok. The links you sent are the Facebook Accounts Centre/settings page and the Instagram home page, not profile pages, so they were not added. TikTok was not provided.
- [ ] **Review the adapted policies**, and have the privacy page legally reviewed
- [ ] Optional: `ANTHROPIC_API_KEY` for the live assistant; a GA4 ID (update the privacy policy and cookie consent if you enable it)
