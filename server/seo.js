import fs from 'node:fs';
import path from 'node:path';
import { all, get } from './db.js';
import { config } from './config.js';
import { setting } from './services/settings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
let template = null;
const tpl = () => (config.prod && template) || (template = fs.readFileSync(path.join(config.publicDir, 'shell.html'), 'utf8'));

const STATIC_PAGES = {
  '/': ['{city} Convention Hall | Wedding, Function & Event Venue in {city}', 'Book {name}, a premium convention hall in {city}, {state}. Weddings, receptions, engagements, corporate events and conferences — check live availability and book online.'],
  '/about': ['About {name} | Function Hall in {city}', 'Learn about {name} — {city}\'s trusted convention and function hall with modern facilities, in-house decoration and catering support.'],
  '/halls': ['Our Halls & Capacity | {name}, {city}', 'Explore our convention halls in {city} — capacities, layouts, dimensions, pricing and facilities. Compare halls side by side.'],
  '/gallery': ['Photo Gallery | Wedding & Event Hall in {city}', 'Browse photos and videos of weddings, receptions and corporate events at {name}, {city}.'],
  '/facilities': ['Facilities & Amenities | {name}, {city}', 'Air-conditioned halls, parking, dining, kitchen, stage, guest rooms, power backup, sound, lighting, Wi-Fi and security at {name}.'],
  '/packages': ['Wedding & Event Packages | {name}, {city}', 'Compare Basic, Standard, Premium, Wedding and Corporate packages at {name} with transparent pricing.'],
  '/events': ['Weddings, Receptions & Corporate Events | {name}', 'From weddings and engagements to conferences and cultural events — see the events we host in {city}.'],
  '/availability': ['Check Hall Availability | {name}, {city}', 'See live date and time-slot availability for our marriage hall in {city} and book your event date.'],
  '/book': ['Book Your Event | {name}, {city}', 'Book the convention hall in {city} online in minutes: pick a date, choose a package and get an instant transparent price.'],
  '/contact': ['Contact & Directions | {name}, {city}', 'Call, WhatsApp or visit {name} in {city}. Send an enquiry and our team will respond quickly.'],
  '/login': ['Sign in | {name}', 'Sign in to manage your bookings.', true],
  '/register': ['Create account | {name}', 'Create an account to book and manage events.', true],
  '/account': ['My bookings | {name}', 'Your bookings, payments and notifications.', true],
  '/privacy-policy': ['Privacy Policy | {name}', 'How {name} collects, uses and protects your personal information.'],
  '/terms': ['Terms & Conditions | {name}', 'Booking terms and conditions for {name}, {city}.'],
  '/cancellation-policy': ['Cancellation Policy | {name}', 'Cancellation and rescheduling rules for bookings at {name}.'],
  '/refund-policy': ['Refund Policy | {name}', 'Refund timelines and eligibility for bookings at {name}.'],
  '/cookie-policy': ['Cookie Policy | {name}', 'How {name} uses cookies and similar technologies.'],
  '/compare': ['Compare Halls & Packages | {name}', 'Compare capacity, pricing and availability side by side at {name}, {city}.'],
  '/search': ['Search | {name}', 'Search halls, packages, facilities and events.', true],
  '/booking': ['Booking lookup | {name}', 'Find your booking.', true],
  '/policies/privacy': ['Privacy Policy | {name}', 'How {name} collects, uses and protects your personal information.'],
  '/policies/terms': ['Terms & Conditions | {name}', 'Booking terms and conditions for {name}, {city}.'],
  '/policies/cancellation': ['Cancellation Policy | {name}', 'Cancellation and rescheduling rules for bookings at {name}.'],
  '/policies/refund': ['Refund Policy | {name}', 'Refund timelines and eligibility for bookings at {name}.'],
  '/policies/cookies': ['Cookie Policy | {name}', 'How {name} uses cookies and similar technologies.'],
};
export const KNOWN_PATHS = new Set(Object.keys(STATIC_PAGES));
const fill = (s, biz) => s.replace(/\{(\w+)\}/g, (_, k) => biz[k] ?? '');

