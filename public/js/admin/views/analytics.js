import { html, setHTML, $, A, load, pageHead, card, ic, money, num, today, addDays } from '../core.js';
import { hbars, bindChartTips } from '../charts.js';

const kpi = (icon, label, value, sub = '') => html`<div class="kpi"><div class="lab"><span class="chip-ic">${ic(icon)}</span>${label}</div><div class="val">${value}</div><div class="sub">${sub || ' '}</div></div>`;
export default async function analytics({ el }) {
  const st = { from: addDays(today(), -29), to: today() };
  setHTML(el, html`${pageHead({ title: 'Analytics', sub: 'Business performance and website conversion tracking.' })}
    <div class="toolbar card" style="margin-bottom:18px;border-radius:14px"><div class="field"><label for="af">From</label><input type="date" id="af" value="${st.from}"></div><div class="field"><label for="at">To</label><input type="date" id="at" value="${st.to}"></div></div><div id="ab"></div>`);
  const body = $('#ab', el);
  const run = () => load(body, () => A.get(`/api/admin/analytics${A.qs(st)}`), (d) => {
    setHTML(body, html`<div class="grid g4 kpis" style="margin-bottom:18px">
      ${kpi('book', 'Bookings created', num(d.bookingsCreated), `${num(d.bookingsWon)} confirmed`)}${kpi('percent', 'Conversion rate', `${d.conversionRate}%`, 'Created → confirmed')}${kpi('rupee', 'Revenue booked', money(d.revenueBooked))}${kpi('card', 'Avg booking value', money(d.avgBookingValue))}</div>
      <div class="grid g2">${card('Conversion tracking', hbars([['Book Now clicks', d.tracking.bookNowClicks], ['Availability checks', d.tracking.availabilityChecks], ['Enquiry forms', d.tracking.enquiryForms], ['Calls', d.tracking.calls], ['WhatsApp clicks', d.tracking.whatsapp]].map(([label, value]) => ({ label, value })), { label: 'Events' }))}
        ${card('Highlights', html`<dl class="kv"><div><dt>Enquiries</dt><dd>${num(d.enquiries)}</dd></div><div><dt>Enquiries converted</dt><dd>${num(d.enquiriesConverted)}</dd></div><div><dt>Popular event type</dt><dd>${d.popularEvent ? `${d.popularEvent.name} (${d.popularEvent.c})` : '—'}</dd></div><div><dt>Popular package</dt><dd>${d.popularPackage ? `${d.popularPackage.name} (${d.popularPackage.c})` : '—'}</dd></div></dl><p class="muted small" style="margin-top:16px">Connect Google Analytics 4 or Meta Pixel under Settings → Analytics for traffic reports.</p>`)}</div>`);
    bindChartTips(body);
  });
  $('#af', el).addEventListener('change', (e) => { st.from = e.target.value; run(); }); $('#at', el).addEventListener('change', (e) => { st.to = e.target.value; run(); });
  await run();
}
