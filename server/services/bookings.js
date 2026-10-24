import crypto from 'node:crypto';
import { all, get, run, tx } from '../db.js';
import { ApiError } from '../lib/http.js';
import { toMin, todayISO } from '../lib/validate.js';
import { setting } from './settings.js';
import { quote } from './pricing.js';
import { conflicts } from './availability.js';
import { notify, notifyAdmin } from './notify.js';

const sqlTime = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
const addMinutes = (m) => sqlTime(new Date(Date.now() + m * 60000));
export const daysUntil = (date) => Math.ceil((Date.parse(date + 'T00:00:00Z') - Date.parse(todayISO() + 'T00:00:00Z')) / 864e5);
const conflictError = () => new ApiError(409, 'BOOKING_CONFLICT', 'Sorry — that date and time has just been taken. Please choose another slot.');

function makeRef() {
  for (let i = 0; i < 10; i++) {
    const ref = `BK-${todayISO().slice(2).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!get('SELECT 1 x FROM bookings WHERE ref=?', ref)) return ref;
  }
  throw new Error('Could not allocate booking reference');
}
const mapDbError = (e) => (String(e.message).includes('BOOKING_CONFLICT') ? conflictError() : e);

export function hydrate(b) {
  if (!b) return b;
  b.breakdown = b.breakdown ? JSON.parse(b.breakdown) : null;
  b.services = all('SELECT service_id, name, qty, amount FROM booking_services WHERE booking_id=?', b.id);
  b.balance = Math.max(0, b.total - b.paid_amount + b.refunded_amount);
  return b;
}
export function getBooking(id) {
  return hydrate(get(`SELECT b.*, h.name AS hall_name, e.name AS event_name, p.name AS package_name
    FROM bookings b JOIN halls h ON h.id=b.hall_id LEFT JOIN event_types e ON e.id=b.event_type_id LEFT JOIN packages p ON p.id=b.package_id WHERE b.id=?`, id));
}

function priceFor(input) {
  return quote({ hall_id: input.hall_id, date: input.event_date, start: input.start_time, end: input.end_time, guests: input.guests, package_id: input.package_id, services: input.services, coupon: input.coupon });
}
function writeServices(bookingId, q) {
  run('DELETE FROM booking_services WHERE booking_id=?', bookingId);
  for (const s of q.services) run('INSERT INTO booking_services(booking_id,service_id,name,qty,amount) VALUES (?,?,?,?,?)', bookingId, s.id, s.name, s.qty, s.amount);
}

export function createBooking(user, input) {
  const q = priceFor(input);
  const cfg = setting('booking');
  const startMin = toMin(input.start_time), endMin = toMin(input.end_time);
  const status = cfg.require_approval ? 'pending' : 'reserved';
  const hold = status === 'pending' ? addMinutes(cfg.hold_minutes) : addMinutes(cfg.advance_deadline_hours * 60);
  const id = tx(() => {
    // Re-check inside the write transaction: closes the race between "check" and "insert".
    if (conflicts({ hallId: input.hall_id, date: input.event_date, startMin, endMin }).length) throw conflictError();
    let r;
    try {
      r = run(`INSERT INTO bookings(ref,user_id,hall_id,event_type_id,package_id,customer_name,phone,email,custom_event,requirements,event_date,start_time,end_time,
        start_min,end_min,buffer_min,guests,status,hold_expires_at,subtotal,discount,tax,total,advance_due,coupon_code,breakdown)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        makeRef(), user?.id ?? null, input.hall_id, input.event_type_id ?? null, input.package_id ?? null, input.customer_name, input.phone, input.email,
        input.custom_event ?? null, input.requirements ?? null, input.event_date, input.start_time, input.end_time, startMin, endMin, cfg.buffer_minutes,
        input.guests, status, hold, q.subtotal, q.discount, q.tax, q.total, q.advance_due, q.coupon?.code ?? null, JSON.stringify(q));
    } catch (e) { throw mapDbError(e); }
    const bid = Number(r.lastInsertRowid);
    writeServices(bid, q);
    if (q.coupon) run('UPDATE coupons SET used = used + 1 WHERE code=?', q.coupon.code);
    return bid;
  });
  const b = getBooking(id);
  notify({ userId: b.user_id, type: 'booking_received', title: `Booking request ${b.ref} received`, link: '/account',
    body: `Hello ${b.customer_name}, we received your request for ${b.hall_name} on ${b.event_date} (${b.start_time}–${b.end_time}). ${status === 'pending' ? 'Our team will review it shortly.' : 'Please pay the advance to confirm.'}`,
    email: b.email, phone: b.phone });
  notifyAdmin('new_booking', `New booking request ${b.ref}`, `${b.customer_name} · ${b.hall_name} · ${b.event_date} · ₹${b.total}`, `/admin/bookings`);
  return b;
}

