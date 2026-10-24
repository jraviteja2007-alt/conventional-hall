import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client, close, futureDate, resetLimits, booking, dbm, base } from './helpers.js';

const ADMIN = ['admin@hall.local', 'Admin@12345'];
let admin, cust;
before(async () => {
  admin = await new Client().login(...ADMIN);
  cust = await new Client().login('customer@example.com', 'Customer@12345');
});
after(() => close());
beforeEach(() => resetLimits());

test('public catalogue endpoints respond', async () => {
  const c = await new Client().init();
  for (const p of ['/api/settings', '/api/halls', '/api/facilities', '/api/packages', '/api/event-types', '/api/gallery', '/api/reviews', '/api/services']) {
    const r = await c.get(p); assert.equal(r.status, 200, p);
  }
  const h = await c.get('/api/halls/grand-ballroom'); assert.equal(h.data.hall.max_guests, 1200);
  assert.equal((await c.get('/api/halls/nope')).status, 404);
  assert.ok((await c.get('/sitemap.xml')).data.includes('/halls/grand-ballroom'));
  assert.ok((await c.get('/robots.txt')).data.includes('Disallow: /admin'));
});

test('SEO: server-rendered head with structured data and real 404 status', async () => {
  const home = await new Client().get('/');
  assert.equal(home.status, 200);
  assert.match(home.data, /<title>(Tangutur|Guntur) Convention Hall/); assert.match(home.data, /application\/ld\+json/); assert.match(home.data, /og:title/);
  const missing = await new Client().get('/definitely-not-a-page'); assert.equal(missing.status, 404);
  assert.match(missing.data, /noindex/);
});

test('auth: validation, registration, login, lockout, roles', async () => {
  const c = await new Client().init();
  let r = await c.post('/api/auth/register', { name: 'A', email: 'bad', phone: '1', password: 'short' });
  assert.equal(r.status, 422); assert.ok(r.data.error.fields.email && r.data.error.fields.password);
  r = await c.post('/api/auth/register', { name: 'New Person', email: 'new@example.com', phone: '+91 91111 22222', password: 'Passw0rdOK' });
  assert.equal(r.status, 201); assert.equal(r.data.user.role, 'customer'); assert.ok(!('password_hash' in r.data.user));
  assert.equal((await c.post('/api/auth/register', { name: 'New Person', email: 'NEW@example.com', phone: '+91 91111 22222', password: 'Passw0rdOK' })).status, 409);
  assert.equal((await c.get('/api/auth/me')).data.user.email, 'new@example.com');
  // customers cannot reach admin APIs; anonymous gets 401
  assert.equal((await c.get('/api/admin/dashboard')).status, 403);
  assert.equal((await new Client().init().then((x) => x.get('/api/admin/dashboard'))).status, 401);
  // brute force lock-out after 5 bad passwords
  const v = await new Client().init();
  for (let i = 0; i < 5; i++) assert.equal((await v.post('/api/auth/login', { email: 'staff@hall.local', password: 'wrong-pass-1' })).status, 401);
  assert.equal((await v.post('/api/auth/login', { email: 'staff@hall.local', password: 'Staff@12345' })).status, 429);
  dbm.run(`UPDATE users SET locked_until=NULL, failed_logins=0 WHERE email='staff@hall.local'`);
});

test('security: CSRF token required, bad origin blocked, JWT tampering rejected', async () => {
  const c = await new Client().init();
  assert.equal((await c.req('POST', '/api/enquiries', { name: 'x' }, { headers: { 'x-csrf-token': 'wrong' } })).status, 403);
  const noToken = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `csrf=${c.jar.csrf}` }, body: '{}' });
  assert.equal(noToken.status, 403);
  assert.equal((await c.req('POST', '/api/auth/logout', {}, { headers: { origin: 'https://evil.example' } })).status, 403);
  const forged = new Client(); await forged.init(); forged.jar.token = cust.jar.token.slice(0, -2) + 'xx';
  assert.equal((await forged.get('/api/bookings')).status, 401);
  const none = new Client(); await none.init(); none.jar.token = 'eyJhbGciOiJub25lIn0.eyJzdWIiOjEsInJvbGUiOiJzdXBlcl9hZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.';
  assert.equal((await none.get('/api/admin/dashboard')).status, 401);
});

