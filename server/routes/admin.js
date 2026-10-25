import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, db } from '../db.js';
import { config } from '../config.js';
import { ApiError, bad, notFound, parseMultipart } from '../lib/http.js';
import { validate, toMin } from '../lib/validate.js';
import { hashPassword, hasRole, ROLE_LEVEL } from '../lib/auth.js';
import { requireRole, page, like, idParam } from './common.js';
import { audit } from '../services/audit.js';
import { allSettings, saveSettings, DEFAULTS } from '../services/settings.js';
import { createBooking, getBooking, modifyBooking, transition } from '../services/bookings.js';
import { recordOfflinePayment, processRefund } from '../services/payments.js';
import { dashboard, report, detailedReport, analytics, aiSummary, toCsv } from '../services/reports.js';
import { quotationPdf } from '../services/documents.js';
import { bookingSchema, parseServices, checkUpload } from './account.js';
import { setting } from '../services/settings.js';

const staff = requireRole('staff'), manager = requireRole('manager'), admin = requireRole('admin'), superAdmin = requireRole('super_admin');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const OP = { id: { type: 'int' } };

/* ---------- generic CRUD resources (content management) ---------- */
const url = { type: 'url', max: 500 };
const RES = {
  halls: {
    table: 'halls', write: 'admin', search: ['name', 'description'], order: 'popularity DESC, id',
    schema: { branch_id: { type: 'int', default: 1 }, slug: { max: 60 }, name: { required: true, max: 100 }, tagline: { max: 160 }, description: { max: 3000 },
      min_guests: { type: 'int', min: 1, max: 100000 }, max_guests: { type: 'int', required: true, min: 1, max: 100000 }, seating_capacity: { type: 'int', required: true, min: 0, max: 100000 }, dining_capacity: { type: 'int', required: true, min: 0, max: 100000 },
      length_m: { type: 'number', min: 0, max: 1000 }, width_m: { type: 'number', min: 0, max: 1000 }, height_m: { type: 'number', min: 0, max: 100 }, area_sqft: { type: 'int', min: 0 },
      base_price: { type: 'int', required: true, min: 0 }, half_day_price: { type: 'int', required: true, min: 0 }, hourly_price: { type: 'int', required: true, min: 0 },
      parking_two: { type: 'int', min: 0 }, parking_four: { type: 'int', min: 0 }, image: url, popularity: { type: 'int', min: 0, max: 1000 }, active: { type: 'bool' } },
    json: { layouts: ['banquet', 'theatre', 'classroom', 'u-shape', 'custom'] }, links: { facility_ids: ['hall_facilities', 'hall_id', 'facility_id'] },
  },
  facilities: { table: 'facilities', write: 'admin', search: ['name', 'description'], order: 'sort, id', schema: { name: { required: true, max: 80 }, slug: { max: 80 }, icon: { max: 30 }, category: { max: 40 }, description: { max: 500 }, spec: { max: 200 }, image: url, featured: { type: 'bool' }, sort: { type: 'int' }, active: { type: 'bool' } } },
  'event-types': { table: 'event_types', write: 'admin', search: ['name'], order: 'sort, id', schema: { name: { required: true, max: 80 }, slug: { max: 60 }, description: { max: 400 }, image: url, icon: { max: 30 }, sort: { type: 'int' }, active: { type: 'bool' } } },
  services: { table: 'services', write: 'admin', search: ['name', 'category'], order: 'category, name', schema: { name: { required: true, max: 100 }, description: { max: 300 }, category: { max: 40 }, price: { type: 'int', required: true, min: 0 }, price_type: { enum: ['fixed', 'per_guest', 'per_hour'], default: 'fixed' }, active: { type: 'bool' } } },
  packages: {
    table: 'packages', write: 'admin', search: ['name', 'description'], order: 'price',
    schema: { slug: { max: 60 }, name: { required: true, max: 80 }, tier: { enum: ['basic', 'standard', 'premium', 'wedding', 'corporate', 'custom'], default: 'standard' }, description: { max: 1000 }, price: { type: 'int', required: true, min: 0 }, per_guest_price: { type: 'int', min: 0 },
      includes_hall: { type: 'bool' }, guest_capacity: { type: 'int', min: 1 }, duration_hours: { type: 'number', min: 1, max: 24 }, image: url, popular: { type: 'bool' }, popularity: { type: 'int' }, active: { type: 'bool' } },
    links: { service_ids: ['package_services', 'package_id', 'service_id'] },
  },
  gallery: { table: 'gallery', write: 'admin', search: ['title', 'category'], order: 'sort, id', schema: { hall_id: { type: 'int' }, category: { required: true, max: 40 }, title: { required: true, max: 120 }, alt: { max: 200 }, type: { enum: ['image', 'video', 'before_after'], default: 'image' }, url: { ...url, required: true }, before_url: url, sort: { type: 'int' }, active: { type: 'bool' } } },
  staff: { table: 'staff', write: 'admin', read: 'manager', search: ['name', 'role'], order: 'name', schema: { name: { required: true, max: 80 }, role: { required: true, max: 60 }, phone: { type: 'phone' }, email: { type: 'email' }, responsibilities: { max: 500 }, availability: { max: 200 }, active: { type: 'bool' } } },
  coupons: { table: 'coupons', pk: 'code', write: 'admin', read: 'manager', search: ['code', 'description'], order: 'code', schema: { code: { required: true, min: 3, max: 30 }, description: { max: 200 }, type: { enum: ['percent', 'fixed'], required: true }, value: { type: 'int', required: true, min: 1 }, min_amount: { type: 'int', min: 0 }, max_uses: { type: 'int', min: 1 }, valid_from: { type: 'date' }, valid_to: { type: 'date' }, active: { type: 'bool' } } },
  holidays: { table: 'holidays', pk: 'date', write: 'admin', search: ['name', 'date'], order: 'date', schema: { date: { type: 'date', required: true }, name: { required: true, max: 80 } } },
  'time-slots': { table: 'time_slots', write: 'admin', search: ['name'], order: 'start_time', schema: { name: { required: true, max: 50 }, slug: { max: 50 }, start_time: { type: 'time', required: true }, end_time: { type: 'time', required: true }, active: { type: 'bool' } } },
  branches: { table: 'branches', write: 'super_admin', search: ['name', 'city'], order: 'id', schema: { name: { required: true, max: 100 }, city: { max: 80 }, address: { max: 300 }, phone: { max: 30 }, email: { type: 'email' }, lat: { type: 'number' }, lng: { type: 'number' }, active: { type: 'bool' } } },
  enquiries: { table: 'enquiries', read: 'staff', write: 'staff', noCreate: true, search: ['name', 'phone', 'email', 'message'], order: 'id DESC', filter: 'status', schema: { status: { enum: ['new', 'contacted', 'follow_up', 'converted', 'closed'] }, notes: { max: 1000 } } },
  reviews: { table: 'reviews', read: 'manager', write: 'manager', noCreate: true, search: ['author', 'body'], order: 'id DESC', filter: 'status', schema: { status: { enum: ['pending', 'approved', 'rejected'] } } },
};

