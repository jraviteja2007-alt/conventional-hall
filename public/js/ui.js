// UI helpers: safe HTML templating (auto-escaping), icons, formatters, toast/modal/lightbox, image helper, tracking.
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s ?? ''));
const val = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(val).join('') : v === null || v === undefined || v === false ? '' : esc(v));
/** Tagged template: every interpolated value is HTML-escaped unless it is itself an html`` result. */
export function html(strings, ...vals) { let o = ''; strings.forEach((s, i) => { o += s; if (i < vals.length) o += val(vals[i]); }); return new Safe(o); }
export const setHTML = (el, safe) => { el.innerHTML = safe instanceof Safe ? safe.s : esc(safe); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const I = {
  snowflake: 'M12 2v20M4.9 6.5l14.2 11M19.1 6.5L4.9 17.5M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5',
  car: 'M5 17h14M3 13l2-6h14l2 6v4H3zM7 17v2M17 17v2M7.5 13h.01M16.5 13h.01',
  utensils: 'M5 3v8a2 2 0 0 0 2 2v8M9 3v8M7 3v6M17 21V3c-2 1.5-3 4-3 8h3',
  chef: 'M6 14a4 4 0 1 1 2-7.5A4 4 0 0 1 16 6a4 4 0 1 1 2 8v6H6z M6 17h12',
  stage: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6',
  bed: 'M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11h.01',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  speaker: 'M6 3h12v18H6zM12 8h.01M12 15a3 3 0 1 0 0 .01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  wifi: 'M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  wheelchair: 'M9 4a1.5 1.5 0 1 0 .01 0M10 8v6h5l3 5M10 11h5M7 13a5 5 0 1 0 7 6',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  chevL: 'M15 5l-7 7 7 7', chevR: 'M9 5l7 7-7 7', chevD: 'M5 9l7 7 7-7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  chat: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z',
  whatsapp: 'M3 21l1.7-5A9 9 0 1 1 8 19.3zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  dash: 'M4 13h7V4H4zM13 20h7V11h-7zM13 9h7V4h-7zM4 20h7v-5H4z',
  rupee: 'M7 5h10M7 9h10M7 5c6 0 6 8 0 8h-1l7 7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.3-1.3L14 3h-4l-.3 2.5a7 7 0 0 0-2.3 1.3l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.3 1.3L10 21h4l.3-2.5a7 7 0 0 0 2.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z',
  layout: 'M3 5h18v14H3zM3 10h18M9 10v9',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
};
export const icon = (name, cls = '') => raw(`<svg class="${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${I[name] || I.info}"/></svg>`);

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const num = (n) => Number(n || 0).toLocaleString('en-IN');
export const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', opts) : '');
export const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const fmtDT = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addDaysISO = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const initials = (n) => String(n || '?').replace(/^sample:\s*/i, '').split(/\s+|&/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const cap = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const stars = (rating, max = 5) => html`<span class="stars" role="img" aria-label="${rating} out of ${max}">${raw('★'.repeat(Math.round(rating)))}<span class="off">${raw('★'.repeat(Math.max(0, max - Math.round(rating))))}</span></span>`;

/** Unsplash-aware responsive image. Falls back to a gradient placeholder (global error handler adds .img-fail). */
export const uw = (url, w) => (url && /images\.unsplash\.com/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${w}`) : url);
export function img(url, alt = '', { w = 800, cls = '', eager = false, sizes = '(max-width: 700px) 100vw, 50vw', ar } = {}) {
  if (!url) return html`<div class="${cls} img-fail" role="img" aria-label="${alt}"></div>`;
  const src = uw(url, w);
  const srcset = /images\.unsplash\.com/.test(url) ? [400, 800, 1200, 1600].map((x) => `${uw(url, x)} ${x}w`).join(', ') : '';
  return html`<img src="${src}" ${srcset ? raw(`srcset="${esc(srcset)}" sizes="${esc(sizes)}"`) : ''} alt="${alt}" class="${cls}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" ${ar ? raw(`style="--ar:${esc(ar)}"`) : ''}>`;
}

/* ---- toast ---- */
export function toast(msg, type = '', ms = 4500) {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = `toast ${type}`; t.setAttribute('role', type === 'err' ? 'alert' : 'status');
  const m = document.createElement('div'); m.textContent = msg; const x = document.createElement('button'); x.className = 'x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
  t.append(m, x); box.append(t); const kill = () => t.remove(); x.onclick = kill; setTimeout(kill, ms);
}

/* ---- modal / confirm ---- */
let lastFocus = null;
export function modal({ title = '', body = '', actions = [], wide = false } = {}) {
  lastFocus = document.activeElement;
  const el = document.createElement('div'); el.className = 'modal open'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="modal-box" ${wide ? 'style="width:min(820px,100%)"' : ''}><h3></h3><div class="mb"></div><div class="row ma" style="margin-top:20px;justify-content:flex-end"></div></div>`;
  el.querySelector('h3').textContent = title; const mb = el.querySelector('.mb');
  if (body instanceof Node) mb.append(body); else mb.innerHTML = body instanceof Safe ? body.s : esc(body);
  const ma = el.querySelector('.ma'); const close = (v) => { el.remove(); document.removeEventListener('keydown', onKey); lastFocus?.focus?.(); res(v); }; let res;
  const done = new Promise((r) => { res = r; });
  actions.forEach((a) => { const b = document.createElement('button'); b.type = 'button'; b.className = `btn ${a.cls || ''}`; b.textContent = a.label; b.onclick = async () => { if (a.onClick) { b.classList.add('is-loading'); try { const r = await a.onClick(el); if (r === false) { b.classList.remove('is-loading'); return; } } catch (e) { b.classList.remove('is-loading'); toast(e.message, 'err'); return; } } close(a.value ?? true); }; ma.append(b); });
  const onKey = (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Tab') { const f = [...el.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } };
  document.addEventListener('keydown', onKey); el.addEventListener('mousedown', (e) => { if (e.target === el) close(null); });
  document.body.append(el); (el.querySelector('input,select,textarea') || el.querySelector('.btn'))?.focus();
  done.el = el; done.close = close; return done;
}
export const confirmDialog = (msg, { title = 'Please confirm', ok = 'Confirm', danger = false } = {}) => modal({ title, body: msg, actions: [{ label: 'Cancel', cls: 'ghost', value: false }, { label: ok, cls: danger ? 'danger' : '', value: true }] }).then((v) => !!v);

/* ---- lightbox ---- */
export function openLightbox(items, start = 0) {
  let i = start; const prevFocus = document.activeElement;
  const el = document.createElement('div'); el.className = 'lightbox open'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Image viewer');
  el.innerHTML = `<button class="lb-btn lb-close" aria-label="Close">✕</button><button class="lb-btn lb-prev" aria-label="Previous">‹</button><div class="lb-stage"></div><div class="lb-cap"></div><button class="lb-btn lb-next" aria-label="Next">›</button>`;
  const stage = el.querySelector('.lb-stage'), capEl = el.querySelector('.lb-cap');
  const show = () => {
    const it = items[i]; stage.innerHTML = '';
    if (it.media_type === 'video' || /\.(mp4|webm)(\?|$)/i.test(it.url)) { const v = document.createElement('video'); v.src = it.url; v.controls = true; v.autoplay = true; v.playsInline = true; stage.append(v); }
    else if (/youtube\.com|youtu\.be/.test(it.url)) { const f = document.createElement('iframe'); f.src = it.url.replace('watch?v=', 'embed/').replace('youtube.com', 'youtube-nocookie.com'); f.style.cssText = 'width:min(92vw,960px);height:min(70vh,540px);border:0;border-radius:12px'; f.allowFullscreen = true; stage.append(f); }
    else { const im = document.createElement('img'); im.src = uw(it.url, 1800); im.alt = it.alt || it.title || ''; stage.append(im); }
    capEl.textContent = `${it.title || it.alt || ''}${items.length > 1 ? `  (${i + 1}/${items.length})` : ''}`;
    el.querySelector('.lb-prev').style.display = el.querySelector('.lb-next').style.display = items.length > 1 ? '' : 'none';
  };
  const go = (d) => { i = (i + d + items.length) % items.length; show(); };
  const close = () => { el.remove(); document.removeEventListener('keydown', key); prevFocus?.focus?.(); };
  const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'Tab') { e.preventDefault(); el.querySelector('.lb-close').focus(); } };
  el.querySelector('.lb-close').onclick = close; el.querySelector('.lb-prev').onclick = () => go(-1); el.querySelector('.lb-next').onclick = () => go(1);
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  let sx = null; el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true }); el.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); sx = null; });
  document.addEventListener('keydown', key); document.body.append(el); show(); el.querySelector('.lb-close').focus();
}

