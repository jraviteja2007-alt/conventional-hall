// Consistent online backup using SQLite's VACUUM INTO (safe while the app is running).
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { config } from '../server/config.js';
const dir = process.env.BACKUP_DIR || path.join(path.dirname(config.dbPath), 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `hall-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
const keep = Number(process.env.BACKUP_KEEP || 14);
const old = fs.readdirSync(dir).filter((f) => f.startsWith('hall-')).sort().reverse().slice(keep);
old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
console.log(`Backup written: ${file} (pruned ${old.length} old)`);