export function sitemapXml() {
  const urls = Object.entries(STATIC_PAGES).filter(([, v]) => !v[2]).map(([p]) => p);
  all('SELECT slug FROM halls WHERE active=1').forEach((h) => urls.push(`/halls/${h.slug}`));
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(config.siteUrl + u)}</loc><lastmod>${today}</lastmod><priority>${u === '/' ? '1.0' : u.startsWith('/policies') ? '0.3' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
}
export const robotsTxt = () => `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /account\nDisallow: /login\nDisallow: /register\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;

/** Server-rendered <head> (title, meta, OG, JSON-LD) + crawlable <noscript> content for each public route. */
export function renderPage(reqPath) {
  const biz = setting('business'), theme = setting('theme');
  let status = 200, title, desc, noindex = false, ld = [], image = get('SELECT image FROM halls WHERE active=1 ORDER BY popularity DESC')?.image || '';
  let body = '';
  const hallMatch = /^\/halls\/([\w-]+)$/.exec(reqPath);
  if (STATIC_PAGES[reqPath]) { [title, desc, noindex] = STATIC_PAGES[reqPath]; }
  else if (hallMatch) {
    const h = get('SELECT * FROM halls WHERE slug=? AND active=1', hallMatch[1]);
    if (h) {
      title = `${h.name} — Capacity ${h.max_guests} | ${biz.name}, ${biz.city}`; desc = `${h.name}: ${h.tagline || ''} Hosts ${h.min_guests}–${h.max_guests} guests. ${h.description || ''}`.slice(0, 300); image = h.image || image;
      ld.push({ '@context': 'https://schema.org', '@type': 'EventVenue', name: h.name, description: h.description, image: h.image, maximumAttendeeCapacity: h.max_guests, address: { '@type': 'PostalAddress', addressLocality: biz.city, addressRegion: biz.state, addressCountry: 'IN' }, url: config.siteUrl + reqPath });
      body = `<h1>${esc(h.name)}</h1><p>${esc(h.description)}</p><p>Capacity: ${h.min_guests}–${h.max_guests} guests.</p>`;
    } else { status = 404; title = `Page not found | ${biz.name}`; desc = 'This page could not be found.'; noindex = true; }
  } else if (/^\/(book\/(pay|done)|booking)\/[\w-]+$/.test(reqPath)) { title = `Your booking | ${biz.name}`; desc = 'Booking details'; noindex = true; }
  else if (reqPath === '/admin' || reqPath.startsWith('/admin/')) { title = `Admin | ${biz.name}`; desc = 'Administration'; noindex = true; }
  else { status = 404; title = `Page not found | ${biz.name}`; desc = 'This page could not be found.'; noindex = true; }
  title = fill(title, biz); desc = fill(desc, biz);
  const canonical = config.siteUrl + (reqPath === '/' ? '/' : reqPath);
  if (reqPath === '/') {
    const r = get(`SELECT COUNT(*) c, ROUND(AVG(rating),1) a FROM reviews WHERE status='approved'`);
    const lb = { '@context': 'https://schema.org', '@type': ['EventVenue', 'LocalBusiness'], name: biz.name, description: biz.description, url: config.siteUrl, image, telephone: biz.phone, email: biz.email, priceRange: '₹₹₹',
      address: { '@type': 'PostalAddress', streetAddress: biz.address, addressLocality: biz.city, addressRegion: biz.state, postalCode: biz.pincode, addressCountry: 'IN' }, geo: { '@type': 'GeoCoordinates', latitude: biz.lat, longitude: biz.lng }, openingHours: 'Mo-Su 09:00-21:00',
      potentialAction: { '@type': 'ReserveAction', target: `${config.siteUrl}/book`, name: 'Book the hall' } };
    if (r.c) lb.aggregateRating = { '@type': 'AggregateRating', ratingValue: r.a, reviewCount: r.c };
    ld.push(lb);
    body = `<h1>${esc(biz.name)} — Convention Hall in ${esc(biz.city)}</h1><p>${esc(biz.description)}</p><p>${esc(biz.address)} · ${esc(biz.phone)}</p>`;
  }
  const keywords = `convention halls in ${biz.city}, function halls in ${biz.city}, wedding halls in ${biz.city}, marriage halls in ${biz.city}, event venues in ${biz.city}, ${biz.name}`;
  const head = [
    `<title>${esc(title)}</title>`, `<meta name="description" content="${esc(desc)}">`, `<meta name="keywords" content="${esc(keywords)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`, `<meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(biz.name)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '', `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="theme-color" content="${esc(theme.primary)}">`, `<meta name="geo.region" content="IN-AP"><meta name="geo.placename" content="${esc(biz.city)}">`, ...ld.map(jsonLd),
  ].join('\n');
  const nav = [['/', 'Home'], ['/halls', 'Halls'], ['/facilities', 'Facilities'], ['/packages', 'Packages'], ['/gallery', 'Gallery'], ['/events', 'Events'], ['/availability', 'Availability'], ['/contact', 'Contact']].map(([h, t]) => `<a href="${h}">${t}</a>`).join(' · ');
  const noscript = `<noscript><div style="padding:24px;font-family:sans-serif;max-width:720px;margin:auto">${body || `<h1>${esc(title)}</h1><p>${esc(desc)}</p>`}<nav>${nav}</nav><p>JavaScript is required for online booking. Call us on <a href="tel:${esc(biz.phone.replace(/\s/g, ''))}">${esc(biz.phone)}</a>.</p></div></noscript>`;
  const html = tpl().replace('<!--SEO_HEAD-->', head).replace('<!--SEO_BODY-->', noscript).replace('<html lang="en"', `<html lang="en"`);
  return { status, html };
}
