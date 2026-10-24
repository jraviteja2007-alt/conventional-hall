import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, audit, db } from '../db/index.js';
import { config } from '../config.js';
import { E } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import { can, hashPassword, randomToken, roleRank, ROLES } from '../lib/security.js';
import { perm } from './admin.js';
import { getSettings, setSetting, DEFAULTS, setSecret, deleteSecret, hasSecret, SECRET_KEYS } from '../services/settings.js';
import * as R from '../services/reports.js';
import { activeProvider } from '../services/payments.js';
import { LEGAL_KEYS } from '../services/legal.js';
import { isDate, todayLocal } from '../lib/time.js';

const REPORTS = {
  revenue: (q) => { const x = R.revenue(q); return { rows: x.rows, columns: ['period', 'payments', 'gross', 'refunded', 'net'], meta: x }; },
  bookings: (q) => { const x = R.bookingsReport(q); return { rows: x.rows, columns: ['period', 'total', 'confirmed', 'pending', 'lost'], meta: x }; },
  events: (q) => { const x = R.eventsReport(q); return { rows: x.byEvent, columns: ['name', 'bookings', 'value', 'avg_guests'], meta: x }; },
  packages: (q) => { const x = R.eventsReport(q); return { rows: x.byPackage, columns: ['name', 'bookings', 'value'], meta: x }; },
  customers: () => { const x = R.customersReport(); return { rows: x.top, columns: ['name', 'phone', 'bookings', 'value'], meta: x }; },
  payments: (q) => { const x = R.paymentsReport(q); return { rows: x.byMethod, columns: ['method', 'c', 'v'], meta: x }; },
};

