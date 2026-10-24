import { html, setHTML, icon, inr, num, errorState, emptyState, todayISO } from '../ui.js';
import { get } from '../api.js';
import { S } from '../store.js';
import { pageHero } from '../components.js';
import { qsOf } from '../helpers.js';

const yes = html`<span class="yes" aria-label="Yes">✓</span>`; const no = html`<span class="no" aria-label="No">–</span>`;

export default async function compare(ctx) {
  const ids = String(ctx.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 3);
  const pkgMode = ctx.query.type === 'packages'; const date = ctx.query.date || '';
  ctx.meta(pkgMode ? 'Compare packages' : 'Compare halls', `Side-by-side comparison of ${pkgMode ? 'packages' : 'halls'} at ${S.site.name}.`);
  const head = pageHero({ title: pkgMode ? 'Compare packages' : 'Compare halls', crumbs: [{ href: pkgMode ? '/packages' : '/halls', label: pkgMode ? 'Packages' : 'Halls' }, { label: 'Compare' }] });
  if (ids.length < 2) { setHTML(ctx.el, html`${head}<section class="section"><div class="container">${emptyState('Choose at least two to compare', 'Tick the Compare box on two or three items, then press Compare.', html`<a class="btn" href="${pkgMode ? '/packages' : '/halls'}">${pkgMode ? 'View packages' : 'View halls'}</a>`)}</div></section>`); return; }
  try {
    if (pkgMode) {
      const { packages } = await get('/api/packages'); const items = ids.map((i) => packages.find((p) => p.id === i)).filter(Boolean);
      const all = [...new Set(items.flatMap((p) => p.services.map((s) => s.name)))];
      const rows = [['Price', (p) => (p.price ? inr(p.price) : 'Custom')], ['Per guest', (p) => (p.per_guest_price ? inr(p.per_guest_price) : '–')], ['Guests', (p) => `${num(p.min_guests)}–${num(p.max_guests)}`], ['Duration', (p) => `${p.duration_hours} hrs`], ['Hall included', (p) => (p.includes_hall ? yes : no)]];
      setHTML(ctx.el, html`${head}<section class="section"><div class="container"><div class="table-wrap"><table class="tbl"><caption class="sr-only">Package comparison</caption><thead><tr><th scope="col">Feature</th>${items.map((p) => html`<th scope="col">${p.name}</th>`)}</tr></thead><tbody>
        ${rows.map(([l, f]) => html`<tr><th scope="row">${l}</th>${items.map((p) => html`<td>${f(p)}</td>`)}</tr>`)}
        ${all.map((s) => html`<tr><th scope="row">${s}</th>${items.map((p) => html`<td>${p.services.some((x) => x.name === s) ? yes : no}</td>`)}</tr>`)}
        <tr><th scope="row"></th>${items.map((p) => html`<td><a class="btn sm" href="/book?package=${p.id}">Choose</a></td>`)}</tr></tbody></table></div></div></section>`);
      return;
    }
    const items = ids.map((i) => S.halls.find((h) => h.id === i)).filter(Boolean);
    const slots = date ? await Promise.all(items.map((h) => get(`/api/availability/slots${qsOf({ hall: h.id, date })}`).then((r) => r.slots).catch(() => []))) : [];
    const facs = [...new Set(items.flatMap((h) => h.facilities.map((f) => f.name)))];
    const rows = [['Guests', (h) => `${num(h.min_guests)}–${num(h.max_guests)}`], ['Seating', (h) => num(h.seating_capacity)], ['Dining', (h) => num(h.dining_capacity)], ['Size', (h) => `${Math.round(h.area_sqm || 0)} m² (${h.length_m || '–'} × ${h.width_m || '–'} m)`], ['Per hour', (h) => inr(h.base_hourly)], ['Half day', (h) => inr(h.base_half_day)], ['Full day', (h) => inr(h.base_full_day)], ['Air-conditioned', (h) => (h.is_ac ? yes : no)]];
    setHTML(ctx.el, html`${head}<section class="section"><div class="container">
      <form class="row" id="cd" style="margin-bottom:18px"><div class="field" style="margin:0"><label for="cd-d">Check availability on</label><input class="input" id="cd-d" type="date" min="${todayISO()}" value="${date}"></div><button class="btn sm" type="submit">Check</button></form>
      <div class="table-wrap"><table class="tbl"><caption class="sr-only">Hall comparison</caption><thead><tr><th scope="col">Feature</th>${items.map((h) => html`<th scope="col"><a href="/halls/${h.slug}">${h.name}</a></th>`)}</tr></thead><tbody>
        ${rows.map(([l, f]) => html`<tr><th scope="row">${l}</th>${items.map((h) => html`<td>${f(h)}</td>`)}</tr>`)}
        ${date ? html`<tr><th scope="row">Availability, ${date}</th>${items.map((h, i) => html`<td>${(slots[i] || []).map((s) => html`<div><span class="badge ${s.available ? 'success' : 'error'}">${s.label}: ${s.available ? 'Free' : 'Booked'}</span></div>`)}</td>`)}</tr>` : ''}
        ${facs.map((f) => html`<tr><th scope="row">${f}</th>${items.map((h) => html`<td>${h.facilities.some((x) => x.name === f) ? yes : no}</td>`)}</tr>`)}
        <tr><th scope="row"></th>${items.map((h) => html`<td><a class="btn sm" href="/book?hall=${h.id}${date ? `&date=${date}` : ''}">Book</a></td>`)}</tr></tbody></table></div></div></section>`);
    ctx.el.querySelector('#cd').addEventListener('submit', (e) => { e.preventDefault(); ctx.navigate(`/compare${qsOf({ ids: ids.join(','), date: ctx.el.querySelector('#cd-d').value })}`); });
  } catch (e) { setHTML(ctx.el, html`${head}<div class="container section">${errorState(e.message)}</div>`); }
}
