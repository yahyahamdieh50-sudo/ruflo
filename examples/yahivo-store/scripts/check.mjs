// Static checks: syntax of every JS file, seed data validity, file size limit,
// and a scan that no secret values leak into public/ files.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProduct } from '../lib/validate.mjs';
import { applySection, SECTIONS } from '../lib/settings.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'uploads', '.git']);
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (skip.has(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

let failed = 0;
const fail = (msg) => { failed += 1; console.error(`✗ ${msg}`); };

for (const f of files.filter((x) => /\.(m?js)$/.test(x))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { fail(`syntax: ${path.relative(root, f)}\n${e.stderr}`); }
}
for (const f of files.filter((x) => /\.(m?js|css|html)$/.test(x))) {
  const lines = readFileSync(f, 'utf8').split('\n').length;
  if (lines > 500) fail(`${path.relative(root, f)} has ${lines} lines (limit 500)`);
}
// Key-shaped values (env var *names* in admin help text are fine; values are not).
const SECRET = /(sk-ant-[A-Za-z0-9_-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|rk_(live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|process\.env)/;
for (const f of files.filter((x) => x.includes(`${path.sep}public${path.sep}`) && /\.(js|html|css|json)$/.test(x))) {
  if (SECRET.test(readFileSync(f, 'utf8'))) fail(`possible secret in public file ${path.relative(root, f)}`);
}

try {
  const { products } = JSON.parse(readFileSync(path.join(root, 'data/seed/products.sample.json'), 'utf8'));
  products.forEach(validateProduct);
} catch (e) { fail(`sample products invalid: ${JSON.stringify(e.fields ?? e.message)}`); }
try {
  let s = JSON.parse(readFileSync(path.join(root, 'data/seed/settings.json'), 'utf8'));
  for (const sec of SECTIONS) s = applySection(s, sec, sec === 'store' ? s : s[sec]);
} catch (e) { fail(`seed settings invalid: ${JSON.stringify(e.fields ?? e.message)}`); }

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log(`✓ ${files.filter((x) => /\.m?js$/.test(x)).length} JS files parse, seed data valid, no secrets in public/, all files ≤ 500 lines`);
