import { all, get } from '../db.js';
import { setting } from './settings.js';
import { toMin, todayISO } from '../lib/validate.js';

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const RANK = { available: 0, pending: 1, reserved: 2, confirmed: 3, blocked: 4, maintenance: 5 };

const activeBookings = (hallId, from, to, excludeId = 0) => all(
  `SELECT id, event_date, start_min, end_min, status FROM bookings
   WHERE hall_id=? AND event_date BETWEEN ? AND ? AND id<>?
     AND (status IN ('reserved','confirmed') OR (status='pending' AND hold_expires_at > ?))`, hallId, from, to, excludeId, nowSql());
const blocksFor = (hallId, from, to) => all('SELECT date, start_min, end_min, status, reason FROM calendar_blocks WHERE hall_id=? AND date BETWEEN ? AND ?', hallId, from, to);

/** Every reason the requested window is unavailable (empty list = free). */
export function conflicts({ hallId, date, startMin, endMin, excludeId = 0 }) {
  const buf = setting('booking').buffer_minutes;
  const out = [];
  for (const b of activeBookings(hallId, date, date, excludeId)) {
    if (startMin < b.end_min + buf && endMin + buf > b.start_min) out.push({ type: 'booking', status: b.status });
  }
  for (const k of blocksFor(hallId, date, date)) {
    if (startMin < k.end_min && endMin > k.start_min) out.push({ type: 'block', status: k.status, reason: k.reason });
  }
  return out;
}
export const isFree = (a) => conflicts(a).length === 0;

/** Public calendar for one month. Exposes statuses only — never customer data. */
export function monthAvailability(hallId, ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${ym}-01`, to = `${ym}-${String(days).padStart(2, '0')}`;
  const buf = setting('booking').buffer_minutes, today = todayISO();
  const slots = all('SELECT slug, name, start_time, end_time FROM time_slots WHERE active=1 ORDER BY start_time, end_time');
  const bks = activeBookings(hallId, from, to), blks = blocksFor(hallId, from, to);
  const out = {};
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const db = bks.filter((b) => b.event_date === date), dk = blks.filter((b) => b.date === date);
    let status = 'available';
    for (const e of [...db, ...dk]) if (RANK[e.status] > RANK[status]) status = e.status;
    const slotState = {};
    for (const s of slots) {
      const sm = toMin(s.start_time), em = toMin(s.end_time);
      const busy = db.some((b) => sm < b.end_min + buf && em + buf > b.start_min) || dk.some((k) => sm < k.end_min && em > k.start_min);
      slotState[s.slug] = !busy;
    }
    const anyFree = Object.values(slotState).some(Boolean);
    out[date] = { status: date < today ? 'past' : status, partial: status !== 'available' && anyFree, slots: slotState };
  }
  return out;
}
