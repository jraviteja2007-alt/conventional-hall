import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { E } from './http.js';

const scrypt = promisify(crypto.scrypt);

// ---------- Password hashing (scrypt, per-user random salt) ----------
const N = 16384, R = 8, P = 1;
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, n, r, p, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}
let dummy;
/** Burn equivalent time for unknown users so login timing doesn't reveal which emails exist. */
export async function dummyVerify(pw) {
  dummy ||= await hashPassword('dummy-password-1');
  await verifyPassword(pw, dummy);
}

// ---------- JWT (HS256) ----------
const b64u = (b) => Buffer.from(b).toString('base64url');
export function signJwt(payload, ttlSeconds = config.sessionDays * 86400) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64u(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
export function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(`${h}.${b}`).digest();
  let given;
  try { given = Buffer.from(s, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    if (JSON.parse(Buffer.from(h, 'base64url')).alg !== 'HS256') return null;
    const p = JSON.parse(Buffer.from(b, 'base64url'));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

// ---------- Secrets at rest (AES-256-GCM) ----------
const key = () => crypto.createHash('sha256').update(`secrets:${config.appSecret}`).digest();
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
export function decrypt(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
export const randomToken = (n = 24) => crypto.randomBytes(n).toString('base64url');
export const randomCode = (len, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') => {
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
};

// ---------- Sliding-window rate limiter (in-memory; swap for Redis when scaling horizontally) ----------
const buckets = new Map();
export function rateLimit({ windowMs, max, name, keyFn }) {
  return (ctx) => {
    const k = `${name}:${keyFn ? keyFn(ctx) : ctx.ip}`;
    const now = Date.now();
    const arr = (buckets.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      ctx.res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      throw E.tooMany();
    }
    arr.push(now);
    buckets.set(k, arr);
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 3600_000) buckets.delete(k);
}, 600_000).unref();

// ---------- Permissions (RBAC) ----------
const ORDER = ['customer', 'staff', 'manager', 'admin', 'super_admin'];
const PERMS = {
  'dashboard.view': 'staff', 'calendar.view': 'staff', 'bookings.view': 'staff', 'bookings.note': 'staff',
  'bookings.manage': 'manager', 'bookings.delete': 'admin',
  'customers.view': 'staff', 'customers.manage': 'manager', 'customers.delete': 'admin',
  'enquiries.manage': 'staff', 'quotations.manage': 'manager',
  'payments.view': 'manager', 'payments.manage': 'manager', 'refunds.manage': 'manager',
  'reviews.moderate': 'manager', 'blocks.manage': 'manager',
  'halls.manage': 'admin', 'packages.manage': 'admin', 'facilities.manage': 'admin', 'gallery.manage': 'admin',
  'events.manage': 'admin', 'staff.manage': 'admin', 'coupons.manage': 'admin', 'pricing.manage': 'admin',
  'settings.manage': 'admin', 'settings.secrets': 'super_admin',
  'reports.view': 'manager', 'analytics.view': 'manager', 'audit.view': 'admin',
  'backup.manage': 'super_admin', 'users.roles': 'super_admin',
};
export const can = (role, perm) => !!PERMS[perm] && ORDER.indexOf(role) >= ORDER.indexOf(PERMS[perm]);
export const isStaffRole = (role) => ORDER.indexOf(role) >= 1;
export const roleRank = (role) => ORDER.indexOf(role);
export const ROLES = ORDER;
