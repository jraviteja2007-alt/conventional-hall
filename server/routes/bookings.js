import fs from 'node:fs';
import { all, get, run, audit } from '../db/index.js';
import { E, readBody } from '../lib/http.js';
import { validate, cleanText, normalizePhone } from '../lib/validate.js';
import { rateLimit, isStaffRole, can } from '../lib/security.js';
import { requireUser } from './auth.js';
import * as B from '../services/bookings.js';
import * as P from '../services/payments.js';
import * as D from '../services/documents.js';
import { saveUpload, readUpload } from '../services/uploads.js';
import { quote } from '../services/pricing.js';
import { notifyAdmins } from '../services/notifications.js';
import { config } from '../config.js';
import { getSetting } from '../services/settings.js';
import { nowTs, todayLocal } from '../lib/time.js';

const bookingSchema = {
  hallId: 'int|required', eventId: 'int|required', eventTitle: 'string|max:120',
  date: 'date|required', start: 'time|required', end: 'time|required', guests: 'int|required|min:1|max:20000',
  packageId: 'int', services: 'array|max:30', couponCode: 'string|max:30', requirements: 'string|max:2000',
  eventDetails: 'object', mode: 'enum:pay,request|default:request',
};
const customerSchema = { name: 'string|required|min:2|max:80', phone: 'phone|required', email: 'email|required' };

/** Access rule: owner, any staff, or (read/pay only) a guest presenting the booking reference + phone. */
function access(ctx, b, { write = false } = {}) {
  if (!b) throw E.notFound('Booking not found');
  if (ctx.user && (b.user_id === ctx.user.id || isStaffRole(ctx.user.role))) return;
  if (!write) {
    const phone = normalizePhone(ctx.query?.phone || ctx.body?.phone || '');
    if (phone && phone === b.phone) return;
  }
  throw E.notFound('Booking not found'); // do not reveal existence
}

const sendPdf = (ctx, buf, name) => ctx.raw(200, buf, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'private, no-store' });

