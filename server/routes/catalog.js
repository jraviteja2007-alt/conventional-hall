import fs from 'node:fs';
import { all, get, run, audit, tx } from '../db/index.js';
import { E, readBody } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import { config } from '../config.js';
import { perm } from './admin.js';
import { saveUpload, readUpload } from '../services/uploads.js';

const JSON_COLS = { events: ['extra_fields'], packages: ['images', 'highlights'] };
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const fk = (e) => {
  if (String(e?.message).includes('FOREIGN KEY') || String(e?.message).includes('constraint')) {
    return E.conflict('IN_USE', String(e.message).includes('UNIQUE') ? 'That value already exists.' : 'This item is in use. Deactivate it instead of deleting.');
  }
  return null;
};

/** Generic admin CRUD for simple catalog tables. Only whitelisted, validated columns are ever written. */
function crud(r, { path, table, permission, schema, order = 'id', json = [], search = [], slugFrom = null }) {
  const outRow = (row) => { for (const c of json) { try { row[c] = JSON.parse(row[c]); } catch { row[c] = []; } } return row; };
  const cols = Object.keys(schema);

  r.get(`/api/admin/${path}`, perm(permission), (ctx) => {
    const q = ctx.query.q ? `%${String(ctx.query.q).replace(/[%_]/g, '')}%` : null;
    const where = q && search.length ? `WHERE ${search.map((c) => `${c} LIKE ?`).join(' OR ')}` : '';
    return { rows: all(`SELECT * FROM ${table} ${where} ORDER BY ${order}`, ...(where ? search.map(() => q) : [])).map(outRow) };
  });
  r.get(`/api/admin/${path}/:id`, perm(permission), (ctx) => {
    const row = get(`SELECT * FROM ${table} WHERE id=?`, Number(ctx.params.id));
    if (!row) throw E.notFound();
    return { row: outRow(row) };
  });
  r.post(`/api/admin/${path}`, perm(permission), (ctx) => {
    const v = validate(ctx.body, schema);
    if (slugFrom && !v.slug) v.slug = slugify(v[slugFrom]);
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    const vals = keys.map((k) => (json.includes(k) ? JSON.stringify(v[k]) : v[k]));
    try {
      const id = run(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, ...vals).id;
      audit(ctx.user, `${table}.create`, table, id, {}, ctx.ip);
      return { row: outRow(get(`SELECT * FROM ${table} WHERE id=?`, id)) };
    } catch (e) { throw fk(e) || e; }
  });
  r.put(`/api/admin/${path}/:id`, perm(permission), (ctx) => {
    const id = Number(ctx.params.id);
    if (!get(`SELECT 1 x FROM ${table} WHERE id=?`, id)) throw E.notFound();
    // PUT = partial update: only fields present in the body are changed
    const partial = Object.fromEntries(Object.entries(schema).map(([k, s]) => [k, s.replace('|required', '')]));
    const v = validate(ctx.body, partial);
    const keys = Object.keys(v).filter((k) => v[k] !== undefined && k in (ctx.body || {}));
    if (!keys.length) return { row: outRow(get(`SELECT * FROM ${table} WHERE id=?`, id)) };
    try {
      run(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => (json.includes(k) ? JSON.stringify(v[k]) : v[k])), id);
    } catch (e) { throw fk(e) || e; }
    audit(ctx.user, `${table}.update`, table, id, { fields: keys }, ctx.ip);
    return { row: outRow(get(`SELECT * FROM ${table} WHERE id=?`, id)) };
  });
  r.delete(`/api/admin/${path}/:id`, perm(permission), (ctx) => {
    try { run(`DELETE FROM ${table} WHERE id=?`, Number(ctx.params.id)); } catch (e) { throw fk(e) || e; }
    audit(ctx.user, `${table}.delete`, table, ctx.params.id, {}, ctx.ip);
    return { ok: true };
  });
}

const img = 'string|max:500';

