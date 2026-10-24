import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run } from '../db.js';
import { config } from '../config.js';
import { ApiError, bad, forbidden, notFound, parseMultipart, rateLimit, readBody } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import { hasRole } from '../lib/auth.js';
import { requireAuth, idParam } from './common.js';
import { createBooking, getBooking, modifyBooking, transition, cancellationRefundPercent, daysUntil } from '../services/bookings.js';
import { initiatePayment, mockCheckout, verifyPayment, handleRazorpayWebhook } from '../services/payments.js';
import { invoicePdf, receiptPdf, confirmationPdf } from '../services/documents.js';
import { notifyAdmin } from '../services/notify.js';
import { setting } from '../services/settings.js';

export const bookingSchema = {
  hall_id: { type: 'int', required: true }, event_type_id: { type: 'int' }, package_id: { type: 'int' },
  customer_name: { required: true, min: 2, max: 80 }, phone: { type: 'phone', required: true }, email: { type: 'email', required: true },
  custom_event: { max: 200 }, requirements: { max: 2000 },
  event_date: { type: 'date', required: true }, start_time: { type: 'time', required: true }, end_time: { type: 'time', required: true },
  guests: { type: 'int', required: true, min: 1, max: 100000 }, coupon: { max: 40 },
};
export const parseServices = (body) => (Array.isArray(body.services) ? body.services.slice(0, 30).map((s) => ({ id: Number(s.id), qty: Number(s.qty) || 1 })) : []);

