import { all, get, run } from '../db.js';
import { ApiError, bad, notFound, rateLimit, readBody } from '../lib/http.js';
import { validate, clean } from '../lib/validate.js';
import { publicSettings } from '../services/settings.js';
import { quote } from '../services/pricing.js';
import { conflicts, monthAvailability } from '../services/availability.js';
import { toMin } from '../lib/validate.js';
import { notifyAdmin } from '../services/notify.js';
import { chat } from '../services/ai.js';
import { like } from './common.js';
import { gatewayInfo } from '../services/payments.js';

const json = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
export const hallOut = (h) => ({ ...h, layouts: json(h.layouts, []), facilities: all('SELECT f.id,f.name,f.icon,f.spec FROM facilities f JOIN hall_facilities hf ON hf.facility_id=f.id WHERE hf.hall_id=? AND f.active=1 ORDER BY f.sort', h.id) });
const pkgOut = (p) => ({ ...p, services: all('SELECT s.id,s.name,s.category FROM services s JOIN package_services ps ON ps.service_id=s.id WHERE ps.package_id=?', p.id) });

export function publicRoutes(app) {
  const writeLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, scope: 'public-write', message: 'Too many submissions. Please try again in a few minutes.' });

  app.get('/api/settings', (req, res) => res.json({ ...publicSettings(), payment: gatewayInfo().mock ? { mock: true } : { mock: false }, time_slots: all('SELECT slug,name,start_time,end_time FROM time_slots WHERE active=1 ORDER BY start_time, end_time') }));

  app.get('/api/halls', (req, res) => {
    const rows = all('SELECT * FROM halls WHERE active=1 ORDER BY popularity DESC, id');
    res.json({ halls: rows.map(hallOut) });
  });
  app.get('/api/halls/:slug', (req, res) => {
    const h = get('SELECT * FROM halls WHERE slug=? AND active=1', req.params.slug);
    if (!h) throw notFound('Hall');
    res.json({ hall: hallOut(h), gallery: all('SELECT id,title,alt,url,category FROM gallery WHERE hall_id=? AND active=1 ORDER BY sort', h.id) });
  });
  app.get('/api/facilities', (req, res) => res.json({ facilities: all('SELECT * FROM facilities WHERE active=1 ORDER BY sort') }));
  app.get('/api/event-types', (req, res) => res.json({ event_types: all('SELECT * FROM event_types WHERE active=1 ORDER BY sort') }));
  app.get('/api/services', (req, res) => res.json({ services: all('SELECT * FROM services WHERE active=1 ORDER BY category, name') }));
  app.get('/api/packages', (req, res) => res.json({ packages: all('SELECT * FROM packages WHERE active=1 ORDER BY CASE tier WHEN \'basic\' THEN 1 WHEN \'standard\' THEN 2 WHEN \'premium\' THEN 3 WHEN \'wedding\' THEN 4 WHEN \'corporate\' THEN 5 ELSE 6 END').map(pkgOut) }));
  app.get('/api/gallery', (req, res) => {
    const rows = req.query.category ? all('SELECT * FROM gallery WHERE active=1 AND category=? ORDER BY sort', req.query.category) : all('SELECT * FROM gallery WHERE active=1 ORDER BY sort');
    res.json({ items: rows, categories: all('SELECT DISTINCT category FROM gallery WHERE active=1').map((r) => r.category) });
  });
  app.get('/api/reviews', (req, res) => {
    const rows = all(`SELECT id,author,event_label,rating,title,body,created_at FROM reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 30`);
    const s = get(`SELECT COUNT(*) count, ROUND(AVG(rating),1) average FROM reviews WHERE status='approved'`);
    res.json({ reviews: rows, summary: { count: s.count, average: s.average || 0 } });
  });

  app.get('/api/availability', (req, res) => {
    const hall = Number(req.query.hall), month = String(req.query.month || '');
    if (!hall || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('hall and month (YYYY-MM) are required');
    if (!get('SELECT 1 x FROM halls WHERE id=? AND active=1', hall)) throw notFound('Hall');
    res.json({ hall, month, days: monthAvailability(hall, month) });
  });
  app.get('/api/availability/check', (req, res) => {
    const v = validate({ hall: req.query.hall, date: req.query.date, start: req.query.start, end: req.query.end }, { hall: { type: 'int', required: true }, date: { type: 'date', required: true }, start: { type: 'time', required: true }, end: { type: 'time', required: true } });
    if (toMin(v.end) <= toMin(v.start)) throw new ApiError(422, 'VALIDATION_ERROR', 'End time must be after start time', { end: 'End time must be after start time' });
    const c = conflicts({ hallId: v.hall, date: v.date, startMin: toMin(v.start), endMin: toMin(v.end) });
    res.json({ available: c.length === 0, reasons: c.map((x) => x.type === 'block' ? x.status : x.status) });
  });

  const quoteSchema = {
    hall_id: { type: 'int', required: true }, event_date: { type: 'date', required: true }, start_time: { type: 'time', required: true }, end_time: { type: 'time', required: true },
    guests: { type: 'int', required: true, min: 1, max: 100000 }, package_id: { type: 'int' }, coupon: { type: 'string', max: 40 },
  };
  app.post('/api/quote', rateLimit({ windowMs: 60_000, max: 60, scope: 'quote' }), (req, res) => {
    const v = validate(req.body, quoteSchema);
    const services = Array.isArray(req.body.services) ? req.body.services.slice(0, 30).map((s) => ({ id: Number(s.id), qty: Number(s.qty) || 1 })) : [];
    const q = quote({ hall_id: v.hall_id, date: v.event_date, start: v.start_time, end: v.end_time, guests: v.guests, package_id: v.package_id, services, coupon: v.coupon });
    const free = conflicts({ hallId: v.hall_id, date: v.event_date, startMin: toMin(v.start_time), endMin: toMin(v.end_time) }).length === 0;
    res.json({ quote: q, available: free });
  });

  app.post('/api/enquiries', writeLimit, (req, res) => {
    if (req.body?.website) return res.json({ ok: true }); // honeypot: bots fill the hidden field
    const v = validate(req.body, { name: { required: true, min: 2, max: 80 }, phone: { type: 'phone', required: true }, email: { type: 'email' }, event_type: { max: 60 }, event_date: { type: 'date' }, guests: { type: 'int', min: 1, max: 100000 }, message: { max: 1500 }, source: { max: 40 } });
    const r = run('INSERT INTO enquiries(name,phone,email,event_type,event_date,guests,message,source) VALUES (?,?,?,?,?,?,?,?)', v.name, v.phone, v.email, v.event_type, v.event_date, v.guests, v.message, v.source || 'website');
    run(`INSERT INTO analytics_events(type,path) VALUES ('enquiry','/contact')`);
    notifyAdmin('new_enquiry', `New enquiry from ${v.name}`, `${v.phone}${v.event_type ? ' · ' + v.event_type : ''}${v.message ? ' — ' + v.message.slice(0, 120) : ''}`, '/admin/enquiries');
    res.json({ ok: true, id: Number(r.lastInsertRowid), message: 'Thank you! Our team will contact you shortly.' }, 201);
  });

  const TRACK = new Set(['book_click', 'call_click', 'whatsapp_click', 'check_availability', 'assistant']);
  app.post('/api/track', rateLimit({ windowMs: 60_000, max: 60, scope: 'track' }), (req, res) => {
    const t = String(req.body?.type || '');
    if (TRACK.has(t)) run('INSERT INTO analytics_events(type,path) VALUES (?,?)', t, clean(req.body.path || '').slice(0, 200));
    res.status(204).end();
  });

  app.get('/api/search', rateLimit({ windowMs: 60_000, max: 60, scope: 'search' }), (req, res) => {
    const q = clean(req.query.q || '').slice(0, 60);
    if (q.length < 2) return res.json({ results: [] });
    const l = like(q), out = [];
    all(`SELECT slug,name,tagline FROM halls WHERE active=1 AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`, l, l).forEach((h) => out.push({ type: 'Hall', title: h.name, text: h.tagline, href: `/halls/${h.slug}` }));
    all(`SELECT name,description FROM packages WHERE active=1 AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`, l, l).forEach((p) => out.push({ type: 'Package', title: p.name, text: p.description, href: '/packages' }));
    all(`SELECT name,description FROM facilities WHERE active=1 AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`, l, l).forEach((f) => out.push({ type: 'Facility', title: f.name, text: f.description, href: '/facilities' }));
    all(`SELECT name,description FROM event_types WHERE active=1 AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`, l, l).forEach((e) => out.push({ type: 'Event', title: e.name, text: e.description, href: '/events' }));
    res.json({ results: out.slice(0, 20) });
  });

  app.post('/api/ai/chat', rateLimit({ windowMs: 60_000, max: 20, scope: 'ai' }), (req, res) => {
    const v = validate(req.body, { message: { required: true, max: 500 } });
    run(`INSERT INTO analytics_events(type,path) VALUES ('assistant','/assistant')`);
    res.json(chat(v.message));
  });
}
