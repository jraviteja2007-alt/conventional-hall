import { all, get } from '../db.js';

export const csvEscape = (v) => { const s = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\r\n');
};
const ACTIVE = `('confirmed','completed')`;

export function dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const q = (sql, ...p) => get(sql, ...p).n;
  return {
    total_bookings: q('SELECT COUNT(*) n FROM bookings'),
    pending_bookings: q(`SELECT COUNT(*) n FROM bookings WHERE status='pending'`),
    todays_events: q(`SELECT COUNT(*) n FROM bookings WHERE event_date=? AND status IN ('confirmed','completed')`, today),
    upcoming_events: q(`SELECT COUNT(*) n FROM bookings WHERE event_date>? AND status IN ('confirmed','reserved')`, today),
    new_enquiries: q(`SELECT COUNT(*) n FROM enquiries WHERE status='new'`),
    revenue: q(`SELECT COALESCE(SUM(paid_amount - refunded_amount),0) n FROM bookings`),
    pending_payments: q(`SELECT COALESCE(SUM(total - paid_amount + refunded_amount),0) n FROM bookings WHERE status IN ('reserved','confirmed')`),
    halls_active: q('SELECT COUNT(*) n FROM halls WHERE active=1'),
    halls_free_today: q(`SELECT COUNT(*) n FROM halls h WHERE active=1 AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.hall_id=h.id AND b.event_date=? AND b.status IN ('confirmed','reserved'))`, today),
    pending_reviews: q(`SELECT COUNT(*) n FROM reviews WHERE status='pending'`),
    pending_refunds: q(`SELECT COUNT(*) n FROM payments WHERE status='pending_refund'`),
    revenue_by_month: all(`SELECT substr(paid_at,1,7) month, SUM(amount) amount FROM payments WHERE status='paid' AND kind<>'refund' AND paid_at >= date('now','-11 months','start of month') GROUP BY 1 ORDER BY 1`),
    bookings_by_month: all(`SELECT substr(event_date,1,7) month, COUNT(*) count FROM bookings WHERE status IN ${ACTIVE} OR status IN ('reserved') GROUP BY 1 ORDER BY 1 DESC LIMIT 12`).reverse(),
    by_status: all('SELECT status, COUNT(*) count FROM bookings GROUP BY status'),
    by_event: all(`SELECT COALESCE(e.name, 'Other') name, COUNT(*) count FROM bookings b LEFT JOIN event_types e ON e.id=b.event_type_id WHERE b.status IN ('pending','reserved','confirmed','completed') GROUP BY 1 ORDER BY 2 DESC`),
    enquiries_by_status: all('SELECT status, COUNT(*) count FROM enquiries GROUP BY status'),
    payment_status: [
      { status: 'Paid', amount: get(`SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='paid' AND kind<>'refund'`).n },
      { status: 'Pending', amount: q(`SELECT COALESCE(SUM(total - paid_amount + refunded_amount),0) n FROM bookings WHERE status IN ('reserved','confirmed')`) },
      { status: 'Refunded', amount: q(`SELECT COALESCE(SUM(refunded_amount),0) n FROM bookings`) },
    ],
  };
}

