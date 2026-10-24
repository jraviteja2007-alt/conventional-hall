import { html, setHTML, $, $$, icon, toast, errorState, emptyState, todayISO } from '../ui.js';
import { get } from '../api.js';
import { S } from '../store.js';
import { pageHero, hallCard } from '../components.js';
import { qsOf, debounceFn } from '../helpers.js';
import { IMG } from '../images.js';

export default async function halls(ctx) {
  ctx.meta('Our Halls', `Compare the halls at ${S.site.name}: capacity, pricing, facilities and live availability.`);
  const q = ctx.query; const picked = new Set();
  setHTML(ctx.el, html`
  ${pageHero({ title: 'Our halls', sub: 'Filter by guests, budget and date, then compare side by side.', crumbs: [{ label: 'Halls' }], image: S.halls[0]?.hero_image || IMG.chandelierHall })}
  <section class="section"><div class="container">
    <form class="card a-filter" id="hf" aria-label="Filter halls"><div class="a-filter-grid">
      <div class="field"><label for="hf-g">Guests</label><input class="input" id="hf-g" name="guests" type="number" min="1" max="20000" inputmode="numeric" value="${q.guests || ''}"></div>
      <div class="field"><label for="hf-p">Max full-day price (₹)</label><input class="input" id="hf-p" name="max_price" type="number" min="0" step="1000" inputmode="numeric" value="${q.max_price || ''}"></div>
      <div class="field"><label for="hf-d">Date (optional)</label><input class="input" id="hf-d" name="date" type="date" min="${todayISO()}" value="${q.date || ''}"></div>
      <div class="field"><label for="hf-s">Sort by</label><select class="input" id="hf-s" name="sort">${[['', 'Recommended'], ['price', 'Price: low to high'], ['capacity', 'Capacity'], ['popularity', 'Popularity'], ['availability', 'Availability']].map(([v, l]) => html`<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`)}</select></div>
    </div></form>
    <div id="hl" aria-live="polite" aria-busy="true"><div class="skeleton sk-card"></div></div>
  </div></section>
  <div class="a-cmp-bar" id="cmpbar" hidden><a class="btn gold" id="cmpgo" href="/compare">Compare (0)</a></div>`);

  const form = $('#hf'); const list = $('#hl'); let seq = 0;
  async function load() {
    const my = ++seq; const f = Object.fromEntries(new FormData(form)); list.setAttribute('aria-busy', 'true');
    history.replaceState({}, '', `/halls${qsOf(f)}`);
    try {
      const r = await get(`/api/search${qsOf({ ...f, guests: f.guests || undefined })}`); if (my !== seq) return;
      const slotsFor = (h) => (f.date ? h.slots : null);
      setHTML(list, r.halls.length ? html`<div class="grid" style="gap:28px">${r.halls.map((h, i) => hallCard(h, i, { compare: true, slots: slotsFor(h) }))}</div>` : emptyState('No halls match', 'Try fewer filters, a different date or a smaller guest count.', html`<button class="btn" type="button" id="hf-reset">Clear filters</button>`));
      $$('[data-cmp]', list).forEach((c) => { c.checked = picked.has(c.dataset.cmp); });
      document.dispatchEvent(new Event('scroll'));
      list.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    } catch (e) { if (my !== seq) return; setHTML(list, errorState(e.message)); $('[data-retry]', list)?.addEventListener('click', load); } finally { list.setAttribute('aria-busy', 'false'); }
  }
  const debounced = debounceFn(load, 350);
  form.addEventListener('input', debounced); form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  list.addEventListener('click', (e) => { if (e.target.id === 'hf-reset') { form.reset(); $$('input,select', form).forEach((i) => { i.value = ''; }); load(); } });
  list.addEventListener('change', (e) => {
    const c = e.target.closest('[data-cmp]'); if (!c) return;
    if (c.checked && picked.size >= 3) { c.checked = false; toast('You can compare up to 3 halls.', 'err'); return; }
    c.checked ? picked.add(c.dataset.cmp) : picked.delete(c.dataset.cmp);
    const bar = $('#cmpbar'); const go = $('#cmpgo'); bar.hidden = picked.size < 1; go.textContent = `Compare (${picked.size})`; go.href = `/compare?ids=${[...picked].join(',')}${f0().date ? `&date=${f0().date}` : ''}`;
    go.classList.toggle('is-loading', false); go.setAttribute('aria-disabled', String(picked.size < 2)); go.style.opacity = picked.size < 2 ? '.6' : '';
  });
  const f0 = () => Object.fromEntries(new FormData(form));
  $('#cmpgo').addEventListener('click', (e) => { if (picked.size < 2) { e.preventDefault(); e.stopPropagation(); toast('Select at least two halls to compare.'); } });
  await load();
}
