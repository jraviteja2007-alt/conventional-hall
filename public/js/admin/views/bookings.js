import { html, setHTML, $, A, pageHead, ic, badge, cell, money, dShort, t12, can, link, go } from '../core.js';
import { mountTable } from '../table.js';

export const STATUSES = ['pending', 'held', 'reserved', 'confirmed', 'completed', 'cancelled', 'rejected', 'expired'];
export default async function bookings({ el, query }) {
  const halls = (await A.get('/api/halls')).halls;
  setHTML(el, html`${pageHead({ title: 'Bookings', sub: 'Approve requests, take payments and manage events.', actions: can('bookings.manage') ? html`<button class="btn" id="newb" type="button">${ic('plus')} New booking</button>` : '' })}<section class="card flush" id="tb"></section>`);
  const host = $('#tb', el); let t;
  $('#newb', el)?.addEventListener('click', async () => (await import('./booking-form.js')).newBooking(() => t.reload(), halls));
  t = mountTable(host, {
    exportName: 'bookings', searchPlaceholder: 'Reference, name, phone or email', defaultSort: 'created', pageSize: 15,
    exportUrl: (p) => `/api/admin/export/bookings?format=${p.format}`,
    filters: [{ name: 'status', label: 'Status', options: STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]) }, { name: 'hall', label: 'Hall', options: halls.map((h) => [h.id, h.name]) }, { name: 'from', label: 'Event from', type: 'date' }, { name: 'to', label: 'Event to', type: 'date' }],
    load: (p) => A.get(`/api/admin/bookings${A.qs(p)}`),
    onRow: (r) => go(`/admin/bookings/${r.ref}`),
    empty: { title: 'No bookings found', text: 'Try clearing the filters.' },
    columns: [
      { key: 'ref', label: 'Reference', render: (r) => cell(link(`/admin/bookings/${r.ref}`, r.ref), r.package_name || 'Hall only') },
      { key: 'customer_name', label: 'Customer', render: (r) => cell(r.customer_name, r.phone) },
      { key: 'event', label: 'Event', render: (r) => cell(r.event_name, r.hall_name) },
      { key: 'event_date', sort: 'date', label: 'Date', render: (r) => cell(dShort(r.event_date), `${t12(r.start_time)} – ${t12(r.end_time)}`) },
      { key: 'guests', label: 'Guests', cls: 'right' },
      { key: 'total', sort: 'total', label: 'Total', cls: 'right', render: (r) => cell(money(r.total), `Paid ${money(r.paid)}`) },
      { key: 'status', sort: 'status', label: 'Status', render: (r) => badge(r.status) },
    ],
  });
  if (query.status) { const s = $('[data-f=status]', host); if (s) { s.value = query.status; s.dispatchEvent(new Event('change', { bubbles: true })); } }
}
