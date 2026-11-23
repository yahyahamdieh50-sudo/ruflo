# Daikin HVAC Installation Academy

> **Independent HVAC training platform. Not affiliated with, endorsed by, or certified by Daikin Industries, Ltd.**
> No Daikin logos are used. Certificates are *academy completion* certificates, never manufacturer certification.

A full-stack training platform (Next.js 16 · React 19 · TypeScript · Tailwind · PostgreSQL · Stripe) for teaching installation,
site preparation, inspection, testing, commissioning readiness and basic troubleshooting of HVAC equipment. English/Arabic (RTL).

## What is built and verified

| Area | Status |
|---|---|
| Premium homepage, free-trailer page, course catalog (search by title / category / **model number**) | ✅ built, browser-tested |
| Auth: signup, login, email verification (POST-confirmed), password reset, profiles, student / instructor / admin roles | ✅ built, tested |
| Plans, pricing page (USD + AED display, optional yearly), server-side gated lessons, quizzes, resources, certificates | ✅ built, tested |
| Student dashboard (courses, %, continue, saved, scores, resources, certificates, subscription) | ✅ built, browser-tested |
| Admin: courses/chapters/lessons/quizzes/resources, uploads, models & sources, students & comp access, pricing, promos, analytics, **publish gate** | ✅ built, browser-tested |
| Stripe: Checkout, portal, upgrade (prorated) / downgrade (scheduled), cancel/resume, billing history, signed idempotent webhooks | ✅ built; webhook path tested with signed events. ⚠ **Not exercised against live Stripe** (see below) |
| Secured media: entitlement check on every request, HTTP Range, S3/R2 presigned URLs | ✅ tested (local driver); S3 path presigns offline, untested against a bucket |
| Grounded AI assistant (approved/accessible passages only, citations, uncertainty warnings) | ✅ built, tested. LLM summarisation optional (needs `ANTHROPIC_API_KEY`) |
| Working sample course (13 chapters, 18 lessons, flowchart, labeled diagram, 3 lesson quizzes, 10-question final, 3 checklists/templates) | ✅ seeded |

**Tests:** 66 automated tests (`npm test`) — entitlements, spec-withholding, publish gate, grading, certificates, i18n parity, auth,
learning flow, Stripe webhook lifecycle. The DB tests run on `pg-mem` by default **and pass on real PostgreSQL 19** (`TEST_DATABASE_URL`).
Additionally smoke-tested in Chromium: gating per plan, secured media (401/403/200/206), quiz → certificate, admin, RTL, mobile.

## Technical-accuracy rules (enforced in code, not just copy)

1. **Model-specific values are withheld by default.** A value (torque, pressure, charge, clearance, wiring, threshold) is rendered only if it has
   a value **and** an exact model **and** a *verified* model **and** an *approved* manual **with revision** **and** a page/section **and**
   admin verification — otherwise the student sees "WITHHELD — check the approved manual" and what is missing (`src/lib/content-rules.ts`).
2. **No invented specifications.** The sample course is generic guidance; every model-specific row is seeded as *withheld*. The only equipment
   model is `SAMPLE-MODEL-A`, labelled placeholder and un-verifiable.
3. **Publish gate:** a course publishes only after an independent technical review (reviewer ≠ author, review newer than the last content edit),
   approved sources with page refs for model-specific lessons, a verified model, and a final assessment.
4. **Assistant** answers only from passages the viewer is entitled to plus admin-approved source passages, cites them, discards LLM output
   that cites nothing/unknown passages, and warns on model-specific or hazardous questions.
5. The seeded sample course is flagged **Sample content** and has *not* been technically reviewed against manufacturer documents.

## Quick start (local)

```bash
cd examples/daikin-hvac-academy
npm install
cp .env.example .env            # set DATABASE_URL and APP_SECRET (openssl rand -base64 48)
npm run db:migrate
SEED_DEMO_USERS=true npm run db:seed   # dev only: free@/basic@/pro@/instructor@demo.test  (DemoPass-12345)
npm run dev                     # http://localhost:3000   (admin = SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npm test && npm run typecheck
```

Next.js loads `.env`; the `db:*` scripts read the shell environment (`set -a; source .env; set +a`).
Real-Postgres tests: `TEST_DATABASE_URL=postgres://… npm run test:pg` (**drops the `public` schema** — use a throwaway database).

## Deployment

