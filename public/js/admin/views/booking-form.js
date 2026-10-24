import { A, toast, html, money } from '../core.js';
import { formModal } from '../forms.js';
import { go } from '../core.js';

/** Create a booking on behalf of a customer (status pending / reserved / confirmed). */
export async function newBooking(done, halls) {
  const [{ events }, { packages }] = await Promise.all([A.get('/api/events'), A.get('/api/packages')]);
  const pk = [['', 'Hall only'], ...packages.map((p) => [p.id, p.name])];
  formModal({ title: 'New booking', wide: true, submit: 'Create booking',
    intro: html`<p class="full muted">Availability is checked on the server; conflicting dates are refused.</p>`,
    fields: [
      { name: 'name', label: 'Customer name', required: true }, { name: 'phone', label: 'Phone', type: 'tel', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'hallId', label: 'Hall', type: 'select', options: halls.map((h) => [h.id, h.name]) }, { name: 'eventId', label: 'Event type', type: 'select', options: events.map((e) => [e.id, e.name]) },
      { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'guests', label: 'Guests', type: 'number', min: 1, required: true },
      { name: 'start', label: 'Start time', type: 'time', default: '09:00', required: true }, { name: 'end', label: 'End time', type: 'time', default: '17:00', required: true },
      { name: 'packageId', label: 'Package', type: 'select', options: pk }, { name: 'status', label: 'Initial status', type: 'select', options: [['pending', 'Pending'], ['reserved', 'Approved (reserved)'], ['confirmed', 'Confirmed']] },
      { name: 'requirements', label: 'Requirements', type: 'textarea' },
    ],
    onSave: async (v) => {
      const body = { hallId: Number(v.hallId), eventId: Number(v.eventId), date: v.date, start: v.start, end: v.end, guests: v.guests, status: v.status, requirements: v.requirements, customer: { name: v.name, phone: v.phone, email: v.email } };
      if (v.packageId) body.packageId = Number(v.packageId);
      const r = await A.post('/api/admin/bookings', body); toast(`Booking ${r.booking.ref} created (${money(r.quote?.total ?? r.booking.total)})`, 'ok'); window.dispatchEvent(new Event('actions:changed')); done?.(); go(`/admin/bookings/${r.booking.ref}`);
    } });
}
