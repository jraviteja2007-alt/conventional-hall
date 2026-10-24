import { html, setHTML, $, $$, icon, inr, num, img, fmtDate, fmtTime, toast, track, openLightbox, showFieldErrors, todayISO } from '../ui.js';
import { S } from '../store.js';
import { get, post } from '../api.js';
import { sectionHead, facilityCard, eventCard, packageCard, reviewCard, hallCard, waLink, telLink, mapsDir, mapsEmbed, mapsNear } from '../components.js';
import { mountCoverflow, nextDays, qsOf } from '../helpers.js';
import { CONVENTION_SPACES, IMG } from '../images.js';

export default async function home(ctx) {
  const [fac, pk, gal, rev] = await Promise.all([
    get('/api/facilities'),
    get('/api/packages'),
    get('/api/gallery'),
    get('/api/reviews').catch(() => ({ reviews: [], summary: { count: 0 } })),
  ]);

  const s = S.site;
  const halls = S.halls;
  const h0 = halls[0];

  ctx.meta(`${s.name} | Convention Hall & Wedding Venue in ${s.city || 'Tangutur'}`, `${s.name}: ${s.tagline}. Check live availability, compare halls and packages and book online.`);

  const words = String(s.tagline || 'Celebrate Your Moments in Style').split(' ');
  const cut = Math.ceil(words.length / 2);
  const maxCap = Math.max(...halls.map((h) => h.max_guests), 1500);
  const area = Math.round(halls.reduce((a, h) => a + (h.area_sqm || 0), 1115));
  const packages = pk.packages.filter((p) => p.tier !== 'custom').sort((a, b) => b.is_featured - a.is_featured || a.sort_order - b.sort_order).slice(0, 3);
  const gItems = gal.items.filter((i) => !i.before_url);
  const rating = rev.summary;
  const reviews = rev.reviews.slice(0, 3);

  const flips = [
    ['1,500+', 'Guests floating capacity', 'Flagship 12,000 sq.ft pillarless viewing auditorium designed for grand South Indian weddings & receptions.'],
    ['100%', 'Central Chilled AC', 'Continuous high-tonnage climate control across main auditorium, dining hall, and bridal guest suites.'],
    ['120+ Cars', 'Secure Parking Bays', 'Ample paved parking for 120+ four-wheelers and 300+ two-wheelers with dedicated portico valet drop-off.'],
    ['125 kVA', 'Silent Power Backup', '100% uninterrupted generator power backup with instantaneous changeover for stage, sound & AC.'],
  ];

  // High-res Unsplash convention hall spaces for the hero stage (Zero 3D lag)
  const heroSpaces = [
    { name: 'Grand Mandapam', img: CONVENTION_SPACES[0].image, tag: 'Grand Kalyana Mandapam · 1,500 Guests' },
    { name: 'Pillarless Auditorium', img: CONVENTION_SPACES[1].image, tag: 'Pillarless Royal Auditorium · 12,000 Sq.Ft' },
    { name: 'Annapoorna Dining', img: CONVENTION_SPACES[4].image, tag: 'Annapoorna Dining Plaza · 500 Seated Batch' },
    { name: 'AC Bridal Suites', img: CONVENTION_SPACES[6].image, tag: '8 Luxury AC Bridal & VIP Guest Suites' },
  ];

  const heroImg = CONVENTION_SPACES[0].image;

  setHTML(ctx.el, html`
  <section class="hero" aria-labelledby="h1">
    <div class="hero-bg" aria-hidden="true">${img(heroImg, '', { w: 1600, eager: true, sizes: '100vw' })}</div>
    <div class="container">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="hero-loc">${icon('pin')} ${s.city || 'Tangutur'} · Near Indian Petrol Station, Kondepi Road</span>
          <h1 id="h1">${words.slice(0, cut).join(' ')} <em>${words.slice(cut).join(' ')}</em></h1>
          <p class="lead">${s.description || 'Welcome to CVR Convention Hall, Tangutur. Experience 12,000 sq.ft of pillarless luxury, central air conditioning, 500-seater dining plaza, 8 AC suites, and 120+ vehicle highway parking.'}</p>
          <div class="hero-cta">
            <a class="btn gold lg" href="/book" data-track="book_click">Book your date</a>
            <a class="btn glass lg" href="/availability">${icon('calendar')} Check availability</a>
            <a class="btn glass lg" href="${waLink('Hello, I would like to know more about booking CVR Convention Hall.')}" target="_blank" rel="noopener noreferrer" data-track="whatsapp_click">${icon('whatsapp')} WhatsApp</a>
          </div>
        </div>
        <div class="hero-stage">
          <div class="hero-photo-box" id="hero-photo-box" role="region" aria-label="Convention Hall Spaces Preview">
            <span class="tag" id="hero-tag">${heroSpaces[0].tag}</span>
            <img id="hero-img" src="${heroSpaces[0].img}" alt="${heroSpaces[0].name}" width="1600" height="1100" loading="eager" />
            <div class="layout-chips" id="space-chips" role="group" aria-label="Convention spaces">
              ${heroSpaces.map((sp, i) => html`<button type="button" class="chip sm ${i ? '' : 'active'}" data-i="${i}" aria-pressed="${i === 0}">${sp.name}</button>`)}
            </div>
          </div>
          <div class="hero-float f1" aria-hidden="true"><b>1,500+</b>guests, one roof</div>
          <div class="hero-float f2" aria-hidden="true"><b>100% AC</b>central chilled cooling</div>
        </div>
      </div>
      <form class="qb" id="qb" novalidate aria-labelledby="qb-t">
        <h2 id="qb-t">${icon('calendar')} Check availability &amp; price</h2>
        <div class="qb-grid">
          <div class="field"><label for="qb-event">Event type</label><select class="input" id="qb-event" name="event">${S.events.map((e) => html`<option value="${e.slug}">${e.name}</option>`)}</select></div>
          <div class="field"><label for="qb-date">Date</label><input class="input" id="qb-date" name="date" type="date" min="${todayISO()}" value="${nextDays(21)}" required></div>
          <div class="field"><label for="qb-start">From</label><input class="input" id="qb-start" name="start" type="time" value="10:00" required></div>
          <div class="field"><label for="qb-end">To</label><input class="input" id="qb-end" name="end" type="time" value="18:00" required></div>
          <div class="field"><label for="qb-guests">Guests</label><input class="input" id="qb-guests" name="guests" type="number" min="1" max="20000" value="500" inputmode="numeric" required></div>
          <button class="btn lg" type="submit">Check now</button>
        </div>
        <div class="qb-result" id="qb-result" aria-live="polite"></div>
      </form>
    </div>
  </section>

  <section class="section"><div class="container">
    <div class="grid g4 perspective">${flips.map(([big, lab, back]) => html`<div class="flip reveal" tabindex="0" role="group" aria-label="${lab}"><div class="flip-in"><div class="flip-f"><span class="big">${big}</span><b>${lab}</b><span class="caption">Hover or focus for details</span></div><div class="flip-b">${back}</div></div></div>`)}</div>
  </div></section>

  <section class="section alt" id="about"><div class="container split">
    <div class="reveal"><span class="eyebrow">About us</span><h2>A royal landmark designed around your celebration</h2><p class="lead">Strategically located on Kondepi Road near the Indian Petrol Station in Tangutur, CVR Convention Hall blends modern architectural grandeur with traditional hospitality.</p>
      <ul class="ticks">
        <li>${icon('check')} 12,000 sq.ft pillar-free viewing auditorium for up to 1,500 guests</li>
        <li>${icon('check')} 100% central chilled-water air conditioning throughout</li>
        <li>${icon('check')} 500-seater hygienic dining plaza with commercial steam kitchen</li>
        <li>${icon('check')} 8 luxury air-conditioned bridal & VIP guest suites</li>
        <li>${icon('check')} 120+ cars & 300+ two-wheelers secure parking with valet space</li>
        <li>${icon('check')} 125 kVA silent generator backup with zero blackout transition</li>
      </ul>
      <div class="row" style="margin-top:20px"><a class="btn" href="/about">Our story</a><a class="btn ghost" href="/contact">Plan a site visit</a><a class="btn ghost" href="${telLink()}" data-track="call_click">${icon('phone')} ${s.phone}</a></div></div>
    <div class="collage" aria-hidden="false">
      <div class="c1" data-depth="0.05">${img(IMG.mandapam, 'Grand Wedding Mandapam Stage', { w: 800, sizes: '(max-width:900px) 70vw, 30vw' })}</div>
      <div class="c2" data-depth="-0.05">${img(IMG.stage, 'Designer Reception Stage', { w: 700, sizes: '(max-width:900px) 50vw, 20vw' })}</div>
      <div class="c3" data-depth="0.08">${img(IMG.canopyCouple, 'Wedding ritual celebration', { w: 600, sizes: '(max-width:900px) 40vw, 18vw' })}</div>
    </div>
  </div></section>

  <section class="section"><div class="container">${sectionHead('Our halls', 'Choose the right space for your guest list', 'Every hall is air-conditioned and comes with stage, dining, guest rooms, and 125 kVA power backup.')}
    <div class="grid" style="gap:28px">${halls.map((h, i) => hallCard(h, i))}</div></div></section>

  <section class="section dark" style="overflow:hidden"><div class="parallax-layer orb" data-depth="0.12" style="width:380px;height:380px;right:-80px;top:40px" aria-hidden="true"></div>
    <div class="container">${sectionHead('Facilities', 'Everything you need, under one roof', 'From centralised AC to a commercial steam kitchen and 125 kVA generator backup, nothing is left to chance.')}
      <div class="grid g4 perspective">${fac.facilities.filter((f) => f.is_featured).slice(0, 8).map((f, i) => facilityCard(f, i))}</div>
      <div class="center" style="margin-top:34px"><a class="btn gold" href="/facilities">All facilities</a></div></div></section>

  <section class="section"><div class="container">${sectionHead('Events we host', 'Every kind of celebration', 'Weddings to conferences, birthdays to cultural evenings. Choose your event to start booking.')}
    <div class="grid g4 perspective">${S.events.filter((e) => !e.is_other).slice(0, 8).map((e, i) => eventCard(e, i))}</div></div></section>

  <section class="section alt"><div class="container">${sectionHead('Packages', 'Clear bundles, honest prices', 'Pick a ready package or build your own. The booking page shows the full price with GST before you pay.')}
    <div class="grid g3 perspective">${packages.map((p, i) => packageCard(p, i))}</div>
    <div class="center" style="margin-top:34px"><a class="btn ghost" href="/packages">Compare all packages</a></div></div></section>

  ${gItems.length > 2 ? html`<section class="section dark"><div class="container">${sectionHead('Gallery', 'A look inside', 'Real moments from our halls, decorations and events.', true)}</div>
    <div class="coverflow" id="cf" tabindex="0"></div><div class="center" style="margin-top:30px"><a class="btn gold" href="/gallery">View full gallery</a></div></section>` : ''}

  ${reviews.length ? html`<section class="section"><div class="container">${sectionHead('Testimonials', 'Loved by hosts and guests', rating.count ? `Rated ${rating.average} out of ${rating.scale} from ${rating.count} reviews.` : '5.0★ rating by families across Prakasam district.')}
    <div class="grid g3 perspective">${reviews.map((r, i) => reviewCard(r, i))}</div></div></section>` : ''}

  <section class="section alt"><div class="container split">
    <div class="reveal"><span class="eyebrow">Find us</span><h2>Easy to reach, easy to park</h2>
      <p class="lead">${s.address}</p><p class="muted">${s.opening_hours || 'Daily, 8:00 AM – 10:00 PM for site visits and enquiries'}</p>
      <div class="row"><a class="btn" href="${mapsDir()}" target="_blank" rel="noopener noreferrer">${icon('pin')} Get directions</a><a class="btn ghost" href="${telLink()}" data-track="call_click">${icon('phone')} ${s.phone}</a></div>
      <p class="caption" style="margin-top:18px">Nearby: ${[['hotels', 'Hotels'], ['restaurants', 'Restaurants'], ['hospitals', 'Hospitals'], ['ATM', 'ATMs']].map(([q, l]) => html`<a href="${mapsNear(q)}" target="_blank" rel="noopener noreferrer">${l}</a>`).map((x, i) => html`${i ? ' · ' : ''}${x}`)}</p></div>
    <div class="map-box reveal"><iframe class="map-frame" title="Map showing the location of ${s.name}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapsEmbed()}"></iframe></div>
  </div></section>

  <section class="section"><div class="container"><div class="cta reveal"><span class="layer" style="width:420px;height:420px;right:-120px;top:-160px"></span><span class="layer" style="width:260px;height:260px;right:80px;bottom:-140px"></span>
    <span class="eyebrow" style="color:#f1d9a0">Ready when you are</span><h2>Let us host your next celebration</h2><p class="lead" style="color:#f2e6ea;max-width:52ch">Check your date in seconds, or talk to our team for a site visit and a custom quotation.</p>
    <div class="row" style="margin-top:22px"><a class="btn gold lg" href="/book" data-track="book_click">Book now</a><a class="btn glass lg" href="/contact">Request a callback</a><a class="btn glass lg" href="${telLink()}" data-track="call_click">${icon('phone')} Call us</a></div></div></div></section>`);

  /* ---- Interactive Hero Photo Switcher (No 3D, fast & responsive) ---- */
  const heroImgEl = $('#hero-img');
  const heroTagEl = $('#hero-tag');
  $('#space-chips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const idx = Number(b.dataset.i);
    const item = heroSpaces[idx];
    if (!item) return;
    $$('#space-chips .chip').forEach((c) => {
      const active = c === b;
      c.classList.toggle('active', active);
      c.setAttribute('aria-pressed', String(active));
    });
    if (heroImgEl) {
      heroImgEl.style.opacity = '0.4';
      setTimeout(() => {
        heroImgEl.src = item.img;
        heroImgEl.alt = item.name;
        heroImgEl.style.opacity = '1';
      }, 80);
    }
    if (heroTagEl) {
      heroTagEl.textContent = item.tag;
    }
  });

  /* ---- Coverflow Gallery ---- */
  const cf = $('#cf');
  if (cf) {
    const off = mountCoverflow(cf, gItems.slice(0, 9), {
      onOpen: (i) => openLightbox(gItems.slice(0, 9), i),
    });
    ctx.onCleanup(() => off?.());
  }

  /* ---- Quick Booking Widget ---- */
  const form = $('#qb');
  const out = $('#qb-result');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const errs = {};
    if (!f.date || f.date < todayISO()) errs.date = 'Choose a future date';
    if (!f.start) errs.start = 'Required';
    if (!f.end || f.end <= f.start) errs.end = 'End after start';
    const guests = Number(f.guests);
    if (!guests || guests < 1) errs.guests = 'Required';
    if (showFieldErrors(form, errs)) return;

    const btn = $('[type=submit]', form);
    btn?.classList.add('is-loading');
    track('availability_check');
    setHTML(out, html`<div class="skeleton" style="height:64px"></div>`);

    const rows = await Promise.all(
      halls.map(async (h) => {
        if (guests > h.max_guests) return { h, state: 'cap', msg: `Holds up to ${num(h.max_guests)} guests` };
        if (guests < h.min_guests) return { h, state: 'min', msg: `Best for ${num(h.min_guests)}+ guests` };
        try {
          const [av, q] = await Promise.all([
            get(`/api/availability/check${qsOf({ hall: h.id, date: f.date, start: f.start, end: f.end })}`),
            post('/api/pricing/quote', { hallId: h.id, date: f.date, start: f.start, end: f.end, guests }).catch((x) => ({ err: x.message })),
          ]);
          return { h, state: av.available ? 'ok' : 'no', av, q: q.quote, err: q.err };
        } catch (x) {
          return { h, state: 'err', msg: x.message };
        }
      })
    );

    btn?.classList.remove('is-loading');
    const link = (h) => `/book${qsOf({ event: f.event, hall: h.id, date: f.date, start: f.start, end: f.end, guests })}`;

    setHTML(
      out,
      html`<p class="caption" style="margin:0">${fmtDate(f.date)} · ${fmtTime(f.start)} – ${fmtTime(f.end)} · ${num(guests)} guests</p>
      ${rows.map((r) => html`
        <div class="qb-res ${r.state === 'ok' ? 'ok' : 'no'}">
          <div>
            <b>${r.h.name}</b>
            <div class="caption">${r.state === 'ok' ? (r.q ? `Estimated ${inr(r.q.total)} incl. GST (hall only, before add-ons)` : r.err || '') : r.state === 'no' ? 'Not available for these hours. Try another slot or hall.' : r.msg}</div>
          </div>
          <div class="row">
            ${r.state === 'ok'
              ? html`<span class="badge success">${icon('check')} Available${r.av.pendingRequests ? ' · requests pending' : ''}</span><a class="btn sm" href="${link(r.h)}" data-track="book_click">Book this hall</a>`
              : r.state === 'no'
              ? html`<span class="badge error">Booked</span><a class="btn sm ghost" href="/availability?hall=${r.h.id}&date=${f.date}">See other dates</a>`
              : html`<span class="badge neutral">Not suitable</span>`}
          </div>
        </div>
      `)}`
    );
  });
}
