import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');

const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? +v : v));
const cache = new Map();
const stmt = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
// Always parameterised: user input never gets concatenated into SQL.
export const all = (sql, ...p) => stmt(sql).all(...clean(p)).map((r) => ({ ...r }));
export const get = (sql, ...p) => { const r = stmt(sql).get(...clean(p)); return r ? { ...r } : undefined; };
export const run = (sql, ...p) => stmt(sql).run(...clean(p));

let depth = 0;
/** Serialised write transaction (BEGIN IMMEDIATE takes the write lock up-front). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE'); depth++;
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
  finally { depth--; }
}

export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')))');
  const dir = path.join(ROOT, 'server', 'migrations');
  const done = new Set(all('SELECT name FROM schema_migrations').map((r) => r.name));
  const applied = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    tx(() => { db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); run('INSERT INTO schema_migrations(name) VALUES (?)', f); });
    applied.push(f);
  }
  return applied;
}