export function track(kind) { try { const t = ({ availability_check: 'check_availability' })[kind] || kind; const c = (document.cookie.match(/(?:^|; )csrf=([^;]*)/) || [])[1] || ''; fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', 'x-csrf-token': decodeURIComponent(c) }, body: JSON.stringify({ type: t, path: location.pathname }), keepalive: true }).catch(() => {}); } catch { /* ignore */ } try { window.gtag?.('event', kind); window.fbq?.('trackCustom', kind); } catch { /* ignore */ } }

export const pageSkeleton = (n = 3) => html`<div class="container section"><div class="grid g3">${Array.from({ length: n }, () => html`<div class="skeleton sk-card"></div>`)}</div></div>`;
export const emptyState = (title, text, cta = '') => html`<div class="empty">${icon('box')}<h3>${title}</h3><p class="muted">${text}</p>${cta}</div>`;
export const errorState = (msg = 'Something went wrong.', retry = true) => html`<div class="errstate" role="alert">${icon('alert')}<h3>We could not load this</h3><p class="muted">${msg}</p>${retry ? html`<button class="btn" data-retry>Try again</button>` : ''}</div>`;

/** Inline form validation helpers */
export function showFieldErrors(root, details = {}) {
  $$('.field.invalid', root).forEach((f) => { f.classList.remove('invalid'); const e = $('.err', f); if (e) e.textContent = ''; });
  let first = null;
  for (const [name, msg] of Object.entries(details || {})) {
    const input = root.querySelector(`[name="${CSS.escape(name)}"]`); const f = input?.closest('.field');
    if (!f) continue; f.classList.add('invalid'); let e = $('.err', f); if (!e) { e = document.createElement('div'); e.className = 'err'; e.setAttribute('role', 'alert'); f.append(e); } e.textContent = msg; first ||= input;
  }
  first?.focus();
  return !!first;
}
export const formData = (form) => Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