/** Booking is visible to its owner and to staff+. */
export function bookingFor(req, id) {
  const b = getBooking(id);
  if (!b) throw notFound('Booking');
  if (b.user_id !== req.user.id && !hasRole(req.user, 'staff')) throw notFound('Booking');
  return b;
}
const MAGIC = [[Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'], [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png'], [Buffer.from('%PDF'), 'application/pdf']];
export function sniff(buf) {
  for (const [sig, mime] of MAGIC) if (buf.subarray(0, sig.length).equals(sig)) return mime;
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
const EXT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'application/pdf': ['.pdf'] };
/** Validates extension, declared MIME, real content (magic bytes) and size. Returns a safe random stored name. */
export function checkUpload(f, allowed, maxBytes) {
  if (!f) throw bad('No file uploaded');
  const ext = path.extname(f.filename).toLowerCase();
  const real = sniff(f.data);
  if (!real || !allowed.includes(real)) throw new ApiError(415, 'BAD_FILE', 'Unsupported file type');
  if (!EXT[real].includes(ext)) throw new ApiError(415, 'BAD_FILE', 'File extension does not match its content');
  if (f.mime && f.mime !== real && !(real === 'image/jpeg' && f.mime === 'image/jpg')) throw new ApiError(415, 'BAD_FILE', 'File type mismatch');
  if (f.data.length > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', `File must be under ${Math.round(maxBytes / 1048576)} MB`);
  return { mime: real, stored: crypto.randomBytes(16).toString('hex') + EXT[real][0] };
}

export function accountRoutes(app) {
  const bookLimit = rateLimit({ windowMs: 10 * 60_000, max: 12, scope: 'booking', message: 'Too many booking attempts. Please try again shortly.' });

  // An account is required so customers can pay, upload documents and track their booking.
  app.post('/api/bookings', requireAuth, bookLimit, (req, res) => {
    const v = validate(req.body, bookingSchema);
    const b = createBooking(req.user, { ...v, services: parseServices(req.body) });
    res.json({ booking: b }, 201);
  });
  app.get('/api/bookings', requireAuth, (req, res) => {
    const rows = all(`SELECT b.id FROM bookings b WHERE b.user_id=? ORDER BY b.event_date DESC`, req.user.id);
    const bookings = rows.map((r) => {
      const b = getBooking(r.id);
      return { ...b, payments: all('SELECT id,kind,amount,status,receipt_no,paid_at,created_at FROM payments WHERE booking_id=? ORDER BY id', b.id), review: get('SELECT id,status,rating FROM reviews WHERE booking_id=?', b.id) || null };
    });
    res.json({ bookings, policy: { tiers: setting('cancellation').tiers, modify_days: setting('booking').customer_modify_days } });
  });
  app.get('/api/bookings/:id', requireAuth, (req, res) => {
    const b = bookingFor(req, idParam(req));
    res.json({ booking: b, payments: all('SELECT id,kind,amount,status,receipt_no,paid_at FROM payments WHERE booking_id=? ORDER BY id', b.id), documents: all('SELECT id,kind,original_name,size,created_at FROM booking_documents WHERE booking_id=?', b.id) });
  });
  app.patch('/api/bookings/:id', requireAuth, bookLimit, (req, res) => {
    const b = bookingFor(req, idParam(req));
    const v = validate(req.body, { event_date: { type: 'date' }, start_time: { type: 'time' }, end_time: { type: 'time' }, guests: { type: 'int', min: 1, max: 100000 }, package_id: { type: 'int' }, requirements: { max: 2000 }, coupon: { max: 40 } });
    const patch = { ...v }; if (Array.isArray(req.body.services)) patch.services = parseServices(req.body);
    res.json(modifyBooking(b.id, patch, { actor: req.user, isStaff: hasRole(req.user, 'staff') }));
  });
  app.get('/api/bookings/:id/cancel-preview', requireAuth, (req, res) => {
    const b = bookingFor(req, idParam(req));
    const pct = cancellationRefundPercent(b.event_date);
    res.json({ refund_percent: pct, refund_amount: Math.round(((b.paid_amount - b.refunded_amount) * pct) / 100), days_left: daysUntil(b.event_date) });
  });
  app.post('/api/bookings/:id/cancel', requireAuth, (req, res) => {
    const b = bookingFor(req, idParam(req));
    const v = validate(req.body, { reason: { max: 300 } });
    res.json(transition(b.id, 'cancel', { actor: req.user, reason: v.reason || 'Cancelled by customer' }));
  });

  // ---- payments ----
  app.post('/api/bookings/:id/pay', requireAuth, rateLimit({ windowMs: 10 * 60_000, max: 20, scope: 'pay' }), async (req, res) => {
    const b = bookingFor(req, idParam(req));
    const v = validate(req.body, { kind: { enum: ['advance', 'balance'], default: 'advance' } });
    res.json(await initiatePayment(b, v.kind));
  });
  app.post('/api/payments/mock/checkout', requireAuth, (req, res) => {
    const v = validate(req.body, { order_id: { required: true, max: 80 } });
    const p = get('SELECT booking_id FROM payments WHERE provider_order_id=?', v.order_id);
    if (!p) throw notFound('Order'); bookingFor(req, p.booking_id);
    res.json(mockCheckout(v.order_id));
  });
  app.post('/api/payments/verify', requireAuth, (req, res) => {
    const v = validate(req.body, { order_id: { required: true, max: 80 }, payment_id: { required: true, max: 80 }, signature: { required: true, max: 200 } });
    const p = get('SELECT booking_id FROM payments WHERE provider_order_id=?', v.order_id);
    if (!p) throw notFound('Order'); bookingFor(req, p.booking_id);
    res.json(verifyPayment(v));
  });
  app.post('/api/payments/webhook/razorpay', (req, res) => {
    res.json(handleRazorpayWebhook(req.rawBody || Buffer.alloc(0), req.headers['x-razorpay-signature']));
  });

  // ---- documents (PDF) ----
  const pdf = (res, name, buf) => { res.setHeader('Content-Disposition', `inline; filename="${name}"`); res.setHeader('Cache-Control', 'private, no-store'); res.send(buf, 'application/pdf'); };
  app.get('/api/documents/confirmation/:id', requireAuth, (req, res) => { const b = bookingFor(req, idParam(req)); pdf(res, `confirmation-${b.ref}.pdf`, confirmationPdf(b)); });
  app.get('/api/documents/invoice/:id', requireAuth, (req, res) => { const b = bookingFor(req, idParam(req)); pdf(res, `invoice-${b.ref}.pdf`, invoicePdf(b)); });
  app.get('/api/documents/receipt/:id', requireAuth, (req, res) => {
    const p = get('SELECT * FROM payments WHERE id=?', idParam(req));
    if (!p || !['paid', 'refunded'].includes(p.status)) throw notFound('Receipt');
    const b = bookingFor(req, p.booking_id); pdf(res, `receipt-${p.receipt_no}.pdf`, receiptPdf(p, b));
  });

  // ---- customer document upload (ID proof etc.) ----
  app.post('/api/bookings/:id/documents', requireAuth, rateLimit({ windowMs: 10 * 60_000, max: 15, scope: 'upload' }), (req, res) => {
    const b = bookingFor(req, idParam(req));
    const { fields, files } = parseMultipart(req);
    const f = files[0]; const { mime, stored } = checkUpload(f, ['image/jpeg', 'image/png', 'application/pdf'], 5 * 1048576);
    if (get('SELECT COUNT(*) n FROM booking_documents WHERE booking_id=?', b.id).n >= 10) throw new ApiError(422, 'LIMIT', 'Maximum of 10 documents per booking');
    const dir = path.join(config.uploadDir, 'private'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, stored), f.data);
    const kind = ['id_proof', 'address_proof', 'organisation_letter', 'other'].includes(fields.kind) ? fields.kind : 'other';
    const r = run('INSERT INTO booking_documents(booking_id,kind,original_name,stored_name,mime,size) VALUES (?,?,?,?,?,?)', b.id, kind, f.filename.replace(/[^\w.\- ]/g, '_').slice(0, 100), stored, mime, f.data.length);
    notifyAdmin('document', `Document uploaded for ${b.ref}`, `${b.customer_name}: ${kind}`, '/admin/bookings');
    res.json({ id: Number(r.lastInsertRowid) }, 201);
  });
  app.get('/api/documents/file/:id', requireAuth, (req, res) => {
    const d = get('SELECT * FROM booking_documents WHERE id=?', idParam(req));
    if (!d) throw notFound('Document'); bookingFor(req, d.booking_id);
    const file = path.join(config.uploadDir, 'private', path.basename(d.stored_name));
    if (!fs.existsSync(file)) throw notFound('Document');
    res.setHeader('Content-Disposition', `attachment; filename="${d.original_name}"`); res.setHeader('Cache-Control', 'private, no-store');
    res.send(fs.readFileSync(file), d.mime);
  });

  // ---- notifications ----
  app.get('/api/notifications', requireAuth, (req, res) => {
    res.json({ notifications: all('SELECT id,type,title,body,link,is_read,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', req.user.id), unread: get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND is_read=0', req.user.id).n });
  });
  app.post('/api/notifications/read', requireAuth, (req, res) => { run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id); res.json({ ok: true }); });

  // ---- reviews (only after the event date, one per booking, moderated) ----
  app.post('/api/reviews', requireAuth, (req, res) => {
    const v = validate(req.body, { booking_id: { type: 'int', required: true }, rating: { type: 'int', required: true, min: 1, max: 5 }, title: { max: 100 }, body: { required: true, min: 10, max: 1500 } });
    const b = bookingFor(req, v.booking_id);
    if (b.user_id !== req.user.id) throw forbidden();
    if (!['confirmed', 'completed'].includes(b.status) || b.event_date >= new Date().toISOString().slice(0, 10)) throw new ApiError(409, 'NOT_ELIGIBLE', 'You can review a booking after your event has taken place.');
    if (get('SELECT 1 x FROM reviews WHERE booking_id=?', b.id)) throw new ApiError(409, 'DUPLICATE', 'You have already reviewed this booking.');
    run('INSERT INTO reviews(booking_id,user_id,author,event_label,rating,title,body) VALUES (?,?,?,?,?,?,?)', b.id, req.user.id, req.user.name, b.event_name || b.custom_event, v.rating, v.title, v.body);
    notifyAdmin('review', `New review from ${req.user.name}`, `${v.rating}★ — awaiting moderation`, '/admin/reviews');
    res.json({ ok: true, message: 'Thank you! Your review will appear once approved.' }, 201);
  });
}
