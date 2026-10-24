# Aurelia Convention Hall — Booking & Management Platform

Full-stack convention-hall website for Guntur, Andhra Pradesh (name, address, phone, colours and tagline are all editable in settings).
**Zero npm dependencies**: Node.js 22+ (built-in SQLite) + vanilla JavaScript. Live 3D hall viewer (canvas renderer, no WebGL needed), photography from Unsplash (hot-linked).

## Run it (2 minutes)
```bash
node -v            # must be 22.5 or newer
npm start          # http://localhost:3000   (database + demo data are created on first start)
```
Dev sign-ins (created automatically outside production — change before going live):

| Role | Email | Password |
|------|-------|----------|
| Super admin | admin@hall.local | Admin@12345 |
| Customer | customer@example.com | Customer@12345 |

Other commands: `npm test` (16 API/security/booking tests), `npm run backup`, `npm run seed`, `npm run migrate`.

## What works
* **Public site** — home with live 3D hall and layout switcher (banquet / theatre / classroom / U-shape), quick availability + price widget, halls & compare, hall detail, facilities, packages & compare, events, gallery with lightbox / before-after, reviews, availability calendar, contact & enquiry form, AI assistant, global search, legal pages, SEO (server-rendered meta, JSON-LD, sitemap, robots), PWA manifest + offline page, cookie banner, 404/500 pages.
* **Booking flow** — one-page booking form with live GST-inclusive price → request → admin approval → online advance payment → confirmation; PDF confirmation / invoice / receipts; change, cancel (refund by notice period), document upload, reviews after the event.
* **Customer account** — upcoming events, history, payments, notifications, profile, password.
* **Backend** — role-based access (customer, staff, manager, admin, super admin), CSRF, rate limits, input validation, parameterised SQL, secure uploads (magic-byte checks), audit log, server-verified payments (Razorpay supported; demo gateway for development), email/SMS/WhatsApp outbox adapters, reminders, hold expiry, **database-level double-booking guard** (tested with 10 simultaneous requests).
* **Admin REST API** — dashboard, bookings (approve / reject / confirm / cancel / modify / manual booking / offline payment / refund), calendar + blocks, customers, staff users, halls, packages, facilities, services, event types, gallery, coupons, quotations, reviews moderation, enquiries, reports, settings, audit log, data export.

## Known gaps (be honest before launch)
* The **admin web UI is not finished** in this build — the admin API above is complete and tested; `/admin` currently serves the earlier admin screen, which targets an older API shape. Use the API (see `tests/api.test.js` for examples) or build the screens on it.
* Unsplash photos load from images.unsplash.com in the visitor's browser. Replace with your own photographs of the real hall before launch.
* Business details (address, phone, WhatsApp, prices) are **placeholders**. Legal pages are starter text — have a lawyer review them.
* Online payments run in demo mode until you set `PAYMENT_PROVIDER=razorpay` plus keys (Stripe is not implemented yet) (see `.env.example`).

## Deploy
Any host that runs Node 22 (Render, Railway, VPS, AWS). Set `NODE_ENV=production`, `BASE_URL=https://your-domain`, `JWT_SECRET`, `SEED_ADMIN_PASSWORD`, payment keys; keep `data/` on a persistent disk; terminate HTTPS at the proxy and set `TRUST_PROXY=true`. Back up with `npm run backup` (cron daily); restore by copying a backup over `data/hall.db` while the app is stopped.

## Layout
```
server/   index.js (app) · routes/ (public, compat, auth, account, admin) · services/ (pricing, availability, bookings, payments, notify, pdf…) · migrations/ · db.js
public/   shell.html · js/ (router, pages/, components, scene3d.js) · css/ · sw.js · manifest
tests/    api.test.js (+ helpers)       scripts/  migrate · seed · backup
```
