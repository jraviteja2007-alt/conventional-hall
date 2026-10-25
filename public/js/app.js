// Application shell: boots data, renders header / drawer / footer / floating actions / assistant / cookie banner,
// registers lazy page routes and starts the router.
import { boot, S, onAuth, setUser } from './store.js';
import { route, start, navigate } from './router.js';
import { initEffects } from './effects.js';
import { html, setHTML, $, $$, icon, toast, esc, debounce, img, inr, num, errorState } from './ui.js';
import { get, post, qs } from './api.js';
import { waLink, telLink, mapsEmbed, mapsDir } from './components.js';

const NAV = [['/', 'Home'], ['/about', 'About'], ['/halls', 'Hall'], ['/gallery', 'Gallery'], ['/facilities', 'Facilities'], ['/packages', 'Packages'], ['/events', 'Events'], ['/availability', 'Availability'], ['/contact', 'Contact']];
const LEGAL = [['/privacy-policy', 'Privacy Policy'], ['/terms', 'Terms & Conditions'], ['/cancellation-policy', 'Cancellation Policy'], ['/refund-policy', 'Refund Policy'], ['/cookie-policy', 'Cookie Policy']];
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

/* ------------------------------------------------------------------ routes */
const page = (name) => () => import(`./pages/${name}.js`);
[
  ['/', 'home'], ['/about', 'about'], ['/halls', 'halls'], ['/halls/:slug', 'hall'], ['/compare', 'compare'], ['/gallery', 'gallery'], ['/facilities', 'facilities'],
  ['/packages', 'packages'], ['/events', 'events'], ['/availability', 'availability'], ['/contact', 'contact'],
  ['/book', 'book'], ['/book/pay/:ref', 'pay'], ['/book/done/:ref', 'done'], ['/booking', 'booking'], ['/booking/:ref', 'booking'],
  ['/login', 'login'], ['/register', 'register'], ['/account', 'account'],
  ['/privacy-policy', 'legal'], ['/terms', 'legal'], ['/cancellation-policy', 'legal'], ['/refund-policy', 'legal'], ['/cookie-policy', 'legal'],
].forEach(([p, n]) => route(p, page(n)));

/* ------------------------------------------------------------------ header + drawer */
const brandHTML = () => {
  const s = S.site, b = S.cfg.branding || {};
  if (b.logo_url) return html`<a class="brand" href="/" aria-label="${s.name} - home"><img class="logo-desktop" src="${b.logo_url}" alt="${s.name}">${b.logo_mobile_url ? html`<img class="logo-mobile" src="${b.logo_mobile_url}" alt="">` : ''}</a>`;
  return html`<a class="brand" href="/" aria-label="${s.name} - home"><span class="brand-mark" aria-hidden="true">${String(s.name || 'H')[0]}</span><span class="brand-name">${s.name}<small>${String(s.city || '').split(',')[0]}</small></span></a>`;
};
const accountLink = (cls = '') => (S.user
  ? html`<a class="${cls}" href="/account">${icon('user')} <span>Account</span></a>`
  : html`<a class="${cls}" href="/login">${icon('user')} <span>Login</span></a>`);

