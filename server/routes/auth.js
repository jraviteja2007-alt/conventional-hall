import { get, run } from '../db.js';
import { config } from '../config.js';
import { ApiError, rateLimit } from '../lib/http.js';
import { hashPassword, verifyPassword, signJwt } from '../lib/auth.js';
import { validate } from '../lib/validate.js';
import { publicUser, requireAuth } from './common.js';
import { audit } from '../services/audit.js';

const pwRule = { required: true, min: 8, max: 100 };
const strongEnough = (p) => /[a-z]/i.test(p) && /\d/.test(p);
function setSession(res, user) {
  res.cookie('token', signJwt({ sub: user.id, role: user.role }), { httpOnly: true, maxAge: config.jwtTtlSeconds, sameSite: 'Lax' });
}

export function authRoutes(app) {
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: 25, scope: 'auth', message: 'Too many attempts. Please wait a few minutes and try again.' });

  app.post('/api/auth/register', limiter, (req, res) => {
    const v = validate(req.body, { name: { required: true, min: 2, max: 80 }, email: { type: 'email', required: true }, phone: { type: 'phone', required: true }, password: pwRule });
    if (!strongEnough(v.password)) throw new ApiError(422, 'VALIDATION_ERROR', 'Weak password', { password: 'Use at least 8 characters with letters and numbers' });
    if (get('SELECT 1 x FROM users WHERE email=?', v.email)) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists', { email: 'This email is already registered' });
    const r = run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?, 'customer')`, v.name, v.email, v.phone, hashPassword(v.password));
    const user = get('SELECT * FROM users WHERE id=?', r.lastInsertRowid);
    setSession(res, user);
    res.json({ user: publicUser(user) }, 201);
  });

  app.post('/api/auth/login', limiter, (req, res) => {
    const v = validate(req.body, { email: { type: 'email', required: true }, password: { required: true, max: 100 } });
    const u = get('SELECT * FROM users WHERE email=?', v.email);
    const generic = new ApiError(401, 'INVALID_LOGIN', 'Incorrect email or password');
    if (!u) { verifyPassword(v.password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '=='); throw generic; } // equalise timing
    if (u.locked_until && u.locked_until > new Date().toISOString().slice(0, 19).replace('T', ' ')) throw new ApiError(429, 'LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
    if (!verifyPassword(v.password, u.password_hash)) {
      const n = u.failed_logins + 1;
      run('UPDATE users SET failed_logins=?, locked_until=? WHERE id=?', n >= 5 ? 0 : n, n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString().slice(0, 19).replace('T', ' ') : null, u.id);
      throw generic;
    }
    if (!u.active) throw new ApiError(403, 'DISABLED', 'This account has been disabled. Please contact us.');
    run('UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=?', u.id);
    setSession(res, u);
    if (u.role !== 'customer') audit({ user: u, ip: req.ip }, 'login', 'user', u.id);
    res.json({ user: publicUser(u) });
  });

  app.post('/api/auth/logout', (req, res) => { res.cookie('token', '', { httpOnly: true, maxAge: 0 }); res.json({ ok: true }); });

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

  app.patch('/api/auth/me', requireAuth, (req, res) => {
    const v = validate(req.body, { name: { min: 2, max: 80 }, phone: { type: 'phone' } });
    const saved = req.body.saved_details && typeof req.body.saved_details === 'object' ? validate(req.body.saved_details, { name: { max: 80 }, phone: { max: 20 }, email: { type: 'email' }, event_type: { max: 40 }, guests: { type: 'int', min: 1, max: 100000 } }) : undefined;
    run('UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), saved_details=COALESCE(?,saved_details) WHERE id=?', v.name, v.phone, saved ? JSON.stringify(saved) : null, req.user.id);
    res.json({ user: publicUser(get('SELECT * FROM users WHERE id=?', req.user.id)) });
  });

  app.post('/api/auth/password', requireAuth, limiter, (req, res) => {
    const v = validate(req.body, { current: { required: true, max: 100 }, password: pwRule });
    if (!strongEnough(v.password)) throw new ApiError(422, 'VALIDATION_ERROR', 'Weak password', { password: 'Use at least 8 characters with letters and numbers' });
    const u = get('SELECT * FROM users WHERE id=?', req.user.id);
    if (!verifyPassword(v.current, u.password_hash)) throw new ApiError(422, 'VALIDATION_ERROR', 'Current password is incorrect', { current: 'Current password is incorrect' });
    run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(v.password), u.id);
    res.json({ ok: true });
  });
}
