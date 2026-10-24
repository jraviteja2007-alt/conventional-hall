import { html, setHTML, $, icon } from '../ui.js';
import { S } from '../store.js';
import { pageHero, sectionHead, enquiryFormHTML, bindEnquiry, waLink, telLink, mapsDir, mapsEmbed, mapsNear } from '../components.js';
import { IMG } from '../images.js';

export default async function contact(ctx) {
  const s = S.site;
  ctx.meta('Contact Us', `Contact ${s.name} in ${s.city}: call, WhatsApp, email or send an enquiry to plan your event.`);
  const ev = S.events.find((e) => e.slug === ctx.query.event);
  const nearby = [['hotel', 'Hotels'], ['restaurant', 'Restaurants'], ['bus station', 'Bus station'], ['railway station', 'Railway station'], ['hospital', 'Hospitals'], ['parking', 'Parking'], ['ATM', 'ATMs']];
  setHTML(ctx.el, html`${pageHero({ title: 'Contact us', sub: 'Plan a site visit, ask for a quotation or simply say hello.', crumbs: [{ label: 'Contact' }], image: IMG.chandelierHall })}
  <section class="section"><div class="container">
    <div class="grid g4 contact-cards">
      <div class="card pad"><div class="ico">${icon('pin')}</div><h3>Visit us</h3><p>${s.address}</p><a href="${mapsDir()}" target="_blank" rel="noopener noreferrer">Get directions</a></div>
      <div class="card pad"><div class="ico">${icon('phone')}</div><h3>Call us</h3><p><a href="${telLink()}" data-track="call_click">${s.phone}</a></p><p class="caption">${s.opening_hours}</p></div>
      <div class="card pad"><div class="ico">${icon('whatsapp')}</div><h3>WhatsApp</h3><p><a href="${waLink('Hello, I would like to know more about booking the hall.')}" target="_blank" rel="noopener noreferrer" data-track="whatsapp_click">Chat with us</a></p><p class="caption">Quick replies during opening hours.</p></div>
      <div class="card pad"><div class="ico">${icon('mail')}</div><h3>Email</h3><p><a href="mailto:${s.email}" data-track="email_click">${s.email}</a></p><p class="caption">We reply within one working day.</p></div>
    </div></div></section>
  <section class="section alt"><div class="container split">
    <div>${sectionHead('Enquiry', 'Tell us about your event', 'Share a few details and our team will call you back with availability and a tailored quotation.')}
      <div class="card pad" id="enq">${enquiryFormHTML({ event: ev?.name, message: ctx.query.message || '' })}</div></div>
    <div><h2>Site visit</h2><p class="lead">See the hall in person before you book. Mention your preferred day in the form, or call us. Visits are free and take about 30 minutes.</p>
      <div class="map-box"><iframe class="map-frame" title="Map showing the location of ${s.name}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapsEmbed()}"></iframe></div>
      <div class="row" style="margin-top:14px"><a class="btn" href="${mapsDir()}" target="_blank" rel="noopener noreferrer">${icon('pin')} Get directions</a></div>
      <h3 style="margin-top:26px">Nearby</h3><div class="tag-row">${nearby.map(([q, l]) => html`<a class="chip" href="${mapsNear(q)}" target="_blank" rel="noopener noreferrer">${l}</a>`)}</div></div>
  </div></section>`);
  bindEnquiry($('.enq-form', ctx.el), 'contact_page');
}