export function register(r) {
  // ---------------- Settings ----------------
  r.get('/api/admin/settings', perm('settings.manage'), (ctx) => ({
    settings: getSettings(),
    legalKeys: LEGAL_KEYS,
    secrets: {
      configured: Object.fromEntries(Object.entries(SECRET_KEYS).map(([env, key]) => [key, !!process.env[env] || hasSecret(key)])),
      editable: can(ctx.user.role, 'settings.secrets'),
    },
    providers: { payment: activeProvider(), email: config.providers.email, sms: config.providers.sms, whatsapp: config.providers.whatsapp },
  }));
  r.put('/api/admin/settings/:group', perm('settings.manage'), (ctx) => {
    const g = ctx.params.group;
    if (!(g in DEFAULTS)) throw E.notFound('Unknown settings group');
    if (typeof ctx.body !== 'object' || Array.isArray(ctx.body) || !ctx.body) throw E.badRequest('Expected an object');
    const body = JSON.parse(JSON.stringify(ctx.body));
    // light server-side validation of the most sensitive groups
    if (g === 'theme') for (const [k, v] of Object.entries(body)) if (!/^#[0-9a-fA-F]{6}$/.test(String(v))) throw E.validation({ [k]: 'Use a hex colour like #6b1e2e' });
    if (g === 'tax') { const t = Number(body.rate); if (!(t >= 0 && t <= 40)) throw E.validation({ rate: 'Tax rate must be between 0 and 40' }); }
    if (g === 'booking') {
      if (body.advance_pct !== undefined && !(Number(body.advance_pct) >= 0 && Number(body.advance_pct) <= 100)) throw E.validation({ advance_pct: 'Advance must be 0-100%' });
      if (body.slots && !Array.isArray(body.slots)) throw E.validation({ slots: 'Slots must be a list' });
    }
    if (g === 'payments' && body.provider && !['mock', 'razorpay', 'stripe'].includes(body.provider)) throw E.validation({ provider: 'Unsupported provider' });
    if (g === 'payments' && body.provider === 'mock' && config.isProd) throw E.validation({ provider: 'The test gateway cannot be enabled in production' });
    if (g === 'branding' || g === 'site') for (const [k, v] of Object.entries(body)) if (typeof v === 'string' && /^\s*javascript:/i.test(v)) throw E.validation({ [k]: 'Invalid value' });
    const saved = setSetting(g, body);
    audit(ctx.user, 'settings.update', 'settings', g, { keys: Object.keys(body) }, ctx.ip);
    return { settings: saved };
  });
  // Secrets are write-only: stored encrypted (AES-256-GCM), never returned. Environment variables take precedence.
  r.put('/api/admin/secrets', perm('settings.secrets'), (ctx) => {
    const allowed = Object.values(SECRET_KEYS);
    for (const [k, v] of Object.entries(ctx.body || {})) {
      if (!allowed.includes(k)) throw E.validation({ [k]: 'Unknown secret' });
      if (v === null || v === '') deleteSecret(k);
      else if (typeof v === 'string' && v.length <= 300) setSecret(k, v);
      else throw E.validation({ [k]: 'Invalid value' });
    }
    audit(ctx.user, 'secrets.update', 'secrets', 'payment', { keys: Object.keys(ctx.body || {}) }, ctx.ip);
    return { ok: true };
  });

  // ---------------- Staff users / roles ----------------
  r.get('/api/admin/users', perm('users.roles'), () => ({ rows: all(`SELECT id,name,email,phone,role,is_active,last_login_at,created_at FROM users WHERE role<>'customer' ORDER BY id`) }));
  r.post('/api/admin/users', perm('users.roles'), async (ctx) => {
    const v = validate(ctx.body, { name: 'string|required|min:2|max:80', email: 'email|required', phone: 'phone', role: 'enum:staff,manager,admin,super_admin|required' });
    if (roleRank(v.role) > roleRank(ctx.user.role)) throw E.forbidden('You cannot grant a role above your own');
    if (get('SELECT 1 x FROM users WHERE email=?', v.email)) throw E.validation({ email: 'A user with this email already exists' });
    const temp = `Tmp-${randomToken(6)}9`;
    const id = run('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)', v.name, v.email, v.phone ?? null, await hashPassword(temp), v.role).id;
    if (v.role === 'admin' || v.role === 'super_admin') run('INSERT INTO admins(user_id) VALUES(?)', id);
    audit(ctx.user, 'user.create', 'user', id, { role: v.role }, ctx.ip);
    return { id, temporaryPassword: temp };
  });
  r.put('/api/admin/users/:id', perm('users.roles'), (ctx) => {
    const id = Number(ctx.params.id);
    const v = validate(ctx.body, { role: 'enum:customer,staff,manager,admin,super_admin', is_active: 'bool' });
    const u = get('SELECT * FROM users WHERE id=?', id);
    if (!u) throw E.notFound();
    if (id === ctx.user.id && (v.role && v.role !== u.role || v.is_active === false)) throw E.unprocessable('SELF_LOCKOUT', 'You cannot change your own role or disable yourself.');
    if (v.role && roleRank(v.role) > roleRank(ctx.user.role)) throw E.forbidden();
    run(`UPDATE users SET role=COALESCE(?,role), is_active=COALESCE(?,is_active), token_version=token_version+1, updated_at=datetime('now') WHERE id=?`, v.role, v.is_active === undefined ? null : +v.is_active, id);
    audit(ctx.user, 'user.update', 'user', id, v, ctx.ip);
    return { ok: true };
  });

  // ---------------- Reports & exports ----------------
  r.get('/api/admin/reports/:name', perm('reports.view'), (ctx) => {
    const fn = REPORTS[ctx.params.name];
    if (!fn) throw E.notFound('Unknown report');
    return fn(ctx.query);
  });
  r.get('/api/admin/analytics', perm('analytics.view'), (ctx) => R.businessAnalytics(ctx.query));

  const exportable = {
    bookings: { sql: `SELECT b.ref, b.customer_name, b.phone, b.email, h.name hall, e.name event, b.event_date, b.start_time, b.end_time, b.guests, b.status, b.subtotal, b.discount, b.tax, b.total, b.created_at FROM bookings b JOIN halls h ON h.id=b.hall_id JOIN events e ON e.id=b.event_id ORDER BY b.id DESC`, perm: 'bookings.view' },
    payments: { sql: `SELECT p.receipt_no, b.ref, p.purpose, p.gateway, p.method, p.amount, p.refunded_amount, p.status, p.verified_at FROM payments p JOIN bookings b ON b.id=p.booking_id ORDER BY p.id DESC`, perm: 'payments.view' },
    customers: { sql: `SELECT u.name, u.email, u.phone, u.created_at, (SELECT COUNT(*) FROM bookings b WHERE b.user_id=u.id) bookings FROM users u WHERE u.role='customer' ORDER BY u.id DESC`, perm: 'customers.view' },
    enquiries: { sql: `SELECT name, phone, email, event_type, event_date, guests, status, source, message, created_at FROM enquiries ORDER BY id DESC`, perm: 'enquiries.manage' },
  };
  r.get('/api/admin/export/:what', (ctx) => {
    const fmt = ['csv', 'xls', 'json', 'pdf'].includes(ctx.query.format) ? ctx.query.format : 'csv';
    let rows; let columns; let title;
    if (exportable[ctx.params.what]) {
      perm(exportable[ctx.params.what].perm)(ctx);
      rows = all(exportable[ctx.params.what].sql); columns = rows[0] ? Object.keys(rows[0]) : []; title = ctx.params.what;
    } else if (REPORTS[ctx.params.what]) {
      perm('reports.view')(ctx);
      ({ rows, columns } = REPORTS[ctx.params.what](ctx.query)); title = `${ctx.params.what}-report`;
    } else throw E.notFound();
    const stamp = todayLocal();
    audit(ctx.user, 'export', 'export', ctx.params.what, { fmt, rows: rows.length }, ctx.ip);
    if (fmt === 'json') return ctx.raw(200, JSON.stringify(rows, null, 2), { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${title}-${stamp}.json"` });
    if (fmt === 'xls') return ctx.raw(200, R.toExcelHtml(rows, columns, title), { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': `attachment; filename="${title}-${stamp}.xls"` });
    if (fmt === 'pdf') return ctx.raw(200, tablePdf(title, rows, columns), { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${title}-${stamp}.pdf"` });
    return ctx.raw(200, `﻿${R.toCsv(rows, columns)}`, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${title}-${stamp}.csv"` });
  });

  // ---------------- Audit log ----------------
  r.get('/api/admin/audit', perm('audit.view'), (ctx) => {
    const size = Math.min(200, Number(ctx.query.pageSize) || 50); const off = (Math.max(1, Number(ctx.query.page) || 1) - 1) * size;
    const l = ctx.query.q ? `%${String(ctx.query.q).replace(/[%_]/g, '')}%` : null;
    const where = l ? 'WHERE action LIKE ? OR entity LIKE ? OR entity_id LIKE ? OR actor_name LIKE ?' : '';
    const args = l ? [l, l, l, l] : [];
    return { rows: all(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, size, off), total: get(`SELECT COUNT(*) c FROM audit_logs ${where}`, ...args).c };
  });

  // ---------------- Backup / data export (super admin) ----------------
  r.get('/api/admin/backup/database', perm('backup.manage'), (ctx) => {
    const tmp = path.join(config.root, 'data', `backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // consistent online snapshot
    const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
    audit(ctx.user, 'backup.download', 'database', '-', {}, ctx.ip);
    return ctx.raw(200, buf, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="convention-${todayLocal()}.db"`, 'Cache-Control': 'no-store' });
  });
  r.get('/api/admin/backup/export.json', perm('backup.manage'), (ctx) => {
    const tables = ['halls', 'facilities', 'hall_facilities', 'hall_layouts', 'events', 'services', 'packages', 'package_services', 'pricing_rules', 'coupons', 'bookings', 'booking_services', 'payments', 'refunds', 'invoices', 'quotations', 'enquiries', 'reviews', 'gallery', 'settings', 'staff', 'branches'];
    const data = Object.fromEntries(tables.map((t) => [t, all(`SELECT * FROM ${t}`)]));
    data.users = all(`SELECT id,name,email,phone,role,is_active,created_at FROM users`); // password hashes are never exported
    audit(ctx.user, 'backup.export_json', 'database', '-', {}, ctx.ip);
    return ctx.raw(200, JSON.stringify({ exported_at: new Date().toISOString(), data }, null, 2), { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="convention-export-${todayLocal()}.json"`, 'Cache-Control': 'no-store' });
  });
}

import { Pdf, textWidth } from '../lib/pdf.js';
function tablePdf(title, rows, columns) {
  const pdf = new Pdf();
  let pg = pdf.cur; let y = 50;
  const colW = Math.min(110, (595 - 80) / Math.max(columns.length, 1));
  const head = () => { pg.text(40, y, title.toUpperCase(), { size: 13, bold: true }); y += 22; columns.forEach((c, i) => pg.text(40 + i * colW, y, c, { size: 8, bold: true })); y += 6; pg.line(40, y, 555, y); y += 12; };
  head();
  for (const row of rows) {
    if (y > 800) { pg = pdf.add(); y = 50; head(); }
    columns.forEach((c, i) => { const s = String(row[c] ?? ''); pg.text(40 + i * colW, y, s.length * 4.4 > colW - 4 ? `${s.slice(0, Math.floor((colW - 4) / 4.4) - 1)}..` : s, { size: 7.5 }); });
    y += 13;
  }
  return pdf.toBuffer();
}
