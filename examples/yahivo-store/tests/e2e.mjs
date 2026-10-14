// Browser end-to-end test (Playwright + Chromium): admin setup, customer purchase on
// desktop and mobile, admin fulfilment, assistant. Run: npm run test:e2e
// Uses a temporary database; set SCREENSHOT_DIR to keep screenshots.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const pw = await import('playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'));
const { chromium, devices } = pw.default ?? pw;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'yahivo-e2e-'));
const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-admin-password';
const shots = process.env.SCREENSHOT_DIR;

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
  cwd: root, env: { ...process.env, PORT: String(PORT), YAHIVO_DB: path.join(tmp, 'e2e.db'), ADMIN_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '', STRIPE_SECRET_KEY: '' }, stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); });
  server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
});

const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
let mobileBrowser;
function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Google Fonts may be unreachable in sandboxed environments; that's not an app error.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR_|status of 4\d\d/.test(m.text())) errors.push(`${label} console: ${m.text()}`);
  });
}
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }); };
const step = (msg) => console.log(`  ✓ ${msg}`);

try {
  // ---------------- Admin setup (desktop)
  const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const admin = await adminCtx.newPage();
  watch(admin, 'admin');
  await admin.goto(`${BASE}/admin`);
  await admin.fill('#pw', 'wrong-password-x');
  await admin.click('button[type=submit]');
  await admin.getByText('Incorrect password').waitFor();
  await admin.fill('#pw', PASSWORD);
  await admin.click('button[type=submit]');
  await admin.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await admin.getByText('Delivery zones and fees').waitFor();
  await shot(admin, 'admin-dashboard');
  step('admin login + launch checklist');

  await admin.goto(`${BASE}/admin#/delivery`);
  await admin.getByRole('button', { name: '+ Add zone' }).click();
  const zone = admin.locator('[data-repeater="zones"] [data-row]').last();
  await zone.locator('[name=id]').fill('dubai');
  await zone.locator('[name=name]').fill('Dubai');
  await zone.locator('[name=country]').fill('United Arab Emirates');
  await zone.locator('[name=areas]').fill('Dubai');
  await zone.locator('[name=fee]').fill('20');
  await admin.getByRole('button', { name: '+ Add zone' }).click();
  const zone2 = admin.locator('[data-repeater="zones"] [data-row]').last();
  await zone2.locator('[name=id]').fill('other');
  await zone2.locator('[name=name]').fill('Other emirates');
  await zone2.locator('[name=country]').fill('United Arab Emirates');
  await zone2.locator('[name=areas]').fill('Dubai, Sharjah');
  await zone2.locator('[name=fee]').fill('30');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByText('already covered by another enabled zone').waitFor();
  step('admin: overlapping delivery zones rejected with a clear error');
  await zone2.locator('[name=areas]').fill('Sharjah, Abu Dhabi');
  await admin.getByRole('button', { name: '+ Add courier' }).click();
  const courier = admin.locator('[data-repeater="couriers"] [data-row]').last();
  await courier.locator('[name=id]').fill('local');
  await courier.locator('[name=name]').fill('Local Courier');
  await courier.locator('[name=trackingUrlTemplate]').fill('https://courier.example/track?n={tracking}');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.locator('.toast', { hasText: 'Saved' }).last().waitFor();
  step('admin: delivery zones + courier saved');

  await admin.goto(`${BASE}/admin#/packing`);
  await admin.getByRole('button', { name: '+ Add packing option' }).click();
  let row = admin.locator('[data-row]').last();
  await row.locator('[name=id]').fill('standard');
  await row.locator('[name=name]').fill('Standard bag');
  await row.locator('[name=fee]').fill('0');
  await admin.getByRole('button', { name: '+ Add packing option' }).click();
  row = admin.locator('[data-row]').last();
  await row.locator('[name=id]').fill('gift');
  await row.locator('[name=name]').fill('Gift box');
  await row.locator('[name=fee]').fill('12.5');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.locator('.toast', { hasText: 'Saved' }).last().waitFor();
  step('admin: packing options saved');

  await admin.goto(`${BASE}/admin#/tax`);
  await admin.check('[name=enabled]');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByText('Enter a tax rate before enabling tax').waitFor();
  await admin.fill('#tname', 'VAT');
  await admin.fill('#trate', '5');
  await admin.check('[name=appliesToDelivery]');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.locator('.toast', { hasText: 'Saved' }).last().waitFor();
  step('admin: tax validated + saved (5% test rate, exclusive)');

  await admin.goto(`${BASE}/admin#/payments`);
  await admin.getByText('No payment provider configured').waitFor();
  await admin.check('[name=manualOrderRequests]');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.locator('.toast', { hasText: 'Saved' }).last().waitFor();

  await admin.goto(`${BASE}/admin#/store`);
  await admin.fill('#sig', 'https://www.instagram.com/');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByText('must link to your public profile page').waitFor();
  await admin.fill('#sig', '');
  await admin.fill('#cemail', 'hello@example.com');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.locator('.toast', { hasText: 'Saved' }).last().waitFor();
  step('admin: payments placeholder enabled; placeholder Instagram URL rejected; contact saved');

  await admin.goto(`${BASE}/admin#/products/_new`);
  await admin.fill('#name', 'E2E Test Hoodie');
  assert.equal(await admin.inputValue('#slug'), 'e2e-test-hoodie');
  await admin.fill('#style', 'Pullover');
  await admin.fill('#price', '150');
  await admin.fill('#sizes', 'M, L');
  await admin.locator('#sizes').dispatchEvent('change');
  await admin.locator('#st0XL').waitFor({ state: 'detached' });
  await admin.fill('#cn0', 'Black');
  await admin.fill('#st0M', '2');
  await admin.fill('#st0L', '0');
  await admin.check('[name=published]');
  await admin.getByRole('button', { name: 'Create product' }).click();
  await admin.locator('.toast', { hasText: 'Product saved' }).last().waitFor();
  await admin.waitForURL(/#\/products\/e2e-test-hoodie$/);
  step('admin: product created with stock per size');

  // ---------------- Customer on desktop
  const desk = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  watch(desk, 'desktop');
  await desk.goto(BASE);
  await desk.getByRole('heading', { level: 1 }).waitFor();
  await desk.locator('.sample-banner').getByText('sample data').waitFor();
  await shot(desk, 'desktop-home');
  await desk.getByRole('link', { name: 'Shop hoodies' }).first().click();
  await desk.waitForURL(/\/shop$/);
  await desk.locator('.chip', { hasText: 'Black' }).click();
  await desk.waitForURL(/color=black/);
  const names = await desk.locator('.card-name').allTextContents();
  assert.ok(names.length > 0 && names.includes('E2E Test Hoodie'), `filter results: ${names}`);
  await desk.selectOption('#sort', 'price-asc');
  await desk.waitForURL(/sort=price-asc/);
  await shot(desk, 'desktop-shop');
  step('desktop: shop filter by colour + sort');

  await desk.locator('.card', { hasText: 'Core Pullover Hoodie' }).click();
  await desk.getByRole('heading', { name: 'Core Pullover Hoodie' }).waitFor();
  await desk.click('#atc');
  await desk.getByText('Please choose a size.').waitFor();
  assert.equal(await desk.locator('.size-opt[data-size="XXL"]').getAttribute('aria-disabled'), 'true', 'sold-out size disabled');
  await desk.click('.size-opt[data-size="M"]');
  await desk.getByText('In stock in M').waitFor();
  await desk.click('#qty-inc');
  await desk.click('#atc');
  await desk.locator('.toast', { hasText: 'Added' }).last().waitFor();
  assert.equal(await desk.textContent('#cart-count'), '2');
  await shot(desk, 'desktop-product');
  step('desktop: product page size validation, stock, qty, add to cart');

  await desk.goto(`${BASE}/cart`);
  await desk.locator('.line').first().waitFor();
  await desk.click('[data-act="inc"]');
  await desk.locator('.line output', { hasText: '3' }).waitFor();
  await desk.click('[data-act="dec"]');
  await desk.locator('.line output', { hasText: '2' }).waitFor();
  await desk.getByText('Choose area at checkout').waitFor();
  await desk.getByText('VAT (5%)').waitFor();
  step('desktop: cart quantity updates + server totals');

  await desk.getByRole('link', { name: 'Checkout' }).click();
  await desk.locator('#checkout-form').waitFor();
  await desk.click('#place');
  await desk.locator('.field-error', { hasText: 'Full name is required' }).waitFor();
  await desk.fill('#name', 'Desk Buyer');
  await desk.fill('#email', 'desk@example.com');
  await desk.fill('#phone', '+971 50 111 2222');
  await desk.selectOption('#region', 'Dubai');
  await desk.fill('#city', 'Marina');
  await desk.fill('#address1', 'Tower 9, Flat 1');
  await desk.check('input[name=packingId][value=gift]');
  await desk.check('input[name=paymentMethod][value=manual]');
  // 2 × 199 = 398; gift 12.50; Dubai 20; VAT 5% on items + delivery (not packing) = 20.90 → 451.40
  await desk.locator('[data-total]', { hasText: '451.40' }).waitFor();
  await desk.getByText('Gift box').first().waitFor();
  await shot(desk, 'desktop-checkout');
  await desk.click('#place');
  await desk.waitForURL(/\/order\/[A-Za-z0-9_-]+\?placed=1/);
  await desk.getByRole('heading', { name: 'Order received' }).waitFor();
  await desk.getByText('YH-1001').first().waitFor();
  await desk.getByText('No payment has been taken').waitFor();
  await desk.locator('[data-total]', { hasText: '451.40' }).waitFor();
  assert.equal(await desk.locator('#cart-count').isHidden(), true, 'cart cleared');
  await shot(desk, 'desktop-confirmation');
  const orderUrl = desk.url();
  step('desktop: checkout validation, totals (items+packing+delivery+tax), order confirmation');

  // ---------------- Admin fulfilment
  await admin.goto(`${BASE}/admin#/orders`);
  await admin.getByText('YH-1001').click();
  await admin.getByRole('heading', { name: /YH-1001/ }).waitFor();
  await admin.getByText('Gift box (').waitFor();
  await admin.selectOption('#st', 'handed_to_courier');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.getByText('Record the courier before').waitFor();
  await admin.selectOption('#st', 'preparing');
  await admin.fill('#pn', 'Gift box, tissue paper, thank-you card');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.locator('h1 .status', { hasText: 'Preparing' }).waitFor();
  await admin.selectOption('#st', 'packed');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.locator('h1 .status', { hasText: 'Packed' }).waitFor();
  await admin.selectOption('#cr', 'local');
  await admin.fill('#tn', 'LC123456');
  await admin.selectOption('#st', 'handed_to_courier');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.locator('h1 .status', { hasText: 'Handed to courier' }).waitFor();
  await admin.getByRole('link', { name: 'Open courier tracking page' }).waitFor();
  await shot(admin, 'admin-order');
  await desk.goto(orderUrl.replace('?placed=1', ''));
  await desk.getByText('LC123456').waitFor();
  await desk.getByRole('link', { name: 'Track with courier' }).waitFor();
  step('admin: status workflow, packing notes, courier + tracking visible to customer');

  await desk.goto(`${BASE}/track`);
  await desk.fill('#number', 'YH-1001');
  await desk.fill('#temail', 'desk@example.com');
  await desk.click('#track-form button');
  await desk.getByText('LC123456').waitFor();
  step('customer: order lookup by number + email');

  // Assistant (demo mode)
  await desk.click('#chat-launcher');
  await desk.getByText('Demo mode').waitFor();
  await desk.fill('#chat-input', 'Recommend a black hoodie in size M under 200');
  await desk.press('#chat-input', 'Enter');
  await desk.locator('.msg-product').first().waitFor();
  await desk.fill('#chat-input', 'how much is delivery?');
  await desk.press('#chat-input', 'Enter');
  await desk.locator('.msg-bot', { hasText: 'Dubai — AED 20.00' }).waitFor();
  await desk.fill('#chat-input', 'what is the capital of peru');
  await desk.press('#chat-input', 'Enter');
  await desk.locator('.msg-bot', { hasText: 'not confident' }).waitFor();
  await shot(desk, 'desktop-chat');
  await desk.locator('.msg-product').first().click();
  await desk.waitForURL(/\/product\//);
  step('assistant: recommendation links, grounded delivery answer, honest fallback');

  // ---------------- Customer on mobile
  // Own browser so the mobile page is the only (foreground) page: Chromium pauses
  // IntersectionObserver work for background pages.
  mobileBrowser = await chromium.launch();
  const mctx = await mobileBrowser.newContext({ ...devices['iPhone 13'] });
  const mob = await mctx.newPage();
  watch(mob, 'mobile');
  await mob.goto(BASE);
  await mob.getByRole('heading', { level: 1 }).waitFor();
  const overflow = async () => mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(await overflow() <= 0, 'no horizontal scroll on home');
  await shot(mob, 'mobile-home');
  await mob.click('#menu-btn');
  await mob.locator('#mobile-nav').getByRole('link', { name: 'Shop all hoodies' }).click();
  await mob.waitForURL(/\/shop$/);
  await mob.click('#open-filters');
  await mob.locator('#filters.open .chip', { hasText: /^L$/ }).click();
  await mob.click('#apply-filters');
  await mob.waitForURL(/size=L/);
  assert.ok(await overflow() <= 0, 'no horizontal scroll on shop');
  await shot(mob, 'mobile-shop');
  step('mobile: menu, filter drawer');

  await mob.locator('.card', { hasText: 'Zip-Up Hoodie' }).first().click();
  await mob.getByRole('heading', { name: 'Zip-Up Hoodie' }).waitFor();
  await mob.click('.size-opt[data-size="L"]');
  await mob.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await mob.locator('#sticky-atc.show').waitFor();
  await mob.click('#sa-btn');
  await mob.locator('.toast', { hasText: 'Added' }).last().waitFor();
  assert.ok(await overflow() <= 0, 'no horizontal scroll on product');
  await shot(mob, 'mobile-product');
  step('mobile: sticky add-to-cart');

  await mob.goto(`${BASE}/checkout`);
  await mob.fill('#name', 'Mobile Buyer');
  await mob.fill('#email', 'mobile@example.com');
  await mob.fill('#phone', '0501234567');
  await mob.selectOption('#region', 'Fujairah').catch(() => {});
  assert.equal(await mob.locator('#region option', { hasText: 'Fujairah' }).count(), 0, 'only configured areas are offered');
  await mob.selectOption('#region', 'Sharjah');
  await mob.fill('#city', 'Al Nahda');
  await mob.fill('#address1', 'Building 3');
  await mob.check('input[name=paymentMethod][value=manual]');
  // 229 + standard 0 + Sharjah 30 + VAT 5% of 259 = 12.95 → 271.95
  await mob.locator('[data-total]', { hasText: '271.95' }).waitFor();
  assert.ok(await overflow() <= 0, 'no horizontal scroll on checkout');
  await shot(mob, 'mobile-checkout');
  await mob.click('#place');
  await mob.getByRole('heading', { name: 'Order received' }).waitFor();
  await mob.getByText('YH-1002').first().waitFor();
  await shot(mob, 'mobile-confirmation');
  step('mobile: checkout with live totals → confirmation');

  // Stock check: e2e product M had 2; buy 2 then the size is sold out.
  await desk.goto(`${BASE}/product/e2e-test-hoodie`);
  await desk.click('.size-opt[data-size="M"]');
  await desk.getByText('Only 2 left in M').waitFor();
  assert.equal(await desk.locator('.size-opt[data-size="L"]').getAttribute('aria-disabled'), 'true');
  step('stock: low-stock + sold-out sizes shown from admin stock');

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('\nE2E passed.');
} catch (e) {
  if (shots) for (const [i, pg] of browser.contexts().flatMap((c) => c.pages()).entries()) await pg.screenshot({ path: path.join(shots, `failure-${i}.png`) }).catch(() => {});
  console.error('\nE2E FAILED:', e.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await mobileBrowser?.close();
  await browser.close();
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}
