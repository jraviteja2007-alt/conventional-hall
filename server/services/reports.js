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

export function detailedReport(type, { from = '2000-01-01', to = '2099-12-31', group = 'month' } = {}) {
  from ||= '2000-01-01';
  to ||= '2099-12-31';
  const g = { day: 10, month: 7, year: 4 }[group] || 7;
  switch (type) {
    case 'revenue': {
      const rows = all(`
        SELECT substr(paid_at,1,${g}) as period,
               COUNT(*) as payments,
               COALESCE(SUM(CASE WHEN kind<>'refund' THEN amount ELSE 0 END), 0) as gross,
               COALESCE(SUM(CASE WHEN kind='refund' THEN amount ELSE 0 END), 0) as refunded,
               COALESCE(SUM(CASE WHEN kind<>'refund' THEN amount ELSE -amount END), 0) as net
        FROM payments 
        WHERE status IN ('paid','refunded') AND substr(paid_at,1,10) BETWEEN ? AND ? 
        GROUP BY 1 ORDER BY 1
      `, from, to);
      const totals = {
        gross: rows.reduce((a, r) => a + (r.gross || 0), 0),
        refunded: rows.reduce((a, r) => a + (r.refunded || 0), 0),
        net: rows.reduce((a, r) => a + (r.net || 0), 0),
      };
      return { columns: ['period', 'payments', 'gross', 'refunded', 'net'], rows, meta: { totals } };
    }
    case 'bookings': {
      const rows = all(`
        SELECT substr(created_at,1,${g}) as period,
               COUNT(*) as total,
               SUM(status IN ('confirmed','completed')) as confirmed,
               SUM(status IN ('pending','reserved')) as pending,
               SUM(status IN ('cancelled','rejected','expired')) as lost
        FROM bookings 
        WHERE substr(created_at,1,10) BETWEEN ? AND ? 
        GROUP BY 1 ORDER BY 1
      `, from, to);
      return { columns: ['period', 'total', 'confirmed', 'pending', 'lost'], rows, meta: {} };
    }
    case 'events': {
      const rows = all(`
        SELECT COALESCE(e.name, b.custom_event, 'Other') as name,
               COUNT(*) as bookings,
               COALESCE(SUM(b.total), 0) as value,
               ROUND(AVG(b.guests)) as avg_guests
        FROM bookings b 
        LEFT JOIN event_types e ON e.id = b.event_type_id 
        WHERE b.status IN ('confirmed','completed') AND b.event_date BETWEEN ? AND ? 
        GROUP BY 1 ORDER BY 2 DESC
      `, from, to);
      return { columns: ['name', 'bookings', 'value', 'avg_guests'], rows, meta: {} };
    }
    case 'packages': {
      const rows = all(`
        SELECT COALESCE(p.name, 'Custom / Hall Only') as name,
               COUNT(*) as bookings,
               COALESCE(SUM(b.total), 0) as value
        FROM bookings b 
        LEFT JOIN packages p ON p.id = b.package_id 
        WHERE b.status IN ('confirmed','completed') AND b.event_date BETWEEN ? AND ? 
        GROUP BY 1 ORDER BY 2 DESC
      `, from, to);
      return { columns: ['name', 'bookings', 'value'], rows, meta: {} };
    }
    case 'customers': {
      const rows = all(`
        SELECT u.name,
               u.phone,
               COUNT(b.id) as bookings,
               COALESCE(SUM(b.paid_amount - b.refunded_amount), 0) as value
        FROM users u 
        LEFT JOIN bookings b ON b.user_id = u.id 
        WHERE u.role = 'customer' 
        GROUP BY u.id 
        ORDER BY value DESC
      `);
      const totalCust = get(`SELECT COUNT(*) n FROM users WHERE role='customer'`).n;
      const payingCust = get(`SELECT COUNT(DISTINCT user_id) n FROM bookings WHERE user_id IS NOT NULL AND status IN ('confirmed','completed')`).n;
      const new30d = get(`SELECT COUNT(*) n FROM users WHERE role='customer' AND created_at >= date('now','-30 days')`).n;
      const repeatCust = get(`SELECT COUNT(*) n FROM (SELECT user_id FROM bookings WHERE user_id IS NOT NULL AND status IN ('confirmed','completed') GROUP BY user_id HAVING COUNT(*) > 1)`).n;
      return {
        columns: ['name', 'phone', 'bookings', 'value'],
        rows,
        meta: {
          totals: { customers: totalCust, paying: payingCust, new_30d: new30d },
          repeat: repeatCust,
        },
      };
    }
    case 'payments': {
      const rows = all(`
        SELECT provider as method,
               COUNT(*) as c,
               SUM(amount) as v
        FROM payments 
        WHERE status = 'paid' AND kind <> 'refund' AND substr(created_at,1,10) BETWEEN ? AND ? 
        GROUP BY 1 ORDER BY 3 DESC
      `, from, to);
      const paidVal = get(`SELECT COALESCE(SUM(amount), 0) n FROM payments WHERE status='paid' AND kind<>'refund' AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to).n;
      const refVal = get(`SELECT COALESCE(SUM(amount), 0) n FROM payments WHERE (status='refunded' OR kind='refund') AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to).n;
      const pendBal = get(`SELECT COALESCE(SUM(total - paid_amount + refunded_amount), 0) n FROM bookings WHERE status IN ('reserved','confirmed') AND event_date BETWEEN ? AND ?`, from, to).n;
      const pendRef = get(`SELECT COALESCE(SUM(amount), 0) n FROM payments WHERE status='pending_refund'`).n;
      return {
        columns: ['method', 'c', 'v'],
        rows,
        meta: {
          paid: { v: paidVal },
          refunded: { v: refVal },
          pending: { v: pendBal },
          pendingRefunds: { v: pendRef },
        },
      };
    }
    case 'bookings_list': {
      const rows = all(`
        SELECT b.ref, b.status, b.customer_name, b.phone, b.email, h.name hall, 
               COALESCE(e.name, b.custom_event) event, b.event_date, b.start_time, 
               b.end_time, b.guests, b.total, b.paid_amount, b.refunded_amount, b.created_at 
        FROM bookings b 
        JOIN halls h ON h.id=b.hall_id 
        LEFT JOIN event_types e ON e.id=b.event_type_id 
        WHERE b.event_date BETWEEN ? AND ? 
        ORDER BY b.event_date DESC
      `, from, to);
      return { columns: ['ref', 'status', 'customer_name', 'phone', 'hall', 'event', 'event_date', 'total', 'paid_amount'], rows, meta: {} };
    }
    default:
      return null;
  }
}

export function report(type, { from, to, group = 'month' } = {}) {
  const d = detailedReport(type, { from, to, group });
  return d ? d.rows : null;
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
