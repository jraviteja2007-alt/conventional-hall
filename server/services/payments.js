import crypto from 'node:crypto';
import { all, get, run, tx } from '../db.js';
import { config } from '../config.js';
import { ApiError } from '../lib/http.js';
import { hmacHex, safeEqual } from '../lib/auth.js';
import { notify, notifyAdmin } from './notify.js';
import { getBooking } from './bookings.js';

const provider = () => config.payment.provider;
const mockSecret = () => hmacHex(config.jwtSecret, 'mock-gateway');

export const gatewayInfo = () => ({
  provider: provider(),
  key_id: provider() === 'razorpay' ? config.payment.razorpayKeyId : 'mock_key',
  mock: provider() === 'mock',
});

/** Create a gateway order for the advance / balance. Amount is computed server-side from the booking. */
export async function initiatePayment(booking, kind) {
  if (!['reserved', 'confirmed'].includes(booking.status)) {
    throw new ApiError(409, 'BAD_STATE', booking.status === 'pending' ? 'This booking is awaiting approval. You can pay once it is approved.' : `Payments are not possible for a ${booking.status} booking.`);
  }
  const due = kind === 'advance' ? booking.advance_due - booking.paid_amount : booking.total - booking.paid_amount + booking.refunded_amount;
  if (due <= 0) throw new ApiError(409, 'NOTHING_DUE', kind === 'advance' ? 'The advance has already been paid.' : 'This booking is fully paid.');
  if (provider() === 'mock' && !config.payment.allowMock) throw new ApiError(503, 'PAYMENTS_DISABLED', 'Online payments are not configured.');
  let orderId;
  if (provider() === 'razorpay') {
    const { razorpayKeyId: id, razorpayKeySecret: sec } = config.payment;
    if (!id || !sec) throw new ApiError(503, 'PAYMENTS_DISABLED', 'Online payments are not configured.');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64') },
      body: JSON.stringify({ amount: due * 100, currency: 'INR', receipt: booking.ref, notes: { booking: booking.ref } }), signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new ApiError(502, 'GATEWAY_ERROR', 'The payment gateway is unavailable. Please try again.');
    orderId = (await r.json()).id;
  } else orderId = 'order_' + crypto.randomBytes(8).toString('hex');
  const r = run(`INSERT INTO payments(booking_id,kind,provider,provider_order_id,amount,status) VALUES (?,?,?,?,?,'created')`, booking.id, kind, provider(), orderId, due);
  return { payment_id: Number(r.lastInsertRowid), order_id: orderId, amount: due, currency: 'INR', ...gatewayInfo() };
}

/** Demo gateway: behaves like a hosted checkout and returns a signed result. Disabled in production. */
export function mockCheckout(orderId) {
  if (provider() !== 'mock' || !config.payment.allowMock) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const p = get('SELECT * FROM payments WHERE provider_order_id=? AND status=?', orderId, 'created');
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
  const paymentId = 'pay_' + crypto.randomBytes(8).toString('hex');
  return { order_id: orderId, payment_id: paymentId, signature: hmacHex(mockSecret(), `${orderId}|${paymentId}`) };
}

/** Never trust the browser: recompute the gateway signature on the server before crediting anything. */
export function verifyPayment({ order_id, payment_id, signature }) {
  const p = get('SELECT * FROM payments WHERE provider_order_id=?', order_id);
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Payment order not found');
  const secret = p.provider === 'razorpay' ? config.payment.razorpayKeySecret : mockSecret();
  if (!secret || !safeEqual(hmacHex(secret, `${order_id}|${payment_id}`), signature || '')) {
    run(`UPDATE payments SET status='failed', note='Signature verification failed' WHERE id=? AND status='created'`, p.id);
    throw new ApiError(400, 'BAD_SIGNATURE', 'Payment could not be verified.');
  }
  return applyPaid(p.id, payment_id);
}

