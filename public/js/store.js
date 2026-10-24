import { get } from './api.js';
export const S = { cfg: null, site: {}, theme: {}, booking: {}, tax: {}, user: null, halls: [], events: [], services: [], loaded: false };
const listeners = new Set();
export const onAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const withStaff = (u) => (u ? { ...u, staff: ['staff', 'manager', 'admin', 'super_admin'].includes(u.role) } : u);
export const setUser = (u) => { S.user = withStaff(u); listeners.forEach((f) => f(u)); };
export async function boot() {
  const [cfg, me, halls, events] = await Promise.all([get('/api/config'), get('/api/auth/me').catch(() => ({ user: null })), get('/api/halls'), get('/api/events')]);
  S.cfg = cfg.settings; S.site = cfg.settings.site; S.theme = cfg.settings.theme; S.booking = cfg.settings.booking; S.tax = cfg.settings.tax; S.stats = cfg.stats;
  S.user = withStaff(me.user); S.halls = halls.halls; S.events = events.events; S.loaded = true;
}
export const hallById = (id) => S.halls.find((h) => h.id === Number(id));
export const eventById = (id) => S.events.find((e) => e.id === Number(id));
export const eventBySlug = (s) => S.events.find((e) => e.slug === s);
export const maxRating = () => S.cfg?.reviews?.max_rating || 5;
