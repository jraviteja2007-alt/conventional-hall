import { ApiError } from './http.js';

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TAGS = /<\/?[a-z][^>]*>/gi;
/** Defence in depth: strip control chars + HTML tags from stored text. Output is also escaped by the UI. */
export const clean = (s) => String(s ?? '').replace(CTRL, '').replace(TAGS, '').trim();

const RX = {
  email: /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^\+?[0-9][0-9\s-]{7,14}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  url: /^(https?:\/\/|\/)[^\s<>"']+$/i,
};

/**
 * schema: { field: { type:'string'|'int'|'number'|'bool'|'email'|'phone'|'date'|'time'|'url'|'array'|'object',
 *                    required, min, max, enum, optional } }
 * Returns a sanitised copy; throws 422 with per-field messages.
 */
export function validate(data, schema) {
  const out = {}, fields = {};
  data = data && typeof data === 'object' ? data : {};
  for (const [k, r] of Object.entries(schema)) {
    let v = data[k];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (r.required) fields[k] = 'This field is required';
      else if (r.default !== undefined) out[k] = r.default;
      continue;
    }
    const t = r.type || 'string';
    if (['string', 'email', 'phone', 'date', 'time', 'url'].includes(t)) {
      if (typeof v !== 'string') { fields[k] = 'Must be text'; continue; }
      v = clean(v);
      if (t !== 'string' && !RX[t].test(v)) { fields[k] = `Enter a valid ${t}`; continue; }
      if (t === 'date' && Number.isNaN(Date.parse(v + 'T00:00:00Z'))) { fields[k] = 'Enter a valid date'; continue; }
      if (r.min && v.length < r.min) { fields[k] = `At least ${r.min} characters`; continue; }
      if (v.length > (r.max || 2000)) { fields[k] = `At most ${r.max || 2000} characters`; continue; }
      if (r.enum && !r.enum.includes(v)) { fields[k] = `Must be one of: ${r.enum.join(', ')}`; continue; }
      if (t === 'email') v = v.toLowerCase();
    } else if (t === 'int' || t === 'number') {
      v = Number(v);
      if (!Number.isFinite(v) || (t === 'int' && !Number.isInteger(v))) { fields[k] = 'Must be a number'; continue; }
      if (r.min !== undefined && v < r.min) { fields[k] = `Must be at least ${r.min}`; continue; }
      if (r.max !== undefined && v > r.max) { fields[k] = `Must be at most ${r.max}`; continue; }
      if (r.enum && !r.enum.includes(v)) { fields[k] = 'Invalid value'; continue; }
    } else if (t === 'bool') {
      v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
    } else if (t === 'array') {
      if (!Array.isArray(v) || v.length > (r.max || 100)) { fields[k] = 'Invalid list'; continue; }
    } else if (t === 'object') {
      if (typeof v !== 'object' || Array.isArray(v)) { fields[k] = 'Invalid object'; continue; }
    }
    out[k] = v;
  }
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', fields);
  return out;
}

export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const todayISO = () => new Date().toISOString().slice(0, 10);
