// Generic catalogue CRUD (halls, packages, services, facilities, event types, coupons, pricing rules, staff) driven by a config map.
import { html, raw, setHTML, $, $$, A, pageHead, ic, cell, money, can, toast, yesNo, badge, num, cap } from '../core.js';
import { mountTable } from '../table.js';
import { formModal } from '../forms.js';
import { confirmDialog } from '/js/ui.js';

const act = { key: 'act', label: '', sort: false, cls: 'act', render: (r) => html`<button class="btn sm ghost" data-act="edit" type="button" aria-label="Edit ${r.name || r.code}">${ic('edit')} Edit</button> <button class="btn sm danger" data-act="del" type="button" aria-label="Delete ${r.name || r.code}">${ic('trash')}</button>` };
const active = { name: 'is_active', label: 'Active (visible to customers)', type: 'checkbox', default: true, full: true };
const T = (name, label, extra = {}) => ({ name, label, ...extra });
const N = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const PRICING = [['flat', 'Flat'], ['per_guest', 'Per guest'], ['per_hour', 'Per hour'], ['per_unit', 'Per unit']];

const CFG = {
  halls: { title: 'Halls', one: 'hall', sub: 'Capacity, pricing, facilities, layouts and photos for every hall.', perm: 'halls.manage', relations: true,
    columns: [{ key: 'name', label: 'Hall', render: (r) => cell(r.name, r.tagline) }, { key: 'max_guests', label: 'Max guests', cls: 'right', render: (r) => num(r.max_guests) }, { key: 'base_full_day', label: 'Full day', cls: 'right', render: (r) => money(r.base_full_day) }, { key: 'is_ac', label: 'A/C', render: (r) => (r.is_ac ? 'Yes' : 'No') }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Hall name', { required: true }), T('tagline', 'Tagline'), T('description', 'Description', { type: 'textarea', rows: 4 }), N('min_guests', 'Minimum guests', { min: 1 }), N('max_guests', 'Maximum guests', { min: 1, required: true }), N('seating_capacity', 'Seating capacity', { min: 0 }), N('dining_capacity', 'Dining capacity', { min: 0 }),
      N('length_m', 'Length (m)', { step: 'any' }), N('width_m', 'Width (m)', { step: 'any' }), N('height_m', 'Height (m)', { step: 'any' }), N('area_sqm', 'Total area (sq m)', { step: 'any' }),
      N('base_hourly', 'Hourly rate (₹)', { min: 0 }), N('base_half_day', 'Half-day rate (₹)', { min: 0 }), N('base_full_day', 'Full-day rate (₹)', { min: 0 }), N('per_guest_rate', 'Per-guest rate (₹)', { min: 0 }), N('buffer_minutes', 'Buffer between events (min)', { min: 0, max: 480 }),
      { name: 'is_ac', label: 'Air-conditioned', type: 'checkbox' }, T('hero_image', 'Hero image', { type: 'image' }), active] },
  packages: { title: 'Packages', one: 'package', sub: 'Bundled offers: basic, standard, premium, wedding, corporate and custom.', perm: 'packages.manage', relations: true,
    columns: [{ key: 'name', label: 'Package', render: (r) => cell(r.name, cap(r.tier)) }, { key: 'price', label: 'Price', cls: 'right', render: (r) => (r.price ? money(r.price) : r.per_guest_price ? `${money(r.per_guest_price)}/guest` : 'Custom') }, { key: 'max_guests', label: 'Guests', render: (r) => `${num(r.min_guests)}–${num(r.max_guests)}` }, { key: 'is_featured', label: 'Featured', render: (r) => (r.is_featured ? badge('active', 'Featured') : '') }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Package name', { required: true }), T('tier', 'Tier', { type: 'select', options: ['basic', 'standard', 'premium', 'wedding', 'corporate', 'custom'].map((x) => [x, cap(x)]) }), T('description', 'Description', { type: 'textarea' }),
      N('price', 'Fixed price (₹)', { min: 0 }), N('per_guest_price', 'Per-guest price (₹)', { min: 0 }), N('min_guests', 'Min guests', { min: 1 }), N('max_guests', 'Max guests', { min: 1 }), N('duration_hours', 'Duration (hours)', { min: 1, max: 48 }), N('sort_order', 'Sort order'),
      { name: 'includes_hall', label: 'Includes hall rental', type: 'checkbox' }, { name: 'is_featured', label: 'Featured / popular', type: 'checkbox' }, T('highlights', 'Highlights (one per line)', { type: 'lines' }), T('images', 'Image URLs (one per line)', { type: 'lines', help: 'Unsplash or uploaded /media/ URLs.' }), active] },
  services: { title: 'Services & add-ons', one: 'service', sub: 'Catering, decoration, photography, sound, lighting, rooms, parking and more.', perm: 'packages.manage',
    columns: [{ key: 'name', label: 'Service', render: (r) => cell(r.name, r.description) }, { key: 'category', label: 'Category', render: (r) => cap(r.category) }, { key: 'pricing_type', label: 'Pricing', render: (r) => cap(r.pricing_type) }, { key: 'price', label: 'Price', cls: 'right', render: (r) => money(r.price) }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Service name', { required: true }), T('category', 'Category', { help: 'e.g. catering, decoration, photography' }), T('pricing_type', 'Pricing type', { type: 'select', options: PRICING }), N('price', 'Price (₹)', { min: 0, required: true }), T('unit_label', 'Unit label'), N('sort_order', 'Sort order'), T('description', 'Description', { type: 'textarea' }), { name: 'default_selected', label: 'Selected by default', type: 'checkbox' }, active] },
  facilities: { title: 'Facilities', one: 'facility', sub: 'Amenities shown on the hall and facilities pages.', perm: 'facilities.manage',
    columns: [{ key: 'name', label: 'Facility', render: (r) => cell(r.name, r.description) }, { key: 'category', label: 'Category', render: (r) => cap(r.category) }, { key: 'icon', label: 'Icon' }, { key: 'is_featured', label: 'Featured', render: (r) => (r.is_featured ? 'Yes' : '') }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Name', { required: true }), T('category', 'Category'), T('icon', 'Icon key', { help: 'snowflake, car, utensils, stage, bed, bolt, speaker, bulb, wifi, shield, wheelchair…' }), N('sort_order', 'Sort order'), T('description', 'Description', { type: 'textarea' }), { name: 'is_featured', label: 'Feature on homepage', type: 'checkbox' }, active] },
  events: { title: 'Event types', one: 'event type', sub: 'Categories customers choose when booking.', perm: 'events.manage',
    columns: [{ key: 'name', label: 'Event', render: (r) => cell(r.name, r.description) }, { key: 'is_other', label: 'Custom', render: (r) => (r.is_other ? 'Free-text event' : '') }, { key: 'sort_order', label: 'Order', cls: 'right' }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Name', { required: true }), N('sort_order', 'Sort order'), T('description', 'Description', { type: 'textarea' }), T('image', 'Image', { type: 'image' }), { name: 'is_other', label: 'Custom event (customer describes requirements)', type: 'checkbox', full: true }, active] },
  coupons: { title: 'Coupons & offers', one: 'coupon', sub: 'Percentage or fixed discounts, coupon codes and seasonal auto-applied offers.', perm: 'coupons.manage',
    columns: [{ key: 'code', label: 'Code', render: (r) => cell(r.code, r.description) }, { key: 'value', label: 'Discount', render: (r) => (r.discount_type === 'percent' ? `${r.value}%` : money(r.value)) }, { key: 'valid_to', label: 'Valid', render: (r) => (r.valid_from || r.valid_to ? `${r.valid_from || '…'} → ${r.valid_to || '…'}` : 'Always') }, { key: 'auto_apply', label: 'Auto', render: (r) => (r.auto_apply ? 'Seasonal' : '') }, { key: 'used_count', label: 'Used', cls: 'right', render: (r) => `${r.used_count ?? 0}${r.usage_limit ? ` / ${r.usage_limit}` : ''}` }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('code', 'Code', { required: true, maxlength: 30 }), T('discount_type', 'Type', { type: 'select', options: [['percent', 'Percentage'], ['fixed', 'Fixed amount (₹)']] }), N('value', 'Value', { required: true, min: 1 }), N('min_amount', 'Minimum order (₹)', { min: 0 }), N('max_discount', 'Maximum discount (₹)', { min: 0 }), N('usage_limit', 'Usage limit', { min: 1 }), T('valid_from', 'Valid from', { type: 'date' }), T('valid_to', 'Valid until', { type: 'date' }), T('description', 'Description / offer name', { type: 'textarea' }), { name: 'auto_apply', label: 'Apply automatically (seasonal offer)', type: 'checkbox', full: true }, active] },
  'pricing-rules': { title: 'Dynamic pricing', one: 'pricing rule', sub: 'Weekend, holiday, peak-season and off-season multipliers applied to the hall rate.', perm: 'pricing.manage',
    columns: [{ key: 'name', label: 'Rule', render: (r) => cell(r.name, cap(r.rule_type)) }, { key: 'multiplier', label: 'Multiplier', cls: 'right', render: (r) => `×${r.multiplier}` }, { key: 'weekdays', label: 'Applies to', render: (r) => r.weekdays ? `Weekdays ${r.weekdays}` : `${r.start_date || ''} → ${r.end_date || ''}` }, { key: 'priority', label: 'Priority', cls: 'right' }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Rule name', { required: true }), T('rule_type', 'Type', { type: 'select', options: [['weekend', 'Weekend'], ['holiday', 'Holiday'], ['peak', 'Peak season'], ['offseason', 'Off-season']] }), N('multiplier', 'Multiplier', { step: '0.01', min: 0.1, max: 5, required: true, help: '1.25 = +25%, 0.85 = 15% off' }), N('priority', 'Priority'), T('weekdays', 'Weekdays', { help: '0=Sun … 6=Sat, comma separated (e.g. 5,6,0)' }), T('start_date', 'Start date', { help: 'YYYY-MM-DD, or MM-DD if repeating yearly' }), T('end_date', 'End date'), { name: 'recurring_yearly', label: 'Repeats every year', type: 'checkbox', full: true }, active] },
  staff: { title: 'Staff', one: 'staff member', sub: 'Team members, responsibilities and availability.', perm: 'staff.manage',
    columns: [{ key: 'name', label: 'Name', render: (r) => cell(r.name, r.role_title) }, { key: 'phone', label: 'Contact', render: (r) => cell(r.phone || '—', r.email) }, { key: 'responsibilities', label: 'Responsibilities' }, { key: 'availability', label: 'Availability' }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) }, act],
    fields: [T('name', 'Name', { required: true }), T('role_title', 'Role', { required: true }), T('phone', 'Phone', { type: 'tel' }), T('email', 'Email', { type: 'email' }), T('responsibilities', 'Assigned responsibilities', { type: 'textarea' }), T('availability', 'Availability', { help: 'e.g. Mon–Sat 9am–8pm' }), active] },
};

const LAYOUT_KINDS = ['theatre', 'dining', 'classroom', 'ushape', 'banquet', 'custom'];
const layoutsToText = (ls) => (ls || []).map((l) => [l.kind, l.name, l.capacity, l.description || ''].join(' | '));
const textToLayouts = (lines) => lines.map((s) => { const [kind, name, cap_, d] = s.split('|').map((x) => x.trim()); return { kind: LAYOUT_KINDS.includes(kind) ? kind : 'custom', name: name || cap(kind), capacity: Number(cap_) || 1, description: d || undefined }; });

export default async function catalog({ el, entity }) {
  const c = CFG[entity]; const allow = can(c.perm);
  setHTML(el, html`${pageHead({ title: c.title, sub: c.sub, actions: allow ? html`<button class="btn" id="add" type="button">${ic('plus')} Add ${c.one}</button>` : '' })}<section class="card flush" id="tb"></section>`);
  let t;
  async function edit(row) {
    const isNew = !row; const values = row ? { ...row } : {};
    let extra = ''; let facilities = []; let services = []; let chosen = new Map(); let layoutsField = null;
    if (entity === 'halls') {
      facilities = (await A.get('/api/admin/facilities')).rows; const cur = row ? (await A.get(`/api/admin/halls/${row.id}/facilities`)).facilities : [];
      chosen = new Map(cur.map((f) => [f.facility_id, f.details])); const lay = row ? (await A.get(`/api/halls/${row.slug}`).catch(() => ({ hall: {} }))).hall?.layouts : [];
      values.layouts = layoutsToText(lay); layoutsField = T('layouts', `Layouts (one per line: kind | name | capacity | note) — kinds: ${LAYOUT_KINDS.join(', ')}`, { type: 'lines', rows: 5 });
      extra = html`<fieldset class="full" style="border:1px solid var(--line-2);border-radius:10px;padding:12px;margin:0"><legend class="small muted">Facilities in this hall</legend><div class="form-grid">${facilities.map((f) => html`<label class="check"><input type="checkbox" data-rel="fac" value="${f.id}" ${chosen.has(f.id) ? raw('checked') : ''}> ${f.name}</label>`)}</div></fieldset>`;
    }
    if (entity === 'packages') {
      services = (await A.get('/api/admin/services')).rows; const cur = row ? (await A.get(`/api/admin/packages/${row.id}/services`)).services : [];
      chosen = new Map(cur.map((s) => [s.service_id, s.quantity]));
      extra = html`<fieldset class="full" style="border:1px solid var(--line-2);border-radius:10px;padding:12px;margin:0"><legend class="small muted">Services bundled in this package</legend><div class="form-grid">${services.map((s) => html`<label class="check"><input type="checkbox" data-rel="svc" value="${s.id}" ${chosen.has(s.id) ? raw('checked') : ''}> ${s.name}</label>`)}</div></fieldset>`;
    }
    const fields = layoutsField ? [...c.fields.slice(0, -2), layoutsField, ...c.fields.slice(-2)] : c.fields;
    formModal({ title: `${isNew ? 'Add' : 'Edit'} ${c.one}`, wide: true, values, fields, extra, submit: isNew ? 'Create' : 'Save changes',
      onSave: async (v, form) => {
        const body = { ...v }; delete body.layouts;
        const r = isNew ? await A.post(`/api/admin/${entity}`, body) : await A.put(`/api/admin/${entity}/${row.id}`, body);
        const id = r.row.id; const picked = $$('input[data-rel]:checked', form).map((x) => Number(x.value));
        if (entity === 'halls') { await A.put(`/api/admin/halls/${id}/facilities`, { facilities: picked.map((f) => ({ facility_id: f, details: chosen.get(f) || undefined })) }); await A.put(`/api/admin/halls/${id}/layouts`, { layouts: textToLayouts(v.layouts || []) }); }
        if (entity === 'packages') await A.put(`/api/admin/packages/${id}/services`, { services: picked.map((s) => ({ service_id: s, quantity: chosen.get(s) || 1 })) });
        toast(`${cap(c.one)} ${isNew ? 'created' : 'saved'}`, 'ok'); t.reload();
      } });
  }
  $('#add', el)?.addEventListener('click', () => edit(null));
  t = mountTable($('#tb', el), {
    exportName: entity, searchPlaceholder: `Search ${c.title.toLowerCase()}`, pageSize: 12,
    fetchAll: async () => (await A.get(`/api/admin/${entity}`)).rows,
    empty: { title: `No ${c.title.toLowerCase()} yet`, text: allow ? `Use “Add ${c.one}” to create the first one.` : '' },
    columns: allow ? c.columns : c.columns.filter((x) => x.key !== 'act'),
    onAction: async (a, r, reload) => {
      if (a === 'edit') { try { await edit(r); } catch (e) { toast(e.message, 'err'); } }
      else if (a === 'del' && await confirmDialog(`Delete “${r.name || r.code}”? This cannot be undone. Deactivate it instead if it is already used in bookings.`, { ok: 'Delete', danger: true })) {
        try { await A.del(`/api/admin/${entity}/${r.id}`); toast('Deleted', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); }
      }
    },
  });
}