function renderHeader() {
  setHTML($('#hdr'), html`<div class="container">${brandHTML()}
    <nav class="nav" aria-label="Primary">${NAV.map(([h, l]) => html`<a href="${h}">${l}</a>`)}</nav>
    <div class="hdr-actions">
      ${accountLink('login-link hdr-link')}
      <a class="btn gold sm" href="/book" data-track="book_click">Book Now</a>
      <button type="button" class="burger" data-act="menu" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">${icon('menu')}</button>
    </div></div>`);
  setHTML($('#drawer'), html`<div class="scrim" data-act="close-menu"></div>
    <nav aria-label="Mobile" id="drawer-nav"><div class="row between" style="margin-bottom:10px"><b style="font-family:var(--ff-head);font-size:1.2rem">${S.site.name}</b><button type="button" class="icon-btn" data-act="close-menu" aria-label="Close menu">${icon('x')}</button></div>
      ${NAV.map(([h, l]) => html`<a href="${h}">${l}</a>`)}
      ${accountLink('')}
      <a class="btn gold block" href="/book" style="margin-top:14px" data-track="book_click">Book Now</a>
      <a class="btn glass block" href="${telLink()}" data-track="call_click" style="margin-top:8px">${icon('phone')} ${S.site.phone}</a></nav>`);
  markActive();
}
function markActive() {
  const p = location.pathname.replace(/(.)\/$/, '$1');
  $$('.nav a, #drawer-nav a').forEach((a) => { const h = a.getAttribute('href'); const on = h === '/' ? p === '/' : p === h || p.startsWith(`${h}/`); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function menu(open) {
  const d = $('#drawer'); d.classList.toggle('open', open); d.setAttribute('aria-hidden', String(!open));
  $('[data-act="menu"]')?.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) $('#drawer-nav a, #drawer-nav button')?.focus(); else $('[data-act="menu"]')?.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ footer */
function renderFooter() {
  const s = S.site, soc = S.cfg.social || {};
  const socials = [['facebook', 'Facebook', icon('facebook')], ['instagram', 'Instagram', icon('instagram')], ['youtube', 'YouTube', icon('youtube')]].filter(([k]) => soc[k]);
  setHTML($('#ftr'), html`<div class="container">
    <div class="footer-grid">
      <div><div class="brand" style="color:#fff;margin-bottom:14px"><span class="brand-mark" aria-hidden="true">${String(s.name || 'H')[0]}</span><span class="brand-name">${s.name}</span></div>
        <p style="max-width:42ch">${(s.about || '').slice(0, 200)}${(s.about || '').length > 200 ? '…' : ''}</p>
        ${socials.length ? html`<div class="social">${socials.map(([k, l, g]) => html`<a href="${soc[k]}" target="_blank" rel="noopener noreferrer" aria-label="${l}">${g}</a>`)}</div>` : ''}</div>
      <div><h4>Quick links</h4><ul>${NAV.concat([['/book', 'Book Online'], ['/booking', 'Find my booking']]).map(([h, l]) => html`<li><a href="${h}">${l}</a></li>`)}</ul></div>
      <div><h4>Our services</h4><ul>${S.events.slice(0, 7).map((e) => html`<li><a href="/book?event=${e.slug}">${e.name}</a></li>`)}<li><a href="/packages">Event packages</a></li></ul></div>
      <div><h4>Contact</h4><ul>
        <li class="row" style="flex-wrap:nowrap;align-items:flex-start">${icon('pin', 'fi')}<span>${s.address}</span></li>
        <li class="row" style="flex-wrap:nowrap">${icon('phone', 'fi')}<a href="${telLink()}" data-track="call_click">${s.phone}</a></li>
        <li class="row" style="flex-wrap:nowrap">${icon('mail', 'fi')}<a href="mailto:${s.email}" data-track="email_click">${s.email}</a></li>
        <li class="row" style="flex-wrap:nowrap">${icon('whatsapp', 'fi')}<a href="${waLink('Hello, I would like to know more about booking the hall.')}" target="_blank" rel="noopener noreferrer" data-track="whatsapp_click">WhatsApp us</a></li>
        <li class="row" style="flex-wrap:nowrap;align-items:flex-start">${icon('clock', 'fi')}<span>${s.opening_hours}</span></li></ul></div>
    </div>
    <div class="footer-map"><iframe class="map-frame" title="Map showing the location of ${esc(s.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapsEmbed()}"></iframe><a class="btn gold sm" href="${mapsDir()}" target="_blank" rel="noopener noreferrer">${icon('pin')} Get directions</a></div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${s.name}. All rights reserved.</span>
      <nav aria-label="Legal" class="row" style="gap:6px 18px">${LEGAL.map(([h, l]) => html`<a href="${h}">${l}</a>`)}<a href="/staff" class="staff-link" style="opacity:0.75" target="_blank" rel="noopener">Staff portal</a></nav></div></div>`);
  setHTML($('#fab'), html`<a class="btn glass" href="${telLink()}" data-track="call_click">${icon('phone')} Call</a>
    <a class="btn success" href="${waLink('Hello, I would like to know more about booking the hall.')}" target="_blank" rel="noopener noreferrer" data-track="whatsapp_click">${icon('whatsapp')} WhatsApp</a>
    <a class="btn gold" href="/book" data-track="book_click">Book</a>`);
}

/* ------------------------------------------------------------------ extras: WhatsApp float & Chatbot */
function renderExtras() {
  const ex = $('#extras');
  setHTML(ex, html`
    <a class="wa-float" href="${waLink('Hello, I would like to know more about booking the hall.')}" target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" data-track="whatsapp_click">${icon('whatsapp')}</a>
    <button type="button" class="chat-fab" data-act="chat" aria-haspopup="dialog" aria-expanded="false">${icon('chat')}<span>Ask us</span></button>
    <section class="chat" id="chat" role="dialog" aria-label="Booking assistant" aria-hidden="true">
      <header><b>Booking assistant</b><button type="button" data-act="chat" aria-label="Close assistant">×</button></header>
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <div class="chat-sugg" id="chat-sugg"></div>
      <form id="chat-form" autocomplete="off"><label class="sr-only" for="chat-in">Your question</label><input class="input" id="chat-in" maxlength="500" placeholder="Ask about dates, prices, parking…" required><button class="btn sm" type="submit">Send</button></form>
    </section>
    <div class="cookie" id="cookie" role="region" aria-label="Cookie notice"><p>We use essential cookies to make booking work and, with your consent, anonymous analytics to improve the site. See our <a href="/cookie-policy">Cookie Policy</a>.</p><div class="row"><button type="button" class="btn sm ghost-light" data-cookie="essential">Essential only</button><button type="button" class="btn gold sm" data-cookie="all">Accept all</button></div></div>
  `);
  if (!ls.get('ch_cookie')) setTimeout(() => $('#cookie')?.classList.add('show'), 1200); else if (ls.get('ch_cookie') === 'all') loadAnalytics();
}

let chatStarted = false;
function chat(open) {
  const c = $('#chat'); c.classList.toggle('open', open); c.setAttribute('aria-hidden', String(!open)); $('[data-act="chat"]').setAttribute('aria-expanded', String(open));
  $('.chat-fab').style.display = open ? 'none' : '';
  if (open) {
    if (!chatStarted) { chatStarted = true; say('bot', `Hello! I am the booking assistant for ${S.site.name}. Ask me about availability, prices, packages, facilities or how to book.`); sugg(['Check availability', 'See packages', 'Facilities', 'How to book', 'Contact']); }
    $('#chat-in').focus();
  } else $('.chat-fab').focus();
}
function say(who, text, action) {
  const log = $('#chat-log'); const m = document.createElement('div'); m.className = `msg ${who}`; m.textContent = text;
  if (action?.href) { const a = document.createElement('a'); a.href = action.href; a.className = 'btn sm gold'; a.style.marginTop = '8px'; a.textContent = action.label; a.addEventListener('click', () => chat(false)); const w = document.createElement('div'); w.className = 'msg-act'; w.append(a); m.append(w); }
  log.append(m); log.scrollTop = log.scrollHeight; return m;
}
const sugg = (list) => { const b = $('#chat-sugg'); b.innerHTML = ''; list.forEach((t) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'chip'; x.textContent = t; x.addEventListener('click', () => ask(t)); b.append(x); }); };
async function ask(text) {
  say('me', text); const typing = say('bot', '…'); typing.classList.add('typing');
  try { const r = await post('/api/assistant', { message: text }); typing.remove(); say('bot', r.reply, r.action); sugg(r.suggestions || []); } catch (e) { typing.remove(); say('bot', e.status === 429 ? 'You are sending messages quickly. Please wait a moment and try again.' : `Sorry, I could not answer that right now. You can call us on ${S.site.phone}.`); }
}

function loadAnalytics() {
  const ga = document.querySelector('meta[name="ga4"]')?.content, px = document.querySelector('meta[name="meta-pixel"]')?.content;
  if (ga && /^G-[A-Z0-9]+$/.test(ga) && !window.gtag) {
    window.dataLayer = window.dataLayer || []; window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
    const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${ga}`; document.head.append(s); window.gtag('js', new Date()); window.gtag('config', ga);
  }
  if (px && /^\d+$/.test(px) && !window.fbq) {
    const q = []; window.fbq = function fbq() { q.push(arguments); }; window.fbq.queue = q; // eslint-disable-line prefer-rest-params
    const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.append(s); window.fbq('init', px); window.fbq('track', 'PageView');
  }
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); const a = e.target.closest('a[href]');
    if (t) {
      const act = t.dataset.act;
      if (act === 'menu') menu(true); else if (act === 'close-menu') menu(false); else if (act === 'chat') chat(!$('#chat').classList.contains('open'));
    }
    if (a && $('#drawer').classList.contains('open') && $('#drawer').contains(a)) menu(false);
    const ck = e.target.closest('[data-cookie]'); if (ck) { ls.set('ch_cookie', ck.dataset.cookie); $('#cookie').classList.remove('show'); if (ck.dataset.cookie === 'all') loadAnalytics(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('#drawer').classList.contains('open')) menu(false); if ($('#chat').classList.contains('open')) chat(false); }
  });
  $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#chat-in'); const v = i.value.trim(); if (v.length < 2) return; i.value = ''; ask(v); });
  onAuth(() => renderHeader());
  window.addEventListener('route:rendered', () => {
    markActive();
    const hdr = $('#hdr'); const hero = document.querySelector('#app .hero, #app .hero-cvr, #app .phero, #app .notfound');
    hdr.classList.toggle('solid', !hero);
    document.body.classList.toggle('has-hero', !!hero);
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) r.unregister();
    }).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

async function main() {
  const app = $('#app');
  try { await boot(); } catch (e) {
    setHTML($('#hdr'), html`<div class="container"><a class="brand" href="/"><span class="brand-name">Convention Hall</span></a></div>`); $('#hdr').classList.add('solid');
    setHTML(app, html`<div class="container section page-top">${errorState(e.network ? e.message : 'The site could not be loaded right now. Please try again in a moment.')}</div>`);
    $('[data-retry]', app)?.addEventListener('click', () => location.reload());
    return;
  }
  renderHeader(); renderFooter(); renderExtras(); wire(); initEffects();
  $('#hdr').classList.add('solid');
  start();
}
main();
export { setUser };
