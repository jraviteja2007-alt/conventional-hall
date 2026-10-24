import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App, ApiError, securityHeaders, httpsRedirect, csrf, rateLimit, readBody, serveStatic } from './lib/http.js';
import { config } from './config.js';
import { migrate, get } from './db.js';
import { seed } from './seed.js';
import { loadUser } from './routes/common.js';
import { publicRoutes } from './routes/public.js';
import { compatRoutes } from './routes/compat.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { renderPage, sitemapXml, robotsTxt } from './seo.js';
import { sweep } from './services/bookings.js';

export function buildApp() {
  migrate();
  if (!get('SELECT 1 x FROM halls LIMIT 1')) seed();
  const app = new App();
  const files = serveStatic(config.publicDir);

  app.use(securityHeaders);
  app.use(httpsRedirect);
  app.use(files);
  app.use(async (req, res) => {
    const isApi = req.path.startsWith('/api/');
    if (isApi) {
      rateLimit({ windowMs: 60_000, max: 400, scope: 'api' })(req, res);
      req.skipCsrf = () => req.path === '/api/payments/webhook/razorpay';
    }
    csrf(req, res); // sets the csrf cookie on every page load; enforces it on unsafe API calls
    if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) await readBody(req, /multipart/i.test(req.headers['content-type'] || '') ? 8_000_000 : 1_000_000);
    if (isApi) loadUser(req);
  });

  compatRoutes(app); publicRoutes(app); authRoutes(app); accountRoutes(app); adminRoutes(app);

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.get('/sitemap.xml', (req, res) => res.send(sitemapXml(), 'application/xml; charset=utf-8'));
  app.get('/robots.txt', (req, res) => res.send(robotsTxt()));
  app.get('/uploads/:name', (req, res) => {
    const name = path.basename(req.params.name);
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(name).toLowerCase()];
    const f = path.join(config.uploadDir, 'public', name);
    if (!mime || !fs.existsSync(f)) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    res.setHeader('Cache-Control', 'public, max-age=86400'); res.send(fs.readFileSync(f), mime);
  });

  // SPA shell with server-rendered SEO head. Unknown routes get a real HTTP 404.
  app.fallback = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    if (req.path.startsWith('/api/')) return;
    if (req.path === '/admin' || req.path.startsWith('/admin/')) { res.setHeader('Cache-Control', 'no-store'); return res.send(fs.readFileSync(path.join(config.publicDir, 'admin.html')), 'text/html; charset=utf-8'); }
    const { status, html } = renderPage(req.path);
    res.statusCode = status; res.setHeader('Cache-Control', 'no-cache');
    res.send(html, 'text/html; charset=utf-8');
  };

  app.onError = (err, req, res) => {
    if (res.headersSent) return res.end();
    const known = err instanceof ApiError;
    if (!known) console.error(`[error] ${req.method} ${req.url}`, err);
    const wantsHtml = !req.path.startsWith('/api/') && /text\/html/.test(req.headers.accept || '');
    if (wantsHtml && (!known || err.status >= 500)) {
      res.statusCode = 500; res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(path.join(config.publicDir, '500.html')));
    }
    res.status(known ? err.status : 500).json({ error: { code: known ? err.code : 'SERVER_ERROR', message: known ? err.message : 'Something went wrong on our side. Please try again.', fields: known ? err.fields : undefined } });
  };
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = buildApp();
  await app.listen(config.port);
  const timer = setInterval(() => { try { sweep(); } catch (e) { console.error('sweep failed', e); } }, 60_000); timer.unref();
  sweep();
  console.log(`\n  Convention Hall platform running → ${config.siteUrl}`);
  if (!config.prod) console.log(`  Admin sign-in (dev only): ${config.seedAdminEmail} / ${config.seedAdminPassword}\n`);
  const stop = () => { app.server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