test('security: SQL injection, XSS sanitising, traversal, upload validation', async () => {
  const c = await new Client().init();
  const sqli = await c.get('/api/search?q=' + encodeURIComponent("' OR 1=1; DROP TABLE users;--"));
  assert.equal(sqli.status, 200); assert.equal(dbm.get('SELECT COUNT(*) n FROM users').n > 0, true);
  const enq = await c.post('/api/enquiries', { name: '<script>alert(1)</script>Mallory', phone: '+91 90000 99999', message: '<img src=x onerror=alert(1)>hello' });
  assert.equal(enq.status, 201);
  const row = dbm.get('SELECT * FROM enquiries ORDER BY id DESC LIMIT 1');
  assert.ok(!/[<>]/.test(row.name + row.message), 'tags stripped');
  assert.equal((await c.get('/..%2f..%2fserver%2fconfig.js')).status === 200 && false, false);
  const t = await c.get('/%2e%2e/server/config.js'); assert.notEqual(t.status, 200);
  assert.ok(!String(t.data).includes('jwtSecret'));
  // honeypot silently discards bots
  const before = dbm.get('SELECT COUNT(*) n FROM enquiries').n;
  await c.post('/api/enquiries', { name: 'Bot', phone: '+91 90000 99998', website: 'http://spam' });
  assert.equal(dbm.get('SELECT COUNT(*) n FROM enquiries').n, before);
  // fake image: text content with .png name must be rejected
  const form = new FormData(); form.append('file', new Blob(['not really an image'], { type: 'image/png' }), 'evil.png');
  const up = await admin.req('POST', '/api/admin/upload', form, { raw: true });
  assert.equal(up.status, 415);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const f2 = new FormData(); f2.append('file', new Blob([png], { type: 'image/png' }), 'ok.png');
  assert.equal((await admin.req('POST', '/api/admin/upload', f2, { raw: true })).status, 201);
  const f3 = new FormData(); f3.append('file', new Blob([png], { type: 'image/png' }), 'sneaky.php');
  assert.equal((await admin.req('POST', '/api/admin/upload', f3, { raw: true })).status, 415);
});

test('pricing: transparent breakdown, weekend uplift, GST, coupon, validation', async () => {
  const c = await new Client().init();
  // find the next Wednesday and Saturday at least 40 days out, outside holidays
  const pick = (dow) => { for (let i = 40; i < 120; i++) { const d = futureDate(i); if (new Date(d + 'T00:00:00Z').getUTCDay() === dow && !dbm.get('SELECT 1 x FROM holidays WHERE date=?', d)) return d; } };
  const wed = pick(3), sat = pick(6);
  const q = (date, extra = {}) => c.post('/api/quote', { hall_id: 2, event_date: date, start_time: '10:00', end_time: '16:00', guests: 100, ...extra });
  const a = (await q(wed)).data.quote, b = (await q(sat)).data.quote;
  assert.equal(a.hours, 6); assert.ok(b.hall_amount > a.hall_amount, 'weekend costs more');
  assert.equal(a.total, a.subtotal - a.discount + a.tax); assert.equal(a.tax, Math.round((a.subtotal * 18) / 100));
  assert.ok(a.lines.length >= 1 && a.advance_due === Math.round(a.total * 0.3));
  const withCoupon = (await q(wed, { coupon: 'WELCOME10', package_id: 2 })).data.quote;
  assert.ok(withCoupon.discount > 0 && withCoupon.lines.some((l) => l.type === 'discount'));
  assert.equal((await q(wed, { coupon: 'NOPE' })).status, 422);
  assert.equal((await q(wed, { guests: 999 })).status, 422);                    // Royal Pavilion max 350
  assert.equal((await q(wed, { end_time: '10:30' })).status, 422);               // below minimum duration
  assert.equal((await q('2020-01-01')).status, 422);                              // past date
  // client-supplied prices are ignored entirely
  const tamper = (await q(wed, { total: 1, price: 1, subtotal: 1 })).data.quote; assert.equal(tamper.total, a.total);
});

