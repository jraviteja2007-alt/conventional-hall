import { html, setHTML, $, $$, icon, inr, num, img, fmtDate, fmtTime, toast, track, openLightbox, showFieldErrors, todayISO } from '../ui.js';
import { S } from '../store.js';
import { get, post } from '../api.js';
import { sectionHead, waLink, telLink, mapsDir, mapsEmbed, mapsNear } from '../components.js';
import { nextDays, qsOf } from '../helpers.js';
import { CONVENTION_SPACES, GALLERY_ITEMS, IMG } from '../images.js';

export default async function home(ctx) {
  const [fac, pk, rev] = await Promise.all([
    get('/api/facilities').catch(() => ({ facilities: [] })),
    get('/api/packages').catch(() => ({ packages: [] })),
    get('/api/reviews').catch(() => ({ reviews: [], summary: { count: 0 } })),
  ]);

  const s = S.site;
  const phone = s.phone || '+91 94402 58592';
  const address = s.address || 'Near Indian Petrol Station, Kondepi Road, Tangutur, Prakasam Dt., AP 523274';

  ctx.meta(
    'CVR Convention Hall Tangutur | Luxury Wedding & Banquet Venue in Prakasam',
    'Experience royal celebrations at CVR Convention Hall, Tangutur, Prakasam Dt. Featuring 1,500-guest capacity, 100% central AC, 500-seater dining plaza, 8 AC suites, and parking for 120+ cars near Indian Petrol Station.'
  );

  // Curated authentic CVR hall spaces for the showcase
  const hallSpaces = [
    {
      id: 'mandapam',
      name: 'Grand Kalyana Mandapam (Royal Hall)',
      badge: 'Most Popular',
      image: '/images/hero_mandapam.jpg',
      area: '12,000 Sq.Ft',
      dimensions: '120 ft x 100 ft',
      height: '24 Feet High',
      seating: '950 Guests Seated',
      floating: 'Up to 1,500 Floating',
      dining: '500 Seated Batch',
      parking: '120 Cars + 300 Bikes',
      rooms: '4 Deluxe AC Suites Included',
      price: '₹1,85,000',
      description: 'Our flagship 12,000 sq.ft pillar-free auditorium designed for spectacular South Indian weddings. Equipped with high-tonnage central chilled-water AC, acoustic soundproofing, 45-foot elevated mandapam stage, royal crystal chandeliers, and polished Italian marble flooring.',
      amenities: [
        'Pillarless Panoramic Viewing for All Guests',
        '45ft x 22ft Elevated Mandapam Stage with Rigging',
        'Continuous 100% Central Chilled AC',
        '125 kVA Silent Generator Zero Blackout Backup',
        'Grand Portico Valet Drop-off Zone',
        'Dedicated VIP Bridal Dressing Rooms Attached',
      ],
      bookUrl: '/book?hall=1',
    },
    {
      id: 'banquet',
      name: 'Sannidhi Mini AC Banquet Hall',
      badge: 'Intimate Luxury',
      image: '/images/mini_hall.jpg',
      area: '4,100 Sq.Ft',
      dimensions: '80 ft x 52 ft',
      height: '18 Feet High',
      seating: '300 Guests Seated',
      floating: 'Up to 450 Floating',
      dining: '200 Seated Batch',
      parking: '40 Cars + 120 Bikes',
      rooms: '2 AC Suites Included',
      price: '₹75,000',
      description: 'An elegant, intimate air-conditioned banquet hall created for engagements, sangeet, half-saree ceremonies, birthdays, and corporate seminars, complete with its own dedicated dining area and private entrance.',
      amenities: [
        'Independent Climate-Controlled Central AC',
        'Integrated Audio System & Wireless Microphones',
        'Private Dedicated Dining Hall Adjacent',
        'Direct Ground-Floor Accessible Entrance',
        'Bridal Green Room with Attached Bathroom',
        'Full 125 kVA Silent Generator Backup',
      ],
      bookUrl: '/book?hall=2',
    },
    {
      id: 'dining',
      name: 'Annapoorna Royal Dining & Lawn Plaza',
      badge: 'Grand Feast',
      image: '/images/dining_hall.jpg',
      area: '7,500 Sq.Ft',
      dimensions: '100 ft x 75 ft',
      height: '16 Feet High',
      seating: '500 Guests Seated',
      floating: 'Continuous Batch Service',
      dining: '500 Seated Per Batch',
      parking: 'Shared Campus Parking',
      rooms: 'Kitchen Restrooms Included',
      price: 'Included with Mandapam',
      description: 'Spacious, ultra-hygienic dining plaza with separate serving lanes for vegetarian and non-vegetarian traditional banana-leaf feasts or modern multi-cuisine buffet counters, supported by a heavy-duty commercial steam kitchen.',
      amenities: [
        'Commercial Steam Boiling & Gas Pipelines',
        'Separate Veg & Non-Veg Kitchen Preparation Bays',
        'Hand-Wash Stations with 24/7 RO Purified Water',
        'Granite Tables & Ergonomic Stainless Seating',
        'Rapid Air Exchange Ventilation System',
        'Adjacent Paved Lawn for Open-Air Buffet Counters',
      ],
      bookUrl: '/book?hall=1',
    },
  ];

  // Curated authentic CVR packages
  const packages = [
    {
      id: 'silver',
      name: 'Silver Classic Package',
      tagline: 'Budget-Friendly Essential Rental',
      tier: 'Essential',
      price: '₹65,000',
      capacity: 'Up to 500 Guests',
      slot: 'Morning or Evening Slot',
      image: '/images/sangeet_stage.jpg',
      highlights: [
        'Standard Stage Lighting & Sound System',
        '100% Central AC Cooling Throughout Event',
        '2 AC Green Rooms with Attached Baths',
        '125 kVA Silent Generator Power Backup',
        'Paved Parking for 120+ Vehicles',
        'Venue Maintenance & Cleaning Crew',
      ],
      url: '/book?package=2',
    },
    {
      id: 'gold',
      name: 'Gold Grandeur Package',
      tagline: 'Complete Day Celebration',
      tier: 'Most Popular',
      price: '₹1,25,000',
      capacity: 'Up to 1,000 Guests',
      slot: 'Full Day (24-Hour Rental)',
      image: '/images/reception_stage.jpg',
      popular: true,
      highlights: [
        'Everything in Silver Package Included',
        '4 Luxury AC Suites for Bride & Groom Families',
        'Designer Floral Reception Stage Backdrop',
        'Commercial Steam Kitchen & Dining Arena Access',
        'Dedicated Parking Attendants & Security',
        'Sound & Lighting Technician On-Site',
      ],
      url: '/book?package=3',
    },
    {
      id: 'royal',
      name: 'Royal Vivaha Imperial Package',
      tagline: '2-Day Grand South Indian Wedding',
      tier: 'Luxury All-Inclusive',
      price: '₹2,10,000',
      capacity: 'Up to 1,500+ Guests',
      slot: '2 Days / 48 Hours Complete Campus',
      image: '/images/hero_mandapam.jpg',
      highlights: [
        'Complete Campus Access (Both Halls + Lawn)',
        'All 8 Luxury AC Bridal & Guest Suites',
        'Full Mandapam & Stage Truss Lighting Rigging',
        'Commercial Steam Kitchen with LPG Infrastructure',
        'Valet Parking Portico Management',
        'Generator Fuel Included for Entire Event Duration',
      ],
      url: '/book?package=4',
    },
  ];

  // Authentic CVR reviews
  const reviews = [
    {
      name: 'K. Venkata Rao',
      location: 'Tangutur',
      event: 'Daughter’s Grand Wedding',
      rating: 5,
      body: 'The 12,000 sq.ft pillarless auditorium gave all 1,200 of our guests an unobstructed view of the Kalyana Mandapam. The central chilled AC was ice-cold even in peak May heat, and the 8 AC guest suites made it very comfortable for both families.',
    },
    {
      name: 'S. Rajesh Chowdary',
      location: 'Ongole',
      event: 'Reception & Sangeet',
      rating: 5,
      body: 'The 500-seater dining plaza and commercial steam kitchen made our catering effortless. Ample paved parking for our guests arriving from Ongole and Singarayakonda along the NH16 corridor. Highly recommended!',
    },
    {
      name: 'M. Srinivasulu',
      location: 'Kondepi',
      event: 'Half-Saree Ceremony',
      rating: 5,
      body: 'Booked the Sannidhi Mini AC hall. Pristine maintenance, crystal-clear sound acoustics, and uninterrupted power with their 125 kVA generator. The management was very transparent with pricing.',
    },
  ];

  setHTML(
    ctx.el,
    html`
    <!-- ================================================================ HERO -->
    <section class="hero" id="hero" aria-labelledby="h1">
      <div class="hero-bg" id="hero-bg" aria-hidden="true">
        <img id="hero-bg-img" src="/images/hero_mandapam.jpg" alt="CVR Convention Hall Tangutur" width="1920" height="1080" fetchpriority="high" />
      </div>
      <div class="container">
        <div style="max-width: 820px; z-index: 2; position: relative;">
          <div class="hero-loc">
            ${icon('sparkles')}
            <span>Tangutur's Premier Convention Landmark (Near Indian Petrol Station)</span>
          </div>
          <h1 id="h1">Celebrate Your Grand Moments in <em>Royal Splendor</em></h1>
          <p class="lead">
            Welcome to <b>CVR Convention Hall</b> at Tangutur. Experience 12,000 sq.ft of pillarless luxury, central chilled air-conditioning, 500-seater dining plaza, 8 AC suites, and 120+ vehicle highway parking.
          </p>

          <div style="margin: 14px 0 20px; display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem; color: #f5e7c4;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399; display: inline-block;"></span>
            <span>Viewing:</span>
            <b id="space-title" style="color: #fff;">Grand Kalyana Mandapam</b>
            <span id="space-subtitle" style="color: #cfc6d6; font-size: 0.8rem;">(Flagship Royal Mandapam Stage)</span>
          </div>

          <div class="row" style="gap: 10px; margin-bottom: 24px;">
            <span class="badge" style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2);">${icon('pin')} Kondepi Road, Tangutur (NH16 Corridor)</span>
            <span class="badge" style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2);">${icon('shield')} Zero Double-Booking Guarantee</span>
          </div>

          <div class="hero-cta">
            <a class="btn gold lg" href="/book" data-track="book_click">${icon('calendar')} Reserve Hall Now</a>
            <a class="btn glass lg" href="#availability">${icon('clock')} Check Availability</a>
            <a class="btn glass lg" href="${waLink('Hello CVR Convention Hall, I am inquiring about booking your hall in Tangutur.')}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} WhatsApp</a>
          </div>

          <!-- 4 Modern Stat Cards in Hero -->
          <div class="hero-stats">
            <div class="hero-stat-card">
              <div class="val-row">${icon('users')} <b>1,500+</b></div>
              <span>Floating Capacity</span>
            </div>
            <div class="hero-stat-card">
              <div class="val-row">${icon('snowflake')} <b>100%</b></div>
              <span>Central AC Hall</span>
            </div>
            <div class="hero-stat-card">
              <div class="val-row">${icon('car')} <b>120+</b></div>
              <span>Car Parking Bays</span>
            </div>
            <div class="hero-stat-card">
              <div class="val-row">${icon('zap')} <b>125 kVA</b></div>
              <span>Silent Genset Backup</span>
            </div>
          </div>

          <!-- Spaces Switcher Pills -->
          <div class="spaces-bar">
            <span class="lbl">${icon('sparkles')} Explore Convention Spaces:</span>
            <div class="spaces-pills" id="space-pills" role="tablist" aria-label="Convention Spaces">
              ${CONVENTION_SPACES.map(
                (sp, i) => html`
                <button type="button" class="pill ${i === 0 ? 'active' : ''}" data-idx="${i}" role="tab" aria-selected="${i === 0}">
                  ${sp.name}
                </button>`
              )}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================================================================ AVAILABILITY ESTIMATOR -->
    <section class="section" id="availability" style="background: var(--bg); padding-top: 50px;">
      <div class="container">
        <form class="qb" id="qb" novalidate aria-labelledby="qb-t">
          <h2 id="qb-t">${icon('calendar')} Check Live Availability &amp; Estimated Pricing</h2>
          <p class="muted" style="margin-top:-6px; margin-bottom: 16px; font-size: 0.92rem;">
            Instant real-time check for CVR Convention Hall, Tangutur. Transparent rates with GST included.
          </p>
          <div class="qb-grid">
            <div class="field">
              <label for="qb-event">Event type</label>
              <select class="input" id="qb-event" name="event">
                ${S.events.map((e) => html`<option value="${e.slug}">${e.name}</option>`)}
              </select>
            </div>
            <div class="field">
              <label for="qb-date">Date</label>
              <input class="input" id="qb-date" name="date" type="date" min="${todayISO()}" value="${nextDays(21)}" required />
            </div>
            <div class="field">
              <label for="qb-start">From</label>
              <input class="input" id="qb-start" name="start" type="time" value="09:00" required />
            </div>
            <div class="field">
              <label for="qb-end">To</label>
              <input class="input" id="qb-end" name="end" type="time" value="21:00" required />
            </div>
            <div class="field">
              <label for="qb-guests">Guests</label>
              <input class="input" id="qb-guests" name="guests" type="number" min="50" max="2000" value="700" inputmode="numeric" required />
            </div>
            <button class="btn gold lg" type="submit" style="height: 48px;">Check Now</button>
          </div>
          <div class="qb-result" id="qb-result" aria-live="polite"></div>
        </form>
      </div>
    </section>

    <!-- ================================================================ ABOUT -->
    <section class="section alt" id="about">
      <div class="container split">
        <!-- Visual Column: Layered Photos + Gold Badge -->
        <div class="about-visual reveal">
          <img class="main-img" src="/images/exterior_facade.jpg" alt="CVR Convention Hall Tangutur Campus" width="800" height="600" loading="lazy" />
          <img class="floating-img" src="/images/reception_stage.jpg" alt="Designer Wedding Stage" width="400" height="250" loading="lazy" />
          <div class="top-badge">
            <b>#1</b>
            <span>Top Rated in Tangutur</span>
          </div>
        </div>

        <!-- Copy Column -->
        <div class="reveal">
          <span class="eyebrow">${icon('sparkles')} The Benchmark of Hospitality</span>
          <h2>Welcome to Tangutur's Most Prestigious Celebration Landmark</h2>
          <p class="lead" style="color: var(--text);">
            Strategically situated on Kondepi Road adjacent to the Indian Petrol Station in Tangutur, <b>CVR Convention Hall</b> was envisioned to eliminate the hassles of traditional marriage halls.
          </p>
          <p class="muted">
            We blend royal South Indian temple architecture with cutting-edge 21st-century amenities: completely pillar-free viewing angles, heavy-tonnage central chilled air-conditioning, 500-seater hygienic dining plaza, 8 hotel-grade AC suites for bridal families, and an uninterrupted 125 kVA silent generator backup.
          </p>

          <div class="about-cards">
            <div class="about-card">
              ${icon('check')}
              <span>Prime location near NH16 &amp; Tangutur Station</span>
            </div>
            <div class="about-card">
              ${icon('check')}
              <span>Paved parking for 120 cars &amp; 300 two-wheelers</span>
            </div>
            <div class="about-card">
              ${icon('check')}
              <span>Stainless steel gas pipelines &amp; steam cooking</span>
            </div>
            <div class="about-card">
              ${icon('check')}
              <span>Wheelchair accessible ramps &amp; senior-friendly</span>
            </div>
          </div>

          <div class="row" style="margin-top: 24px;">
            <a class="btn gold" href="/book" data-track="book_click">Check Open Dates</a>
            <a class="btn ghost" href="${telLink()}" data-track="call_click">${icon('phone')} Call Venue Manager</a>
          </div>
        </div>
      </div>
    </section>

    <!-- ================================================================ HALLS SHOWCASE -->
    <section class="section dark" id="halls">
      <div class="container">
        <div class="section-head center">
          <span class="eyebrow">Architectural Elegance</span>
          <h2>Explore Our Grand Event Spaces</h2>
          <p class="subheading">
            From grand 1,500-guest wedding ceremonies to corporate symposiums, explore our versatile air-conditioned halls and dining arenas in Tangutur.
          </p>
        </div>

        <!-- Hall Tabs -->
        <div class="hall-tabs" role="tablist" aria-label="Hall selection">
          ${hallSpaces.map(
            (h, i) => html`
            <button type="button" class="hall-tab-btn ${i === 0 ? 'active' : ''}" data-hall="${h.id}" role="tab" aria-selected="${i === 0}">
              <span class="dot"></span>
              <span>${h.name}</span>
            </button>`
          )}
        </div>

        <!-- Dynamic Hall Showcase Container -->
        <div id="hall-showcase-box">
          <!-- Render first hall by default -->
          ${renderHallCard(hallSpaces[0])}
        </div>
      </div>
    </section>

    <!-- ================================================================ PACKAGES -->
    <section class="section" id="packages">
      <div class="container">
        <div class="section-head center">
          <span class="eyebrow">All-Inclusive Value Bundles</span>
          <h2>Curated Event &amp; Wedding Packages</h2>
          <p class="subheading">
            Transparent, all-inclusive pricing with zero hidden surcharges. Designed for seamless celebrations from intimate engagements to grand 1,500-guest royal weddings.
          </p>
        </div>

        <div class="grid g3">
          ${packages.map(
            (p) => html`
            <article class="card pkg reveal ${p.popular ? 'featured' : ''}" style="display:flex; flex-direction:column;">
              <div class="pimg" style="aspect-ratio: 16/10; position:relative; overflow:hidden;">
                <img src="${p.image}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover;" loading="lazy" />
                <span class="badge tier-tag" style="position:absolute; top:12px; left:12px; background:rgba(0,0,0,0.6); color:#fff; backdrop-filter:blur(6px);">${p.tier}</span>
                ${p.popular ? html`<span class="ribbon" style="position:absolute; top:12px; right:12px; background:var(--accent); color:#2a2110; font-weight:700; padding:4px 10px; border-radius:999px; font-size:0.75rem;">Most Popular</span>` : ''}
              </div>
              <div class="body" style="padding: 24px; flex:1; display:flex; flex-direction:column;">
                <h3 style="margin-bottom: 4px;">${p.name}</h3>
                <p class="muted" style="font-size: 0.88rem; margin-bottom: 12px;">${p.tagline}</p>
                
                <div style="margin: 8px 0 16px;">
                  <span style="font-family:var(--ff-head); font-size:1.8rem; font-weight:700; color:var(--primary);">${p.price}</span>
                  <small class="muted" style="font-size: 0.82rem;"> / package</small>
                  <div class="caption" style="margin-top: 4px; color:var(--muted);">${p.slot} · ${p.capacity}</div>
                </div>

                <ul class="ticks" style="margin: 0 0 20px 0; font-size: 0.88rem;">
                  ${p.highlights.map((h) => html`<li>${icon('check')} <span>${h}</span></li>`)}
                </ul>

                <div style="margin-top: auto; padding-top: 14px;">
                  <a class="btn ${p.popular ? 'gold' : 'ghost'} block" href="${p.url}">Choose Package</a>
                </div>
              </div>
            </article>`
          )}
        </div>
      </div>
    </section>

    <!-- ================================================================ FACILITIES -->
    <section class="section dark" id="facilities">
      <div class="container">
        <div class="section-head center">
          <span class="eyebrow">Uncompromised Luxury</span>
          <h2>Facilities Engineered for Perfection</h2>
          <p class="subheading">
            From centralised chilled air conditioning to an industrial steam kitchen and 125 kVA generator backup, every detail has been built to perfection.
          </p>
        </div>

        <div class="grid g4">
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('snowflake')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">100% Central Chilled AC</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Heavy-tonnage central air conditioning across main auditorium, dining hall, and bridal guest suites.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('zap')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">125 kVA Silent Generator</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Automatic changeover with zero blackout guarantee ensuring stage, music, and AC never stop.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('sparkles')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">500-Seater Dining Plaza</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Massive hygienic dining space with commercial steam kitchen, gas pipelines, and continuous batch dining.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('user')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">8 Luxury AC Suites</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Private hotel-grade air-conditioned bridal and VIP suites with attached western restrooms and vanity dressing mirrors.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('car')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">120+ Car Paved Parking</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Spacious paved parking for 120+ cars and 300+ two-wheelers with a grand covered portico valet drop-off.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('sparkles')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">Acoustic Audio &amp; Lighting</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Acoustically treated auditorium walls, professional stage lighting truss, and crisp sound distribution.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('shield')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">24/7 Security &amp; CCTV</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Full-campus CCTV monitoring, fire hydrant network, and trained security personnel on duty.</p>
          </article>
          <article class="card fac-card reveal" style="background: rgba(28,26,36,0.8); border: 1px solid rgba(255,255,255,0.12); padding: 22px; border-radius: 18px;">
            <div style="color: var(--accent); margin-bottom: 12px;">${icon('check')}</div>
            <h3 style="color:#fff; font-size: 1.15rem; margin-bottom: 6px;">Wheelchair Accessible</h3>
            <p class="muted" style="font-size: 0.88rem; line-height: 1.5;">Seamless wheelchair ramps and broad entrances from the parking portico into the main hall and dining.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ================================================================ GALLERY -->
    <section class="section" id="gallery">
      <div class="container">
        <div class="section-head center">
          <span class="eyebrow">Visual Tour</span>
          <h2>CVR Convention Hall Gallery</h2>
          <p class="subheading">
            Authentic photographs of our wedding mandapams, reception stages, banquet dining, and exterior campus.
          </p>
        </div>

        <!-- Filter tabs -->
        <div class="gal-tabs" id="gal-filters" role="tablist">
          <button type="button" class="gal-tab-btn active" data-cat="all">All Photos</button>
          <button type="button" class="gal-tab-btn" data-cat="mandapam">Mandapam</button>
          <button type="button" class="gal-tab-btn" data-cat="stage">Stage &amp; Decor</button>
          <button type="button" class="gal-tab-btn" data-cat="dining">Dining &amp; Kitchen</button>
          <button type="button" class="gal-tab-btn" data-cat="suites">Suites &amp; Lounge</button>
          <button type="button" class="gal-tab-btn" data-cat="campus">Campus &amp; Facade</button>
        </div>

        <!-- Gallery Grid -->
        <div class="gal-grid" id="gal-grid">
          ${GALLERY_ITEMS.map(
            (item) => html`
            <div class="gal-item reveal" data-cat="${item.category}" tabindex="0" role="button" aria-label="${item.title}">
              <img src="${item.image}" alt="${item.title}" loading="lazy" />
              <div class="gal-item-info">
                <span class="tag">${item.categoryLabel}</span>
                <h4>${item.title}</h4>
              </div>
            </div>`
          )}
        </div>
      </div>
    </section>

    <!-- ================================================================ TESTIMONIALS -->
    <section class="section alt" id="testimonials">
      <div class="container">
        <div class="section-head center">
          <span class="eyebrow">Testimonials</span>
          <h2>Words of Love from Our Patrons</h2>
          <p class="subheading">5.0★ rating by families across Prakasam district (Tangutur, Ongole, Singarayakonda, Kondepi).</p>
        </div>

        <div class="grid g3">
          ${reviews.map(
            (r) => html`
            <div class="card quote reveal" style="padding: 28px; border-radius: 20px; background: #fff; box-shadow: var(--sh-1);">
              <div style="color: #f59e0b; margin-bottom: 12px; font-size: 1.1rem;">★★★★★</div>
              <blockquote style="margin: 0 0 18px 0; color: var(--text); font-size: 0.94rem; line-height: 1.6;">"${r.body}"</blockquote>
              <div style="border-top: 1px solid var(--line); padding-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <b style="display: block; font-size: 0.95rem;">${r.name}</b>
                  <span class="muted" style="font-size: 0.8rem;">${r.location}</span>
                </div>
                <span class="badge neutral" style="font-size: 0.75rem;">${r.event}</span>
              </div>
            </div>`
          )}
        </div>
      </div>
    </section>

    <!-- ================================================================ LOCATION & CONTACT -->
    <section class="section alt" id="contact" style="background: var(--surface);">
      <div class="container split">
        <div class="reveal">
          <span class="eyebrow">Find Us</span>
          <h2>Location, Directions &amp; Map</h2>
          <p class="lead">${address}</p>
          <p class="muted">Daily, 8:00 AM – 10:00 PM for walk-in site visits and wedding date reservations.</p>

          <div style="margin: 20px 0; display: grid; gap: 10px;">
            <div class="row" style="gap: 10px;">
              <span class="badge" style="background: var(--primary-l); color: var(--primary); font-weight: 600;">${icon('phone')} ${phone}</span>
              <span class="badge" style="background: var(--primary-l); color: var(--primary); font-weight: 600;">info@cvrconventionhall.com</span>
            </div>
            <p class="caption" style="margin-top: 8px;">
              Nearby: ${[['hotels', 'Hotels'], ['restaurants', 'Restaurants'], ['hospitals', 'Hospitals'], ['ATM', 'ATMs']]
                .map(([q, l]) => html`<a href="${mapsNear(q)}" target="_blank" rel="noopener noreferrer">${l}</a>`)
                .map((x, i) => html`${i ? ' · ' : ''}${x}`)}
            </p>
          </div>

          <div class="row" style="margin-top: 24px;">
            <a class="btn gold" href="${mapsDir()}" target="_blank" rel="noopener noreferrer">${icon('pin')} Get Driving Directions</a>
            <a class="btn ghost" href="${telLink()}" data-track="call_click">${icon('phone')} Call Now</a>
          </div>
        </div>

        <div class="map-box reveal" style="height: 380px; border-radius: 20px; overflow: hidden; box-shadow: var(--sh-2); border: 1px solid var(--line);">
          <iframe class="map-frame" title="Map showing location of CVR Convention Hall, Tangutur" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapsEmbed()}" style="width:100%; height:100%; border:0;"></iframe>
        </div>
      </div>
    </section>

    <!-- ================================================================ CTA BANNER -->
    <section class="section" style="padding-bottom: 60px;">
      <div class="container">
        <div class="cta reveal" style="background: radial-gradient(circle at 80% 20%, rgba(201,162,75,0.25), transparent 50%), linear-gradient(135deg, #4a0d1a, #1a0a14); border-radius: 28px; padding: clamp(36px, 5vw, 64px); color: #fff; box-shadow: var(--sh-3);">
          <span class="eyebrow" style="color: #f59e0b;">Ready When You Are</span>
          <h2 style="color: #fff; margin-bottom: 12px;">Plan Your Dream Event with Our Experts</h2>
          <p class="lead" style="color: #f2e6ea; max-width: 54ch; margin-bottom: 24px;">
            Check your date in seconds, or speak directly to our venue management team for a guided site tour and transparent custom quotation.
          </p>
          <div class="row" style="gap: 14px;">
            <a class="btn gold lg" href="/book" data-track="book_click">Reserve Your Date</a>
            <a class="btn glass lg" href="${telLink()}" data-track="call_click">${icon('phone')} Call +91 94402 58592</a>
            <a class="btn glass lg" href="${waLink('Hello, I would like to schedule a site visit to CVR Convention Hall.')}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} WhatsApp Us</a>
          </div>
        </div>
      </div>
    </section>
  `
  );

  /* ------------------------------------------------------------------ Interactive Hero Spaces Switcher */
  const heroImgEl = $('#hero-bg-img');
  const spaceTitleEl = $('#space-title');
  const spaceSubEl = $('#space-subtitle');

  $('#space-pills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-idx]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const item = CONVENTION_SPACES[idx];
    if (!item) return;

    $$('#space-pills .pill').forEach((p) => {
      p.classList.toggle('active', p === btn);
      p.setAttribute('aria-selected', String(p === btn));
    });

    if (heroImgEl) {
      heroImgEl.style.opacity = '0.4';
      heroImgEl.style.transition = 'opacity 0.25s ease';
      setTimeout(() => {
        heroImgEl.src = item.image;
        heroImgEl.alt = item.name;
        heroImgEl.style.opacity = '1';
      }, 200);
    }
    if (spaceTitleEl) spaceTitleEl.textContent = item.name;
    if (spaceSubEl) spaceSubEl.textContent = `(${item.subtitle})`;
  });

  /* ------------------------------------------------------------------ Interactive Hall Showcase Switcher */
  function renderHallCard(h) {
    return html`
      <div class="hall-showcase-card">
        <div class="hall-media">
          <img src="${h.image}" alt="${h.name}" loading="lazy" />
          <div class="hall-media-overlay"></div>
          <div class="hall-media-badges">
            <div class="hall-media-badge"><span class="lbl">Area</span><b>${h.area}</b></div>
            <div class="hall-media-badge"><span class="lbl">Dimensions</span><b>${h.dimensions}</b></div>
            <div class="hall-media-badge"><span class="lbl">Ceiling</span><b>${h.height}</b></div>
          </div>
        </div>
        <div class="hall-info-body">
          <div>
            <span class="badge" style="background:var(--accent); color:#2a2110; font-weight:700; font-size:0.75rem; margin-bottom:10px;">${h.badge}</span>
            <h3>${h.name}</h3>
            <p class="muted" style="font-size:0.92rem; line-height:1.6; margin-bottom:18px;">${h.description}</p>

            <div class="hall-spec-grid">
              <div class="hall-spec-box">
                <span class="lbl">${icon('users')} Seating</span>
                <b>${h.seating}</b>
                <small>${h.floating}</small>
              </div>
              <div class="hall-spec-box">
                <span class="lbl">${icon('sparkles')} Dining</span>
                <b>${h.dining}</b>
                <small>Continuous batch</small>
              </div>
              <div class="hall-spec-box">
                <span class="lbl">${icon('car')} Parking</span>
                <b>${h.parking}</b>
                <small>Paved portico</small>
              </div>
              <div class="hall-spec-box">
                <span class="lbl">${icon('user')} Suites</span>
                <b>${h.rooms}</b>
                <small>AC attached baths</small>
              </div>
            </div>

            <div class="hall-amenities">
              ${h.amenities.map((a) => html`<div class="hall-amenity">${icon('check')} <span>${a}</span></div>`)}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.1); padding-top:16px;">
            <div>
              <span style="font-size:0.78rem; color:#b6acc2; text-transform:uppercase;">Full Day Base</span>
              <div style="font-family:var(--ff-head); font-size:1.6rem; color:var(--accent); font-weight:700;">${h.price}</div>
            </div>
            <a class="btn gold" href="${h.bookUrl}">${icon('calendar')} Book Space</a>
          </div>
        </div>
      </div>
    `;
  }

  const showcaseBox = $('#hall-showcase-box');
  $$('.hall-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.hall;
      const hall = hallSpaces.find((x) => x.id === id);
      if (!hall) return;
      $$('.hall-tab-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      if (showcaseBox) {
        showcaseBox.style.opacity = '0.3';
        showcaseBox.style.transition = 'opacity 0.2s';
        setTimeout(() => {
          setHTML(showcaseBox, renderHallCard(hall));
          showcaseBox.style.opacity = '1';
        }, 150);
      }
    });
  });

  /* ------------------------------------------------------------------ Interactive Gallery Filter */
  const galGrid = $('#gal-grid');
  $('#gal-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.gal-tab-btn');
    if (!btn) return;
    const cat = btn.dataset.cat;
    $$('#gal-filters .gal-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('#gal-grid .gal-item').forEach((item) => {
      const match = cat === 'all' || item.dataset.cat === cat;
      item.style.display = match ? 'block' : 'none';
    });
  });

  // Lightbox on gallery click
  galGrid?.addEventListener('click', (e) => {
    const item = e.target.closest('.gal-item');
    if (!item) return;
    const imgEl = item.querySelector('img');
    const h4 = item.querySelector('h4');
    if (imgEl) openLightbox(imgEl.src, h4 ? h4.textContent : '');
  });

  /* ------------------------------------------------------------------ Quick Booking Calculator */
  const qbForm = $('#qb');
  const qbRes = $('#qb-result');

  qbForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(qbForm);
    const date = fd.get('date');
    const start = fd.get('start');
    const end = fd.get('end');
    const guests = Number(fd.get('guests')) || 500;
    const event = fd.get('event') || 'wedding';

    if (!date || !start || !end) {
      toast('Please select event date and hours', 'err');
      return;
    }

    setHTML(qbRes, html`<div class="skeleton" style="height: 60px; border-radius: 12px;"></div>`);

    try {
      const q = await get(`/api/pricing/quote?hall=1&date=${date}&start=${start}&end=${end}&guests=${guests}&event=${event}`);
      setHTML(
        qbRes,
        html`
        <div style="background: rgba(255,255,255,0.95); border: 2px solid var(--accent); border-radius: 16px; padding: 18px 22px; margin-top: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
            <div>
              <span class="badge" style="background:#10b981; color:#fff; font-weight:700;">✓ Hall Available for Selected Date</span>
              <h3 style="margin: 8px 0 2px; font-size: 1.25rem;">Grand Kalyana Mandapam (Royal Hall)</h3>
              <p class="caption" style="margin: 0;">Date: ${fmtDate(date)} · Hours: ${fmtTime(start)} – ${fmtTime(end)} · ${guests} Guests</p>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 0.8rem; color: var(--muted); text-transform: uppercase;">Estimated Total (Inc. GST)</span>
              <div style="font-family: var(--ff-head); font-size: 1.8rem; font-weight: 700; color: var(--primary);">${inr(q.total)}</div>
              <small class="caption">Advance deposit (${q.advancePct}%): <b>${inr(q.advance)}</b></small>
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--line); padding-top: 12px;">
            <a class="btn gold" href="/book?hall=1&date=${date}&start=${start}&end=${end}&guests=${guests}&event=${event}">${icon('calendar')} Book This Date Now</a>
          </div>
        </div>
      `
      );
    } catch (err) {
      setHTML(
        qbRes,
        html`<div class="alert err" style="margin-top: 14px;">${err.message || 'Unable to calculate quote for selected date.'}</div>`
      );
    }
  });
}
