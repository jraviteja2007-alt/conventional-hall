import { all, get, run } from '../db/index.js';
import { config } from '../config.js';
import { getSetting, secret } from './settings.js';
import { fmtDate, fmtTime12, fmtINR } from '../lib/time.js';

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- message templates ----------
const bookingLine = (b) => `${b.ref} - ${b.event_title || 'Event'} on ${fmtDate(b.event_date)}, ${fmtTime12(b.start_time)} - ${fmtTime12(b.end_time)}`;
const TEMPLATES = {
  booking_received: (d) => ({ title: 'Booking request received', body: `Hi ${d.customer_name}, we received your booking request ${bookingLine(d)}. Total ${fmtINR(d.total)}. Our team will review it shortly.` }),
  booking_approved: (d) => ({ title: 'Booking approved - pay advance to confirm', body: `Good news ${d.customer_name}! Your request ${bookingLine(d)} is approved. Pay the advance of ${fmtINR(d.advance_required)} within ${getSetting('booking').approve_pay_within_hours} hours to confirm the date.` }),
  booking_confirmed: (d) => ({ title: 'Booking confirmed', body: `Your booking is confirmed! ${bookingLine(d)}. Balance due: ${fmtINR(d.balance)}.` }),
  booking_rejected: (d) => ({ title: 'Booking request declined', body: `Sorry ${d.customer_name}, we could not accept ${bookingLine(d)}.${d.reason ? ` Reason: ${d.reason}` : ''} Please contact us for alternatives.` }),
  booking_cancelled: (d) => ({ title: 'Booking cancelled', body: `Your booking ${bookingLine(d)} has been cancelled.${d.refund_due ? ` A refund of ${fmtINR(d.refund_due)} is being processed.` : ''}` }),
  booking_rescheduled: (d) => ({ title: 'Booking rescheduled', body: `Your booking has been moved. New schedule: ${bookingLine(d)}.` }),
  payment_received: (d) => ({ title: 'Payment received', body: `We received ${fmtINR(d.amount)} for ${d.ref}. Receipt: ${d.receipt_no}.` }),
  event_reminder: (d) => ({ title: 'Event reminder', body: `Reminder: your event ${bookingLine(d)} is in ${d.days} day${d.days === 1 ? '' : 's'}. Balance due: ${fmtINR(d.balance)}.` }),
  admin_new_booking: (d) => ({ title: 'New booking request', body: `${d.customer_name} (${d.phone}) - ${bookingLine(d)}, ${d.guests} guests, ${fmtINR(d.total)}.` }),
  admin_new_enquiry: (d) => ({ title: 'New enquiry', body: `${d.name} (${d.phone}) enquired about ${d.event_type || 'an event'}${d.event_date ? ` on ${fmtDate(d.event_date)}` : ''}.` }),
  admin_payment: (d) => ({ title: 'Payment received', body: `${fmtINR(d.amount)} paid for ${d.ref} (${d.receipt_no}).` }),
  admin_cancellation: (d) => ({ title: 'Booking cancelled', body: `${d.customer_name} cancelled ${bookingLine(d)}. Refund due: ${fmtINR(d.refund_due)}.` }),
  enquiry_ack: (d) => ({ title: 'We got your enquiry', body: `Hi ${d.name}, thanks for contacting ${getSetting('site').name}. We will call you back shortly.` }),
};
export const render = (type, data) => TEMPLATES[type](data);

/**
 * Queue notifications. In-app rows are visible immediately; email/SMS/WhatsApp are queued for the dispatcher
 * according to the admin's notification settings.
 */
export function notify({ type, data, userId = null, email = null, phone = null, audience = 'customer' }) {
  const { title, body } = render(type, data);
  const ns = getSetting('notifications');
  const payload = JSON.stringify({ type, ref: data.ref || null });
  if (userId || audience === 'admin') {
    run('INSERT INTO notifications(user_id,audience,channel,type,title,body,payload,status,sent_at) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'))',
      userId, audience, 'inapp', type, title, body, payload, 'sent');
  }
  const queue = (channel, recipient) => run('INSERT INTO notifications(user_id,audience,channel,type,title,body,recipient,payload) VALUES(?,?,?,?,?,?,?,?)',
    userId, audience, channel, type, title, body, recipient, payload);
  if (audience === 'admin') {
    if (ns.email) for (const e of ns.admin_emails || []) queue('email', e);
    return;
  }
  if (ns.email && email) queue('email', email);
  if (ns.sms && phone) queue('sms', phone);
  if (ns.whatsapp && phone) queue('whatsapp', phone);
}

