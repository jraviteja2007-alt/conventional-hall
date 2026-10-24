import { html, setHTML, icon, cap } from '../ui.js';
import { S } from '../store.js';
import { get } from '../api.js';
import { pageHero, sectionHead, facilityCard } from '../components.js';
import { IMG } from '../images.js';

const CAT = { comfort: 'Comfort', access: 'Access & parking', food: 'Dining & kitchen', event: 'Event & entertainment', safety: 'Safety & security', general: 'General' };

export default async function facilities(ctx) {
  const { facilities: fac } = await get('/api/facilities');
  const full = await Promise.all(S.halls.map((h) => get(`/api/halls/${h.slug}`).then((r) => r.hall).catch(() => h)));
  ctx.meta('Facilities', `Air conditioning, parking, dining, stage, sound, lighting, Wi-Fi, security and accessibility at ${S.site.name}.`);
  const cats = [...new Set(fac.map((f) => f.category))];
  const detail = (h, f) => (h.facilities || []).find((x) => x.id === f.id);
  const parking = full.map((h) => [h, detail(h, fac.find((f) => /parking/i.test(f.name)) || {})]).filter(([, d]) => d);
  const access = fac.filter((f) => /wheelchair|accessible|toilet|ramp|lift/i.test(`${f.name} ${f.description}`));
  setHTML(ctx.el, html`
  ${pageHero({ title: 'Facilities', sub: 'Everything you need for a smooth celebration, under one roof.', crumbs: [{ label: 'Facilities' }], image: IMG.ballroomTables })}
  <section class="section"><div class="container">
    ${cats.map((c) => html`<div class="a-cat"><h2 class="a-cat-h">${CAT[c] || cap(c)}</h2><div class="grid g4 perspective">${fac.filter((f) => f.category === c).map((f, i) => facilityCard(f, i))}</div></div>`)}
  </div></section>
  ${full.length > 1 ? html`<section class="section alt"><div class="container">${sectionHead('By hall', 'Facility matrix', 'Which hall offers what.')}
    <div class="table-wrap"><table class="tbl"><caption class="sr-only">Facilities available in each hall</caption><thead><tr><th scope="col">Facility</th>${full.map((h) => html`<th scope="col"><a href="/halls/${h.slug}">${h.name}</a></th>`)}</tr></thead>
    <tbody>${fac.map((f) => html`<tr><th scope="row">${f.name}</th>${full.map((h) => { const d = detail(h, f); return d ? html`<td class="yes"><span aria-hidden="true">✓</span><span class="sr-only">Available</span>${d.details ? html`<div class="caption">${d.details}</div>` : ''}</td>` : html`<td class="no"><span aria-hidden="true">–</span><span class="sr-only">Not available</span></td>`; })}</tr>`)}</tbody></table></div></div></section>` : ''}
  <section class="section"><div class="container split">
    <div class="reveal"><span class="eyebrow">Parking</span><h2>Space for every guest vehicle</h2>
      ${parking.length ? html`<ul class="ticks">${parking.map(([h, d]) => html`<li>${icon('car')} <span><b>${h.name}</b>: ${d.details || 'Parking available'}</span></li>`)}</ul>` : html`<p class="muted">Parking is available on site. Contact us for details.</p>`}
      <p class="caption">Two-wheeler and four-wheeler bays are listed per hall above where provided.</p></div>
    <div class="reveal"><span class="eyebrow">Accessibility</span><h2>Welcoming to everyone</h2>
      <ul class="ticks">${(access.length ? access.map((f) => [f.name, f.description]) : [['Wheelchair access', 'Please ask us about step-free access.']]).map(([n, d]) => html`<li>${icon('wheelchair')} <span><b>${n}</b>${d ? html`: ${d}` : ''}</span></li>`)}</ul>
      <p class="caption">Accessible entrance and accessible toilets can be confirmed for your hall when you <a href="/contact">contact us</a>.</p></div></div></section>`);
}
