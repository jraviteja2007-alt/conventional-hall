// Admin core: api wrapper (401 handling), RBAC, icons, status badges, small DOM + format helpers.
import { html, raw, esc, setHTML, $, $$, toast, inr, num, fmtDate, fmtDT, cap } from '/js/ui.js';
import * as base from '/js/api.js';

export { html, raw, esc, setHTML, $, $$, toast, inr, num, fmtDate, fmtDT, cap };
export const ApiError = base.ApiError;
export const bus = new EventTarget();

async function wrap(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof base.ApiError && e.status === 401) bus.dispatchEvent(new Event('unauthorized'));
    throw e;
  }
}
export const A = {
  get: (p, o) => wrap(() => base.get(p, o)),
  post: (p, b, o) => wrap(() => base.post(p, b, o)),
  put: (p, b, o) => wrap(() => base.put(p, b, o)),
  patch: (p, b, o) => wrap(() => base.patch(p, b, o)),
  del: (p, o) => wrap(() => base.del(p, o)),
  raw: (p, o) => wrap(() => base.api(p, o)),
  qs: base.qs,
};

/* ---------------- state + RBAC (mirrors server/lib/security.js; the server remains the authority) ---------------- */
export const state = { user: null, config: null };
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
export const can = (p) => !!state.user && !!PERMS[p] && ORDER.indexOf(state.user.role) >= ORDER.indexOf(PERMS[p]);
export const ROLE_LABEL = { customer: 'Customer', staff: 'Staff', manager: 'Manager', admin: 'Admin', super_admin: 'Super admin' };

/* ---------------- icons (24px stroke set) ---------------- */
const P = {
  dash: 'M4 13h7V4H4zM13 20h7V11h-7zM13 9h7V4h-7zM4 20h7v-5H4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  doc: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  building: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  percent: 'M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M9 10h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.3-1.3L14 3h-4l-.3 2.5a7 7 0 0 0-2.3 1.3l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.3 1.3L10 21h4l.3-2.5a7 7 0 0 0 2.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z',
  key: 'M15 8a4 4 0 1 1-3.5 6L4 21v-3h3v-3h3l1.5-1.5A4 4 0 0 1 15 8zM16.5 9.5h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  refresh: 'M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  chevL: 'M15 5l-7 7 7 7', chevR: 'M9 5l7 7-7 7', chevD: 'M5 9l7 7 7-7', chevU: 'M5 15l7-7 7 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  pdf: 'M6 3h8l5 5v13H6zM14 3v5h5M8.5 16.5h1.5a1.5 1.5 0 0 0 0-3H8.5v5M13 13.5v5h1a2 2 0 0 0 0-5z',
  rupee: 'M7 5h10M7 9h10M7 5c6 0 6 8 0 8h-1l7 7',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  columns: 'M4 4h5v16H4zM10 4h5v16h-5zM16 4h4v16h-4z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
};
export const ic = (name, cls = '') => raw(`<svg class="ic ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${P[name] || P.info}"/></svg>`);

/* ---------------- status badges ---------------- */
const TONE = {
  pending: 'amber', held: 'amber', new: 'amber', requested: 'amber', queued: 'amber', draft: 'amber', follow_up: 'amber', created: 'grey',
  reserved: 'blue', contacted: 'blue', sent: 'green', approved: 'green', accepted: 'green',
  confirmed: 'green', paid: 'green', processed: 'green', converted: 'green', active: 'green',
  completed: 'teal', partially_refunded: 'violet', refunded: 'violet',
  cancelled: 'red', rejected: 'red', failed: 'red', void: 'red', blocked: 'red', inactive: 'grey',
  expired: 'grey', closed: 'grey', maintenance: 'violet', available: 'green',
};
export const badge = (s, label) => html`<span class="badge b-${TONE[s] || 'grey'}">${label || cap(s)}</span>`;
export const yesNo = (v) => (v ? badge('active', 'Active') : badge('inactive', 'Inactive'));