/** Idempotent: safe to call from both the browser verify call and the gateway webhook. */
export function applyPaid(paymentId, providerPaymentId) {
  const out = tx(() => {
    const p = get('SELECT * FROM payments WHERE id=?', paymentId);
    if (p.status === 'paid') return { already: true, payment: p };
    const receipt = `RCP-${new Date().getFullYear()}-${String(p.id).padStart(5, '0')}`;
    run(`UPDATE payments SET status='paid', provider_payment_id=?, receipt_no=?, paid_at=datetime('now') WHERE id=?`, providerPaymentId, receipt, p.id);
    run(`UPDATE bookings SET paid_amount = paid_amount + ?, updated_at=datetime('now') WHERE id=?`, p.amount, p.booking_id);
    const b = get('SELECT * FROM bookings WHERE id=?', p.booking_id);
    let confirmed = false;
    if (b.status === 'reserved' && b.paid_amount >= b.advance_due) {
      run(`UPDATE bookings SET status='confirmed', hold_expires_at=NULL WHERE id=?`, b.id); confirmed = true;
      if (!get('SELECT 1 x FROM invoices WHERE booking_id=?', b.id)) run('INSERT INTO invoices(number,booking_id) VALUES (?,?)', `INV-${new Date().getFullYear()}-${String(b.id).padStart(5, '0')}`, b.id);
    }
    return { already: false, confirmed, payment: get('SELECT * FROM payments WHERE id=?', p.id) };
  });
  if (!out.already) {
    const b = getBooking(out.payment.booking_id);
    notify({ userId: b.user_id, type: 'payment_received', title: `Payment received — ₹${out.payment.amount}`, link: '/account', email: b.email, phone: b.phone,
      body: `Thank you! We received ₹${out.payment.amount} for ${b.ref}. Receipt ${out.payment.receipt_no}.${out.confirmed ? ' Your booking is now confirmed.' : ''}` });
    notifyAdmin('payment', `Payment ₹${out.payment.amount} · ${b.ref}`, `${b.customer_name} paid via ${out.payment.provider}`, '/admin/payments');
    if (out.confirmed) notify({ userId: b.user_id, type: 'booking_confirmed', title: `Booking ${b.ref} confirmed`, body: `Your booking for ${b.event_date} is confirmed.`, email: b.email, phone: b.phone });
  }
  return { booking: getBooking(out.payment.booking_id), payment: out.payment, confirmed: !!out.confirmed };
}

/** Admin: record cash / bank-transfer / cheque received offline. */
export function recordOfflinePayment(bookingId, amount, note) {
  const b = getBooking(bookingId);
  if (!b) throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
  if (!['reserved', 'confirmed', 'pending'].includes(b.status)) throw new ApiError(409, 'BAD_STATE', 'Cannot record a payment for this booking.');
  if (amount <= 0 || amount > b.total - b.paid_amount + b.refunded_amount) throw new ApiError(422, 'VALIDATION_ERROR', 'Amount exceeds the balance due', { amount: 'Amount exceeds the balance due' });
  const r = run(`INSERT INTO payments(booking_id,kind,provider,provider_order_id,amount,status,note) VALUES (?,?,?,?,?, 'created', ?)`,
    bookingId, b.paid_amount ? 'balance' : 'advance', 'offline', 'off_' + crypto.randomBytes(6).toString('hex'), amount, note || 'Recorded by admin');
  return applyPaid(Number(r.lastInsertRowid), 'offline');
}

export function processRefund(paymentId, note) {
  const p = get('SELECT * FROM payments WHERE id=? AND kind=?', paymentId, 'refund');
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Refund not found');
  if (p.status !== 'pending_refund') throw new ApiError(409, 'BAD_STATE', 'This refund was already processed.');
  tx(() => {
    run(`UPDATE payments SET status='refunded', paid_at=datetime('now'), receipt_no=?, note=COALESCE(?, note) WHERE id=?`, `REF-${new Date().getFullYear()}-${String(p.id).padStart(5, '0')}`, note ?? null, p.id);
    run('UPDATE bookings SET refunded_amount = refunded_amount + ? WHERE id=?', p.amount, p.booking_id);
  });
  const b = getBooking(p.booking_id);
  notify({ userId: b.user_id, type: 'refund', title: `Refund of ₹${p.amount} processed`, body: `Your refund for ${b.ref} has been processed.`, email: b.email, phone: b.phone });
  return get('SELECT * FROM payments WHERE id=?', p.id);
}

/** Razorpay webhook: HMAC-SHA256 over the raw body with the webhook secret. */
export function handleRazorpayWebhook(rawBody, signature) {
  const secret = config.payment.razorpayWebhookSecret;
  if (!secret || !safeEqual(hmacHex(secret, rawBody), signature || '')) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid webhook signature');
  const evt = JSON.parse(rawBody.toString('utf8'));
  if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
    const ent = evt.payload?.payment?.entity;
    const p = ent && get('SELECT * FROM payments WHERE provider_order_id=?', ent.order_id);
    if (p) applyPaid(p.id, ent.id);
  }
  return { ok: true };
}
