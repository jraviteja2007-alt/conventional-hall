import { html, setHTML, $, $$, icon, inr, num, img, openLightbox, stars } from '../ui.js';
import { get } from '../api.js';
import { S } from '../store.js';
import { sectionHead, facilityCard, packageCard, reviewCard, mountCalendar, mapsDir, mapsNear, telLink, waLink } from '../components.js';
import { mount3D } from '../helpers.js';
import { IMG } from '../images.js';

export default async function hall(ctx) {
  let data;
  try { data = await get(`/api/halls/${encodeURIComponent(ctx.params.slug)}`); } catch (e) { if (e.status === 404) return (await import('./notfound.js')).default(ctx); throw e; }
  const h = data.hall; const pk = data.packages.filter((p) => p.tier !== 'custom').slice(0, 3);
  ctx.meta(`${h.name} | Banquet & Convention Hall`, `${h.name}: up to ${num(h.max_guests)} guests, ${Math.round(h.area_sqm || 0)} m², from ${inr(h.base_full_day)} per day. Check availability and book online.`);
  const photos = [h.hero_image && { url: h.hero_image, title: h.name, alt: `${h.name} interior` }, ...(h.images || [])].filter(Boolean);
  const fac = (name) => h.facilities.find((f) => new RegExp(name, 'i').test(f.name));
  const parking = fac('parking'); const ac = fac('air');
  const dims = [['Length', h.length_m, 'm'], ['Width', h.width_m, 'm'], ['Height', h.height_m, 'm'], ['Total area', Math.round(h.area_sqm || 0), 'm²']].filter((d) => d[1]);
  const caps = [['Minimum guests', h.min_guests], ['Maximum guests', h.max_guests], ['Seating capacity', h.seating_capacity], ['Dining capacity', h.dining_capacity]].filter((c) => c[1]);
  const first = h.layouts?.find((l) => l.kind !== 'custom') || h.layouts?.[0];
  let selected = null;

  setHTML(ctx.el, html`
  <section class="phero a-hhero"><div class="bgimg" aria-hidden="true">${img(h.hero_image || IMG.chandelierHall, '', { w: 1600, eager: true, sizes: '100vw' })}</div>
    <div class="container"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span><a href="/halls">Halls</a></span><span aria-current="page">${h.name}</span></nav>
      <h1>${h.name}</h1><p class="subheading">${h.tagline || ''}</p>
      <div class="row" style="margin-top:14px">${h.rating?.count ? html`<span class="row" style="gap:6px">${stars(h.rating.average, h.rating.scale)}<span>${h.rating.average} (${h.rating.count})</span></span>` : ''}${h.is_ac ? html`<span class="badge">${icon('snowflake')} Air-conditioned</span>` : ''}<a class="btn gold" href="/book?hall=${h.id}" data-track="book_click">Book this hall</a></div></div></section>

  <section class="section"><div class="container split">
    <div class="reveal"><span class="eyebrow">Overview</span><h2>About this hall</h2><p class="lead">${h.description}</p>
      <div class="stat-row"><div class="stat"><b>${inr(h.base_hourly)}</b><span>Per hour</span></div><div class="stat"><b>${inr(h.base_half_day)}</b><span>Half day</span></div><div class="stat"><b>${inr(h.base_full_day)}</b><span>Full day</span></div></div>
      <p class="caption">Weekend, holiday and peak-season rates may differ; GST is shown at checkout.</p></div>
    <div class="a-3d card" id="h3d-wrap"><div class="hero-3d a-3d-box" id="h3d" role="group" aria-label="3D hall view"><span class="tag">3D · ${h.name}</span>
      <div class="layout-chips" id="lc" role="group" aria-label="Seating layout">${(h.layouts || []).filter((l) => l.kind !== 'custom').map((l) => html`<button type="button" class="chip sm ${l === first ? 'active' : ''}" data-kind="${l.kind}" data-cap="${l.capacity}" aria-pressed="${l === first}">${l.name}</button>`)}</div>
      <span class="drag-hint">Drag to rotate</span></div></div></div></section>

  <section class="section alt"><div class="container"><div class="grid g2">
    <div class="card"><h3>Capacity</h3><div class="stat-row">${caps.map(([l, v]) => html`<div class="stat"><b>${num(v)}</b><span>${l}</span></div>`)}</div></div>
    <div class="card"><h3>Dimensions</h3><div class="stat-row">${dims.map(([l, v, u]) => html`<div class="stat"><b>${num(v)} ${u}</b><span>${l}</span></div>`)}</div></div></div>
    ${h.layouts?.length ? html`<h3 style="margin-top:28px">Layouts and capacity</h3><div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">Layout</th><th scope="col">Capacity</th><th scope="col">Best for</th></tr></thead><tbody>${h.layouts.map((l) => html`<tr><th scope="row">${l.name}</th><td>${num(l.capacity)}</td><td>${l.description || ''}</td></tr>`)}</tbody></table></div>` : ''}</div></section>

  ${photos.length > 1 ? html`<section class="section"><div class="container">${sectionHead('Photos', `Inside ${h.name}`)}<div class="masonry">${photos.slice(0, 9).map((p, i) => html`<button type="button" class="g-item" data-i="${i}" aria-label="Open photo: ${p.title || p.alt || h.name}">${img(p.thumb_url || p.url, p.alt || p.title || h.name, { w: 700, sizes: '(max-width:700px) 100vw, 33vw' })}<span class="cap">${p.title || ''}</span></button>`)}</div></div></section>` : ''}

  <section class="section dark"><div class="container">${sectionHead('Facilities', 'Included with this hall')}
    <div class="grid g4 perspective">${h.facilities.map((f, i) => html`<div>${facilityCard(f, i)}${f.details ? html`<p class="caption" style="margin:8px 4px 0">${f.details}</p>` : ''}</div>`)}</div>
    <div class="row" style="margin-top:24px">${ac ? html`<span class="badge">${icon('snowflake')} ${ac.details || 'Centralised AC'}</span>` : ''}${parking ? html`<span class="badge">${icon('car')} ${parking.details || 'Parking available'}</span>` : ''}</div></div></section>

  <section class="section" id="availability"><div class="container split">
    <div><span class="eyebrow">Availability</span><h2>Pick your date</h2><div id="cal"></div></div>
    <div class="card reveal"><h3>Your selection</h3><p id="sel" class="muted" aria-live="polite">Choose an available date on the calendar.</p><a class="btn gold block" id="bk" href="/book?hall=${h.id}" data-track="book_click">Book this hall</a>
      <div class="row" style="margin-top:12px"><a class="btn ghost sm" href="${telLink()}" data-track="call_click">${icon('phone')} Call</a><a class="btn ghost sm" href="${waLink(`Hello, I am interested in ${h.name}.`)}" target="_blank" rel="noopener noreferrer" data-track="whatsapp_click">${icon('whatsapp')} WhatsApp</a></div></div></div></section>

  ${pk.length ? html`<section class="section alt"><div class="container">${sectionHead('Packages', `Packages for ${h.name}`)}<div class="grid g3 perspective">${pk.map((p, i) => packageCard(p, i))}</div></div></section>` : ''}
  ${h.reviews?.length ? html`<section class="section"><div class="container">${sectionHead('Reviews', 'What hosts say')}<div class="grid g3 perspective">${h.reviews.slice(0, 3).map((r, i) => reviewCard(r, i))}</div></div></section>` : ''}
  <section class="section alt"><div class="container"><p class="caption">Nearby: ${[['hotels', 'Hotels'], ['restaurants', 'Restaurants'], ['bus station', 'Transport'], ['hospitals', 'Hospitals'], ['parking', 'Parking']].map(([q, l], i) => html`${i ? ' · ' : ''}<a href="${mapsNear(q)}" target="_blank" rel="noopener noreferrer">${l}</a>`)} · <a href="${mapsDir()}" target="_blank" rel="noopener noreferrer">Get directions</a></p></div></section>
  <div class="a-sticky"><a class="btn gold block" href="/book?hall=${h.id}" data-track="book_click">Book ${h.name}</a></div>`);

  const h3 = mount3D($('#h3d'), h, ctx);
  $('#lc').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]'); if (!b || !h3) return;
    $$('#lc .chip').forEach((c) => { c.classList.toggle('active', c === b); c.setAttribute('aria-pressed', String(c === b)); });
    h3.setLayout({ layout: b.dataset.kind, capacity: Number(b.dataset.cap) });
  });
  $$('.g-item', ctx.el).forEach((b) => b.addEventListener('click', () => openLightbox(photos.slice(0, 9), Number(b.dataset.i))));
  mountCalendar($('#cal'), { hallId: h.id, selected: ctx.query.date || null, onSelect: (d, info) => {
    selected = d; $('#sel').textContent = `${new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}: ${info?.status && info.status !== 'available' ? `currently ${info.status}` : 'available'}`;
    $('#bk').href = `/book?hall=${h.id}&date=${d}`; $('#bk').textContent = 'Book this date';
  } });
  void selected;
}
