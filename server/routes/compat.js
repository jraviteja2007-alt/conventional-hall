// Presentation adapter: the public website pages consume a slightly different, UI-oriented JSON shape than the
// core REST API (`/api/*` routes in public.js). These routes are registered BEFORE the core routes so they win for
// the same path, and they only reshape data produced by the tested services — no business logic lives here.
import { all, get } from '../db.js';
import { ApiError, bad, notFound, rateLimit } from '../lib/http.js';
import { toMin } from '../lib/validate.js';
import { setting } from '../services/settings.js';
import { conflicts, monthAvailability } from '../services/availability.js';
import { quote } from '../services/pricing.js';
import { chat, recommend } from '../services/ai.js';
import { LEGAL_DEFAULTS, LEGAL_KEYS } from '../services/legal.js';

const J = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const SQFT = 10.7639;
const todayISO = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

const LAYOUT_NAMES = { banquet: 'Banquet', theatre: 'Theatre', classroom: 'Classroom', 'u-shape': 'U-shape', dining: 'Dining', custom: 'Custom' };
function layoutsFor(h) {
  const kinds = J(h.layouts, ['banquet']);
  const cap = { banquet: h.dining_capacity, dining: h.dining_capacity, theatre: h.seating_capacity, classroom: Math.round(h.seating_capacity * 0.55), 'u-shape': Math.round(h.seating_capacity * 0.3), custom: h.max_guests };
  return kinds.map((k) => ({ kind: k, name: LAYOUT_NAMES[k] || k, capacity: cap[k] || h.max_guests }));
}
const ratingFor = () => {
  const r = get(`SELECT COUNT(*) count, ROUND(AVG(rating),1) average FROM reviews WHERE status='approved'`);
  return r.count ? { count: r.count, average: r.average, scale: 5 } : null;
};
function hallOld(h) {
  const facs = all('SELECT f.id,f.name,f.icon,f.spec FROM facilities f JOIN hall_facilities hf ON hf.facility_id=f.id WHERE hf.hall_id=? AND f.active=1 ORDER BY f.sort', h.id);
  const imgs = all('SELECT url,title,alt FROM gallery WHERE hall_id=? AND active=1 AND type=\'image\' ORDER BY sort', h.id).map((g) => ({ url: g.url, title: g.title || h.name, alt: g.alt || `${h.name} photo` }));
  const area = h.area_sqft ? h.area_sqft / SQFT : (h.length_m || 0) * (h.width_m || 0);
  return {
    id: h.id, slug: h.slug, name: h.name, tagline: h.tagline, description: h.description,
    min_guests: h.min_guests, max_guests: h.max_guests, seating_capacity: h.seating_capacity, dining_capacity: h.dining_capacity,
    length_m: h.length_m, width_m: h.width_m, height_m: h.height_m, area_sqm: Math.round(area), is_ac: 1,
    parking_two: h.parking_two, parking_four: h.parking_four, popularity: h.popularity,
    base_full_day: h.base_price, base_half_day: h.half_day_price, base_hourly: h.hourly_price,
    hero_image: h.image, images: imgs, layouts: layoutsFor(h), facilities: facs.map((f) => ({ ...f, details: f.spec })), rating: ratingFor(),
  };
}
function pkgOld(p) {
  const services = all('SELECT s.id,s.name,s.category FROM services s JOIN package_services ps ON ps.service_id=s.id WHERE ps.package_id=?', p.id);
  return {
    ...p, is_featured: p.popular, sort_order: -(p.popularity || 0), min_guests: 1, max_guests: p.guest_capacity || 0,
    highlights: services.map((s) => s.name).slice(0, 6), services, images: p.image ? [p.image] : [],
  };
}
const facOld = (f) => ({ ...f, is_featured: f.featured, details: f.spec });
const eventOld = (e) => ({ ...e, is_other: /other|custom/.test(e.slug) ? 1 : 0, extra_fields: [] });
const siteOld = () => {
  const b = setting('business');
  return { name: b.name, short_name: b.name.split(' ')[0], tagline: b.tagline, about: b.description, city: b.city, state: b.state, country: b.country, address: b.address, phone: b.phone, whatsapp: b.whatsapp, email: b.email, opening_hours: b.hours, social: b.social, lat: b.lat, lng: b.lng };
};
function quoteOld(q) {
  const lines = q.lines.map((l) => ({ ...l, included: l.amount === 0 && /included/i.test(l.label) }));
  const half = Math.round((q.tax / 2) * 100) / 100;
  const disc = q.discount ? { label: q.coupon?.description || 'Discount', code: q.coupon?.code || '', amount: q.discount, auto: false } : null;
  return { lines, subtotal: q.subtotal, discount: disc, tax: { name: q.tax_label, rate: q.tax_percent, amount: q.tax, cgst: half, sgst: q.tax - half }, total: q.total, advancePct: q.advance_percent, advance: q.advance_due, hours: q.hours, day_type: q.day_type, season: q.season };
}
const priceBand = (h) => h.base_price;

