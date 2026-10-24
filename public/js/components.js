// Reusable view components (return html`` strings) and small interactive widgets.
import { html, raw, icon, img, inr, num, fmtDate, fmtTime, stars, esc, $, $$, toast, track, initials, showFieldErrors, formData, cap, todayISO } from './ui.js';
import { S, maxRating } from './store.js';
import { get, post, qs } from './api.js';

export const pageHero = ({ title, sub = '', crumbs = [], image = '' }) => html`
<section class="phero"><div class="bgimg" aria-hidden="true">${image ? img(image, '', { w: 1600, eager: true, sizes: '100vw' }) : ''}</div>
  <div class="container"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${crumbs.map((c) => (c.href ? html`<span><a href="${c.href}">${c.label}</a></span>` : html`<span aria-current="page">${c.label}</span>`))}</nav>
  <h1>${title}</h1>${sub ? html`<p class="subheading">${sub}</p>` : ''}</div></section>`;

export const sectionHead = (eyebrow, title, sub = '', center = false) => html`<div class="section-head reveal ${center ? 'center' : ''}"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${sub ? html`<p class="subheading">${sub}</p>` : ''}</div>`;

export const facilityCard = (f, i = 0) => html`<article class="card fac-card shine reveal" data-d="${i % 4}" data-tilt="8"><div class="ico pop">${icon(f.icon || 'sparkles')}</div><h3 class="pop">${f.name}</h3><p>${f.description || ''}</p></article>`;
export const eventCard = (e, i = 0) => html`<a class="ev-card shine reveal" data-d="${i % 4}" data-tilt="9" href="/book?event=${e.slug}" aria-label="Book a ${e.name} event">${img(e.image, '', { w: 700, sizes: '(max-width:700px) 100vw, 25vw' })}<div class="txt"><h3>${e.name}</h3><p>${e.description || ''}</p></div></a>`;

export function startingPrice(p) {
  if (p.tier === 'custom') return html`<span class="price" style="font-size:1.4rem">Custom quote</span>`;
  const parts = [];
  if (p.price) parts.push(inr(p.price));
  return html`<span class="price">${p.price ? inr(p.price) : inr(p.per_guest_price)}<small> ${p.price ? '' : 'per guest'}${p.price && p.per_guest_price ? ` + ${inr(p.per_guest_price)}/guest` : ''}</small></span>`;
}
export const packageCard = (p, i = 0, { compare = false } = {}) => html`
<article class="card pkg shine reveal ${p.is_featured ? 'featured' : ''}" data-d="${i % 4}" data-tilt="6">
  <div class="pimg">${img(p.images?.[0], `${p.name} package`, { w: 700, sizes: '(max-width:700px) 100vw, 33vw' })}<span class="badge tier-tag">${cap(p.tier)}</span>${p.is_featured ? html`<span class="ribbon">Popular</span>` : ''}</div>
  <div class="body"><h3>${p.name}</h3><p class="muted" style="margin:0;font-size:.92rem">${p.description || ''}</p>
    ${startingPrice(p)}
    <div class="caption">${p.includes_hall ? 'Hall included · ' : 'Add to your hall booking · '}${p.duration_hours} hrs · ${num(p.min_guests)}–${num(p.max_guests)} guests</div>
    <ul>${(p.highlights || []).slice(0, 6).map((h) => html`<li>${icon('check')}<span>${h}</span></li>`)}</ul>
    <div class="row" style="margin-top:auto;padding-top:12px"><a class="btn" href="/book?package=${p.id}${p.hall_id ? `&hall=${p.hall_id}` : ''}" data-track="book_click">${p.tier === 'custom' ? 'Request quotation' : 'Choose package'}</a>${compare ? html`<label class="chip"><input type="checkbox" data-cmp="${p.id}" style="accent-color:var(--primary)"> Compare</label>` : ''}</div>
  </div></article>`;

export const reviewCard = (r, i = 0) => html`
<figure class="card quote reveal" data-d="${i % 3}" style="margin:0"><div class="row" style="margin-bottom:12px">${stars(r.rating, maxRating())}<span class="caption">${r.event_label || ''}</span></div>
  ${r.title ? html`<h3 style="font-size:1.15rem">${r.title}</h3>` : ''}<blockquote style="margin:0 0 16px;color:var(--muted)">${r.body}</blockquote>
  <figcaption class="row"><span class="avatar" aria-hidden="true">${initials(r.author_name)}</span><div><b>${String(r.author_name).replace(/^Sample:\s*/i, '')}</b>${r.is_sample ? html`<div class="caption">Sample testimonial</div>` : html`<div class="caption">Verified booking</div>`}</div></figcaption></figure>`;

