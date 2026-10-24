import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hall-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.PORT = '0';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../server/index.js');
export const http = await import('../server/lib/http.js');
export const dbm = await import('../server/db.js');
const app = buildApp();
const server = await app.listen(0);
export const base = `http://127.0.0.1:${server.address().port}`;
export const close = () => server.close();

export class Client {
  constructor() { this.jar = {}; }
  async req(method, url, body, { raw, headers = {} } = {}) {
    const h = { ...headers };
    if (this.jar.csrf && !('x-csrf-token' in h)) h['x-csrf-token'] = this.jar.csrf;
    h.cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (body && !raw) h['content-type'] = 'application/json';
    const r = await fetch(base + url, { method, headers: h, body: raw ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (/Max-Age=0/i.test(c) || v === '') delete this.jar[kv.slice(0, i)]; else this.jar[kv.slice(0, i)] = v; }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : ct.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { status: r.status, data, headers: r.headers };
  }
  get(u, o) { return this.req('GET', u, undefined, o); }
  post(u, b, o) { return this.req('POST', u, b ?? {}, o); }
  put(u, b) { return this.req('PUT', u, b ?? {}); }
  patch(u, b) { return this.req('PATCH', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
  async init() { await this.get('/api/settings'); return this; }
  async login(email, password) { await this.init(); const r = await this.post('/api/auth/login', { email, password }); if (r.status !== 200) throw new Error('login failed ' + JSON.stringify(r.data)); return this; }
}
export const futureDate = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
export const resetLimits = () => http.resetRateLimits();
export const booking = (date, extra = {}) => ({
  hall_id: 1, event_type_id: 1, customer_name: 'Test User', phone: '+91 90000 11111', email: 'test@example.com',
  event_date: date, start_time: '10:00', end_time: '16:00', guests: 200, services: [], ...extra,
});
