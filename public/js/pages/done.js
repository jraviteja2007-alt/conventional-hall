// Booking confirmation / status page shown right after a request is sent.
import { html, setHTML, icon, inr, num, fmtDate, fmtTime, errorState } from '../ui.js';
import { S } from '../store.js';
import { get } from '../api.js';
import { pageHero, waLink } from '../components.js';
import { statusBadge } from '../helpers.js';

const NEXT = {
  pending: ['We have received your request', 'Our team is checking the date and will approve it shortly — usually within a few hours. You will get an email and notification as soon as it is approved.'],
  reserved: ['Approved — pay the advance to confirm', 'Your date is on hold for you. Pay the advance online before the hold expires to confirm the booking.'],
  confirmed: ['Your booking is confirmed', 'Thank you! Your advance is received and the date is secured. A confirmation is available below.'],
  rejected: ['We could not accept this request', 'This date or slot is not available. Please choose another date or contact us and we will help.'],
  cancelled: ['This booking was cancelled', 'If you paid an advance, any eligible refund is processed as per the cancellation policy.'],
  expired: ['The hold expired', 'The advance was not received in time so the date was released. You can send a new request.'],
  completed: ['Event completed', 'We hope it was wonderful! You can leave a review from your booking page.'],
};

export default async function done(ctx) {
  if (!S.user) { ctx.navigate(`/login?next=${encodeURIComponent(ctx.path)}`, { replace: true }); return; }
  let d;
  try { d = await get(`/api/bookings/${encodeURIComponent(ctx.params.ref)}`); } catch (e) { setHTML(ctx.el, html`${pageHero({ title: 'Booking', crumbs: [{ label: 'Booking' }] })}<div class="container section">${errorState(e.message)}</div>`); return; }
  const b = d.booking; const [t, sub] = NEXT[b.status] || NEXT.pending;
  ctx.meta(`Booking ${b.ref}`, 'Your booking details.');
  const due = Math.max(0, b.advance_due - b.paid_amount);
  setHTML(ctx.el, html`
  ${pageHero({ title: t, sub: `Booking reference ${b.ref}`, crumbs: [{ label: 'Booking' }, { label: b.ref }] })}
  <section class="section"><div class="container" style="max-width:860px">
    <div class="card bk-done">
      <div class="row between"><h2 style="margin:0">${icon('check')} ${b.ref}</h2>${statusBadge(b.status)}</div>
      <p class="lead">${sub}</p>
      <dl class="kv">
        <div><dt>Event</dt><dd>${b.event_name || b.custom_event || 'Event'}</dd></div><div><dt>Hall</dt><dd>${b.hall_name}</dd></div>
        <div><dt>Date</dt><dd>${fmtDate(b.event_date)}</dd></div><div><dt>Time</dt><dd>${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}</dd></div>
        <div><dt>Guests</dt><dd>${num(b.guests)}</dd></div><div><dt>Package</dt><dd>${b.package_name || 'Hall only'}</dd></div>
        <div><dt>Total (incl. GST)</dt><dd><b>${inr(b.total)}</b></dd></div><div><dt>Paid so far</dt><dd>${inr(b.paid_amount)}</dd></div>
      </dl>
      <div class="row" style="margin-top:22px">
        ${b.status === 'reserved' && due > 0 ? html`<a class="btn gold lg" href="/book/pay/${b.id}">Pay advance ${inr(due)}</a>` : ''}
        <a class="btn" href="/booking/${b.id}">Manage booking</a>
        <a class="btn ghost" href="/api/documents/confirmation/${b.id}" target="_blank" rel="noopener">${icon('download')} Booking PDF</a>
        <a class="btn ghost" href="${waLink(`Hello, regarding booking ${b.ref}`)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} WhatsApp us</a>
      </div>
      ${b.status === 'reserved' && b.hold_expires_at ? html`<p class="caption" style="margin-top:14px">Hold expires: ${new Date(b.hold_expires_at.replace(' ', 'T') + (b.hold_expires_at.includes('Z') ? '' : 'Z')).toLocaleString('en-IN')}</p>` : ''}
    </div>
  </div></section>`);
}
