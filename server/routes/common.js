import { get } from '../db.js';
import { verifyJwt, hasRole } from '../lib/auth.js';
import { ApiError, forbidden, unauthorized } from '../lib/http.js';

/** Attach req.user from the signed httpOnly cookie. The user is re-read so disabled/changed roles apply immediately. */
export function loadUser(req) {
  const p = verifyJwt(req.cookies.token);
  if (!p) return;
  const u = get('SELECT id,name,email,phone,role,active,saved_details FROM users WHERE id=?', p.sub);
  if (u && u.active) req.user = u;
}
export const requireAuth = (req) => { if (!req.user) throw unauthorized(); };
export const requireRole = (min) => (req) => {
  if (!req.user) throw unauthorized();
  if (!hasRole(req.user, min)) throw forbidden();
};
export const page = (req, def = 20, max = 200) => {
  const size = Math.min(max, Math.max(1, parseInt(req.query.size) || def));
  const pg = Math.max(1, parseInt(req.query.page) || 1);
  return { size, pg, offset: (pg - 1) * size };
};
export const like = (q) => `%${String(q).replace(/[%_\\]/g, '\\$&')}%`;
export const idParam = (req) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) throw new ApiError(404, 'NOT_FOUND', 'Not found'); return id; };
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  staff: u.role !== 'customer',
  saved_details: u.saved_details ? JSON.parse(u.saved_details) : null,
});
