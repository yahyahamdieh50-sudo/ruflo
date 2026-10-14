// SQLite persistence (built-in node:sqlite). All calls are synchronous, so a
// single Node process never interleaves two stock updates.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateProduct } from './validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SEED_DIR = path.join(here, '..', 'data', 'seed');
export const DEFAULT_DB = path.join(here, '..', 'data', 'yahivo.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (slug TEXT PRIMARY KEY, data TEXT NOT NULL, published INTEGER NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  at TEXT NOT NULL, type TEXT NOT NULL, status TEXT, note TEXT, actor TEXT
);
CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
`;

const now = () => new Date().toISOString();
const readSeed = (f) => JSON.parse(readFileSync(path.join(SEED_DIR, f), 'utf8'));

export class Store {
  /**
   * @param {string} file  database path (':memory:' for tests)
   * @param {{ seed?: 'yahivo'|'sample'|'none' }} opts  catalogue loaded into an empty database:
   *   'yahivo' = the real catalogue (default), 'sample' = test products, 'none' = empty.
   */
  constructor(file = process.env.YAHIVO_DB || DEFAULT_DB, { seed = process.env.YAHIVO_SEED || 'yahivo' } = {}) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.#seed(seed);
  }

  #seed(seed) {
    if (!this.db.prepare('SELECT 1 FROM settings WHERE id = 1').get()) {
      this.db.prepare('INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(readSeed(seed === 'sample' ? 'settings.sample.json' : 'settings.json')), now());
    }
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    const files = { yahivo: 'products.yahivo.json', sample: 'products.sample.json' };
    if (count === 0 && files[seed]) {
      for (const p of readSeed(files[seed]).products) this.upsertProduct(validateProduct(p));
    }
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---- settings
  getSettings() {
    return JSON.parse(this.db.prepare('SELECT data FROM settings WHERE id = 1').get().data);
  }
  saveSettings(settings) {
    this.db.prepare('UPDATE settings SET data = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(settings), now());
  }

  // ---- products
  listProducts({ includeUnpublished = false } = {}) {
    const sql = includeUnpublished ? 'SELECT data FROM products' : 'SELECT data FROM products WHERE published = 1';
    return this.db.prepare(sql).all().map((r) => JSON.parse(r.data));
  }
  getProduct(slug, { includeUnpublished = false } = {}) {
    const row = this.db.prepare('SELECT data, published FROM products WHERE slug = ?').get(slug);
    if (!row || (!includeUnpublished && !row.published)) return null;
    return JSON.parse(row.data);
  }
  upsertProduct(product, originalSlug = product.slug) {
    return this.transaction(() => {
      if (originalSlug !== product.slug) {
        if (this.db.prepare('SELECT 1 FROM products WHERE slug = ?').get(product.slug)) throw Object.assign(new Error('slug_taken'), { code: 'slug_taken' });
        this.db.prepare('DELETE FROM products WHERE slug = ?').run(originalSlug);
      }
      this.db.prepare(`INSERT INTO products (slug, data, published, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET data = excluded.data, published = excluded.published, updated_at = excluded.updated_at`)
        .run(product.slug, JSON.stringify(product), product.published ? 1 : 0, now());
      return product;
    });
  }
  deleteProduct(slug) {
    return this.db.prepare('DELETE FROM products WHERE slug = ?').run(slug).changes > 0;
  }
  /** Adjust tracked stock. Must run inside a transaction. Returns false if it would go negative. */
  adjustStock(slug, colorName, size, delta) {
    const row = this.db.prepare('SELECT data FROM products WHERE slug = ?').get(slug);
    if (!row) return delta > 0; // product deleted: nothing to restock
    const p = JSON.parse(row.data);
    const color = p.colors.find((c) => c.name === colorName);
    if (!color) return delta > 0;
    if (!color.stock) return true; // stock not tracked for this colour
    const next = (color.stock[size] ?? 0) + delta;
    if (next < 0) return false;
    color.stock[size] = next;
    this.db.prepare('UPDATE products SET data = ?, updated_at = ? WHERE slug = ?').run(JSON.stringify(p), now(), slug);
    return true;
  }

  // ---- orders
  insertOrder({ number, token, email, status, paymentStatus, data }) {
    const t = now();
    const { lastInsertRowid } = this.db.prepare(`INSERT INTO orders (number, token, email, status, payment_status, created_at, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(number, token, email, status, paymentStatus, t, t, JSON.stringify(data));
    return Number(lastInsertRowid);
  }
  nextOrderNumber() {
    const row = this.db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'orders'").get();
    return `YH-${1001 + Number(row?.seq ?? 0)}`;
  }
  #rowToOrder(r) {
    if (!r) return null;
    return { id: r.id, number: r.number, token: r.token, email: r.email, status: r.status, paymentStatus: r.payment_status, createdAt: r.created_at, updatedAt: r.updated_at, ...JSON.parse(r.data) };
  }
  getOrder(id) { return this.#rowToOrder(this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id)); }
  getOrderByToken(token) { return this.#rowToOrder(this.db.prepare('SELECT * FROM orders WHERE token = ?').get(token)); }
  getOrderByNumber(number) { return this.#rowToOrder(this.db.prepare('SELECT * FROM orders WHERE number = ?').get(number)); }
  listOrders({ status, q, limit = 50, offset = 0 } = {}) {
    const where = [];
    const args = [];
    if (status) { where.push('status = ?'); args.push(status); }
    if (q) { where.push('(number LIKE ? OR email LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
    const sql = `SELECT * FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(sql).all(...args, limit, offset).map((r) => this.#rowToOrder(r));
    const counts = Object.fromEntries(this.db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]));
    return { orders: rows, counts };
  }
  saveOrder(order) {
    const { id, number, token, email, status, paymentStatus, createdAt, updatedAt, events, ...data } = order;
    this.db.prepare('UPDATE orders SET status = ?, payment_status = ?, updated_at = ?, data = ? WHERE id = ?')
      .run(status, paymentStatus, now(), JSON.stringify(data), id);
  }
  setOrderEmail(id, email) {
    this.db.prepare('UPDATE orders SET email = ? WHERE id = ?').run(email, id);
  }
  addEvent(orderId, { type, status = null, note = null, actor = 'system' }) {
    this.db.prepare('INSERT INTO order_events (order_id, at, type, status, note, actor) VALUES (?, ?, ?, ?, ?, ?)')
      .run(orderId, now(), type, status, note, actor);
  }
  events(orderId) {
    return this.db.prepare('SELECT at, type, status, note, actor FROM order_events WHERE order_id = ? ORDER BY id').all(orderId).map((r) => ({ ...r }));
  }

  // ---- admin sessions (only a hash of the token is stored)
  createSession(tokenHash, ttlMs) {
    this.db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').run(tokenHash, Date.now() + ttlMs);
  }
  hasSession(tokenHash) {
    return Boolean(this.db.prepare('SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now()));
  }
  deleteSession(tokenHash) {
    this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
  }

  close() { this.db.close(); }
}
