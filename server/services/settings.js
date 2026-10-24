import { all, get, run } from '../db.js';

export const DEFAULTS = {
  business: {
    name: 'CVR Convention Hall', tagline: 'Royal Convention & Banquet',
    short_name: 'CVR',
    description: 'Welcome to CVR Convention Hall at Tangutur. Experience 12,000 sq.ft of pillarless luxury, central air conditioning, 500-seater dining plaza, 8 AC suites, and 120+ vehicle highway parking.',
    city: 'Tangutur', state: 'Andhra Pradesh', country: 'India', pincode: '523274',
    address: 'Near Indian Petrol Station, Kondepi Road, Tangutur, Prakasam Dt. (NH16 Corridor), Andhra Pradesh 523274',
    phone: '+91 94402 58592', whatsapp: '919440258592', email: 'bookings@cvrconvention.example',
    lat: 15.3434, lng: 80.0302, hours: 'Daily, 8:00 AM – 10:00 PM',
    social: { facebook: 'https://facebook.com/', instagram: 'https://instagram.com/', youtube: 'https://youtube.com/' },
    logo: '', logo_mobile: '', favicon: '',
  },
  theme: { primary: '#6b1e2e', secondary: '#090d16', accent: '#f59e0b', background: '#090d16', text: '#f8fafc', success: '#10b981', warning: '#f59e0b', error: '#ef4444' },
  booking: {
    advance_percent: 30, hold_minutes: 1440, advance_deadline_hours: 48, buffer_minutes: 60,
    min_hours: 2, max_hours: 17, max_advance_days: 540, require_approval: true,
    customer_modify_days: 7, reminder_days: 3,
  },
  tax: { label: 'GST', percent: 18 },
  pricing: {
    weekend_multiplier: 1.25, holiday_multiplier: 1.5, peak_multiplier: 1.2, offseason_multiplier: 0.9,
    peak_months: [11, 12, 1, 2, 4, 5], off_months: [6, 7, 8],
  },
  cancellation: { tiers: [{ min_days: 30, refund_percent: 90 }, { min_days: 15, refund_percent: 50 }, { min_days: 7, refund_percent: 25 }, { min_days: 0, refund_percent: 0 }] },
  notifications: { email: true, sms: false, whatsapp: false },
  ai: { enabled: true },
  analytics: { ga_id: '' },
};
const PUBLIC_KEYS = ['business', 'theme', 'booking', 'tax', 'pricing', 'cancellation', 'ai', 'analytics'];
let cache = null;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = isObj(a?.[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };

export function allSettings() {
  if (cache) return cache;
  const stored = Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, JSON.parse(r.value)]));
  cache = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, merge(DEFAULTS[k], stored[k])]));
  return cache;
}
export const setting = (group) => allSettings()[group];
export const publicSettings = () => Object.fromEntries(PUBLIC_KEYS.map((k) => [k, allSettings()[k]]));
export function saveSettings(group, value) {
  if (!DEFAULTS[group]) return false;
  const merged = merge(allSettings()[group], value);
  run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', group, JSON.stringify(merged));
  cache = null; return true;
}
export const resetSettingsCache = () => { cache = null; };