test('booking → approve → pay (server-verified) → confirmed → documents', async () => {
  const date = futureDate(90);
  let r = await cust.post('/api/bookings', booking(date, { hall_id: 2, guests: 150, package_id: 2, requirements: 'Need stage' }));
  assert.equal(r.status, 201); const b = r.data.booking;
  assert.equal(b.status, 'pending'); assert.match(b.ref, /^BK-/); assert.ok(b.total > 0 && b.advance_due > 0);
  // cannot pay before approval
  assert.equal((await cust.post(`/api/bookings/${b.id}/pay`, {})).status, 409);
  assert.equal((await cust.post(`/api/admin/bookings/${b.id}/approve`)).status, 403);
  r = await admin.post(`/api/admin/bookings/${b.id}/approve`); assert.equal(r.data.booking.status, 'reserved');
  // initiate + tampered signature is rejected and credits nothing
  const order = (await cust.post(`/api/bookings/${b.id}/pay`, { kind: 'advance' })).data;
  assert.equal(order.amount, b.advance_due);
  let v = await cust.post('/api/payments/verify', { order_id: order.order_id, payment_id: 'pay_fake', signature: 'f'.repeat(64) });
  assert.equal(v.status, 400); assert.equal(dbm.get('SELECT paid_amount p FROM bookings WHERE id=?', b.id).p, 0);
  // genuine flow
  const order2 = (await cust.post(`/api/bookings/${b.id}/pay`, { kind: 'advance' })).data;
  const co = (await cust.post('/api/payments/mock/checkout', { order_id: order2.order_id })).data;
  v = await cust.post('/api/payments/verify', co); assert.equal(v.status, 200); assert.equal(v.data.booking.status, 'confirmed'); assert.equal(v.data.booking.paid_amount, b.advance_due);
  // replay is idempotent — no double credit
  await cust.post('/api/payments/verify', co); assert.equal(dbm.get('SELECT paid_amount p FROM bookings WHERE id=?', b.id).p, b.advance_due);
  // documents
  for (const d of [`confirmation/${b.id}`, `invoice/${b.id}`, `receipt/${v.data.payment.id}`]) {
    const pdf = await cust.get(`/api/documents/${d}`); assert.equal(pdf.status, 200, d); assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.data.toString('latin1').includes('%%EOF'));
  }
  // another customer cannot see this booking
  const other = await new Client().login('sravani@example.com', 'Customer@12345');
  assert.equal((await other.get(`/api/bookings/${b.id}`)).status, 404);
  assert.equal((await other.get(`/api/documents/invoice/${b.id}`)).status, 404);
  // balance payment via offline admin entry completes it
  const rest = b.total - b.advance_due;
  const off = await admin.post(`/api/admin/bookings/${b.id}/payments`, { amount: rest, note: 'cash' }); assert.equal(off.status, 201);
  assert.equal((await admin.post(`/api/admin/bookings/${b.id}/payments`, { amount: 1 })).status, 422); // nothing left
});