/* ---------------- DOM helpers ---------------- */
/** Delegated event listener. */
const bound = new WeakMap();
export function on(root, type, sel, fn) {
  // Re-registering the same (type, selector) on a root replaces the earlier handler, so re-rendered views never double-fire actions.
  const m = bound.get(root) || new Map(); bound.set(root, m); const key = `${type}|${sel}`;
  if (m.has(key)) root.removeEventListener(type, m.get(key));
  const h = (e) => { const t = e.target.closest?.(sel); if (t && root.contains(t)) fn(e, t); };
  m.set(key, h); root.addEventListener(type, h);
}
export const nodeOf = (safe, tag = 'div', cls = '') => { const d = document.createElement(tag); if (cls) d.className = cls; setHTML(d, safe); return d; };
export const skel = (n = 3) => html`<div class="skel-wrap" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, () => html`<div class="skeleton sk-line"></div>`)}</div>`;
export const pageSkel = () => html`<div class="skel-wrap" aria-busy="true" aria-label="Loading"><div class="skeleton sk-title"></div><div class="grid g4">${[1, 2, 3, 4].map(() => html`<div class="skeleton sk-card"></div>`)}</div><div class="skeleton sk-block"></div></div>`;
export const emptyBlock = (title, text = '', cta = '') => html`<div class="empty">${ic('inbox')}<h3>${title}</h3>${text ? html`<p class="muted">${text}</p>` : ''}${cta}</div>`;
export const errBlock = (msg = 'Something went wrong.', retry = true) => html`<div class="errstate" role="alert">${ic('alert')}<h3>We could not load this</h3><p class="muted">${msg}</p>${retry ? html`<button class="btn" data-retry type="button">Try again</button>` : ''}</div>`;

/** Load data into a view with skeleton -> content / error+retry. render(data, reload). */
export async function load(view, fetcher, render) {
  const run = async () => {
    setHTML(view, pageSkel());
    try {
      const d = await fetcher();
      if (!view.isConnected) return;
      await render(d, run);
    } catch (e) {
      if (e.status === 401 || !view.isConnected) return;
      setHTML(view, errBlock(e.message));
      $('[data-retry]', view)?.addEventListener('click', run);
    }
  };
  await run();
}

export const pageHead = ({ title, sub = '', actions = '' }) => html`<div class="page-head"><div><h1>${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
export const card = (title, body, { actions = '', cls = '' } = {}) => html`<section class="card ${cls}">${title || actions ? html`<header class="card-h"><h2>${title}</h2><div class="row">${actions}</div></header>` : ''}<div class="card-b">${body}</div></section>`;
export const kv = (pairs) => html`<dl class="kv">${pairs.filter(Boolean).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v === undefined || v === null || v === '' ? raw('<span class="muted">-</span>') : v}</dd></div>`)}</dl>`;

/* ---------------- formatting ---------------- */
export const money = (n) => inr(n);
export const compact = (n) => {
  n = Number(n || 0); const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '')}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '')}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
};
export const t12 = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const dShort = (d) => fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const ago = (s) => {
  if (!s) return '';
  const t = new Date(String(s).replace(' ', 'T') + 'Z').getTime(); const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.round(m / 60)}h ago`; if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  return fmtDT(s);
};
export const cell = (a, b = '') => html`<div class="cell-main">${a}</div>${b ? html`<div class="cell-sub">${b}</div>` : ''}`;

/* ---------------- downloads / csv ---------------- */
export function toCSV(rows, cols) {
  const q = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(typeof c.csv === 'function' ? c.csv(r) : r[c.key])).join(','))].join('\r\n');
}
export function downloadText(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- navigation ---------------- */
export const go = (path, replace = false) => { bus.dispatchEvent(new CustomEvent('navigate', { detail: { path, replace } })); };
export const link = (path, label, cls = '') => html`<a href="${path}" class="${cls}" data-link>${label}</a>`;