export function register(r) {
  // ---- create ----
  r.post('/api/bookings', rateLimit({ windowMs: 10 * 60_000, max: 12, name: 'booking' }), (ctx) => {
    const v = validate(ctx.body, bookingSchema);
    const given = ctx.body?.customer && typeof ctx.body.customer === 'object' ? ctx.body.customer : {};
    const base = ctx.user ? { name: ctx.user.name, phone: ctx.user.phone, email: ctx.user.email } : {};
    const customer = validate({ ...base, ...Object.fromEntries(Object.entries(given).filter(([, x]) => x)) }, customerSchema);
    const res = B.createBooking({ ...v, services: v.services || [], customer }, { user: ctx.user, ip: ctx.ip });
    return { booking: res.booking, quote: res.quote };
  });

  // ---- guest lookup (ref + phone) ----
  r.get('/api/bookings/lookup', rateLimit({ windowMs: 10 * 60_000, max: 15, name: 'lookup' }), (ctx) => {
    const v = validate(ctx.query, { ref: 'string|required|max:30', phone: 'phone|required' });
    const b = B.loadBooking(v.ref.toUpperCase());
    if (!b || b.phone !== v.phone) throw E.notFound('We could not find a booking with those details');
    return { booking: B.hydrate(b) };
  });

  r.get('/api/me/bookings', requireUser, (ctx) => {
    const rows = all('SELECT * FROM bookings WHERE user_id=? ORDER BY event_date DESC, id DESC', ctx.user.id);
    const bookings = rows.map((b) => B.hydrate(b));
    const t = todayLocal();
    const myPay = all(`SELECT p.id, p.receipt_no, p.amount, p.status, p.method, p.verified_at, b.ref FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.user_id=? AND p.status IN ('paid','partially_refunded','refunded') ORDER BY p.id DESC`, ctx.user.id);
    const enq = all(`SELECT id, event_type, event_date, status, created_at FROM enquiries WHERE lower(email)=lower(?) OR phone=? ORDER BY id DESC LIMIT 20`, ctx.user.email, ctx.user.phone || '');
    return {
      upcoming: bookings.filter((b) => b.event_date >= t && !['cancelled', 'rejected', 'expired', 'completed'].includes(b.status)),
      history: bookings.filter((b) => b.event_date < t || ['cancelled', 'rejected', 'expired', 'completed'].includes(b.status)),
      payments: myPay, enquiries: enq,
      reviewable: bookings.filter((b) => ['confirmed', 'completed'].includes(b.status) && b.event_date < t && !get('SELECT 1 x FROM reviews WHERE booking_id=?', b.id)).map((b) => b.ref),
    };
  });

  r.get('/api/bookings/:ref', (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase());
    access(ctx, b);
    const h = B.hydrate(b);
    h.policy = { refundIfCancelledNow: B.refundFor(b, B.paidAmount(b.id)) };
    return { booking: h };
  });

  // ---- modify / reschedule / cancel ----
  r.patch('/api/bookings/:ref', requireUser, (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase());
    access(ctx, b, { write: true });
    const v = validate(ctx.body, { date: 'date', start: 'time', end: 'time', guests: 'int|min:1|max:20000', packageId: 'int', services: 'array|max:30', requirements: 'string|max:2000', eventDetails: 'object' });
    const changes = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
    if (ctx.body.packageId === null) changes.packageId = null;
    return { booking: B.modify(b.ref, changes, ctx.user, ctx.ip, { byAdmin: isStaffRole(ctx.user.role) && can(ctx.user.role, 'bookings.manage') }) };
  });
  r.post('/api/bookings/:ref/cancel', requireUser, (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase());
    access(ctx, b, { write: true });
    const v = validate(ctx.body, { reason: 'string|max:300' });
    return B.cancel(b.ref, v.reason, ctx.user, ctx.ip, { byAdmin: false });
  });
  r.post('/api/bookings/:ref/quote', (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase());
    access(ctx, b);
    const v = validate(ctx.body, { date: 'date', start: 'time', end: 'time', guests: 'int|min:1' });
    return { quote: quote({ hallId: b.hall_id, date: v.date || b.event_date, start: v.start || b.start_time, end: v.end || b.end_time, guests: v.guests || b.guests, packageId: b.package_id, services: all('SELECT service_id id, quantity qty FROM booking_services WHERE booking_id=? AND included=0', b.id) }) };
  });

  // ---- documents (ID proofs etc.). Raw upload: Content-Type = file mime, X-Filename, X-Doc-Kind ----
  r.post('/api/bookings/:ref/documents', rateLimit({ windowMs: 10 * 60_000, max: 20, name: 'upload' }), async (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase());
    access(ctx, b);
    if (all('SELECT id FROM booking_documents WHERE booking_id=?', b.id).length >= 10) throw E.unprocessable('TOO_MANY_FILES', 'You can upload up to 10 documents per booking');
    const buffer = await readBody(ctx.req, { raw: true, limit: config.maxUploadBytes + 1024 });
    const f = saveUpload({ buffer, filename: decodeURIComponent(ctx.req.headers['x-filename'] || 'document'), mime: ctx.req.headers['content-type'] });
    const kind = cleanText(ctx.req.headers['x-doc-kind'] || 'id_proof').slice(0, 30);
    const id = run('INSERT INTO booking_documents(booking_id,kind,original_name,stored_name,mime,size,uploaded_by) VALUES(?,?,?,?,?,?,?)', b.id, kind, f.original, f.stored, f.mime, f.size, ctx.user?.id ?? null).id;
    return { document: { id, kind, original_name: f.original, size: f.size } };
  });
  r.get('/api/bookings/:ref/documents/:id', (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase());
    access(ctx, b);
    const d = get('SELECT * FROM booking_documents WHERE id=? AND booking_id=?', Number(ctx.params.id), b.id);
    if (!d) throw E.notFound();
    const p = readUpload('docs', d.stored_name);
    if (!p) throw E.notFound();
    return ctx.raw(200, fs.readFileSync(p), { 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="${d.original_name.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  });

  // ---- PDFs ----
  r.get('/api/bookings/:ref/confirmation.pdf', (ctx) => { const b = B.loadBooking(ctx.params.ref.toUpperCase()); access(ctx, b); return sendPdf(ctx, D.bookingConfirmationPdf(b.ref), `confirmation-${b.ref}.pdf`); });
  r.get('/api/bookings/:ref/invoice.pdf', (ctx) => {
    const b = B.loadBooking(ctx.params.ref.toUpperCase()); access(ctx, b);
    if (!['confirmed', 'completed'].includes(b.status)) throw E.unprocessable('INVALID_STATE', 'An invoice is available once the booking is confirmed.');
    return sendPdf(ctx, D.invoicePdf(b.ref), `invoice-${b.ref}.pdf`);
  });
  r.get('/api/payments/:id/receipt.pdf', (ctx) => {
    const p = get('SELECT * FROM payments WHERE id=?', Number(ctx.params.id));
    if (!p) throw E.notFound();
    access(ctx, B.loadBooking(p.booking_id));
    const buf = D.receiptPdf(p.id);
    if (!buf) throw E.notFound('No receipt for an unpaid payment');
    return sendPdf(ctx, buf, `receipt-${p.receipt_no}.pdf`);
  });

  // ---- payments ----
  const payLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, name: 'pay' });
  r.post('/api/payments/create-order', payLimit, async (ctx) => {
    const v = validate(ctx.body, { ref: 'string|required|max:30', purpose: 'enum:advance,balance,full|default:advance', phone: 'phone' });
    const b = B.loadBooking(v.ref.toUpperCase());
    access(ctx, b);
    return P.createOrder(b.ref, { purpose: v.purpose, user: ctx.user, ip: ctx.ip });
  });
  r.post('/api/payments/mock/pay', payLimit, (ctx) => {
    const v = validate(ctx.body, { orderId: 'string|required|max:80' });
    return P.mockGatewayPay(v.orderId);
  });
  r.post('/api/payments/verify', payLimit, (ctx) => {
    const v = validate(ctx.body, { orderId: 'string|required|max:80', paymentId: 'string|required|max:80', signature: 'string|required|max:200', method: 'string|max:30' });
    const res = P.verifyClientPayment(v, ctx.user, ctx.ip);
    return { ok: true, booking: res.booking, receipt_no: res.payment.receipt_no, paymentId: res.payment.id };
  });
  r.post('/api/webhooks/:gateway', async (ctx) => {
    const raw = (await readBody(ctx.req, { raw: true, limit: 500_000 })).toString('utf8');
    return P.handleWebhook(ctx.params.gateway, raw, ctx.req.headers, ctx.ip);
  });

  // ---- reviews (only after an eligible, completed event) ----
  r.post('/api/reviews', requireUser, rateLimit({ windowMs: 60 * 60_000, max: 10, name: 'review' }), (ctx) => {
    const v = validate(ctx.body, { ref: 'string|required', rating: 'int|required|min:1|max:10', title: 'string|max:100', body: 'string|required|min:10|max:1500' });
    const maxRating = getSetting('reviews').max_rating;
    if (v.rating > maxRating) throw E.validation({ rating: `Rating must be between 1 and ${maxRating}` });
    const b = B.loadBooking(v.ref.toUpperCase());
    if (!b || b.user_id !== ctx.user.id) throw E.notFound('Booking not found');
    if (!['confirmed', 'completed'].includes(b.status) || b.end_ts > nowTs()) throw E.unprocessable('NOT_ELIGIBLE', 'You can review a booking after your event has taken place.');
    if (get('SELECT 1 x FROM reviews WHERE booking_id=?', b.id)) throw E.conflict('ALREADY_REVIEWED', 'You have already reviewed this booking.');
    const ev = get('SELECT name FROM events WHERE id=?', b.event_id);
    run('INSERT INTO reviews(booking_id,user_id,hall_id,author_name,event_label,rating,title,body,status) VALUES(?,?,?,?,?,?,?,?,?)', b.id, ctx.user.id, b.hall_id, ctx.user.name, ev?.name || null, v.rating, v.title ?? null, v.body, 'pending');
    return { ok: true, message: 'Thank you! Your review will appear after moderation.' };
  });
}
