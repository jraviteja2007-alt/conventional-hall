import { html, setHTML, $, $$, icon, inr, num, img, openLightbox } from '../ui.js';
import { S } from '../store.js';
import { get } from '../api.js';
import { sectionHead, facilityCard, eventCard, packageCard, reviewCard, hallCard, waLink, telLink, mapsDir, mapsEmbed, mapsNear } from '../components.js';
import { mountCoverflow } from '../helpers.js';
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

  // High-res authentic convention spaces for the hero stage with auto-slideshow
  const heroSpaces = [
    { name: 'Grand Mandapam', img: '/images/hero_mandapam.jpg', tag: 'Grand Kalyana Mandapam · 1,500 Guests' },
    { name: 'Royal Auditorium', img: '/images/grand_auditorium.jpg', tag: 'Pillarless Royal Auditorium · 12,000 Sq.Ft' },
    { name: 'Reception Stage', img: '/images/reception_stage.jpg', tag: 'Imperial Reception Stage · 40-ft LED Backdrop' },
    { name: 'Annapoorna Dining', img: '/images/dining_hall.jpg', tag: 'Annapoorna Dining Plaza · 500 Seated Batch' },
    { name: 'Royal Buffet', img: '/images/dining_buffet.jpg', tag: 'Deluxe Banquet & Live Catering Setup' },
    { name: 'AC Bridal Suites', img: '/images/bridal_suite.jpg', tag: '8 Luxury AC Bridal & VIP Guest Suites' },
    { name: 'Muhurtham Decor', img: '/images/royal_mandapam_decor.jpg', tag: 'Traditional Telugu Muhurtham Mandapam' },
    { name: 'Luxury Ballroom', img: '/images/luxury_ballroom.jpg', tag: 'Grand Chandelier Banquet Ballroom' },
    { name: 'Campus & Parking', img: '/images/exterior_facade.jpg', tag: 'Highway Campus · 120+ Cars Parking' },
  ];

  const heroImg = '/images/hero_mandapam.jpg';

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
            <img id="hero-img" src="${heroSpaces[0].img}" alt="${heroSpaces[0].name}" width="1600" height="1100" loading="eager" />
            <button type="button" class="hero-nav-btn prev" id="hero-prev" aria-label="Previous photo">&#8249;</button>
            <button type="button" class="hero-nav-btn next" id="hero-next" aria-label="Next photo">&#8250;</button>
            <div class="hero-progress" id="hero-progress"></div>
            <div class="hero-dots" id="hero-dots" role="tablist" aria-label="Slideshow pagination">
              ${heroSpaces.map((_, i) => html`<button type="button" class="hero-dot ${i ? '' : 'active'}" data-i="${i}" aria-label="Photo ${i + 1}" role="tab" aria-selected="${i === 0}"></button>`)}
            </div>
          </div>
          <div class="hero-float f1" aria-hidden="true"><b>1,500+</b>guests, one roof</div>
          <div class="hero-float f2" aria-hidden="true"><b>100% AC</b>central chilled cooling</div>
        </div>
      </div>
    </div>
  </section>

  <section class="section"><div class="container">
    <div class="grid g4 perspective">${flips.map(([big, lab, back]) => html`<div class="flip reveal" tabindex="0" role="group" aria-label="${lab}"><div class="flip-in"><div class="flip-f"><span class="big">${big}</span><b>${lab}</b><span class="caption">Hover or focus for details</span></div><div class="flip-b">${back}</div></div></div>`)}</div>
  </div></section>

  <!-- ======================== IMPROVED ABOUT SECTION (TAGGED IMAGE AREA) ======================== -->
  <section class="section alt" id="about"><div class="container split">
    <div class="reveal">
      <span class="eyebrow">About us</span>
      <h2>A royal landmark designed around your celebration</h2>
      <p class="lead">Strategically located on Kondepi Road near the Indian Petrol Station in Tangutur, CVR Convention Hall blends modern architectural grandeur with traditional hospitality.</p>
      <ul class="ticks">
        <li>${icon('check')} <span>12,000 sq.ft pillar-free viewing auditorium for up to 1,500 guests</span></li>
        <li>${icon('check')} <span>100% central chilled-water air conditioning throughout</span></li>
        <li>${icon('check')} <span>500-seater hygienic dining plaza with commercial steam kitchen</span></li>
        <li>${icon('check')} <span>8 luxury air-conditioned bridal &amp; VIP guest suites</span></li>
        <li>${icon('check')} <span>120+ cars &amp; 300+ two-wheelers secure parking with valet space</span></li>
        <li>${icon('check')} <span>125 kVA silent generator backup with zero blackout transition</span></li>
      </ul>
      <div class="row" style="margin-top:24px">
        <a class="btn" href="/about">Our story</a>
        <a class="btn ghost" href="/contact">Plan a site visit</a>
        <a class="btn ghost" href="${telLink()}" data-track="call_click">${icon('phone')} ${s.phone}</a>
      </div>
    </div>
    <div class="collage" aria-hidden="false">
      <div class="c1" data-depth="0.05"><img src="/images/exterior_facade.jpg" alt="CVR Convention Hall Tangutur Exterior Campus" loading="lazy" /></div>
      <div class="c2" data-depth="-0.05"><img src="/images/reception_stage.jpg" alt="Grand Reception Stage" loading="lazy" /></div>
      <div class="c3" data-depth="0.08"><img src="/images/entrance_lobby.jpg" alt="Imperial Entrance Chandelier Lobby" loading="lazy" /></div>
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

  /* ---- Auto-changing Hero Photo Carousel ---- */
  let curIndex = 0;
  let autoTimer = null;
  const INTERVAL_MS = 3800;
  const heroBox = $('#hero-photo-box', ctx.el);
  const heroImgEl = $('#hero-img', ctx.el);
  const heroProgressBar = $('#hero-progress', ctx.el);
  const dotsContainer = $('#hero-dots', ctx.el);

  // Preload all space images in browser cache for instantaneous transitions
  heroSpaces.forEach((s) => {
    const im = new Image();
    im.src = s.img;
  });

  function setSpace(idx) {
    curIndex = (idx + heroSpaces.length) % heroSpaces.length;
    const item = heroSpaces[curIndex];
    if (!item) return;

    // Update active dot without any scroll or layout shift
    const dots = $$('#hero-dots .hero-dot', ctx.el);
    dots.forEach((d, i) => {
      const active = i === curIndex;
      d.classList.toggle('active', active);
      d.setAttribute('aria-selected', String(active));
    });

    // Cross-fade image smoothly
    if (heroImgEl) {
      heroImgEl.style.opacity = '0.35';
      setTimeout(() => {
        heroImgEl.src = item.img;
        heroImgEl.alt = item.name;
        heroImgEl.style.opacity = '1';
      }, 70);
    }

    resetAutoPlay();
  }

  function startProgress() {
    if (!heroProgressBar) return;
    heroProgressBar.style.transition = 'none';
    heroProgressBar.style.width = '0%';
    setTimeout(() => {
      heroProgressBar.style.transition = `width ${INTERVAL_MS}ms linear`;
      heroProgressBar.style.width = '100%';
    }, 20);
  }

  function resetAutoPlay() {
    clearInterval(autoTimer);
    startProgress();
    autoTimer = setInterval(() => {
      setSpace(curIndex + 1);
    }, INTERVAL_MS);
  }

  // Click on dots
  dotsContainer?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    setSpace(Number(b.dataset.i));
  });

  // Prev / Next arrow buttons
  $('#hero-prev', ctx.el)?.addEventListener('click', (e) => {
    e.stopPropagation();
    setSpace(curIndex - 1);
  });
  $('#hero-next', ctx.el)?.addEventListener('click', (e) => {
    e.stopPropagation();
    setSpace(curIndex + 1);
  });

  // Pause on hover, resume on leave
  heroBox?.addEventListener('mouseenter', () => {
    clearInterval(autoTimer);
    if (heroProgressBar) heroProgressBar.style.width = '0%';
  });
  heroBox?.addEventListener('mouseleave', () => {
    resetAutoPlay();
  });

  // Touch swipe support on mobile devices
  let touchStartX = 0;
  heroBox?.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  heroBox?.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diff) > 40) {
      setSpace(diff > 0 ? curIndex - 1 : curIndex + 1);
    }
  }, { passive: true });

  // Start auto-play initially
  resetAutoPlay();
  ctx.onCleanup(() => {
    clearInterval(autoTimer);
  });

  /* ---- Coverflow Gallery ---- */
  const cf = $('#cf');
  if (cf) {
    const off = mountCoverflow(cf, gItems.slice(0, 9), {
      onOpen: (i) => openLightbox(gItems.slice(0, 9), i),
    });
    ctx.onCleanup(() => off?.());
  }
}