export const notifyAdmins = (type, data) => notify({ type, data, audience: 'admin' });

// ---------- providers ----------
async function postJson(url, body, headers) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
const PROVIDERS = {
  email: {
    console: async (n) => { console.log(`[email -> ${n.recipient}] ${n.title}\n${n.body}`); },
    resend: async (n) => {
      const key = secret('RESEND_API_KEY', 'resend_api_key');
      if (!key) throw new Error('RESEND_API_KEY not configured');
      const site = getSetting('site');
      await postJson('https://api.resend.com/emails', {
        from: config.env.EMAIL_FROM || `${site.name} <onboarding@resend.dev>`, to: [n.recipient], subject: n.title,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>${escHtml(n.title)}</h2><p>${escHtml(n.body)}</p><hr><small>${escHtml(site.name)} - ${escHtml(site.address)} - ${escHtml(site.phone)}</small></div>`,
        text: n.body,
      }, { Authorization: `Bearer ${key}` });
    },
  },
  sms: {
    console: async (n) => { console.log(`[sms -> ${n.recipient}] ${n.body}`); },
    twilio: async (n) => {
      const sid = secret('TWILIO_ACCOUNT_SID', 'twilio_sid'); const tok = secret('TWILIO_AUTH_TOKEN', 'twilio_token');
      if (!sid || !tok) throw new Error('Twilio not configured');
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: n.recipient, From: config.env.TWILIO_FROM || '', Body: n.body }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`Twilio HTTP ${r.status}`);
    },
  },
  whatsapp: {
    console: async (n) => { console.log(`[whatsapp -> ${n.recipient}] ${n.body}`); },
    cloud: async (n) => {
      const token = secret('WHATSAPP_TOKEN', 'whatsapp_token'); const pid = config.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !pid) throw new Error('WhatsApp Cloud API not configured');
      await postJson(`https://graph.facebook.com/v20.0/${pid}/messages`, { messaging_product: 'whatsapp', to: n.recipient.replace(/\D/g, ''), type: 'text', text: { body: n.body } }, { Authorization: `Bearer ${token}` });
    },
  },
};

export async function flushQueue(limit = 20) {
  const rows = all(`SELECT * FROM notifications WHERE status='queued' AND channel<>'inapp' AND attempts < 3 ORDER BY id LIMIT ?`, limit);
  for (const n of rows) {
    const name = config.providers[n.channel];
    const fn = PROVIDERS[n.channel]?.[name];
    try {
      if (!fn) throw new Error(`Unknown ${n.channel} provider "${name}"`);
      await fn(n);
      run(`UPDATE notifications SET status='sent', provider=?, sent_at=datetime('now'), attempts=attempts+1, error=NULL WHERE id=?`, name, n.id);
    } catch (e) {
      const attempts = n.attempts + 1;
      run('UPDATE notifications SET status=?, attempts=?, error=?, provider=? WHERE id=?', attempts >= 3 ? 'failed' : 'queued', attempts, String(e.message).slice(0, 300), name, n.id);
    }
  }
  return rows.length;
}

/** Reminders: sent once per configured lead time (e.g. 7 days and 1 day before the event). */
export function queueReminders(nowDate) {
  const days = getSetting('notifications').reminder_days || [];
  let count = 0;
  for (const d of days) {
    const target = new Date(Date.parse(`${nowDate}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
    for (const b of all(`SELECT * FROM bookings WHERE status='confirmed' AND event_date=?`, target)) {
      const sent = JSON.parse(b.reminder_sent || '[]');
      if (sent.includes(d)) continue;
      const paid = get(`SELECT COALESCE(SUM(amount - refunded_amount),0) p FROM payments WHERE booking_id=? AND status IN ('paid','partially_refunded')`, b.id).p;
      notify({ type: 'event_reminder', data: { ...b, days: d, balance: Math.max(0, b.total - paid) }, userId: b.user_id, email: b.email, phone: b.phone });
      run('UPDATE bookings SET reminder_sent=? WHERE id=?', JSON.stringify([...sent, d]), b.id);
      count++;
    }
  }
  return count;
}
