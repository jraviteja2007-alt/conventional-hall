// Admin console shell: auth gate, sidebar/header/breadcrumbs, History-API router with lazy view modules.
import { html, raw, setHTML, $, $$, A, state, can, ic, bus, toast, ROLE_LABEL, errBlock, on, esc } from './core.js';
import { bindUploads, field, collect } from './forms.js';
import { showFieldErrors } from '/js/ui.js';

const view = (file, entity) => () => import(`./views/${file}.js`).then((m) => ({ default: (ctx) => m.default({ ...ctx, entity }) }));
/** path, title, nav group, icon, permission, loader */
const ROUTES = [
  ['/admin', 'Dashboard', 'Overview', 'dash', 'dashboard.view', view('dashboard')],
  ['/admin/bookings', 'Bookings', 'Operations', 'book', 'bookings.view', view('bookings')],
  ['/admin/bookings/:ref', 'Booking', null, 'book', 'bookings.view', view('booking-detail'), '/admin/bookings'],
  ['/admin/calendar', 'Calendar', 'Operations', 'calendar', 'calendar.view', view('calendar')],
  ['/admin/enquiries', 'Enquiries', 'Operations', 'inbox', 'enquiries.manage', view('enquiries')],
  ['/admin/quotations', 'Quotations', 'Operations', 'doc', 'quotations.manage', view('quotations')],
  ['/admin/customers', 'Customers', 'Operations', 'users', 'customers.view', view('customers')],
  ['/admin/payments', 'Payments & refunds', 'Finance', 'card', 'payments.view', view('payments')],
  ['/admin/reports', 'Reports', 'Finance', 'chart', 'reports.view', view('reports')],
  ['/admin/analytics', 'Analytics', 'Finance', 'sparkle', 'analytics.view', view('analytics')],
  ['/admin/halls', 'Halls', 'Catalogue', 'building', 'halls.manage', view('catalog', 'halls')],
  ['/admin/packages', 'Packages', 'Catalogue', 'box', 'packages.manage', view('catalog', 'packages')],
  ['/admin/services', 'Services & add-ons', 'Catalogue', 'wrench', 'packages.manage', view('catalog', 'services')],
  ['/admin/facilities', 'Facilities', 'Catalogue', 'list', 'facilities.manage', view('catalog', 'facilities')],
  ['/admin/events', 'Event types', 'Catalogue', 'calendar', 'events.manage', view('catalog', 'events')],
  ['/admin/gallery', 'Gallery', 'Catalogue', 'image', 'gallery.manage', view('gallery')],
  ['/admin/coupons', 'Coupons & offers', 'Catalogue', 'percent', 'coupons.manage', view('catalog', 'coupons')],
  ['/admin/pricing-rules', 'Dynamic pricing', 'Catalogue', 'tag', 'pricing.manage', view('catalog', 'pricing-rules')],
  ['/admin/staff', 'Staff', 'Catalogue', 'user', 'staff.manage', view('catalog', 'staff')],
  ['/admin/reviews', 'Reviews', 'Catalogue', 'star', 'reviews.moderate', view('reviews')],
  ['/admin/settings', 'Settings', 'System', 'gear', 'settings.manage', view('settings')],
  ['/admin/notifications', 'Notification log', 'System', 'bell', 'settings.manage', view('system', 'notifications')],
  ['/admin/users', 'Staff accounts', 'System', 'key', 'users.roles', view('system', 'users')],
  ['/admin/audit', 'Audit log', 'System', 'shield', 'audit.view', view('system', 'audit')],
  ['/admin/backup', 'Backup & export', 'System', 'db', 'backup.manage', view('system', 'backup')],
].map(([p, title, group, icon, perm, loader, parent]) => {
  const keys = []; const re = new RegExp(`^${p.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  return { p, title, group, icon, perm, loader, parent, re, keys };
});

const app = $('#app'); let cleanups = []; let seq = 0; let badgeCounts = {};
export const onLeave = (f) => cleanups.push(f);

/* ---------------- tilt (3D) on KPI tiles ---------------- */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('pointermove', (e) => {
  if (reduce) return; const k = e.target.closest?.('.kpi'); if (!k) return;
  const r = k.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width; const py = (e.clientY - r.top) / r.height;
  k.style.transform = `rotateX(${((0.5 - py) * 9).toFixed(2)}deg) rotateY(${((px - 0.5) * 11).toFixed(2)}deg) translateZ(6px)`; k.style.setProperty('--mx', `${px * 100}%`); k.style.setProperty('--my', `${py * 100}%`);
});
document.addEventListener('pointerout', (e) => { const k = e.target.closest?.('.kpi'); if (k && !k.contains(e.relatedTarget)) k.style.transform = ''; });

/* ---------------- login ---------------- */
function showLogin(msg = '') {
  document.title = 'Sign in | Admin Console';
  setHTML(app, html`<div class="login-wrap"><form class="login-card" novalidate aria-labelledby="lh">
    <div class="logo" aria-hidden="true">A</div><h1 id="lh">Admin console</h1><p class="muted">Sign in with your staff account.</p>
    ${msg ? html`<div class="alert err" role="alert">${msg}</div>` : ''}
    ${field({ name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'username' })}
    ${field({ name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' })}
    <button class="btn" style="width:100%;margin-top:20px" type="submit">Sign in</button>
    <p class="muted small" style="margin:16px 0 0;text-align:center"><a href="/" data-native>← Back to website</a></p></form></div>`);
  const form = $('form', app); $('input', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const { out } = collect(form, [{ name: 'email' }, { name: 'password', type: 'text' }]); const btn = $('button', form);
    const errs = {}; if (!/^\S+@\S+\.\S+$/.test(out.email || '')) errs.email = 'Enter your email'; if (!out.password) errs.password = 'Enter your password';
    btn.classList.add('is-loading');
    try {
      const r = await A.post('/api/auth/login', out);
      const isStaff = r.user && (r.user.staff || (r.user.role && r.user.role !== 'customer'));
      if (!isStaff) { await A.post('/api/auth/logout').catch(() => {}); throw new Error('This account does not have admin access.'); }
      state.user = r.user; await enter();
    } catch (err) { btn.classList.remove('is-loading'); if (err.details) showFieldErrors(form, err.details); toast(err.message, 'err'); }
  });
}

/* ---------------- shell ---------------- */
const allowed = () => ROUTES.filter((r) => r.group && can(r.perm));
function shellHTML() {
  const groups = [...new Set(allowed().map((r) => r.group))];
  const u = state.user;
  return html`<div class="shell"><aside class="side" id="side" aria-label="Sidebar">
    <a class="brand" href="/admin" data-link><span class="brand-mark" aria-hidden="true">${(state.config?.site?.name || 'A')[0]}</span><span><b>${state.config?.site?.name || 'Convention Hall'}</b><small>Admin console</small></span></a>
    <nav aria-label="Admin">${groups.map((g) => html`<div class="nav-group" role="presentation">${g}</div>${allowed().filter((r) => r.group === g).map((r) => html`<a href="${r.p}" data-link data-nav="${r.p}">${ic(r.icon)}<span>${r.title}</span><span class="nav-count" data-badge="${r.p}" hidden></span></a>`)}`)}</nav></aside>
    <div class="scrim" id="scrim"></div>
    <div class="main-col"><header class="hdr"><button class="btn ghost icon burger" id="burger" type="button" aria-label="Open menu" aria-controls="side" aria-expanded="false">${ic('menu')}</button>
      <nav class="crumbs" id="crumbs" aria-label="Breadcrumb"></nav><span class="spacer"></span>
      <a class="btn ghost sm no-print" href="/" target="_blank" rel="noopener">${ic('external')} View site</a>
      <div class="user-chip"><span class="who"><b>${u.name}</b><small>${ROLE_LABEL[u.role] || u.role}</small></span><span class="av" aria-hidden="true">${String(u.name)[0].toUpperCase()}</span><button class="btn ghost sm" id="logout" type="button" aria-label="Sign out">${ic('logout')}</button></div></header>
      <main id="main" class="main" tabindex="-1"></main></div></div>`;
}
function menu(open) { $('#side').classList.toggle('open', open); $('#scrim').classList.toggle('open', open); $('#burger').setAttribute('aria-expanded', String(open)); if (open) $('#side a')?.focus(); }

function wireShell() {
  $('#burger').addEventListener('click', () => menu(!$('#side').classList.contains('open')));
  $('#scrim').addEventListener('click', () => menu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu(false); });
  $('#logout').addEventListener('click', async () => { await A.post('/api/auth/logout').catch(() => {}); state.user = null; showLogin(); history.replaceState({}, '', '/admin'); });
}
async function refreshBadges() {
  try {
    const out = {};
    if (can('dashboard.view')) { const d = await A.get('/api/admin/dashboard'); out['/admin/bookings'] = d.pending_requests; out['/admin/enquiries'] = d.pending_enquiries; out['/admin/reviews'] = d.pending_reviews; out['/admin/payments'] = d.pending_refunds; }
    badgeCounts = out;
    $$('[data-badge]').forEach((b) => { const n = out[b.dataset.badge] || 0; b.hidden = !n; b.textContent = n; b.setAttribute('aria-label', `${n} need attention`); });
  } catch { /* non-critical */ }
}
export const refreshNav = refreshBadges;

function crumbs(r, ctx) {
  const parts = [html`<a href="/admin" data-link>Admin</a>`];
  if (r.parent) parts.push(html`<a href="${r.parent}" data-link>${ROUTES.find((x) => x.p === r.parent).title}</a>`);
  if (r.p !== '/admin') parts.push(html`<span aria-current="page">${ctx.params.ref || r.title}</span>`);
  setHTML($('#crumbs'), html`${parts.map((p, i) => html`${i ? ic('chevR') : ''}${p}`)}`);
}

async function render() {
  const my = ++seq; cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); cleanups = [];
  const path = location.pathname.replace(/(.)\/$/, '$1'); const el = $('#main'); if (!el) return;
  let found = null; const params = {};
  for (const r of ROUTES) { const m = r.re.exec(path); if (m) { found = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; } }
  $$('[data-nav]').forEach((a) => { const on_ = found && (a.dataset.nav === found.p || a.dataset.nav === found.parent); if (on_) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!found) { document.title = 'Not found | Admin'; setHTML($('#crumbs'), html`<a href="/admin" data-link>Admin</a>`); setHTML(el, html`<div class="empty">${ic('alert')}<h3>Page not found</h3><p><a href="/admin" data-link>Back to dashboard</a></p></div>`); return; }
  if (!can(found.perm)) { crumbs(found, { params }); setHTML(el, html`<div class="empty">${ic('lock')}<h3>You do not have access to this page</h3><p class="muted">Ask a super admin to change your role if you need it.</p></div>`); return; }
  crumbs(found, { params }); document.title = `${params.ref || found.title} | Admin`;
  setHTML(el, html`<div class="skel-wrap" aria-busy="true" aria-label="Loading"><div class="skeleton sk-title"></div><div class="grid g4">${[1, 2, 3, 4].map(() => html`<div class="skeleton sk-card"></div>`)}</div></div>`);
  try {
    const mod = await found.loader(); if (my !== seq) return;
    el.innerHTML = '';
    await mod.default({ el, params, query: Object.fromEntries(new URLSearchParams(location.search)), go: navigate, onLeave, isCurrent: () => my === seq });
  } catch (e) {
    if (my !== seq || e.status === 401) return; console.error(e);
    setHTML(el, errBlock(e.message || 'This page could not be loaded.')); $('[data-retry]', el)?.addEventListener('click', render);
  }
  if (my === seq) { window.scrollTo(0, 0); }
}
export function navigate(url, { replace = false } = {}) {
  menu(false); if (url === location.pathname + location.search) { render(); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', url); render();
}
bus.addEventListener('navigate', (e) => navigate(e.detail.path, { replace: e.detail.replace }));
bus.addEventListener('unauthorized', () => { if (state.user) { state.user = null; showLogin('Your session has expired. Please sign in again.'); } });
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const a = e.target.closest('a[data-link]'); if (!a) return; e.preventDefault(); navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', () => { if (state.user) render(); });
window.addEventListener('actions:changed', refreshBadges);

async function enter() {
  setHTML(app, shellHTML()); app.className = ''; wireShell();
  if (location.pathname === '/admin/' || !location.pathname.startsWith('/admin')) history.replaceState({}, '', '/admin');
  refreshBadges(); await render();
}

(async function init() {
  try {
    const [me, cfg] = await Promise.all([A.get('/api/auth/me'), A.get('/api/config').catch(() => ({ settings: {} }))]);
    const isStaff = me.user && (me.user.staff || (me.user.role && me.user.role !== 'customer'));
    if (isStaff) { state.user = me.user; await enter(); } else showLogin();
  } catch (e) { setHTML(app, errBlock(e.message)); $('[data-retry]', app)?.addEventListener('click', () => location.reload()); }
})();
export { on, esc, raw, bindUploads };
