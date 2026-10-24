import { html, setHTML, $, inr, num, icon, errorState, emptyState, todayISO } from '../ui.js';
import { get } from '../api.js';
import { S } from '../store.js';
import { pageHero, hallCard, packageCard, facilityCard, eventCard } from '../components.js';
import { qsOf } from '../helpers.js';

export default async function search(ctx) {
  const q = ctx.query; ctx.meta('Search', `Search halls, packages, facilities and events at ${S.site.name}.`);
  setHTML(ctx.el, html`${pageHero({ title: q.q ? `Results for “${q.q}”` : 'Search', crumbs: [{ label: 'Search' }] })}
  <section class="section"><div class="container">
    <form class="card a-filter" id="sf" role="search" aria-label="Search and filter"><div class="a-filter-grid">
      <div class="field"><label for="sf-q">Search</label><input class="input" id="sf-q" name="q" type="search" maxlength="60" value="${q.q || ''}"></div>
      <div class="field"><label for="sf-e">Event</label><select class="input" id="sf-e" name="event"><option value="">Any</option>${S.events.map((e) => html`<option value="${e.slug}" ${q.event === e.slug ? 'selected' : ''}>${e.name}</option>`)}</select></div>
      <div class="field"><label for="sf-g">Guests</label><input class="input" id="sf-g" name="guests" type="number" min="1" inputmode="numeric" value="${q.guests || ''}"></div>
      <div class="field"><label for="sf-p">Max price (₹)</label><input class="input" id="sf-p" name="max_price" type="number" min="0" step="1000" inputmode="numeric" value="${q.max_price || ''}"></div>
      <div class="field"><label for="sf-d">Date</label><input class="input" id="sf-d" name="date" type="date" min="${todayISO()}" value="${q.date || ''}"></div>
      <div class="field"><label for="sf-s">Sort</label><select class="input" id="sf-s" name="sort">${[['', 'Relevance'], ['price', 'Price'], ['capacity', 'Capacity'], ['popularity', 'Popularity'], ['availability', 'Availability']].map(([v, l]) => html`<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`)}</select></div>
    </div><button class="btn" type="submit">${icon('search')} Search</button></form>
    <div id="sr" aria-live="polite" aria-busy="true"><div class="skeleton sk-card"></div></div></div></section>`);
  const out = $('#sr');
  async function run(params) {
    out.setAttribute('aria-busy', 'true');
    try {
      const r = await get(`/api/search${qsOf(params)}`);
      const n = r.halls.length + r.packages.length + r.facilities.length + r.events.length;
      if (!n) { setHTML(out, emptyState('No results', 'Try a different word such as “wedding”, “parking” or “AC”, or remove a filter.')); return; }
      setHTML(out, html`<p class="caption">${n} result${n === 1 ? '' : 's'}</p>
        ${r.halls.length ? html`<h2 class="a-cat-h">Halls</h2><div class="grid" style="gap:24px">${r.halls.map((h, i) => hallCard(h, i, { slots: params.date ? h.slots : null }))}</div>` : ''}
        ${r.packages.length ? html`<h2 class="a-cat-h">Packages</h2><div class="grid g3">${r.packages.map((p, i) => packageCard(p, i))}</div>` : ''}
        ${r.facilities.length ? html`<h2 class="a-cat-h">Facilities</h2><div class="grid g4">${r.facilities.map((f, i) => facilityCard(f, i))}</div>` : ''}
        ${r.events.length ? html`<h2 class="a-cat-h">Events</h2><div class="grid g4">${r.events.map((e, i) => eventCard(e, i))}</div>` : ''}`);
      out.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    } catch (e) { setHTML(out, errorState(e.message)); $('[data-retry]', out)?.addEventListener('click', () => run(params)); } finally { out.setAttribute('aria-busy', 'false'); }
  }
  $('#sf').addEventListener('submit', (e) => { e.preventDefault(); ctx.navigate(`/search${qsOf(Object.fromEntries(new FormData(e.target)))}`); });
  await run(Object.fromEntries(Object.entries(q).filter(([k]) => ['q', 'event', 'guests', 'max_price', 'date', 'sort'].includes(k))));
  void inr; void num;
}
