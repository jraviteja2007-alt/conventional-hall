import { html, setHTML, $, $$, icon, inr, num, cap, toast, errorState, emptyState, showFieldErrors, formData } from '../ui.js';
import { S } from '../store.js';
import { get, post } from '../api.js';
import { pageHero, sectionHead, packageCard } from '../components.js';
import { qsOf } from '../helpers.js';
import { IMG } from '../images.js';

export default async function packages(ctx) {
  ctx.meta('Packages', 'Compare our wedding, corporate and event packages with transparent pricing.');
  let pk;
  try { pk = (await get('/api/packages')).packages; } catch (e) {
    setHTML(ctx.el, html`${pageHero({ title: 'Packages', crumbs: [{ label: 'Packages' }] })}<div class="container section">${errorState(e.message)}</div>`);
    $('[data-retry]', ctx.el)?.addEventListener('click', () => ctx.navigate(location.pathname)); return;
  }
  if (!ctx.isCurrent()) return;
  const tiers = [...new Set(pk.map((p) => p.tier))];
  let tier = tiers.includes(ctx.query.tier) ? ctx.query.tier : '';
  const picked = new Set();
  const shown = () => pk.filter((p) => !tier || p.tier === tier);
  const cards = () => (shown().length ? html`<div class="grid g3 perspective">${shown().map((p, i) => packageCard(p, i, { compare: true }))}</div>` : emptyState('No packages in this category', 'Try another category.'));

  setHTML(ctx.el, html`${pageHero({ title: 'Event packages', sub: 'Clear bundles with GST shown upfront. Pick one, compare, or build your own.', crumbs: [{ label: 'Packages' }], image: IMG.longBanquet })}
  <section class="section"><div class="container">
    <div class="tag-row" id="pk-tiers" role="group" aria-label="Filter by package type" style="margin-bottom:24px"><button type="button" class="chip" data-tier="" aria-pressed="${!tier}">All</button>${tiers.map((t) => html`<button type="button" class="chip" data-tier="${t}" aria-pressed="${tier === t}">${cap(t)}</button>`)}</div>
    <div id="pk-grid">${cards()}</div>
    <div id="pk-cmp" style="margin-top:40px" aria-live="polite"></div>
  </div></section>
  <section class="section alt" id="recommend"><div class="container split">
    <div>${sectionHead('Not sure?', 'Find the right package', 'Tell us about your event and we will suggest the best fit with an indicative price.')}</div>
    <form class="card pad" id="rec-form" novalidate aria-label="Package recommendation"><div class="form-grid">
      <div class="field"><label for="rc-event">Event type</label><select class="input" id="rc-event" name="event"><option value="">Any</option>${S.events.filter((e) => !e.is_other).map((e) => html`<option value="${e.slug}">${e.name}</option>`)}</select></div>
      <div class="field"><label for="rc-guests">Guests</label><input class="input" id="rc-guests" name="guests" type="number" min="1" max="20000" inputmode="numeric" required value="${ctx.query.guests || 300}"></div>
      <div class="field full"><label for="rc-budget">Budget in ₹ (optional)</label><input class="input" id="rc-budget" name="budget" type="number" min="0" step="1000" inputmode="numeric" placeholder="e.g. 400000"></div></div>
      <button class="btn gold" type="submit">${icon('sparkles')} Recommend packages</button>
      <div id="rec-out" aria-live="polite" style="margin-top:18px"></div></form>
  </div></section>`);

  $('#pk-tiers', ctx.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]'); if (!b) return; tier = b.dataset.tier;
    $$('#pk-tiers .chip', ctx.el).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    setHTML($('#pk-grid', ctx.el), cards()); $$('[data-cmp]', ctx.el).forEach((c) => { c.checked = picked.has(Number(c.dataset.cmp)); });
  });

  const feat = (p) => [...new Set([...(p.services || []).map((s) => (s.quantity > 1 ? `${s.name} × ${s.quantity}` : s.name)), ...(p.highlights || [])])];
  const cmp = () => {
    const list = pk.filter((p) => picked.has(p.id)); const box = $('#pk-cmp', ctx.el);
    if (list.length < 2) { setHTML(box, list.length ? html`<p class="muted">Select one more package to compare.</p>` : ''); return; }
    const all = [...new Set(list.flatMap(feat))];
    const row = (l, f) => html`<tr><th scope="row">${l}</th>${list.map((p) => html`<td>${f(p)}</td>`)}</tr>`;
    setHTML(box, html`<h2 style="font-size:1.6rem">Compare packages</h2><div class="table-wrap"><table class="tbl"><thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${list.map((p) => html`<th scope="col">${p.name}<div class="caption">${cap(p.tier)}</div></th>`)}</tr></thead><tbody>
      ${row('Price', (p) => (p.tier === 'custom' ? 'Custom quote' : p.price ? inr(p.price) : '—'))}
      ${row('Per guest', (p) => (p.per_guest_price ? `${inr(p.per_guest_price)} / guest` : '—'))}
      ${row('Duration', (p) => `${p.duration_hours} hours`)}
      ${row('Guests', (p) => `${num(p.min_guests)} – ${num(p.max_guests)}`)}
      ${row('Hall included', (p) => (p.includes_hall ? html`<span class="yes">Yes</span>` : html`<span class="no">No</span>`))}
      ${all.map((f) => row(f, (p) => (feat(p).includes(f) ? html`<span class="yes" aria-label="Included">✓</span>` : html`<span class="no" aria-label="Not included">–</span>`)))}
      ${row('', (p) => html`<a class="btn sm" href="/book?package=${p.id}${p.hall_id ? `&hall=${p.hall_id}` : ''}">Choose</a>`)}
    </tbody></table></div>`);
  };
  ctx.el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-cmp]'); if (!c) return; const id = Number(c.dataset.cmp);
    if (c.checked) { if (picked.size >= 3) { c.checked = false; toast('You can compare up to 3 packages.', 'err'); return; } picked.add(id); } else picked.delete(id);
    cmp();
  });

  const form = $('#rec-form', ctx.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = formData(form); const out = $('#rec-out', ctx.el); const btn = $('[type=submit]', form);
    const errs = {}; if (!Number(f.guests) || Number(f.guests) < 1) errs.guests = 'Enter the number of guests';
    if (showFieldErrors(form, errs)) return;
    btn.classList.add('is-loading'); setHTML(out, html`<div class="skeleton" style="height:80px"></div>`);
    try {
      const body = { event: f.event || undefined, guests: Number(f.guests), budget: f.budget ? Number(f.budget) : undefined };
      const { recommendations } = await post('/api/recommend', body);
      if (!recommendations.length) { setHTML(out, html`<div class="alert info">${icon('info')}<div>No ready package fits those numbers. <a href="/contact">Request a custom quotation</a>.</div></div>`); return; }
      setHTML(out, html`${recommendations.map((r, i) => html`<div class="qb-res ok"><div><b>${i === 0 ? 'Best match: ' : ''}${r.package.name}</b> at ${r.hall.name}<div class="caption">About ${inr(r.estimate.total)} incl. GST for ${num(r.estimate.guests)} guests (indicative)</div></div><a class="btn sm" href="/book${qsOf({ package: r.package.id, hall: r.hall.id, event: f.event, guests: r.estimate.guests })}" data-track="book_click">Book</a></div>`)}<p class="caption">Estimates assume a weekday about two months ahead. Final price depends on your date.</p>`);
    } catch (err) { setHTML(out, html`<div class="alert err" role="alert">${err.message}</div>`); } finally { btn.classList.remove('is-loading'); }
  });
}
