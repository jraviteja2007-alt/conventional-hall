import { html, setHTML, icon, num, img } from '../ui.js';
import { S } from '../store.js';
import { get } from '../api.js';
import { pageHero, sectionHead, reviewCard, telLink } from '../components.js';
import { IMG } from '../images.js';

export default async function about(ctx) {
  const rev = await get('/api/reviews').catch(() => ({ reviews: [], summary: { count: 0 } }));
  const s = S.site; const halls = S.halls;
  ctx.meta(`About ${s.name}`, `Learn about ${s.name} in ${s.city}: our story, values, halls and the team behind your celebration.`);
  const maxCap = Math.max(0, ...halls.map((h) => h.max_guests)); const area = Math.round(halls.reduce((a, h) => a + (h.area_sqm || 0), 0));
  const stats = [[String(halls.length), halls.length === 1 ? 'Hall' : 'Halls'], [num(maxCap), 'Max guests'], [`${num(area)} m²`, 'Event space'], [rev.summary.count ? `${rev.summary.average}★` : S.events.length, rev.summary.count ? `${rev.summary.count} reviews` : 'Event types']];
  const values = [['heart', 'Care for every family', 'We treat each event as if it were our own family function.'], ['tag', 'Honest pricing', 'GST and every charge are shown before you pay.'], ['shield', 'Safe and secure', 'CCTV, trained security, generator backup and fire safety.'], ['users', 'One coordinator', 'A single point of contact from enquiry to send-off.']];
  setHTML(ctx.el, html`
  ${pageHero({ title: `About ${s.name}`, sub: s.tagline, crumbs: [{ label: 'About' }], image: halls[0]?.hero_image || IMG.chandelierHall })}
  <section class="section"><div class="container split">
    <div class="reveal"><span class="eyebrow">Our story</span><h2>Built for the moments that matter</h2><p class="lead">${s.about}</p>
      <p class="muted">Located in ${s.city}, we bring together elegant spaces, in-house services and a team that has hosted weddings, receptions, conferences and cultural evenings for families and companies across the region.</p>
      <div class="row" style="margin-top:18px"><a class="btn" href="/halls">Explore our halls</a><a class="btn ghost" href="/contact">Plan a site visit</a></div></div>
    <div class="collage">
      <div class="c1" data-depth="0.05">${img(halls[0]?.hero_image || IMG.banquetRound, 'Main hall interior', { w: 800, sizes: '(max-width:900px) 70vw, 30vw' })}</div>
      <div class="c2" data-depth="-0.05">${img(halls[1]?.hero_image || IMG.floralHall, 'Decorated hall', { w: 700, sizes: '(max-width:900px) 50vw, 20vw' })}</div>
      <div class="c3" data-depth="0.08">${img(IMG.canopyCouple, 'Couple under a floral canopy', { w: 600, sizes: '(max-width:900px) 40vw, 18vw' })}</div>
    </div></div></section>
  <section class="section alt"><div class="container"><div class="grid g4 perspective">${stats.map(([b, l]) => html`<div class="card a-stat reveal" data-tilt="8"><b>${b}</b><span class="muted">${l}</span></div>`)}</div></div></section>
  <section class="section"><div class="container">${sectionHead('Our values', 'What you can expect from us', '', true)}
    <div class="grid g4 perspective">${values.map(([ic, t, d], i) => html`<article class="card fac-card shine reveal" data-d="${i}" data-tilt="8"><div class="ico pop">${icon(ic)}</div><h3 class="pop">${t}</h3><p>${d}</p></article>`)}</div></div></section>
  ${rev.reviews.length ? html`<section class="section alt"><div class="container">${sectionHead('Kind words', 'From the families we have hosted')}<div class="grid g3 perspective">${rev.reviews.slice(0, 3).map((r, i) => reviewCard(r, i))}</div></div></section>` : ''}
  <section class="section"><div class="container"><div class="cta reveal"><span class="eyebrow" style="color:#f1d9a0">Let us talk</span><h2>Come and see the venue</h2>
    <div class="row" style="margin-top:20px"><a class="btn gold lg" href="/book" data-track="book_click">Book now</a><a class="btn glass lg" href="/contact">Request a callback</a><a class="btn glass lg" href="${telLink()}" data-track="call_click">${icon('phone')} Call us</a></div></div></div></section>`);
}
