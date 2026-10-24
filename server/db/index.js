import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
};
const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

/** All parameters are bound (never string-concatenated) -> SQL-injection safe. */
export const all = (sql, ...p) => stmt(sql).all(...norm(p)).map((r) => ({ ...r }));
export const get = (sql, ...p) => { const r = stmt(sql).get(...norm(p)); return r ? { ...r } : null; };
export const run = (sql, ...p) => {
  const r = stmt(sql).run(...norm(p));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};

let depth = 0;
/** Synchronous IMMEDIATE transaction (takes the write lock up-front -> no lost updates). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    depth--;
  }
}

export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  const dir = path.join(config.root, 'server', 'db', 'migrations');
  const applied = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (get('SELECT 1 x FROM schema_migrations WHERE name=?', f)) continue;
    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      run('INSERT INTO schema_migrations(name) VALUES(?)', f);
      db.exec('COMMIT');
      applied.push(f);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }
  return applied;
}

export function audit(actor, action, entity, entityId, details = {}, ip = null) {
  run(
    'INSERT INTO audit_logs(actor_id,actor_name,action,entity,entity_id,details,ip) VALUES(?,?,?,?,?,?,?)',
    actor?.id ?? null, actor?.name ?? null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details), ip,
  );
}