export const hallCard = (h, i = 0, { compare = false, slots = null } = {}) => html`
<article class="card hall-card shine reveal ${i % 2 ? 'rev' : ''}" data-tilt="3">
  <div class="himg">${img(h.hero_image, h.name, { w: 900, sizes: '(max-width:800px) 100vw, 50vw' })}${h.is_ac ? html`<span class="badge" style="position:absolute;left:14px;top:14px;background:#fff">${icon('snowflake')} Air-conditioned</span>` : ''}</div>
  <div class="hbody"><div class="row between"><h3 style="margin:0">${h.name}</h3>${h.rating?.count ? html`<span class="row" style="gap:6px">${stars(h.rating.average, h.rating.scale)}<span class="caption">${h.rating.average}</span></span>` : ''}</div>
    <p class="muted" style="margin:0">${h.tagline || ''}</p>
    <div class="stat-row"><div class="stat"><b>${num(h.max_guests)}</b><span>Max guests</span></div><div class="stat"><b>${num(Math.round(h.area_sqm || 0))}</b><span>Sq m</span></div><div class="stat"><b>${inr(h.base_full_day)}</b><span>Full day from</span></div></div>
    <div class="tag-row">${(h.facilities || []).slice(0, 6).map((f) => html`<span class="badge neutral">${f.name}</span>`)}</div>
    ${slots ? html`<div class="tag-row">${slots.map((s) => html`<span class="badge ${s.available ? 'success' : 'error'}">${s.label}: ${s.available ? 'Free' : 'Booked'}</span>`)}</div>` : ''}
    <div class="row" style="margin-top:auto;padding-top:10px"><a class="btn" href="/halls/${h.slug}">Explore hall</a><a class="btn ghost" href="/book?hall=${h.id}" data-track="book_click">Book now</a>${compare ? html`<label class="chip"><input type="checkbox" data-cmp="${h.id}" style="accent-color:var(--primary)"> Compare</label>` : ''}</div></div></article>`;

export function priceBreakdown(q, { compact = false } = {}) {
  if (!q) return html`<p class="muted">Choose a hall, date and time to see the price.</p>`;
  const lines = q.lines.filter((l) => !(l.included && l.amount === 0 && compact && l.type === 'service'));
  return html`<div class="pb">
    ${lines.map((l) => html`<div class="pl ${l.included ? 'inc' : ''}"><span>${l.label}${l.qty > 1 && l.unit ? html` <small>(${num(l.qty)} × ${inr(l.unit)})</small>` : ''}</span><span>${l.included ? 'Included' : inr(l.amount)}</span></div>`)}
    <div class="pl"><span><b>Subtotal</b></span><span><b>${inr(q.subtotal)}</b></span></div>
    ${q.discount ? html`<div class="pl disc"><span>Discount: ${q.discount.label}${q.discount.auto ? '' : ` (${q.discount.code})`}</span><span>− ${inr(q.discount.amount)}</span></div>` : ''}
    ${q.tax ? html`<div class="pl"><span>${q.tax.name} @ ${q.tax.rate}% <small>(CGST ${inr(q.tax.cgst)} + SGST ${inr(q.tax.sgst)})</small></span><span>${inr(q.tax.amount)}</span></div>` : ''}
    <div class="pl total"><span>Total</span><span>${inr(q.total)}</span></div>
    <p class="caption" style="margin:10px 0 0">Booking advance (${q.advancePct}%): <b>${inr(q.advance)}</b> · Balance: ${inr(q.total - q.advance)}</p></div>`;
}