1. **Database** – managed PostgreSQL (Neon, Supabase, RDS, Azure…). Set `DATABASE_URL` (+ `DATABASE_SSL=true` if required). Run `npm run db:migrate` then `npm run db:seed` once (set a strong `SEED_ADMIN_PASSWORD`, **never** `SEED_DEMO_USERS` in production).
2. **App** – any Node 20.9+ host (Vercel, Fly, Render, Azure App Service, Docker). `npm run build && npm start`. Set `APP_URL` to the public https origin and `APP_SECRET`.
3. **Media storage** – for more than one instance use `STORAGE_DRIVER=s3` (S3/Cloudflare R2): create a **private** bucket, set `S3_*`, and add a CORS rule allowing `PUT` from `APP_URL` (admin uploads go browser → bucket via presigned URL). `local` streams from `./storage/private` and only suits a single server with a persistent disk.
4. **Stripe** (start in *test mode*)
   - Set `STRIPE_SECRET_KEY`.
   - Webhook endpoint `https://<APP_URL>/api/stripe/webhook`, events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`.
   - Admin → **Pricing** → *Sync to Stripe* for each active plan (creates the Product/Price). Re-sync after changing an amount.
   - Enable the Customer Portal in the Stripe dashboard. For UAE VAT set up Stripe Tax and `STRIPE_AUTOMATIC_TAX=true`.
5. **Email** – set `SMTP_*` and `EMAIL_FROM` (use a verified sending domain with SPF/DKIM). **Without SMTP no email is sent** (it is logged); registration verification, payment and completion emails depend on this.
6. **Reverse proxy** – terminate TLS; forward `X-Forwarded-For` (used for rate limiting).

## Remaining external integrations & configuration (not done / not claimed)

- **Stripe live verification** – code is written against the current SDK types and unit/integration-tested with signed synthetic events, but has not run against Stripe's API (no keys in the build sandbox). Run a full test-mode pass: checkout, promo, upgrade, scheduled downgrade, cancel/resume, failed payment (`4000 0000 0000 0341`), portal. The downgrade-via-schedule flow in particular needs a real test.
- **SMTP provider** and domain authentication.
- **Real media** – no videos exist. Upload trailers/lessons in Admin; until then players show an explicit "not uploaded" state. Homepage/course images are original *generic illustrations*; replace with licensed photography (admin → cover image URL).
- **Real, verified Daikin content** – obtain written authorisation to reproduce or excerpt manuals; add sources (title, revision, reference, rights note), approve them, add verified models and spec rows, then have an independent technical reviewer sign off each course. Remaining 9 category courses are syllabus-only ("coming soon").
- **Arabic** – UI strings and sample-course titles/intro are a good-faith draft; have a native technical translator review. Most lesson/quiz bodies fall back to English (flagged in UI).
- **Trademark/legal** – using "Daikin" in the product name/domain and marketing needs legal review (nominative use ≠ permission). Also terms of service, privacy policy (PDPL/GDPR), refund policy, VAT registration.
- **Assistant** – set `ANTHROPIC_API_KEY` for generated answers (otherwise it returns cited passages). Retrieval is lexical BM25 over an in-memory corpus; move to pgvector/embeddings if the library grows into thousands of passages. Arabic questions only match Arabic source text.
- **Scale/ops** – rate limiter is in-process (use Redis for multi-instance); add error monitoring, backups, a scheduled job to purge expired sessions/tokens, and an out-of-band process for refunds/chargebacks (refund events are not yet handled).
- **Video DRM** – access control is server-side (per-request entitlement, short-lived signed URLs), which deters casual sharing but is not DRM.
- **Certificates** – printable HTML (browser *Save as PDF*); no server-generated PDF. Public verification shows holder name, course, date and score.

## Layout

```
db/schema.sql            PostgreSQL schema (portable SQL)
src/lib/                 domain logic: entitlements, content-rules, auth-core, billing, learning, assistant, storage…
src/app/                 pages, server actions (app/actions), route handlers (app/api)
src/content/             sample course, quizzes, standard 13-part structure
tests/                   vitest suites (pg-mem or real Postgres)
scripts/                 migrate, seed, i18n key extractor
```

## Security notes

bcrypt password hashes · random session tokens stored hashed (revocable, cleared on password reset) · httpOnly/SameSite=Lax cookies ·
no account enumeration on signup/reset · rate limits on login/reset/signup/checkout/assistant · same-origin checks on mutating route handlers ·
entitlements change only from signature-verified webhooks · upload keys server-generated, extension allow-list, path-traversal guarded ·
quiz answers never sent to the client before grading · no card data stored · security headers via `next.config.ts`.