export function register(r) {
  crud(r, {
    path: 'facilities', table: 'facilities', permission: 'facilities.manage', order: 'sort_order, id', search: ['name', 'category'], slugFrom: 'name',
    schema: { slug: 'string|max:60', name: 'string|required|max:80', category: 'string|max:40', icon: 'string|max:30', description: 'string|max:500', is_featured: 'bool', sort_order: 'int', is_active: 'bool' },
  });
  crud(r, {
    path: 'events', table: 'events', permission: 'events.manage', order: 'sort_order, id', json: JSON_COLS.events, slugFrom: 'name',
    schema: { slug: 'string|max:60', name: 'string|required|max:80', description: 'string|max:500', image: img, extra_fields: 'array|max:20', is_other: 'bool', sort_order: 'int', is_active: 'bool' },
  });
  crud(r, {
    path: 'services', table: 'services', permission: 'packages.manage', order: 'sort_order, id', search: ['name', 'category'], slugFrom: 'name',
    schema: { slug: 'string|max:60', name: 'string|required|max:80', category: 'string|max:40', pricing_type: 'enum:flat,per_guest,per_hour,per_unit|required', price: 'int|required|min:0', unit_label: 'string|max:30', description: 'string|max:300', default_selected: 'bool', sort_order: 'int', is_active: 'bool' },
  });
  crud(r, {
    path: 'packages', table: 'packages', permission: 'packages.manage', order: 'sort_order, id', json: JSON_COLS.packages, search: ['name', 'tier'], slugFrom: 'name',
    schema: {
      slug: 'string|max:60', hall_id: 'int', name: 'string|required|max:80', tier: 'enum:basic,standard,premium,wedding,corporate,custom|required', description: 'string|max:800',
      price: 'int|min:0', per_guest_price: 'int|min:0', includes_hall: 'bool', min_guests: 'int|min:1', max_guests: 'int|min:1', duration_hours: 'int|min:1|max:48',
      images: 'array|max:10', highlights: 'array|max:12', is_featured: 'bool', sort_order: 'int', is_active: 'bool',
    },
  });
  crud(r, {
    path: 'coupons', table: 'coupons', permission: 'coupons.manage', order: 'id DESC', search: ['code', 'description'],
    schema: { code: 'string|required|min:3|max:30', description: 'string|max:200', discount_type: 'enum:percent,fixed|required', value: 'int|required|min:1', min_amount: 'int|min:0', max_discount: 'int|min:0', valid_from: 'date', valid_to: 'date', usage_limit: 'int|min:1', auto_apply: 'bool', is_active: 'bool' },
  });
  crud(r, {
    path: 'pricing-rules', table: 'pricing_rules', permission: 'pricing.manage', order: 'rule_type, priority DESC, id',
    schema: { hall_id: 'int', name: 'string|required|max:80', rule_type: 'enum:weekend,holiday,peak,offseason|required', weekdays: 'string|max:20', start_date: 'string|max:10', end_date: 'string|max:10', recurring_yearly: 'bool', multiplier: 'number|required|min:0.1|max:5', priority: 'int', is_active: 'bool' },
  });
  crud(r, {
    path: 'staff', table: 'staff', permission: 'staff.manage', order: 'name', search: ['name', 'role_title'],
    schema: { branch_id: 'int', user_id: 'int', name: 'string|required|max:80', role_title: 'string|required|max:80', phone: 'phone', email: 'email', responsibilities: 'string|max:500', availability: 'string|max:200', is_active: 'bool' },
  });
  crud(r, {
    path: 'branches', table: 'branches', permission: 'halls.manage', order: 'id',
    schema: { name: 'string|required|max:80', city: 'string|required|max:80', address: 'string|max:300', phone: 'string|max:30', email: 'email', lat: 'number', lng: 'number', is_active: 'bool' },
  });
  crud(r, {
    path: 'halls', table: 'halls', permission: 'halls.manage', order: 'sort_order, id', search: ['name'], slugFrom: 'name',
    schema: {
      branch_id: 'int', slug: 'string|max:60', name: 'string|required|max:80', tagline: 'string|max:160', description: 'string|max:3000',
      min_guests: 'int|min:1', max_guests: 'int|required|min:1', seating_capacity: 'int|min:0', dining_capacity: 'int|min:0',
      length_m: 'number|min:0', width_m: 'number|min:0', height_m: 'number|min:0', area_sqm: 'number|min:0',
      base_hourly: 'int|min:0', base_half_day: 'int|min:0', base_full_day: 'int|min:0', per_guest_rate: 'int|min:0', buffer_minutes: 'int|min:0|max:480',
      is_ac: 'bool', hero_image: img, is_active: 'bool', sort_order: 'int',
    },
  });
  crud(r, {
    path: 'gallery', table: 'gallery', permission: 'gallery.manage', order: 'sort_order, id', search: ['title', 'category'],
    schema: { hall_id: 'int', category: 'string|required|max:40', media_type: 'enum:image,video|default:image', url: 'string|required|max:600', thumb_url: img, before_url: img, title: 'string|max:120', alt: 'string|max:200', sort_order: 'int', is_active: 'bool' },
  });

  // ---- relations ----
  r.put('/api/admin/halls/:id/facilities', perm('halls.manage'), (ctx) => {
    const id = Number(ctx.params.id);
    const items = validate(ctx.body, { facilities: 'array|required|max:60' }).facilities;
    tx(() => {
      run('DELETE FROM hall_facilities WHERE hall_id=?', id);
      for (const f of items) {
        const fid = Number(f.facility_id ?? f.id);
        if (Number.isInteger(fid)) run('INSERT OR IGNORE INTO hall_facilities(hall_id,facility_id,details) VALUES(?,?,?)', id, fid, f.details ? String(f.details).replace(/<[^>]*>/g, '').slice(0, 200) : null);
      }
    });
    audit(ctx.user, 'hall.facilities', 'hall', id, { count: items.length }, ctx.ip);
    return { ok: true };
  });
  r.get('/api/admin/halls/:id/facilities', perm('halls.manage'), (ctx) => ({ facilities: all('SELECT facility_id, details FROM hall_facilities WHERE hall_id=?', Number(ctx.params.id)) }));
  r.put('/api/admin/halls/:id/layouts', perm('halls.manage'), (ctx) => {
    const id = Number(ctx.params.id);
    const items = validate(ctx.body, { layouts: 'array|required|max:12' }).layouts;
    tx(() => {
      run('DELETE FROM hall_layouts WHERE hall_id=?', id);
      for (const l of items) {
        const v = validate(l, { kind: 'enum:theatre,dining,classroom,ushape,banquet,custom|required', name: 'string|required|max:60', capacity: 'int|required|min:1', description: 'string|max:200' });
        run('INSERT INTO hall_layouts(hall_id,kind,name,capacity,description) VALUES(?,?,?,?,?)', id, v.kind, v.name, v.capacity, v.description ?? null);
      }
    });
    return { ok: true };
  });
  r.put('/api/admin/packages/:id/services', perm('packages.manage'), (ctx) => {
    const id = Number(ctx.params.id);
    const items = validate(ctx.body, { services: 'array|required|max:40' }).services;
    tx(() => {
      run('DELETE FROM package_services WHERE package_id=?', id);
      for (const s of items) {
        const sid = Number(s.service_id ?? s.id);
        if (Number.isInteger(sid)) run('INSERT OR IGNORE INTO package_services(package_id,service_id,quantity) VALUES(?,?,?)', id, sid, Math.max(1, Number(s.quantity) || 1));
      }
    });
    return { ok: true };
  });
  r.get('/api/admin/packages/:id/services', perm('packages.manage'), (ctx) => ({ services: all('SELECT service_id, quantity FROM package_services WHERE package_id=?', Number(ctx.params.id)) }));

  // ---- gallery / image upload (admin). Stored outside the web root, served via /media/:file ----
  r.post('/api/admin/upload', perm('gallery.manage'), async (ctx) => {
    const buffer = await readBody(ctx.req, { raw: true, limit: config.maxUploadBytes + 1024 });
    const f = saveUpload({ buffer, filename: decodeURIComponent(ctx.req.headers['x-filename'] || 'image'), mime: ctx.req.headers['content-type'], imagesOnly: true, subdir: 'media' });
    audit(ctx.user, 'media.upload', 'media', f.stored, { size: f.size }, ctx.ip);
    return { url: `/media/${f.stored}` };
  });
  r.get('/media/:file', (ctx) => {
    const p = readUpload('media', ctx.params.file);
    if (!p) throw E.notFound();
    const ext = ctx.params.file.split('.').pop();
    return ctx.raw(200, fs.readFileSync(p), { 'Content-Type': { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  });
}