function compile(name, cfg) {
  cfg.pk ||= 'id'; cfg.read ||= 'staff';
  cfg.updSchema = Object.fromEntries(Object.entries(cfg.schema).map(([k, v]) => [k, { ...v, required: false, default: undefined }]));
  return cfg;
}
Object.entries(RES).forEach(([n, c]) => compile(n, c));

function hydrateRow(cfg, row) {
  for (const k of Object.keys(cfg.json || {})) row[k] = (() => { try { return JSON.parse(row[k]); } catch { return []; } })();
  for (const [k, [tbl, a, b]] of Object.entries(cfg.links || {})) row[k] = all(`SELECT ${b} v FROM ${tbl} WHERE ${a}=?`, row[cfg.pk]).map((r) => r.v);
  return row;
}
function saveRow(cfg, req, id) {
  const create = id === undefined;
  const data = validate(req.body, create ? cfg.schema : cfg.updSchema);
  for (const [k, allowed] of Object.entries(cfg.json || {})) {
    if (req.body[k] !== undefined) { if (!Array.isArray(req.body[k]) || req.body[k].some((x) => !allowed.includes(x))) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid values', { [k]: 'Invalid selection' }); data[k] = JSON.stringify(req.body[k]); }
  }
  if (create && cfg.schema.slug && !data.slug && data.name) data.slug = slugify(data.name);
  if (cfg.schema.slug && data.slug) data.slug = slugify(data.slug);
  if (cfg.table === 'coupons' && data.code) data.code = data.code.toUpperCase().replace(/\s+/g, '');
  if (cfg.table === 'time_slots' && toMin(data.end_time ?? '23:59') <= toMin(data.start_time ?? '00:00')) throw new ApiError(422, 'VALIDATION_ERROR', 'End must be after start', { end_time: 'End must be after start' });
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  try {
    return tx(() => {
      let key = id;
      if (create) {
        const r = run(`INSERT INTO ${cfg.table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => data[c]));
        key = cfg.pk === 'id' ? Number(r.lastInsertRowid) : data[cfg.pk];
      } else if (cols.length) {
        const r = run(`UPDATE ${cfg.table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE ${cfg.pk}=?`, ...cols.map((c) => data[c]), key);
        if (!r.changes) throw notFound();
      }
      for (const [k, [tbl, a, b]] of Object.entries(cfg.links || {})) {
        if (!Array.isArray(req.body[k])) continue;
        run(`DELETE FROM ${tbl} WHERE ${a}=?`, key);
        for (const v of [...new Set(req.body[k].map(Number))].filter(Number.isInteger)) run(`INSERT OR IGNORE INTO ${tbl}(${a},${b}) VALUES (?,?)`, key, v);
      }
      return key;
    });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new ApiError(409, 'DUPLICATE', 'That name / code already exists');
    if (/FOREIGN KEY/.test(e.message)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid reference');
    throw e;
  }
}

export function adminRoutes(app) {
  const A = '/api/admin';

  for (const [name, cfg] of Object.entries(RES)) {
    const base = `${A}/${name}`;
    const pkOf = (req) => (cfg.pk === 'id' ? idParam(req) : req.params.id);
    app.get(base, requireRole(cfg.read), (req, res) => {
      const { size, pg, offset } = page(req, 25, 500); const where = [], p = [];
      if (req.query.q && cfg.search) { where.push('(' + cfg.search.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')'); cfg.search.forEach(() => p.push(like(req.query.q))); }
      if (cfg.filter && req.query[cfg.filter]) { where.push(`${cfg.filter}=?`); p.push(req.query[cfg.filter]); }
      const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const total = get(`SELECT COUNT(*) n FROM ${cfg.table} ${w}`, ...p).n;
      const rows = all(`SELECT * FROM ${cfg.table} ${w} ORDER BY ${cfg.order} LIMIT ? OFFSET ?`, ...p, size, offset).map((r) => hydrateRow(cfg, r));
      res.json({ rows, total, page: pg, size });
    });
    app.get(`${base}/:id`, requireRole(cfg.read), (req, res) => {
      const row = get(`SELECT * FROM ${cfg.table} WHERE ${cfg.pk}=?`, pkOf(req)); if (!row) throw notFound();
      res.json({ row: hydrateRow(cfg, row) });
    });
    if (!cfg.noCreate) app.post(base, requireRole(cfg.write), (req, res) => {
      const key = saveRow(cfg, req); audit(req, 'create', name, key, req.body);
      res.json({ row: hydrateRow(cfg, get(`SELECT * FROM ${cfg.table} WHERE ${cfg.pk}=?`, key)) }, 201);
    });
    app.put(`${base}/:id`, requireRole(cfg.write), (req, res) => {
      const key = pkOf(req); saveRow(cfg, req, key); audit(req, 'update', name, key, req.body);
      res.json({ row: hydrateRow(cfg, get(`SELECT * FROM ${cfg.table} WHERE ${cfg.pk}=?`, key)) });
    });
    if (!cfg.noDelete) app.delete(`${base}/:id`, requireRole(cfg.write), (req, res) => {
      const key = pkOf(req);
      try { const r = run(`DELETE FROM ${cfg.table} WHERE ${cfg.pk}=?`, key); if (!r.changes) throw notFound(); }
      catch (e) { if (/FOREIGN KEY/.test(e.message)) throw new ApiError(409, 'IN_USE', 'This item is in use by existing records. Deactivate it instead of deleting.'); throw e; }
      audit(req, 'delete', name, key); res.json({ ok: true });
    });
  }

  /* ---------- dashboard & analytics ---------- */
  app.get(`${A}/dashboard`, staff, (req, res) => {
    const s = dashboard();
    const a = analytics();
    const unread = get(`SELECT COUNT(*) n FROM notifications WHERE audience='admin' AND is_read=0`).n;
    const revMonth = get(`SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='paid' AND kind<>'refund' AND substr(paid_at,1,7)=strftime('%Y-%m','now')`).n;
    const upcoming = all(`
      SELECT b.ref, b.status, b.customer_name, h.name hall, b.event_date, b.start_time, b.guests 
      FROM bookings b 
      JOIN halls h ON h.id = b.hall_id 
      WHERE b.event_date >= date('now') AND b.status IN ('confirmed','reserved','pending') 
      ORDER BY b.event_date ASC, b.start_time ASC 
      LIMIT 8
    `);

    res.json({
      // Keep nested stats & analytics for backwards compatibility and test assertions
      stats: s,
      analytics: a,
      unread,

      // Top-level fields consumed by public/js/admin/views/dashboard.js
      total_bookings: s.total_bookings,
      pending_requests: s.pending_bookings,
      todays_events: s.todays_events,
      upcoming_events: s.upcoming_events,
      pending_enquiries: s.new_enquiries,
      revenue: s.revenue,
      revenue_month: revMonth,
      pending_payments: s.pending_payments,
      available_halls: s.halls_free_today,
      halls_total: s.halls_active,
      pending_reviews: s.pending_reviews,
      pending_refunds: s.pending_refunds,

      monthly: (s.revenue_by_month || []).map((r) => ({ m: r.month, v: r.amount })),
      byStatus: (s.by_status || []).map((r) => ({ status: r.status, c: r.count })),
      byEvent: (s.by_event || []).map((r) => ({ name: r.name, c: r.count })),
      enquiries: (s.enquiries_by_status || []).map((r) => ({ status: r.status, c: r.count })),
      payStatus: (s.payment_status || []).map((r) => ({ label: r.status, value: r.amount })),
      upcoming,
    });
  });

  app.get(`${A}/analytics`, staff, (req, res) => {
    const from = req.query.from || '2000-01-01';
    const to = req.query.to || '2099-12-31';
    const n = (sql, ...p) => get(sql, ...p).n;

    const requests = n('SELECT COUNT(*) n FROM bookings WHERE substr(created_at,1,10) BETWEEN ? AND ?', from, to);
    const confirmed = n(`SELECT COUNT(*) n FROM bookings WHERE status IN ('confirmed','completed') AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to);
    const enq = n('SELECT COUNT(*) n FROM enquiries WHERE substr(created_at,1,10) BETWEEN ? AND ?', from, to);
    const conv = n(`SELECT COUNT(*) n FROM enquiries WHERE status='converted' AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to);
    const revBooked = n(`SELECT COALESCE(SUM(paid_amount - refunded_amount),0) n FROM bookings WHERE substr(created_at,1,10) BETWEEN ? AND ?`, from, to);
    const avgVal = Math.round(n(`SELECT COALESCE(AVG(total),0) n FROM bookings WHERE status IN ('confirmed','completed') AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to));

    const ev = Object.fromEntries(all(`SELECT type, COUNT(*) c FROM analytics_events WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY type`, from, to).map((r) => [r.type, r.c]));

    const popEvent = get(`SELECT COALESCE(e.name,'Other') name, COUNT(*) c FROM bookings b LEFT JOIN event_types e ON e.id=b.event_type_id WHERE b.status IN ('confirmed','completed') AND substr(b.created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, from, to);
    const popPkg = get(`SELECT p.name, COUNT(*) c FROM bookings b JOIN packages p ON p.id=b.package_id WHERE b.status IN ('confirmed','completed') AND substr(b.created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, from, to);

    res.json({
      bookingsCreated: requests,
      bookingsWon: confirmed,
      conversionRate: requests ? Math.round((confirmed / requests) * 1000) / 10 : 0,
      revenueBooked: revBooked,
      avgBookingValue: avgVal,
      tracking: {
        bookNowClicks: ev.book_click || 0,
        availabilityChecks: ev.assistant || 0,
        enquiryForms: ev.enquiry || 0,
        calls: ev.call_click || 0,
        whatsapp: ev.whatsapp_click || 0,
      },
      enquiries: enq,
      enquiriesConverted: conv,
      popularEvent: popEvent ? { name: popEvent.name, c: popEvent.c } : null,
      popularPackage: popPkg ? { name: popPkg.name, c: popPkg.c } : null,
    });
  });

  app.get(`${A}/ai/summary`, manager, (req, res) => res.json(aiSummary()));
  app.get(`${A}/notifications`, staff, (req, res) => res.json({ notifications: all(`SELECT * FROM notifications WHERE audience='admin' ORDER BY id DESC LIMIT 60`) }));
  app.post(`${A}/notifications/read`, staff, (req, res) => { run(`UPDATE notifications SET is_read=1 WHERE audience='admin'`); res.json({ ok: true }); });

  /* ---------- bookings ---------- */
  const SORTS = { event_date: 'b.event_date', created: 'b.created_at', total: 'b.total', customer: 'b.customer_name', status: 'b.status', guests: 'b.guests' };
  app.get(`${A}/bookings`, staff, (req, res) => {
    const { size, pg, offset } = page(req, 20, 500); const where = [], p = [];
    if (req.query.status) { where.push('b.status=?'); p.push(req.query.status); }
    if (req.query.hall) { where.push('b.hall_id=?'); p.push(Number(req.query.hall)); }
    if (req.query.from) { where.push('b.event_date>=?'); p.push(req.query.from); }
    if (req.query.to) { where.push('b.event_date<=?'); p.push(req.query.to); }
    if (req.query.q) { where.push(`(b.ref LIKE ? ESCAPE '\\' OR b.customer_name LIKE ? ESCAPE '\\' OR b.phone LIKE ? ESCAPE '\\' OR b.email LIKE ? ESCAPE '\\')`); for (let i = 0; i < 4; i++) p.push(like(req.query.q)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const order = `${SORTS[req.query.sort] || 'b.created_at'} ${req.query.dir === 'asc' ? 'ASC' : 'DESC'}`;
    const base = `FROM bookings b JOIN halls h ON h.id=b.hall_id LEFT JOIN event_types e ON e.id=b.event_type_id LEFT JOIN packages pk ON pk.id=b.package_id ${w}`;
    if (req.query.format === 'csv') {
      const rows = all(`SELECT b.ref, b.status, b.customer_name, b.phone, b.email, h.name hall, COALESCE(e.name,b.custom_event) event, b.event_date, b.start_time, b.end_time, b.guests, b.total, b.paid_amount, b.refunded_amount, b.created_at ${base} ORDER BY ${order}`, ...p);
      audit(req, 'export', 'bookings', null, `${rows.length} rows`);
      res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"'); return res.send(toCsv(rows), 'text/csv; charset=utf-8');
    }
    const total = get(`SELECT COUNT(*) n ${base}`, ...p).n;
    const rows = all(`SELECT b.*, h.name hall_name, e.name event_name, pk.name package_name ${base} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, size, offset).map((r) => ({ ...r, breakdown: undefined, balance: Math.max(0, r.total - r.paid_amount + r.refunded_amount) }));
    res.json({ rows, total, page: pg, size });
  });
  app.get(`${A}/bookings/:id`, staff, (req, res) => {
    const b = getBooking(idParam(req)); if (!b) throw notFound('Booking');
    res.json({ booking: b, payments: all('SELECT * FROM payments WHERE booking_id=? ORDER BY id', b.id), documents: all('SELECT id,kind,original_name,size,created_at FROM booking_documents WHERE booking_id=?', b.id), customer: b.user_id ? get('SELECT id,name,email,phone FROM users WHERE id=?', b.user_id) : null });
  });
  app.post(`${A}/bookings`, manager, (req, res) => {
    const v = validate(req.body, bookingSchema);
    const b = createBooking(null, { ...v, services: parseServices(req.body) });
    if (req.body.user_id) run('UPDATE bookings SET user_id=? WHERE id=?', Number(req.body.user_id), b.id);
    let out = b; if (req.body.confirm) out = transition(b.id, 'confirm', { actor: req.user }).booking;
    audit(req, 'create', 'booking', b.id); res.json({ booking: out }, 201);
  });
  for (const action of ['approve', 'reject', 'confirm', 'cancel', 'complete']) {
    app.post(`${A}/bookings/:id/${action}`, manager, (req, res) => {
      const v = validate(req.body, { reason: { max: 300 }, refund_percent: { type: 'int', min: 0, max: 100 } });
      const out = transition(idParam(req), action, { actor: req.user, reason: v.reason, refundPercent: v.refund_percent });
      audit(req, action, 'booking', out.booking.ref, v.reason); res.json(out);
    });
  }
  app.patch(`${A}/bookings/:id`, manager, (req, res) => {
    const id = idParam(req);
    const v = validate(req.body, { event_date: { type: 'date' }, start_time: { type: 'time' }, end_time: { type: 'time' }, guests: { type: 'int', min: 1, max: 100000 }, hall_id: { type: 'int' }, package_id: { type: 'int' }, requirements: { max: 2000 }, coupon: { max: 40 }, admin_notes: { max: 2000 } });
    const { admin_notes, ...patch } = v; if (Array.isArray(req.body.services)) patch.services = parseServices(req.body);
    if (admin_notes !== undefined) run('UPDATE bookings SET admin_notes=? WHERE id=?', admin_notes, id);
    const out = Object.keys(patch).length ? modifyBooking(id, patch, { actor: req.user, isStaff: true }) : { booking: getBooking(id) };
    audit(req, 'modify', 'booking', out.booking.ref, req.body); res.json(out);
  });
  app.post(`${A}/bookings/:id/payments`, manager, (req, res) => {
    const v = validate(req.body, { amount: { type: 'int', required: true, min: 1 }, note: { max: 200 } });
    const out = recordOfflinePayment(idParam(req), v.amount, v.note); audit(req, 'offline_payment', 'booking', idParam(req), v); res.json(out, 201);
  });

  /* ---------- calendar & blocks ---------- */
  app.get(`${A}/calendar`, staff, (req, res) => {
    const from = req.query.from, to = req.query.to;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) throw bad('from and to dates are required');
    const hall = Number(req.query.hall) || null;
    const bookings = all(`SELECT b.id,b.ref,b.status,b.customer_name,b.event_date,b.start_time,b.end_time,b.guests,b.total,b.hall_id,h.name hall_name,COALESCE(e.name,b.custom_event) event FROM bookings b JOIN halls h ON h.id=b.hall_id LEFT JOIN event_types e ON e.id=b.event_type_id WHERE b.event_date BETWEEN ? AND ? AND b.status IN ('pending','reserved','confirmed','completed') ${hall ? 'AND b.hall_id=' + hall : ''} ORDER BY b.event_date, b.start_min`, from, to);
    const blocks = all(`SELECT k.*, h.name hall_name FROM calendar_blocks k JOIN halls h ON h.id=k.hall_id WHERE k.date BETWEEN ? AND ? ${hall ? 'AND k.hall_id=' + hall : ''} ORDER BY k.date`, from, to);
    res.json({ bookings, blocks });
  });
  app.post(`${A}/blocks`, manager, (req, res) => {
    const v = validate(req.body, { hall_id: { type: 'int', required: true }, date: { type: 'date', required: true }, start_time: { type: 'time', default: '00:00' }, end_time: { type: 'time', default: '23:59' }, status: { enum: ['blocked', 'maintenance'], default: 'blocked' }, reason: { max: 200 } });
    const clash = all(`SELECT ref FROM bookings WHERE hall_id=? AND event_date=? AND status IN ('reserved','confirmed')`, v.hall_id, v.date);
    if (clash.length) throw new ApiError(409, 'BOOKING_CONFLICT', `Cannot block: ${clash.map((c) => c.ref).join(', ')} already booked on this date.`);
    const r = run('INSERT INTO calendar_blocks(hall_id,date,start_min,end_min,status,reason) VALUES (?,?,?,?,?,?)', v.hall_id, v.date, toMin(v.start_time), v.end_time === '23:59' ? 1440 : toMin(v.end_time), v.status, v.reason);
    audit(req, 'block', 'calendar', v.date, v); res.json({ id: Number(r.lastInsertRowid) }, 201);
  });
  app.delete(`${A}/blocks/:id`, manager, (req, res) => { run('DELETE FROM calendar_blocks WHERE id=?', idParam(req)); audit(req, 'unblock', 'calendar', req.params.id); res.json({ ok: true }); });

  /* ---------- payments & refunds ---------- */
  app.get(`${A}/payments`, manager, (req, res) => {
    const { size, pg, offset } = page(req, 25, 200); const w = req.query.status ? 'WHERE p.status=?' : '', p = req.query.status ? [req.query.status] : [];
    const rows = all(`SELECT p.*, b.ref, b.customer_name FROM payments p JOIN bookings b ON b.id=p.booking_id ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`, ...p, size, offset);
    res.json({ rows, total: get(`SELECT COUNT(*) n FROM payments p ${w}`, ...p).n, page: pg, size });
  });
  app.post(`${A}/payments/:id/refund`, manager, (req, res) => {
    const v = validate(req.body, { note: { max: 200 } });
    const out = processRefund(idParam(req), v.note); audit(req, 'refund', 'payment', req.params.id, v); res.json({ payment: out });
  });

  /* ---------- quotations ---------- */
  const qSchema = { customer_name: { required: true, max: 80 }, email: { type: 'email' }, phone: { type: 'phone' }, hall_id: { type: 'int' }, event_date: { type: 'date' }, valid_until: { type: 'date' }, notes: { max: 1500 }, status: { enum: ['draft', 'sent', 'accepted', 'declined', 'expired'], default: 'draft' } };
  const items = (body) => {
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 40) throw new ApiError(422, 'VALIDATION_ERROR', 'Add at least one line item', { items: 'Add at least one line item' });
    return body.items.map((i) => ({ label: String(i.label || '').replace(/<[^>]*>/g, '').slice(0, 150), amount: Math.round(Number(i.amount)) })).filter((i) => i.label && Number.isFinite(i.amount));
  };
  const totals = (list) => { const sub = list.reduce((s, i) => s + i.amount, 0), tax = Math.round((sub * setting('tax').percent) / 100); return { subtotal: sub, tax, total: sub + tax }; };
  app.get(`${A}/quotations`, manager, (req, res) => res.json({ rows: all('SELECT * FROM quotations ORDER BY id DESC LIMIT 200').map((q) => ({ ...q, items: JSON.parse(q.items) })), total: get('SELECT COUNT(*) n FROM quotations').n }));
  app.post(`${A}/quotations`, manager, (req, res) => {
    const v = validate(req.body, qSchema), list = items(req.body), t = totals(list);
    const n = (get('SELECT COALESCE(MAX(id),0)+1 n FROM quotations').n);
    const r = run('INSERT INTO quotations(number,customer_name,email,phone,hall_id,event_date,items,subtotal,tax,total,status,valid_until,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      `QUO-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`, v.customer_name, v.email, v.phone, v.hall_id, v.event_date, JSON.stringify(list), t.subtotal, t.tax, t.total, v.status, v.valid_until, v.notes, req.user.id);
    audit(req, 'create', 'quotation', r.lastInsertRowid); res.json({ id: Number(r.lastInsertRowid), ...t }, 201);
  });
  app.put(`${A}/quotations/:id`, manager, (req, res) => {
    const v = validate(req.body, qSchema), list = items(req.body), t = totals(list);
    const r = run('UPDATE quotations SET customer_name=?,email=?,phone=?,hall_id=?,event_date=?,items=?,subtotal=?,tax=?,total=?,status=?,valid_until=?,notes=? WHERE id=?', v.customer_name, v.email, v.phone, v.hall_id, v.event_date, JSON.stringify(list), t.subtotal, t.tax, t.total, v.status, v.valid_until, v.notes, idParam(req));
    if (!r.changes) throw notFound(); audit(req, 'update', 'quotation', req.params.id); res.json({ ok: true, ...t });
  });
  app.delete(`${A}/quotations/:id`, admin, (req, res) => { run('DELETE FROM quotations WHERE id=?', idParam(req)); audit(req, 'delete', 'quotation', req.params.id); res.json({ ok: true }); });
  app.get(`${A}/quotations/:id/pdf`, manager, (req, res) => {
    const q = get('SELECT * FROM quotations WHERE id=?', idParam(req)); if (!q) throw notFound('Quotation');
    res.setHeader('Content-Disposition', `inline; filename="${q.number}.pdf"`); res.send(quotationPdf(q), 'application/pdf');
  });

  /* ---------- customers & users ---------- */
  app.get(`${A}/customers`, staff, (req, res) => {
    const { size, pg, offset } = page(req, 25, 200); const where = [`u.role='customer'`], p = [];
    if (req.query.q) { where.push(`(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')`); for (let i = 0; i < 3; i++) p.push(like(req.query.q)); }
    const w = 'WHERE ' + where.join(' AND ');
    const rows = all(`SELECT u.id,u.name,u.email,u.phone,u.active,u.created_at,(SELECT COUNT(*) FROM bookings b WHERE b.user_id=u.id) bookings,(SELECT COALESCE(SUM(paid_amount-refunded_amount),0) FROM bookings b WHERE b.user_id=u.id) paid FROM users u ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`, ...p, size, offset);
    res.json({ rows, total: get(`SELECT COUNT(*) n FROM users u ${w}`, ...p).n, page: pg, size });
  });
  const custSchema = { name: { required: true, min: 2, max: 80 }, email: { type: 'email', required: true }, phone: { type: 'phone' }, active: { type: 'bool' } };
  app.post(`${A}/customers`, manager, (req, res) => {
    const v = validate(req.body, { ...custSchema, password: { required: true, min: 8, max: 100 } });
    if (get('SELECT 1 x FROM users WHERE email=?', v.email)) throw new ApiError(409, 'EMAIL_TAKEN', 'Email already registered', { email: 'Email already registered' });
    const r = run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?, 'customer')`, v.name, v.email, v.phone, hashPassword(v.password));
    audit(req, 'create', 'customer', r.lastInsertRowid); res.json({ id: Number(r.lastInsertRowid) }, 201);
  });
  app.put(`${A}/customers/:id`, manager, (req, res) => {
    const v = validate(req.body, { name: { min: 2, max: 80 }, phone: { type: 'phone' }, active: { type: 'bool' } });
    const r = run(`UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), active=COALESCE(?,active) WHERE id=? AND role='customer'`, v.name, v.phone, v.active, idParam(req));
    if (!r.changes) throw notFound('Customer'); audit(req, 'update', 'customer', req.params.id, v); res.json({ ok: true });
  });
  app.delete(`${A}/customers/:id`, admin, (req, res) => {
    const id = idParam(req);
    if (get('SELECT 1 x FROM bookings WHERE user_id=?', id)) throw new ApiError(409, 'IN_USE', 'This customer has bookings. Disable the account instead of deleting it.');
    run(`DELETE FROM users WHERE id=? AND role='customer'`, id); audit(req, 'delete', 'customer', id); res.json({ ok: true });
  });
  app.get(`${A}/users`, superAdmin, (req, res) => res.json({ rows: all(`SELECT id,name,email,phone,role,active,created_at FROM users WHERE role<>'customer' ORDER BY id`) }));
  app.post(`${A}/users`, superAdmin, (req, res) => {
    const v = validate(req.body, { name: { required: true, min: 2, max: 80 }, email: { type: 'email', required: true }, phone: { type: 'phone' }, role: { enum: ['staff', 'manager', 'admin', 'super_admin'], required: true }, password: { required: true, min: 10, max: 100 } });
    if (get('SELECT 1 x FROM users WHERE email=?', v.email)) throw new ApiError(409, 'EMAIL_TAKEN', 'Email already registered', { email: 'Email already registered' });
    const r = run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)', v.name, v.email, v.phone, hashPassword(v.password), v.role);
    audit(req, 'create', 'user', r.lastInsertRowid, { email: v.email, role: v.role }); res.json({ id: Number(r.lastInsertRowid) }, 201);
  });
  app.put(`${A}/users/:id`, superAdmin, (req, res) => {
    const id = idParam(req);
    const v = validate(req.body, { name: { min: 2, max: 80 }, role: { enum: ['customer', 'staff', 'manager', 'admin', 'super_admin'] }, active: { type: 'bool' }, password: { min: 10, max: 100 } });
    if (id === req.user.id && (v.role && v.role !== req.user.role || v.active === 0)) throw new ApiError(409, 'SELF', 'You cannot demote or disable your own account.');
    run('UPDATE users SET name=COALESCE(?,name), role=COALESCE(?,role), active=COALESCE(?,active), password_hash=COALESCE(?,password_hash) WHERE id=?', v.name, v.role, v.active, v.password ? hashPassword(v.password) : null, id);
    audit(req, 'update', 'user', id, { role: v.role, active: v.active, password_changed: !!v.password }); res.json({ ok: true });
  });

  /* ---------- settings ---------- */
  app.get(`${A}/settings`, admin, (req, res) => res.json({ settings: allSettings(), payment: { provider: config.payment.provider, configured: config.payment.provider === 'mock' || !!config.payment.razorpayKeyId }, notifications_channels: { smtp: !!config.smtp.host, sms: !!config.smsWebhookUrl, whatsapp: !!config.whatsappWebhookUrl } }));
  app.put(`${A}/settings/:group`, admin, (req, res) => {
    const g = req.params.group;
    if (!DEFAULTS[g]) throw notFound('Settings group');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Never accept secrets through the settings API — those live in environment variables only.
    const str = JSON.stringify(body);
    if (str.length > 20000 || /<script/i.test(str)) throw bad('Invalid settings');
    const colors = g === 'theme' ? Object.values(body) : [];
    if (colors.some((c) => !/^#[0-9a-f]{6}$/i.test(c))) throw new ApiError(422, 'VALIDATION_ERROR', 'Colours must be hex values like #0e1a3a');
    saveSettings(g, body); audit(req, 'settings', g, null, body); res.json({ settings: allSettings()[g] });
  });

  /* ---------- reports, exports, audit ---------- */
  app.get(`${A}/reports/:type`, manager, (req, res) => {
    const rep = detailedReport(req.params.type, { from: req.query.from, to: req.query.to, group: req.query.group });
    if (!rep) throw notFound('Report');
    if (req.query.format === 'csv') {
      audit(req, 'export', 'report', req.params.type);
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-report.csv"`);
      return res.send(toCsv(rep.rows), 'text/csv; charset=utf-8');
    }
    res.json(rep);
  });

  app.get(`${A}/export/:what`, manager, (req, res) => {
    const rep = detailedReport(req.params.what, { from: req.query.from, to: req.query.to, group: req.query.group });
    if (!rep) throw notFound('Report');
    const fmt = req.query.format || 'csv';
    const stamp = new Date().toISOString().slice(0, 10);
    const title = `${req.params.what}-report-${stamp}`;
    audit(req, 'export', 'report', req.params.what, { format: fmt, count: rep.rows.length });

    if (fmt === 'xls') {
      const cols = rep.columns;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table,th,td{border:1px solid #ccc;border-collapse:collapse;padding:8px;}th{background:#6b1e2e;color:#fff;font-weight:bold;}</style></head><body><h2>${req.params.what.toUpperCase()} REPORT</h2><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rep.rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      res.setHeader('Content-Disposition', `attachment; filename="${title}.xls"`);
      return res.send(html, 'application/vnd.ms-excel; charset=utf-8');
    }

    if (fmt === 'pdf') {
      const cols = rep.columns;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#1a1622;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:10px;text-align:left;}th{background:#f4ecef;font-weight:700;}h1{margin:0;color:#6b1e2e;font-size:24px;}.sub{color:#666;font-size:14px;margin-top:4px;}</style></head><body onload="window.print()"><h1>CVR Convention Hall</h1><div class="sub">${req.params.what.toUpperCase()} REPORT · Date range: ${req.query.from || 'All'} to ${req.query.to || 'Present'}</div><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rep.rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      return res.send(html, 'text/html; charset=utf-8');
    }

    // Default: CSV
    res.setHeader('Content-Disposition', `attachment; filename="${title}.csv"`);
    return res.send(toCsv(rep.rows), 'text/csv; charset=utf-8');
  });
  app.get(`${A}/audit`, superAdmin, (req, res) => {
    const { size, pg, offset } = page(req, 50, 200);
    res.json({ rows: all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?', size, offset), total: get('SELECT COUNT(*) n FROM audit_logs').n, page: pg, size });
  });
  app.get(`${A}/outbox`, admin, (req, res) => res.json({ rows: all('SELECT * FROM outbox ORDER BY id DESC LIMIT 100') }));
  app.get(`${A}/export`, superAdmin, (req, res) => {
    const tables = ['bookings', 'booking_services', 'payments', 'invoices', 'quotations', 'enquiries', 'reviews', 'halls', 'packages', 'services', 'facilities', 'coupons', 'gallery', 'staff'];
    const data = Object.fromEntries(tables.map((t) => [t, all(`SELECT * FROM ${t}`)]));
    data.customers = all(`SELECT id,name,email,phone,active,created_at FROM users WHERE role='customer'`);
    audit(req, 'export', 'all-data'); res.setHeader('Content-Disposition', 'attachment; filename="business-data-export.json"');
    res.send(JSON.stringify({ exported_at: new Date().toISOString(), data }, null, 2), 'application/json; charset=utf-8');
  });

  /* ---------- image upload (admin) ---------- */
  app.post(`${A}/upload`, admin, (req, res) => {
    const { files } = parseMultipart(req);
    const { stored } = checkUpload(files[0], ['image/jpeg', 'image/png', 'image/webp'], 5 * 1048576);
    const dir = path.join(config.uploadDir, 'public'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, stored), files[0].data);
    audit(req, 'upload', 'image', stored); res.json({ url: `/uploads/${stored}` }, 201);
  });
}