const NEXT = {
  approve: { from: ['pending'], to: 'reserved' },
  reject: { from: ['pending'], to: 'rejected' },
  confirm: { from: ['pending', 'reserved'], to: 'confirmed' },
  complete: { from: ['confirmed'], to: 'completed' },
  cancel: { from: ['pending', 'reserved', 'confirmed'], to: 'cancelled' },
};

export function cancellationRefundPercent(eventDate) {
  const days = daysUntil(eventDate);
  const tier = [...setting('cancellation').tiers].sort((a, b) => b.min_days - a.min_days).find((t) => days >= t.min_days);
  return tier ? tier.refund_percent : 0;
}

export function transition(id, action, { actor, reason, refundPercent } = {}) {
  const rule = NEXT[action];
  if (!rule) throw new ApiError(400, 'BAD_ACTION', 'Unknown action');
  const res = tx(() => {
    const b = get('SELECT * FROM bookings WHERE id=?', id);
    if (!b) throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
    if (!rule.from.includes(b.status)) throw new ApiError(409, 'BAD_STATE', `A ${b.status} booking cannot be ${action === 'approve' ? 'approved' : action + 'ed'}.`);
    let hold = null, refund = 0;
    if (action === 'approve') hold = addMinutes(setting('booking').advance_deadline_hours * 60);
    if (action === 'approve' || action === 'confirm') {
      if (conflicts({ hallId: b.hall_id, date: b.event_date, startMin: b.start_min, endMin: b.end_min, excludeId: b.id }).length) throw conflictError();
    }
    if (action === 'cancel') {
      const pct = refundPercent ?? cancellationRefundPercent(b.event_date);
      refund = Math.round(((b.paid_amount - b.refunded_amount) * pct) / 100);
      if (refund > 0) {
        run(`INSERT INTO payments(booking_id,kind,provider,amount,status,note) VALUES (?, 'refund', 'manual', ?, 'pending_refund', ?)`, b.id, refund, `Cancellation refund (${pct}%)`);
      }
    }
    try {
      run(`UPDATE bookings SET status=?, hold_expires_at=?, cancel_reason=COALESCE(?, cancel_reason), updated_at=datetime('now') WHERE id=?`, rule.to, hold, reason ?? null, id);
    } catch (e) { throw mapDbError(e); }
    if ((action === 'reject' || action === 'cancel') && b.coupon_code) run('UPDATE coupons SET used = MAX(0, used - 1) WHERE code=?', b.coupon_code);
    return { before: b, refund };
  });
  const b = getBooking(id);
  const msgs = {
    approve: [`Booking ${b.ref} approved`, `Great news! Your booking for ${b.event_date} is approved. Pay the advance of ₹${b.advance_due} within ${setting('booking').advance_deadline_hours} hours to confirm your date.`],
    reject: [`Booking ${b.ref} could not be accepted`, `We're sorry, we couldn't accept your request for ${b.event_date}.${reason ? ' Reason: ' + reason : ''}`],
    confirm: [`Booking ${b.ref} confirmed`, `Your booking for ${b.event_date} (${b.start_time}–${b.end_time}) at ${b.hall_name} is confirmed.`],
    complete: [`Thank you for hosting with us`, `We hope ${b.ref} was memorable! Please share a review from your dashboard.`],
    cancel: [`Booking ${b.ref} cancelled`, `Your booking for ${b.event_date} has been cancelled.${res.refund ? ` A refund of ₹${res.refund} will be processed.` : ''}`],
  }[action];
  notify({ userId: b.user_id, type: `booking_${rule.to}`, title: msgs[0], body: msgs[1], link: '/account', email: b.email, phone: b.phone });
  if (action === 'cancel') notifyAdmin('cancellation', `Booking ${b.ref} cancelled`, `${b.customer_name} · ${b.event_date}${actor ? ' · by ' + actor.name : ''}`, '/admin/bookings');
  return { booking: b, refund: res.refund };
}