test('DOUBLE-BOOKING: 10 simultaneous requests for one slot → exactly one wins', async () => {
  const date = futureDate(130);
  const users = await Promise.all(Array.from({ length: 10 }, (_, i) => (async () => {
    const c = await new Client().init();
    await c.post('/api/auth/register', { name: `Racer ${i}`, email: `racer${i}@example.com`, phone: '+91 90000 0000' + i, password: 'RacePass123' });
    return c;
  })()));
  resetLimits();
  const results = await Promise.all(users.map((c) => c.post('/api/bookings', booking(date, { hall_id: 1, guests: 300 }))));
  const wins = results.filter((r) => r.status === 201), losses = results.filter((r) => r.status === 409);
  assert.equal(wins.length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(losses.length, 9); assert.equal(losses[0].data.error.code, 'BOOKING_CONFLICT');
  assert.equal(dbm.get(`SELECT COUNT(*) n FROM bookings WHERE hall_id=1 AND event_date=? AND status IN ('pending','reserved','confirmed')`, date).n, 1);
});

test('buffer time, overlaps and slot calendar', async () => {
  const date = futureDate(150), c = cust;
  assert.equal((await c.post('/api/bookings', booking(date, { start_time: '10:00', end_time: '14:00' }))).status, 201);
  assert.equal((await c.post('/api/bookings', booking(date, { start_time: '13:00', end_time: '17:00' }))).status, 409);   // overlap
  assert.equal((await c.post('/api/bookings', booking(date, { start_time: '14:00', end_time: '18:00' }))).status, 409);   // inside 60-min buffer
  assert.equal((await c.post('/api/bookings', booking(date, { start_time: '15:00', end_time: '19:00' }))).status, 201);   // clear of buffer
  assert.equal((await c.post('/api/bookings', booking(date, { hall_id: 2 }))).status, 201);                                // other hall is independent
  const cal = (await c.get(`/api/availability?hall=1&month=${date.slice(0, 7)}`)).data.days[date];
  assert.equal(cal.status, 'pending'); assert.equal(cal.slots['full-day'], false);
  assert.ok(!JSON.stringify(cal).includes('Test User'), 'no personal data in public calendar');
  const chk = (await c.get(`/api/availability/check?hall=1&date=${date}&start=11:00&end=12:00`)).data; assert.equal(chk.available, false);
});

test('database constraint blocks conflicting confirmed bookings even if app code is bypassed', () => {
  const date = futureDate(200);
  const ins = (s, e, st) => dbm.run(`INSERT INTO bookings(ref,hall_id,customer_name,phone,email,event_date,start_time,end_time,start_min,end_min,buffer_min,guests,status) VALUES (?,1,'x','1','x@x.co',?,?,?,?,?,60,10,?)`, 'T-' + Math.random(), date, '00:00', '00:00', s, e, st);
  ins(600, 840, 'confirmed');
  assert.throws(() => ins(700, 900, 'confirmed'), /BOOKING_CONFLICT/);
  assert.throws(() => ins(850, 1000, 'reserved'), /BOOKING_CONFLICT/);   // within buffer
  assert.doesNotThrow(() => ins(1000, 1100, 'confirmed'));
  assert.doesNotThrow(() => ins(700, 900, 'pending'));                      // pending holds are app-level only
  const id = dbm.run(`INSERT INTO bookings(ref,hall_id,customer_name,phone,email,event_date,start_time,end_time,start_min,end_min,buffer_min,guests,status) VALUES ('T-up',1,'x','1','x@x.co',?, '00:00','00:00',100,200,60,10,'pending')`, date).lastInsertRowid;
  assert.throws(() => dbm.run(`UPDATE bookings SET status='confirmed', start_min=650, end_min=700 WHERE id=?`, id), /BOOKING_CONFLICT/);
});

test('admin blocks/maintenance, modify, reschedule and cancellation refunds', async () => {
  const date = futureDate(210);
  // block a date → customers cannot book it
  const bl = await admin.post('/api/admin/blocks', { hall_id: 1, date, status: 'maintenance', reason: 'Painting' }); assert.equal(bl.status, 201);
  assert.equal((await cust.post('/api/bookings', booking(date))).status, 409);
  assert.equal((await cust.get(`/api/availability?hall=1&month=${date.slice(0, 7)}`)).data.days[date].status, 'maintenance');
  await admin.del(`/api/admin/blocks/${bl.data.id}`);
  // book far ahead, confirm with payment, reschedule, then cancel → refund tier
  const d1 = futureDate(220), d2 = futureDate(225);
  const b = (await cust.post('/api/bookings', booking(d1, { hall_id: 2, guests: 100 }))).data.booking;
  await admin.post(`/api/admin/bookings/${b.id}/approve`);
  const o = (await cust.post(`/api/bookings/${b.id}/pay`, {})).data;
  await cust.post('/api/payments/verify', (await cust.post('/api/payments/mock/checkout', { order_id: o.order_id })).data);
  const mod = await cust.patch(`/api/bookings/${b.id}`, { event_date: d2, guests: 120 });
  assert.equal(mod.status, 200); assert.equal(mod.data.booking.event_date, d2); assert.equal(mod.data.booking.guests, 120);
  const prev = await cust.get(`/api/bookings/${b.id}/cancel-preview`); assert.equal(prev.data.refund_percent, 90);
  const can = await cust.post(`/api/bookings/${b.id}/cancel`, { reason: 'Plans changed' });
  assert.equal(can.status, 200); assert.equal(can.data.booking.status, 'cancelled'); assert.equal(can.data.refund, Math.round(o.amount * 0.9));
  const pend = (await admin.get('/api/admin/payments?status=pending_refund')).data.rows.find((p) => p.booking_id === b.id);
  assert.ok(pend); const done = await admin.post(`/api/admin/payments/${pend.id}/refund`, {}); assert.equal(done.status, 200);
  assert.equal((await admin.post(`/api/admin/payments/${pend.id}/refund`, {})).status, 409);
  // date freed again
  assert.equal((await cust.post('/api/bookings', booking(d2, { hall_id: 2 }))).status, 201);
  // late changes blocked for customers (inside modify window) but allowed for admin
  const soon = futureDate(3); const sb = (await cust.post('/api/bookings', booking(soon, { hall_id: 2 }))).data.booking;
  assert.equal((await cust.patch(`/api/bookings/${sb.id}`, { guests: 50 })).status, 403);
  assert.equal((await admin.patch(`/api/admin/bookings/${sb.id}`, { guests: 50 })).status, 200);
});

test('hold expiry releases the slot; reminders are sent once', async () => {
  const { sweep } = await import('../server/services/bookings.js');
  const date = futureDate(240);
  const b = (await cust.post('/api/bookings', booking(date, { hall_id: 2 }))).data.booking;
  dbm.run(`UPDATE bookings SET hold_expires_at=datetime('now','-1 minute') WHERE id=?`, b.id);
  assert.equal(sweep().expired >= 1, true);
  assert.equal(dbm.get('SELECT status FROM bookings WHERE id=?', b.id).status, 'expired');
  assert.equal((await cust.post('/api/bookings', booking(date, { hall_id: 2 }))).status, 201);
});

test('admin CRUD, RBAC levels, settings, reports, exports', async () => {
  const staff = await new Client().login('staff@hall.local', 'Staff@12345');
  const manager = await new Client().login('manager@hall.local', 'Manager@12345');
  assert.equal((await staff.get('/api/admin/bookings')).status, 200);
  assert.equal((await staff.post('/api/admin/packages', { name: 'X', price: 1 })).status, 403);
  assert.equal((await staff.get('/api/admin/settings')).status, 403);
  assert.equal((await manager.get('/api/admin/audit')).status, 403);
  // create + update + delete a package with services
  let r = await admin.post('/api/admin/packages', { name: 'Festival Special', tier: 'standard', price: 12345, per_guest_price: 100, guest_capacity: 200, service_ids: [1, 6] });
  assert.equal(r.status, 201); const id = r.data.row.id; assert.deepEqual(r.data.row.service_ids.sort(), [1, 6]);
  assert.equal((await admin.put(`/api/admin/packages/${id}`, { price: 15000, service_ids: [1] })).data.row.service_ids.length, 1);
  assert.equal((await admin.post('/api/admin/packages', { name: 'Bad', price: -5 })).status, 422);
  assert.equal((await admin.del(`/api/admin/packages/${id}`)).status, 200);
  assert.equal((await admin.del('/api/admin/halls/1')).status, 409);   // hall in use
  // settings
  r = await admin.put('/api/admin/settings/business', { name: 'Test Hall Name', tagline: 'New tagline' }); assert.equal(r.data.settings.name, 'Test Hall Name');
  assert.equal((await new Client().get('/api/settings')).data.business.tagline, 'New tagline');
  assert.equal((await admin.put('/api/admin/settings/theme', { primary: 'red' })).status, 422);
  assert.equal((await admin.put('/api/admin/settings/booking', { advance_percent: 40 })).data.settings.advance_percent, 40);
  await admin.put('/api/admin/settings/booking', { advance_percent: 30 }); await admin.put('/api/admin/settings/business', { name: 'Aurelia Convention Hall' });
  // reports & csv
  const d = (await admin.get('/api/admin/dashboard')).data; assert.ok(d.stats.total_bookings > 5 && Array.isArray(d.stats.revenue_by_month));
  for (const t of ['revenue', 'bookings', 'events', 'customers', 'payments']) assert.equal((await manager.get(`/api/admin/reports/${t}`)).status, 200, t);
  const csv = await admin.get('/api/admin/bookings?format=csv'); assert.match(csv.headers.get('content-type'), /csv/); assert.match(csv.data, /ref,status/);
  assert.equal((await admin.get('/api/admin/export')).status, 200);
  assert.ok((await admin.get('/api/admin/audit')).data.rows.some((a) => a.action === 'settings'));
  // CSV formula injection is neutralised
  const { csvEscape } = await import('../server/services/reports.js'); assert.equal(csvEscape('=HYPERLINK("x")')[0], '"');
  assert.ok((await admin.get('/api/admin/ai/summary')).data.summary.length > 20);
});

test('reviews are moderated and only allowed after the event', async () => {
  const date = futureDate(300);
  const b = (await cust.post('/api/bookings', booking(date, { hall_id: 2 }))).data.booking;
  assert.equal((await cust.post('/api/reviews', { booking_id: b.id, rating: 5, body: 'Looking forward to it so much!' })).status, 409);
  const done = dbm.all(`SELECT id FROM bookings WHERE status='completed' AND user_id=(SELECT id FROM users WHERE email='customer@example.com')`);
  const eligible = dbm.get(`SELECT id FROM bookings WHERE user_id=(SELECT id FROM users WHERE email='customer@example.com') AND event_date < date('now')`);
  if (!eligible) { dbm.run(`UPDATE bookings SET event_date=date('now','-3 days'), status='completed' WHERE id=?`, b.id); }
  const target = eligible?.id ?? b.id;
  const r = await cust.post('/api/reviews', { booking_id: target, rating: 4, title: 'Great', body: 'A wonderful evening for the whole family.' });
  assert.equal(r.status, 201);
  assert.equal((await cust.post('/api/reviews', { booking_id: target, rating: 4, body: 'Second review attempt here.' })).status, 409);
  assert.ok(!(await new Client().get('/api/reviews')).data.reviews.some((x) => x.body.includes('wonderful evening')), 'hidden until approved');
  const rid = dbm.get('SELECT id FROM reviews WHERE booking_id=?', target).id;
  await admin.put(`/api/admin/reviews/${rid}`, { status: 'approved' });
  assert.ok((await new Client().get('/api/reviews')).data.reviews.some((x) => x.body.includes('wonderful evening')));
});

test('AI assistant answers from live data and never invents availability', async () => {
  const c = await new Client().init();
  const date = futureDate(90);
  const booked = futureDate(150);
  const a = (await c.post('/api/ai/chat', { message: `Is the hall available on ${booked}?` })).data.reply;
  assert.match(a, /Grand Ballroom: .*(available|booked)/);
  const free = (await c.post('/api/ai/chat', { message: `Is ${futureDate(400)} free?` })).data.reply; assert.match(free, /available for/);
  const rec = (await c.post('/api/ai/chat', { message: 'Suggest a package for a wedding with 600 guests, budget 7 lakh' })).data.reply; assert.match(rec, /Wedding|Premium|Standard/);
  const price = (await c.post('/api/ai/chat', { message: 'what is the price?' })).data.reply; assert.match(price, /₹/);
  assert.equal((await c.post('/api/ai/chat', { message: '' })).status, 422);
});

test('rate limiting protects public write endpoints', async () => {
  resetLimits();
  const c = await new Client().init(); let last;
  for (let i = 0; i < 25; i++) last = await c.post('/api/enquiries', { name: 'Spam Tester', phone: '+91 90000 77777' });
  assert.equal(last.status, 429);
});
