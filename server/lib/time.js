import { config } from '../config.js';

export const pad = (n) => String(n).padStart(2, '0');
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const dayIndex = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
export const tsOf = (date, time) => dayIndex(date) * 1440 + toMin(time);
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const tsToDate = (ts) => new Date(ts * 60000).toISOString().slice(0, 10);
export const tsToTime = (ts) => { const m = ((ts % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

/** Business-local "now" (naive) */
export const nowTs = () => Math.floor((Date.now() + config.tzOffsetMinutes * 60000) / 60000);
export const todayLocal = () => tsToDate(nowTs());
export const nowSec = () => Math.floor(Date.now() / 1000);

/** An event that ends at or before its start time rolls over to the next day (overnight events). */
export function span(date, start, end) {
  const startTs = tsOf(date, start);
  let endTs = tsOf(date, end);
  if (endTs <= startTs) endTs += 1440;
  return { startTs, endTs, hours: (endTs - startTs) / 60 };
}

export const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { first, nextFirst: next, days: (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000 };
};

export const fmtINR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
export const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtTime12 = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