export function compatRoutes(app) {
  app.get('/api/config', (req, res) => {
    const b = setting('booking'), t = setting('tax');
    res.json({ settings: { site: siteOld(), theme: setting('theme'), booking: { ...b, advance_pct: b.advance_percent }, tax: { name: t.label, rate: t.percent }, reviews: { max_rating: 5 }, branding: { logo: setting('business').logo, favicon: setting('business').favicon } }, stats: {} });
  });
  app.get('/api/events', (req, res) => res.json({ events: all('SELECT * FROM event_types WHERE active=1 ORDER BY sort').map(eventOld) }));
  app.get('/api/halls', (req, res) => res.json({ halls: all('SELECT * FROM halls WHERE active=1 ORDER BY popularity DESC, id').map(hallOld) }));
  app.get('/api/halls/:slug', (req, res) => {
    const h = get('SELECT * FROM halls WHERE slug=? AND active=1', req.params.slug);
    if (!h) throw notFound('Hall');
    const reviews = all(`SELECT id,author author_name,event_label,rating,title,body FROM reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 6`);
    const packages = all(`SELECT * FROM packages WHERE active=1 ORDER BY popularity DESC`).map(pkgOld);
    res.json({ hall: { ...hallOld(h), reviews }, packages, gallery: all('SELECT id,title,alt,url,category FROM gallery WHERE hall_id=? AND active=1 ORDER BY sort', h.id) });
  });
  app.get('/api/packages', (req, res) => res.json({ packages: all(`SELECT * FROM packages WHERE active=1 ORDER BY CASE tier WHEN 'basic' THEN 1 WHEN 'standard' THEN 2 WHEN 'premium' THEN 3 WHEN 'wedding' THEN 4 WHEN 'corporate' THEN 5 ELSE 6 END`).map(pkgOld) }));
  app.get('/api/facilities', (req, res) => res.json({ facilities: all('SELECT * FROM facilities WHERE active=1 ORDER BY sort').map(facOld) }));
  app.get('/api/gallery', (req, res) => {
    const rows = all('SELECT * FROM gallery WHERE active=1 ORDER BY sort');
    res.json({ items: rows.map((g) => ({ ...g, media_type: g.type, thumb_url: g.url, poster: g.poster || g.url })), categories: [...new Set(rows.map((g) => g.category))] });
  });
  app.get('/api/reviews', (req, res) => {
    const rows = all(`SELECT id,author author_name,event_label,rating,title,body,created_at FROM reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 30`).map((r) => ({ ...r, is_sample: 0 }));
    const s = ratingFor() || { count: 0, average: 0, scale: 5 };
    res.json({ reviews: rows, summary: s });
  });

  /* ---- availability ---- */
  app.get('/api/availability/calendar', (req, res) => {
    const hall = Number(req.query.hall), month = String(req.query.month || '');
    if (!hall || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('hall and month (YYYY-MM) are required');
    if (!get('SELECT 1 x FROM halls WHERE id=? AND active=1', hall)) throw notFound('Hall');
    const days = Object.entries(monthAvailability(hall, month)).map(([date, d]) => ({ date, status: d.status === 'past' ? 'available' : d.status, partial: d.partial }));
    res.json({ hall, month, days });
  });
  app.get('/api/availability/slots', (req, res) => {
    const hall = Number(req.query.hall), date = String(req.query.date || '');
    if (!hall || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('hall and date are required');
    const slots = all('SELECT slug,name,start_time,end_time FROM time_slots WHERE active=1 ORDER BY start_time').map((s) => ({
      slug: s.slug, label: s.name, start: s.start_time, end: s.end_time,
      available: date >= todayISO() && conflicts({ hallId: hall, date, startMin: toMin(s.start_time), endMin: toMin(s.end_time) }).length === 0,
    }));
    slots.sort((a, b) => (a.slug === 'full-day') - (b.slug === 'full-day') || a.start.localeCompare(b.start));
    res.json({ hall, date, slots });
  });

  /* ---- pricing / recommendation / assistant / search / legal ---- */
  app.post('/api/pricing/quote', rateLimit({ windowMs: 60_000, max: 60, scope: 'quote2' }), (req, res) => {
    const b = req.body || {};
    const services = Array.isArray(b.services) ? b.services.slice(0, 30).map((s) => ({ id: Number(s.id), qty: Number(s.qty) || 1 })) : [];
    const q = quote({ hall_id: Number(b.hallId), date: b.date, start: b.start, end: b.end, guests: Number(b.guests), package_id: b.packageId ? Number(b.packageId) : undefined, services, coupon: b.coupon || undefined });
    const available = conflicts({ hallId: Number(b.hallId), date: b.date, startMin: toMin(b.start), endMin: toMin(b.end) }).length === 0;
    res.json({ quote: quoteOld(q), available });
  });

  app.post('/api/recommend', rateLimit({ windowMs: 60_000, max: 30, scope: 'rec' }), (req, res) => {
    const guests = Number(req.body?.guests) || 0, budget = Number(req.body?.budget) || 0, slug = String(req.body?.event || '');
    if (guests < 1) throw new ApiError(422, 'VALIDATION_ERROR', 'Enter the number of guests', { guests: 'Required' });
    const ev = slug ? get('SELECT id, slug, name FROM event_types WHERE slug=?', slug) : null;
    const date = new Date(Date.now() + 330 * 60_000 + 60 * 864e5).toISOString().slice(0, 10);
    const t = setting('tax');
    const out = recommend({ guests, budget: budget || undefined, eventType: ev || undefined }).flatMap((p) => {
      const hall = get('SELECT id,name,slug FROM halls WHERE active=1 AND max_guests>=? ORDER BY base_price LIMIT 1', guests);
      if (!hall) return [];
      let total;
      try { total = quote({ hall_id: hall.id, date, start: '10:00', end: `${String(Math.min(10 + Math.round(p.duration_hours || 6), 23)).padStart(2, '0')}:00`, guests, package_id: p.id }).total; } catch { total = Math.round(p.cost * (1 + t.percent / 100)); }
      return [{ package: pkgOld(p), hall, estimate: { total, guests } }];
    });
    res.json({ recommendations: out });
  });

  app.post('/api/assistant', rateLimit({ windowMs: 60_000, max: 20, scope: 'assistant' }), (req, res) => {
    const msg = String(req.body?.message || '').trim();
    if (!msg) throw bad('Message is required');
    const r = chat(msg);
    res.json({ reply: r.reply, action: r.actions?.[0] || null, actions: r.actions || [], suggestions: ['Check availability', 'See packages', 'Facilities', 'How to book', 'Contact'] });
  });

  app.get('/api/search', rateLimit({ windowMs: 60_000, max: 90, scope: 'search2' }), (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60).toLowerCase();
    const guests = Number(req.query.guests) || 0, maxPrice = Number(req.query.max_price) || 0, date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null, sort = req.query.sort || '';
    const has = (...f) => !q || f.some((x) => String(x || '').toLowerCase().includes(q));
    let halls = all('SELECT * FROM halls WHERE active=1').filter((h) => has(h.name, h.tagline, h.description) && (!guests || h.max_guests >= guests) && (!maxPrice || priceBand(h) <= maxPrice));
    if (sort === 'price') halls.sort((a, b) => a.base_price - b.base_price); else if (sort === 'capacity') halls.sort((a, b) => b.max_guests - a.max_guests); else halls.sort((a, b) => b.popularity - a.popularity);
    let out = halls.map(hallOld);
    if (date) {
      const slots = all('SELECT name,start_time,end_time FROM time_slots WHERE active=1 ORDER BY start_time');
      out = out.map((h) => ({ ...h, slots: slots.map((s) => ({ label: s.name, available: date >= todayISO() && conflicts({ hallId: h.id, date, startMin: toMin(s.start_time), endMin: toMin(s.end_time) }).length === 0 })) }));
      if (sort === 'availability') out.sort((a, b) => b.slots.filter((s) => s.available).length - a.slots.filter((s) => s.available).length);
    }
    const slim = !!q && !guests && !maxPrice;
    res.json({
      halls: out,
      packages: all('SELECT * FROM packages WHERE active=1').filter((p) => has(p.name, p.description, p.tier) && (!guests || !p.guest_capacity || p.guest_capacity >= guests)).map(pkgOld).filter((p) => !maxPrice || !p.price || p.price <= maxPrice),
      facilities: slim || !guests ? all('SELECT * FROM facilities WHERE active=1 ORDER BY sort').filter((f) => q && has(f.name, f.description, f.category)).map(facOld) : [],
      events: all('SELECT * FROM event_types WHERE active=1 ORDER BY sort').filter((e) => q && has(e.name, e.description)).map(eventOld),
    });
  });

  app.get('/api/legal/:key', (req, res) => {
    const key = req.params.key;
    if (!LEGAL_KEYS.includes(key)) throw notFound('Policy');
    const saved = get('SELECT value FROM settings WHERE key=?', `legal_${key}`);
    const d = { ...LEGAL_DEFAULTS[key], ...(saved ? J(saved.value, {}) : {}) };
    const tiers = /cancel|refund/.test(key) ? setting('cancellation').tiers.map((t) => ({ days_before: t.min_days, refund_pct: t.refund_percent })) : [];
    res.json({ title: d.title, body: d.body, business: setting('business').name, tiers, updated: null });
  });
}
