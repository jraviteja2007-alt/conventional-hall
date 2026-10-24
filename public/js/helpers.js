// Shared helpers for page modules: 3D mounting, guest-booking phone memory, calendar file, coverflow, countdown, misc.
import { html, raw, esc, icon, $, $$, cap, fmtDate, fmtTime, img } from './ui.js';
import { S } from './store.js';
import { Hall3D } from './scene3d.js';

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const KINDS = ['theatre', 'classroom', 'ushape', 'dining', 'banquet'];
export const layoutKind = (k) => (KINDS.includes(k) ? k : 'banquet');

/** Mount an interactive 3D cut-away of a hall into `box` (a positioned element). Cleans itself up with the page. */
export function mount3D(box, hall, ctx, { layout, interactive = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Interactive 3D view of ${hall.name}. Drag to rotate, or use the arrow keys.`);
  box.prepend(canvas);
  const first = hall.layouts?.[0];
  const kind = layoutKind(layout || first?.kind);
  const cap = (hall.layouts || []).find((l) => l.kind === kind)?.capacity || hall.seating_capacity || hall.max_guests;
  let h3;
  try { h3 = new Hall3D(canvas, { layout: kind, capacity: cap, length: hall.length_m || 40, width: hall.width_m || 26, interactive }); } catch (e) { console.warn('3D unavailable', e); box.classList.add('no3d'); return null; }
  ctx?.onCleanup(() => h3.destroy());
  return h3;
}

/* ---- guest booking access: remember the phone used so a guest can reopen their booking in this tab ---- */
export const phoneStore = {
  get(ref) { try { return sessionStorage.getItem(`ch_ph_${ref}`) || ''; } catch { return ''; } },
  set(ref, p) { try { sessionStorage.setItem(`ch_ph_${ref}`, p); } catch { /* private mode */ } },
};
export const guestQs = (ref, first = true) => { if (S.user) return ''; const p = phoneStore.get(ref); return p ? `${first ? '?' : '&'}phone=${encodeURIComponent(p)}` : ''; };

export const statusBadge = (s) => html`<span class="badge ${s}">${cap(s === 'reserved' ? 'approved' : s === 'held' ? 'on hold' : s)}</span>`;
export const STATUS_HELP = {
  pending: 'Awaiting approval from our team. The slot is not blocked until it is approved.',
  held: 'Your slot is held for a short time while you pay the advance.',
  reserved: 'Approved. Pay the advance to confirm your date.',
  confirmed: 'Confirmed. We are looking forward to hosting you.',
  completed: 'This event has taken place. Thank you!',
  cancelled: 'This booking was cancelled.', rejected: 'This request could not be accepted.', expired: 'This booking expired because the advance was not paid in time.',
};
export const eventName = (b) => b.event?.name || 'Event';
export const timeRange = (b) => `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`;

/** Download a .ics calendar file for a booking (generated in the browser). */
export function icsLink(b) {
  const d = String(b.event_date).replace(/-/g, ''); const t = (x) => String(x).replace(':', '') + '00';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Convention Hall//EN', 'BEGIN:VEVENT', `UID:${b.ref}@hall`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
    `DTSTART:${d}T${t(b.start_time)}`, `DTEND:${d}T${t(b.end_time)}`, `SUMMARY:${eventName(b)} at ${S.site.name}`, `LOCATION:${String(S.site.address || '').replace(/,/g, '\\,')}`, `DESCRIPTION:Booking ${b.ref}`, 'END:VEVENT', 'END:VCALENDAR'];
  return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
}

/** Count down from `secs`; calls tick(mm:ss, secsLeft) every second and onDone() at zero. Returns stop(). */
export function countdown(secs, tick, onDone) {
  let left = Math.max(0, Math.floor(secs)); const end = Date.now() + left * 1000;
  const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const run = () => { left = Math.max(0, Math.round((end - Date.now()) / 1000)); tick(fmt(left), left); if (left <= 0) { clearInterval(id); onDone?.(); } };
  const id = setInterval(run, 1000); run();
  return () => clearInterval(id);
}

/** 3D coverflow carousel. items: [{url, title, alt}] */
export function mountCoverflow(root, items, { onOpen } = {}) {
  if (!items.length) return;
  let cur = Math.min(1, items.length - 1);
  root.innerHTML = `<div class="cf-track">${items.map((it, i) => `<button type="button" class="cf-item" data-i="${i}" aria-label="${esc(it.title || it.alt || 'Photo')}">${img(it.thumb_url || it.url, it.alt || it.title || '', { w: 800, sizes: '460px' })}<span class="cap">${esc(it.title || '')}</span></button>`).join('')}</div>
    <button type="button" class="cf-btn prev" aria-label="Previous photo">‹</button><button type="button" class="cf-btn next" aria-label="Next photo">›</button>`;
  const els = $$('.cf-item', root);
  const place = () => els.forEach((el, i) => {
    const d = i - cur; const a = Math.abs(d); const vis = a <= 3;
    const mob = root.clientWidth < 640;
    el.style.transform = `translateX(${d * (mob ? 38 : 56)}%) translateZ(${-a * 140}px) rotateY(${reduced ? 0 : Math.max(-55, Math.min(55, -d * 32))}deg) scale(${d === 0 ? 1 : 0.9})`;
    el.style.opacity = vis ? String(1 - a * 0.22) : '0'; el.style.zIndex = String(10 - a); el.style.pointerEvents = vis ? 'auto' : 'none'; el.style.filter = d === 0 ? 'none' : 'brightness(.6)';
    el.classList.toggle('active', d === 0); el.tabIndex = d === 0 ? 0 : -1;
  });
  const go = (n) => { cur = (n + items.length) % items.length; place(); };
  root.addEventListener('click', (e) => {
    if (e.target.closest('.prev')) return go(cur - 1); if (e.target.closest('.next')) return go(cur + 1);
    const it = e.target.closest('.cf-item'); if (!it) return; const i = Number(it.dataset.i); if (i === cur) onOpen?.(i); else go(i);
  });
  root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', 'carousel'); root.setAttribute('aria-label', 'Photo gallery');
  root.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(cur - 1); if (e.key === 'ArrowRight') go(cur + 1); });
  let sx = null; root.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true }); root.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); sx = null; });
  window.addEventListener('resize', place); place();
  return () => window.removeEventListener('resize', place);
}

/** Before/after slider markup + binding. */
export const beforeAfter = (it) => html`<figure class="ba-wrap" style="margin:0"><div class="ba" data-ba style="--pos:50%">${img(it.before_url, `Before: ${it.alt || it.title}`, { w: 1000, sizes: '(max-width:700px) 100vw, 50vw' })}<div class="after">${img(it.url, `After: ${it.alt || it.title}`, { w: 1000, sizes: '(max-width:700px) 100vw, 50vw' })}</div><span class="lab" style="left:12px">Before</span><span class="lab" style="right:12px">After</span><div class="bar"></div><input type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after"></div><figcaption class="caption" style="margin-top:8px">${it.title}</figcaption></figure>`;
export function bindBeforeAfter(root) {
  $$('[data-ba]', root).forEach((ba) => { const r = $('input', ba); const set = () => ba.style.setProperty('--pos', `${r.value}%`); r.addEventListener('input', set); set(); });
}

export const iconFor = (name) => icon(name || 'sparkles');
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const hallPriceFrom = (h) => h.base_full_day || h.base_half_day || h.base_hourly;
export const qsOf = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? `?${s}` : ''; };
export const debounceFn = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const nextDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) && !n.startsWith('/admin') ? n : '/account');
export { raw };
