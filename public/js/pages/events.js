import { html, setHTML, $, $$, icon, inr, num, toast, showFieldErrors, formData } from '../ui.js';
import { S } from '../store.js';
import { post } from '../api.js';
import { pageHero, sectionHead, eventCard } from '../components.js';
import { IMG } from '../images.js';

export default async function events(ctx) {
  ctx.meta('Events we host', `Weddings, receptions, engagements, birthdays, corporate events, conferences and more at ${S.site.name}.`);
  const evs = S.events;
  setHTML(ctx.el, html`
  ${pageHero({ title: 'Events we host', sub: 'Choose your occasion to see what we need to know and start booking.', crumbs: [{ label: 'Events' }], image: IMG.floralHall })}
  <section class="section"><div class="container">
    <div class="grid g4 perspective">${evs.map((e, i) => eventCard(e, i))}</div></div></section>
  <section class="section alt"><div class="container">${sectionHead('Details', 'What we ask for each event', 'Details help us prepare the right setup.')}
    <div class="stack">${evs.map((e) => html`<details class="card a-ev" id="ev-${e.slug}"><summary><b>${e.name}</b></summary>
      <p class="muted">${e.description}</p>
      ${e.extra_fields?.length ? html`<ul class="ticks">${e.extra_fields.map((f) => html`<li>${icon('check')} ${f.label}</li>`)}</ul>` : ''}
      <a class="btn sm" href="/book?event=${e.slug}" data-track="book_click">Book this event</a></details>`)}</div></div></section>
  <section class="section"><div class="container split">
    <div class="reveal"><span class="eyebrow">Recommendation</span><h2>Find the right package</h2><p class="lead">Tell us about your event and we will suggest packages with live estimates.</p>
      <form id="rec" novalidate aria-label="Package recommendation"><div class="form-grid">
        <div class="field"><label for="rc-event">Event type</label><select class="input" id="rc-event" name="event">${evs.filter((e) => !e.is_other).map((e) => html`<option value="${e.slug}">${e.name}</option>`)}</select></div>
        <div class="field"><label for="rc-guests">Guests</label><input class="input" id="rc-guests" name="guests" type="number" min="1" max="20000" value="300" inputmode="numeric" required></div>
        <div class="field full"><label for="rc-budget">Budget in ₹ (optional)</label><input class="input" id="rc-budget" name="budget" type="number" min="0" step="1000" inputmode="numeric"></div></div>
        <button class="btn gold" type="submit">Recommend</button></form></div>
    <div id="rec-out" aria-live="polite"><p class="muted">Your recommendations will appear here.</p></div></div></section>`);

  if (location.hash) $(location.hash.replace(/[^#\w-]/g, ''))?.setAttribute('open', '');
  const form = $('#rec'); const out = $('#rec-out');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = formData(form); const btn = $('[type=submit]', form);
    const errs = {}; if (!Number(f.guests) || Number(f.guests) < 1) errs.guests = 'Enter the number of guests';
    if (showFieldErrors(form, errs)) return;
    btn.classList.add('is-loading');
    try {
      const body = { event: f.event, guests: Number(f.guests) }; if (f.budget) body.budget = Number(f.budget);
      const { recommendations: r } = await post('/api/recommend', body);
      setHTML(out, r.length ? html`<div class="stack">${r.map((x) => html`<article class="card"><div class="row between"><h3 style="margin:0">${x.package.name}</h3><span class="badge">${x.hall?.name || ''}</span></div>
        <p class="muted">${x.package.description || ''}</p>${x.estimate ? html`<p class="price">${inr(x.estimate.total ?? x.estimate)}<small> est. incl. GST</small></p>` : ''}
        <p class="caption">${num(x.package.min_guests)}–${num(x.package.max_guests)} guests · ${x.package.duration_hours} hrs</p>
        <a class="btn sm" href="/book?package=${x.package.id}${x.hall ? `&hall=${x.hall.id}` : ''}&event=${f.event}&guests=${f.guests}">Choose package</a></article>`)}</div>` : html`<div class="alert info">No package matches those numbers. <a href="/contact">Talk to us</a> for a custom quote.</div>`);
    } catch (err) { toast(err.message, 'err'); if (err.details) showFieldErrors(form, err.details); } finally { btn.classList.remove('is-loading'); }
  });
}
