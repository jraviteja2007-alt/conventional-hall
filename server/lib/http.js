// Minimal, dependency-free HTTP framework: routing, JSON/multipart bodies, cookies,
// security headers, CSRF (double-submit), rate limiting, static files with gzip + ETag.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { config } from '../config.js';

export class ApiError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
export const bad = (msg, fields) => new ApiError(400, 'BAD_REQUEST', msg, fields);
export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do this') => new ApiError(403, 'FORBIDDEN', msg);
export const unauthorized = (msg = 'Please sign in to continue') => new ApiError(401, 'UNAUTHORIZED', msg);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest)|image\/svg)/;

export function parseCookies(h = '') {
  const out = {};
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip */ } }
  }
  return out;
}

export class App {
  constructor() { this.before = []; this.routes = []; this.fallback = null; this.onError = null; }
  use(fn) { this.before.push(fn); return this; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
    return this;
  }
  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }

  listen(port) {
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.requestTimeout = 30000;
    return new Promise((resolve) => this.server.listen(port, () => resolve(this.server)));
  }

  async handle(req, res) {
    decorate(req, res);
    try {
      for (const fn of this.before) { await fn(req, res); if (res.writableEnded) return; }
      const url = req.path;
      let matched = null, pathMatched = false;
      for (const r of this.routes) {
        const m = r.re.exec(url);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method && !(req.method === 'HEAD' && r.method === 'GET')) continue;
        matched = { r, m }; break;
      }
      if (matched) {
        req.params = {};
        matched.r.keys.forEach((k, i) => { try { req.params[k] = decodeURIComponent(matched.m[i + 1]); } catch { throw bad('Malformed URL'); } });
        for (const h of matched.r.handlers) { await h(req, res); if (res.writableEnded) return; }
        if (!res.writableEnded) res.status(204).end();
        return;
      }
      if (pathMatched) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
      if (this.fallback) { await this.fallback(req, res); if (res.writableEnded) return; }
      throw notFound('Endpoint');
    } catch (err) {
      if (this.onError) this.onError(err, req, res);
      else { res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Server error' } }); }
    }
  }
}

function decorate(req, res) {
  const u = new URL(req.url, 'http://x');
  req.path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
  req.query = Object.fromEntries(u.searchParams);
  req.cookies = parseCookies(req.headers.cookie);
  req.ip = (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '';
  req.params = {};
  const cookiesOut = [];
  res.status = (c) => { res.statusCode = c; return res; };
  res.header = (k, v) => { res.setHeader(k, v); return res; };
  res.cookie = (name, value, o = {}) => {
    let c = `${name}=${encodeURIComponent(value)}; Path=${o.path || '/'}`;
    if (o.maxAge !== undefined) c += `; Max-Age=${o.maxAge}`;
    if (o.httpOnly) c += '; HttpOnly';
    c += `; SameSite=${o.sameSite || 'Lax'}`;
    if (config.prod) c += '; Secure';
    cookiesOut.push(c); res.setHeader('Set-Cookie', cookiesOut);
    return res;
  };
  res.json = (data, status) => {
    if (status) res.statusCode = status;
    const body = Buffer.from(JSON.stringify(data));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', res.getHeader('Cache-Control') || 'no-store');
    sendBuffer(req, res, body);
  };
  res.send = (body, type = 'text/plain; charset=utf-8') => {
    res.setHeader('Content-Type', type);
    sendBuffer(req, res, Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
  };
}

function sendBuffer(req, res, body) {
  const ct = String(res.getHeader('Content-Type') || '');
  const ae = String(req.headers['accept-encoding'] || '');
  if (body.length > 1024 && COMPRESSIBLE.test(ct) && /gzip/.test(ae)) {
    body = zlib.gzipSync(body); res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Length', body.length);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** Read request body with a hard size limit; JSON is parsed, multipart left as a Buffer. */
export async function readBody(req, limit = 1_000_000) {
  if (req.body !== undefined) return req.body;
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    chunks.push(c);
  }
  req.rawBody = Buffer.concat(chunks);
  const ct = String(req.headers['content-type'] || '');
  if (/^application\/json/i.test(ct)) {
    if (!req.rawBody.length) req.body = {};
    else { try { req.body = JSON.parse(req.rawBody.toString('utf8')); } catch { throw bad('Invalid JSON body'); } }
  } else req.body = {};
  return req.body;
}

/** Minimal multipart/form-data parser: returns { fields, files:[{name,filename,mime,data}] }. */
export function parseMultipart(req) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(req.headers['content-type'] || ''));
  if (!m) throw bad('Expected multipart/form-data');
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const buf = req.rawBody; const fields = {}; const files = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(pos + boundary.length + 2, next - 2); // strip CRLF
    const he = part.indexOf('\r\n\r\n');
    if (he > 0) {
      const head = part.subarray(0, he).toString('utf8'); const data = part.subarray(he + 4);
      const name = /name="([^"]*)"/.exec(head)?.[1]; const filename = /filename="([^"]*)"/.exec(head)?.[1];
      const mime = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim();
      if (filename !== undefined) files.push({ name, filename: path.basename(filename), mime, data });
      else if (name) fields[name] = data.toString('utf8');
    }
    pos = next;
  }
  return { fields, files };
}

/* ------------------------------ middleware ------------------------------ */

export function securityHeaders(req, res) {
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob: https://images.unsplash.com https://plus.unsplash.com",
    "media-src 'self' https://videos.pexels.com https://assets.mixkit.co", "frame-src https://www.google.com https://maps.google.com https://www.youtube-nocookie.com",
    "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.removeHeader?.('X-Powered-By');
  if (config.prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function httpsRedirect(req, res) {
  if (!config.forceHttps) return;
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  if (proto !== 'https') { res.statusCode = 308; res.setHeader('Location', config.siteUrl + req.url); res.end(); }
}

/** CSRF: double-submit cookie. The `csrf` cookie is readable by our JS and echoed in X-CSRF-Token. */
export function csrf(req, res) {
  let token = req.cookies.csrf;
  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf', token, { maxAge: 60 * 60 * 24 * 30, sameSite: 'Lax' });
    req.cookies.csrf = token;
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.skipCsrf?.()) return;
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new ApiError(403, 'BAD_ORIGIN', 'Cross-site request blocked');
  const sent = req.headers['x-csrf-token'];
  if (!sent || sent.length !== token.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(token))) {
    throw new ApiError(403, 'CSRF', 'Security token missing or invalid. Please refresh the page.');
  }
}

const buckets = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k); }, 60_000).unref();
/** Fixed-window rate limiter keyed by IP (+ optional scope name). */
export function rateLimit({ windowMs = 60_000, max = 60, scope = 'g', message = 'Too many requests. Please slow down.' } = {}) {
  return (req, res) => {
    const key = `${scope}:${req.ip}`; const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.n++;
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - b.n));
    if (b.n > max) { res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000)); throw new ApiError(429, 'RATE_LIMITED', message); }
  };
}
export const resetRateLimits = () => buckets.clear();

const fileCache = new Map();
export function serveStatic(root) {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    let rel; try { rel = decodeURIComponent(req.path); } catch { return; }
    if (rel.includes('\0') || rel === '/') return;
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) return;
    let st; try { st = fs.statSync(file); } catch { return; }
    if (!st.isFile()) return;
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; res.end(); return; }
    let body = fileCache.get(file);
    if (!body || body.etag !== etag) { body = { etag, data: fs.readFileSync(file) }; fileCache.set(file, body); }
    res.setHeader('Content-Type', type);
    sendBuffer(req, res, body.data);
  };
}