export function report(type, { from, to, group = 'month' }) {
  from ||= '2000-01-01'; to ||= '2999-12-31';
  const g = { day: 10, month: 7, year: 4 }[group] || 7;
  switch (type) {
    case 'revenue': return all(`SELECT substr(paid_at,1,${g}) period, COUNT(*) payments, SUM(CASE WHEN kind<>'refund' THEN amount ELSE 0 END) collected, SUM(CASE WHEN kind='refund' THEN amount ELSE 0 END) refunded FROM payments WHERE status IN ('paid','refunded') AND substr(paid_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`, from, to);
    case 'bookings': return all(`SELECT substr(created_at,1,${g}) period, COUNT(*) requests, SUM(status IN ('confirmed','completed')) confirmed, SUM(status IN ('cancelled','rejected','expired')) lost, COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') THEN total END),0) booked_value FROM bookings WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`, from, to);
    case 'events': return all(`SELECT COALESCE(e.name, b.custom_event, 'Other') event_type, COUNT(*) bookings, COALESCE(SUM(b.total),0) value, ROUND(AVG(b.guests)) avg_guests FROM bookings b LEFT JOIN event_types e ON e.id=b.event_type_id WHERE b.status IN ('confirmed','completed') AND b.event_date BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, from, to);
    case 'customers': return all(`SELECT u.name, u.email, u.phone, COUNT(b.id) bookings, COALESCE(SUM(b.paid_amount - b.refunded_amount),0) paid, MAX(b.event_date) last_event, u.created_at joined FROM users u LEFT JOIN bookings b ON b.user_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY paid DESC`);
    case 'payments': return all(`SELECT p.id, p.receipt_no, b.ref booking, b.customer_name, p.kind, p.provider, p.amount, p.status, p.paid_at, p.created_at FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE substr(p.created_at,1,10) BETWEEN ? AND ? ORDER BY p.id DESC`, from, to);
    case 'bookings_list': return all(`SELECT b.ref, b.status, b.customer_name, b.phone, b.email, h.name hall, COALESCE(e.name, b.custom_event) event, b.event_date, b.start_time, b.end_time, b.guests, b.total, b.paid_amount, b.refunded_amount, b.created_at FROM bookings b JOIN halls h ON h.id=b.hall_id LEFT JOIN event_types e ON e.id=b.event_type_id WHERE b.event_date BETWEEN ? AND ? ORDER BY b.event_date DESC`, from, to);
    default: return null;
  }
}

export function analytics() {
  const n = (sql, ...p) => get(sql, ...p).n;
  const requests = n('SELECT COUNT(*) n FROM bookings'), confirmed = n(`SELECT COUNT(*) n FROM bookings WHERE status IN ${ACTIVE}`);
  const enq = n('SELECT COUNT(*) n FROM enquiries'), conv = n(`SELECT COUNT(*) n FROM enquiries WHERE status='converted'`);
  const ev = Object.fromEntries(all(`SELECT type, COUNT(*) c FROM analytics_events WHERE created_at >= date('now','-30 days') GROUP BY type`).map((r) => [r.type, r.c]));
  return {
    total_bookings: requests, confirmed_bookings: confirmed,
    conversion_rate: requests ? Math.round((confirmed / requests) * 1000) / 10 : 0,
    enquiry_conversion_rate: enq ? Math.round((conv / enq) * 1000) / 10 : 0,
    revenue: n(`SELECT COALESCE(SUM(paid_amount - refunded_amount),0) n FROM bookings`),
    avg_booking_value: Math.round(n(`SELECT COALESCE(AVG(total),0) n FROM bookings WHERE status IN ${ACTIVE}`)),
    popular_event: get(`SELECT COALESCE(e.name,'Other') name, COUNT(*) c FROM bookings b LEFT JOIN event_types e ON e.id=b.event_type_id WHERE b.status IN ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 1`)?.name ?? '—',
    popular_package: get(`SELECT p.name, COUNT(*) c FROM bookings b JOIN packages p ON p.id=b.package_id WHERE b.status IN ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 1`)?.name ?? '—',
    tracked_30d: { booking_clicks: ev.book_click || 0, enquiries: ev.enquiry || 0, calls: ev.call_click || 0, whatsapp: ev.whatsapp_click || 0, assistant: ev.assistant || 0 },
  };
}

/** Plain-language summary built only from the numbers above (no invented figures). */
export function aiSummary() {
  const a = analytics(), d = dashboard();
  const rev = d.revenue_by_month, last = rev.at(-1), prev = rev.at(-2);
  const trend = last && prev ? (last.amount >= prev.amount ? `up ${Math.round(((last.amount - prev.amount) / (prev.amount || 1)) * 100)}%` : `down ${Math.round(((prev.amount - last.amount) / prev.amount) * 100)}%`) : null;
  const bits = [
    `${a.total_bookings} booking requests so far, ${a.confirmed_bookings} confirmed (${a.conversion_rate}% conversion).`,
    `Net revenue collected: ₹${a.revenue.toLocaleString('en-IN')}; average confirmed booking ₹${a.avg_booking_value.toLocaleString('en-IN')}.`,
    trend ? `Latest month collections (${last.month}) are ${trend} versus ${prev.month}.` : null,
    `Most popular event type: ${a.popular_event}. Most booked package: ${a.popular_package}.`,
    d.pending_bookings ? `${d.pending_bookings} booking request(s) are waiting for your approval.` : null,
    d.new_enquiries ? `${d.new_enquiries} new enquiries need a first response — fast replies convert best.` : null,
    d.pending_payments ? `₹${d.pending_payments.toLocaleString('en-IN')} is outstanding across active bookings.` : null,
    d.pending_refunds ? `${d.pending_refunds} refund(s) are pending processing.` : null,
  ].filter(Boolean);
  return { summary: bits.join(' '), points: bits };
}