/** Availability calendar widget. Statuses: available / pending / reserved / confirmed / blocked / maintenance. */
export function mountCalendar(root, { hallId, selected = null, onSelect = () => {}, month = null }) {
  const now = new Date(); let ym = month || (selected ? selected.slice(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`); let hall = hallId; let sel = selected; let data = new Map(); let seq = 0;
  const today = todayISO();
  const label = { available: 'Available', pending: 'Pending', reserved: 'Reserved', confirmed: 'Booked', blocked: 'Blocked', maintenance: 'Maintenance' };
  async function load() {
    const my = ++seq; root.setAttribute('aria-busy', 'true');
    try { const r = await get(`/api/availability/calendar${qs({ hall, month: ym })}`); if (my !== seq) return; data = new Map(r.days.map((d) => [d.date, d])); } catch (e) { data = new Map(); toast(e.message, 'err'); }
    root.removeAttribute('aria-busy'); draw();
  }
  function draw() {
    const [y, m] = ym.split('-').map(Number); const first = new Date(y, m - 1, 1); const days = new Date(y, m, 0).getDate(); const lead = (first.getDay() + 6) % 7;
    const title = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const cells = [...Array(lead)].map(() => '<span class="cal-day blank"></span>');
    for (let d = 1; d <= days; d++) {
      const date = `${ym}-${String(d).padStart(2, '0')}`; const st = data.get(date)?.status || 'available'; const past = date < today; const blocked = ['blocked', 'maintenance'].includes(st);
      cells.push(`<button type="button" class="cal-day s-${st}${date === sel ? ' sel' : ''}${date === today ? ' today' : ''}" data-date="${date}" ${past || blocked ? 'disabled' : ''} aria-label="${esc(fmtDate(date))}: ${past ? 'past date' : label[st]}" aria-pressed="${date === sel}">${d}${st !== 'available' ? `<small>${label[st].slice(0, 4)}</small>` : ''}</button>`);
    }
    root.innerHTML = `<div class="cal"><div class="cal-head"><button type="button" class="btn ghost sm" data-nav="-1" aria-label="Previous month">‹</button><h3 aria-live="polite">${esc(title)}</h3><button type="button" class="btn ghost sm" data-nav="1" aria-label="Next month">›</button></div>
      <div class="cal-grid" role="group" aria-label="${esc(title)}">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div>
      <div class="legend" style="margin-top:14px"><span><i style="background:#dff1e8"></i>Available</span><span><i style="background:#f6e3bb"></i>Pending</span><span><i style="background:#d7e1f6"></i>Reserved</span><span><i style="background:#f4d1cd"></i>Confirmed</span><span><i style="background:#d9d6de"></i>Blocked</span><span><i style="background:repeating-linear-gradient(45deg,#e6e1d8,#e6e1d8 3px,#d6cfc2 3px,#d6cfc2 6px)"></i>Maintenance</span></div></div>`;
  }
  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]'); if (nav) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + Number(nav.dataset.nav), 1); ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; load(); return; }
    const day = e.target.closest('[data-date]'); if (day && !day.disabled) { sel = day.dataset.date; draw(); onSelect(sel, data.get(sel)); }
  });
  draw(); load();
  return { setHall(id) { hall = id; load(); }, refresh: load, select(d) { sel = d; draw(); }, get date() { return sel; } };
}

/** Slot picker (morning/afternoon/evening/full day + custom hours). Calls onPick({start,end,label}). */
export async function mountSlots(root, { hallId, date, onPick, picked = null }) {
  root.innerHTML = '<div class="skeleton" style="height:90px"></div>';
  try {
    const { slots } = await get(`/api/availability/slots${qs({ hall: hallId, date })}`);
    root.innerHTML = `<div class="slots" role="group" aria-label="Time slots">${slots.map((s) => `<button type="button" class="slot" data-s="${s.start}" data-e="${s.end}" data-l="${esc(s.label)}" aria-pressed="${picked && picked.start === s.start && picked.end === s.end}" ${s.available ? '' : 'disabled'}><b>${esc(s.label)}</b><span>${fmtTime(s.start)} – ${fmtTime(s.end)}</span><br><span style="color:${s.available ? 'var(--success)' : 'var(--error)'}">${s.available ? 'Available' : s.reason === 'maintenance' ? 'Maintenance' : 'Not available'}</span></button>`).join('')}</div>
    <details style="margin-top:14px" ${picked && !slots.some((s) => s.start === picked.start && s.end === picked.end) ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">Need different hours? Choose a custom time</summary><div class="form-grid" style="margin-top:12px"><div class="field"><label for="cs">Start time</label><input class="input" id="cs" type="time" value="${esc(picked?.start || '09:00')}"></div><div class="field"><label for="ce">End time</label><input class="input" id="ce" type="time" value="${esc(picked?.end || '17:00')}"></div></div><button type="button" class="btn ghost sm" id="cc">Use custom hours</button></details>`;
    root.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', () => { root.querySelectorAll('.slot').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onPick({ start: b.dataset.s, end: b.dataset.e, label: b.dataset.l }); }));
    root.querySelector('#cc').addEventListener('click', () => { const s = root.querySelector('#cs').value, e = root.querySelector('#ce').value; if (!s || !e || s >= e) { toast('Choose a start time before the end time.', 'err'); return; } root.querySelectorAll('.slot').forEach((x) => x.setAttribute('aria-pressed', 'false')); onPick({ start: s, end: e, label: 'Custom hours' }); });
  } catch (e) { root.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
}

export const enquiryFormHTML = (opts = {}) => html`
<form class="enq-form" novalidate aria-label="Enquiry form"><div class="form-grid">
  <div class="field"><label for="en-name">Your name</label><input class="input" id="en-name" name="name" autocomplete="name" required minlength="2" maxlength="80" value="${S.user?.name || ''}"></div>
  <div class="field"><label for="en-phone">Mobile number</label><input class="input" id="en-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="98765 43210" value="${S.user?.phone || ''}"></div>
  <div class="field"><label for="en-email">Email (optional)</label><input class="input" id="en-email" name="email" type="email" autocomplete="email" value="${S.user?.email || ''}"></div>
  <div class="field"><label for="en-type">Event type</label><select class="input" id="en-type" name="eventType"><option value="">Select…</option>${S.events.map((e) => html`<option ${opts.event === e.name ? 'selected' : ''}>${e.name}</option>`)}</select></div>
  <div class="field"><label for="en-date">Tentative date</label><input class="input" id="en-date" name="eventDate" type="date" min="${todayISO()}"></div>
  <div class="field"><label for="en-guests">Guests</label><input class="input" id="en-guests" name="guests" type="number" min="1" max="20000" inputmode="numeric"></div>
  <div class="field full"><label for="en-msg">How can we help?</label><textarea class="input" id="en-msg" name="message" maxlength="1500" placeholder="Tell us about your event, budget or any questions…">${opts.message || ''}</textarea></div>
  <input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>
  <button class="btn gold lg" type="submit">${opts.cta || 'Send enquiry'}</button><p class="caption" style="margin-top:10px">We reply within one working day. Your details are used only to respond to this enquiry.</p></form>`;

export function bindEnquiry(form, source = 'enquiry_form') {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = formData(form); const btn = form.querySelector('[type=submit]');
    const errs = {}; if (!f.name || f.name.length < 2) errs.name = 'Please enter your name'; if (!/^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(f.phone.replace(/\s+/g, ' ').trim()) && !/^\+\d{8,15}$/.test(f.phone.replace(/[\s-]/g, ''))) errs.phone = 'Enter a valid mobile number';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email address';
    if (showFieldErrors(form, errs)) return;
    btn.classList.add('is-loading');
    try {
      const body = { ...f, source, guests: f.guests ? Number(f.guests) : undefined }; Object.keys(body).forEach((k) => body[k] === '' && delete body[k]);
      const r = await post('/api/enquiries', body); toast(r.message || 'Thank you! We will contact you shortly.', 'ok');
      form.innerHTML = `<div class="alert ok" role="status">${esc(r.message || 'Thank you! Our team will contact you shortly.')}</div>`;
    } catch (err) { btn.classList.remove('is-loading'); if (err.details) showFieldErrors(form, err.details); toast(err.message, 'err'); }
  });
}

export const waLink = (text = '') => `https://wa.me/${String(S.site.whatsapp || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const telLink = () => `tel:${String(S.site.phone || '').replace(/[^\d+]/g, '')}`;
export const mapsDir = () => `https://www.google.com/maps/dir/?api=1&destination=${S.site.lat},${S.site.lng}`;
export const mapsEmbed = () => `https://www.google.com/maps?q=${encodeURIComponent(`${S.site.lat},${S.site.lng}`)}&z=15&output=embed`;
export const mapsNear = (what) => `https://www.google.com/maps/search/${encodeURIComponent(what)}/@${S.site.lat},${S.site.lng},15z`;

/** Fire conversion tracking for any element carrying data-track (event delegation, installed once). */
document.addEventListener('click', (e) => { const t = e.target.closest('[data-track]'); if (t) track(t.dataset.track); });