/** Modify / reschedule. Re-prices server-side and re-checks availability inside the write lock. */
export function modifyBooking(id, patch, { actor, isStaff }) {
  const b0 = get('SELECT * FROM bookings WHERE id=?', id);
  if (!b0) throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
  if (!['pending', 'reserved', 'confirmed'].includes(b0.status)) throw new ApiError(409, 'BAD_STATE', 'This booking can no longer be changed.');
  const cfg = setting('booking');
  if (!isStaff && daysUntil(b0.event_date) < cfg.customer_modify_days) {
    throw new ApiError(403, 'TOO_LATE', `Changes are allowed up to ${cfg.customer_modify_days} days before the event. Please contact us.`);
  }
  const prev = hydrate({ ...b0 });
  const next = {
    hall_id: patch.hall_id ?? b0.hall_id, event_date: patch.event_date ?? b0.event_date,
    start_time: patch.start_time ?? b0.start_time, end_time: patch.end_time ?? b0.end_time,
    guests: patch.guests ?? b0.guests, package_id: patch.package_id !== undefined ? patch.package_id : b0.package_id,
    services: patch.services ?? prev.services.map((s) => ({ id: s.service_id, qty: s.qty })),
    coupon: patch.coupon !== undefined ? patch.coupon : b0.coupon_code,
  };
  const q = quote({ ...next, date: next.event_date, start: next.start_time, end: next.end_time, strict: !isStaff });
  tx(() => {
    const sMin = toMin(next.start_time), eMin = toMin(next.end_time);
    if (conflicts({ hallId: next.hall_id, date: next.event_date, startMin: sMin, endMin: eMin, excludeId: id }).length) throw conflictError();
    try {
      run(`UPDATE bookings SET hall_id=?, event_date=?, start_time=?, end_time=?, start_min=?, end_min=?, guests=?, package_id=?,
        requirements=COALESCE(?, requirements), custom_event=COALESCE(?, custom_event), subtotal=?, discount=?, tax=?, total=?, advance_due=?, coupon_code=?, breakdown=?, reminder_sent=0,
        updated_at=datetime('now') WHERE id=?`,
        next.hall_id, next.event_date, next.start_time, next.end_time, sMin, eMin, next.guests, next.package_id ?? null,
        patch.requirements ?? null, patch.custom_event ?? null, q.subtotal, q.discount, q.tax, q.total, q.advance_due, q.coupon?.code ?? null, JSON.stringify(q), id);
    } catch (e) { throw mapDbError(e); }
    writeServices(id, q);
  });
  const b = getBooking(id);
  notify({ userId: b.user_id, type: 'booking_modified', title: `Booking ${b.ref} updated`, link: '/account', email: b.email, phone: b.phone,
    body: `Your booking now stands at ${b.event_date} ${b.start_time}–${b.end_time}, ${b.guests} guests. New total: ₹${b.total}.` });
  return { booking: b, previous: { event_date: prev.event_date, start_time: prev.start_time, end_time: prev.end_time, total: prev.total } };
}

/** Housekeeping: expire stale holds and send reminders. Safe to run repeatedly. */
export function sweep() {
  const now = sqlTime();
  const stale = all(`SELECT id, ref, user_id, email, phone, coupon_code FROM bookings WHERE status IN ('pending','reserved') AND hold_expires_at IS NOT NULL AND hold_expires_at < ?`, now);
  for (const b of stale) {
    run(`UPDATE bookings SET status='expired', updated_at=datetime('now') WHERE id=? AND status IN ('pending','reserved')`, b.id);
    if (b.coupon_code) run('UPDATE coupons SET used = MAX(0, used - 1) WHERE code=?', b.coupon_code);
    notify({ userId: b.user_id, type: 'booking_expired', title: `Booking ${b.ref} expired`, body: 'The hold on your date expired because the advance was not received in time. You can submit a new request anytime.', email: b.email, phone: b.phone });
  }
  const days = setting('booking').reminder_days;
  const soon = all(`SELECT * FROM bookings WHERE status='confirmed' AND reminder_sent=0 AND event_date BETWEEN ? AND ?`, todayISO(), new Date(Date.now() + days * 864e5).toISOString().slice(0, 10));
  for (const b of soon) {
    run('UPDATE bookings SET reminder_sent=1 WHERE id=?', b.id);
    notify({ userId: b.user_id, type: 'reminder', title: `Reminder: your event is on ${b.event_date}`, body: `Booking ${b.ref} — ${b.start_time} to ${b.end_time}. Balance due: ₹${Math.max(0, b.total - b.paid_amount + b.refunded_amount)}.`, email: b.email, phone: b.phone });
  }
  run(`UPDATE bookings SET status='completed', updated_at=datetime('now') WHERE status='confirmed' AND event_date < ?`, todayISO());
  return { expired: stale.length, reminded: soon.length };
}
