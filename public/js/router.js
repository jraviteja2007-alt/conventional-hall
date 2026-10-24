// History-API router with lazy page modules, cleanup hooks, scroll restoration and per-page SEO meta.
import { S } from './store.js';
import { errorState, setHTML, html, $ } from './ui.js';
const routes = []; let cleanups = []; let seq = 0;
export const route = (pattern, loader, meta = {}) => {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, loader, meta });
};
export function setMeta(title, description) {
  const name = S.site?.name || '';
  if (title) document.title = title.includes(name) ? title : `${title} | ${name}`;
  if (description) { let m = document.querySelector('meta[name="description"]'); if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.append(m); } m.content = description; }
}
export function navigate(url, { replace = false } = {}) {
  if (url === location.pathname + location.search + location.hash) { render(); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', url); render();
}
export const query = () => Object.fromEntries(new URLSearchParams(location.search));
async function render() {
  const my = ++seq; const el = document.getElementById('app'); const path = location.pathname.replace(/(.)\/$/, '$1');
  cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); cleanups = [];
  let found = null, params = {};
  for (const r of routes) { const m = r.re.exec(path); if (m) { found = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; } }
  document.body.dataset.route = path;
  const load = async () => {
    const mod = await (found ? found.loader() : import('./pages/notfound.js'));
    if (my !== seq) return;
    el.innerHTML = '';
    const ctx = { params, query: query(), el, meta: setMeta, navigate, onCleanup: (f) => cleanups.push(f), path, isCurrent: () => my === seq };
    await mod.default(ctx);
    if (my !== seq) return;
    window.dispatchEvent(new CustomEvent('route:rendered', { detail: { path } }));
  };
  el.innerHTML = '<div class="page-loader"><div class="spinner" role="status" aria-label="Loading"></div></div>';
  try { await load(); } catch (e) {
    if (my !== seq) return; console.error(e);
    setHTML(el, html`<div class="container section page-top">${errorState(e.network ? e.message : 'This page could not be loaded.')}</div>`);
    $('[data-retry]', el)?.addEventListener('click', () => render());
  }
  if (my === seq) {
    if (location.hash && document.getElementById(location.hash.slice(1))) document.getElementById(location.hash.slice(1)).scrollIntoView(); else window.scrollTo(0, 0);
    el.focus({ preventScroll: true });
  }
}
export function start() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.native !== undefined) return;
    const u = new URL(a.href, location.href); if (u.origin !== location.origin) return;
    if (/^\/(api|admin|media)\b/.test(u.pathname) || /\.(pdf|xml|txt|csv)$/.test(u.pathname)) return;
    e.preventDefault(); navigate(u.pathname + u.search + u.hash);
  });
  window.addEventListener('popstate', render);
  render();
}
