import { all, get, run, tx } from './db.js';
import { config } from './config.js';
import { hashPassword } from './lib/auth.js';

// All photography is hot-linked from Unsplash (images.unsplash.com) and loaded by the visitor's browser.
// Every image can be replaced from Admin → Gallery / Halls without touching code.
const U = (id, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
export const PHOTOS = {
  hero: 'photo-1519167758481-83f550bb49b3', ballroom: 'photo-1478146896981-b80fe463b330', pavilion: 'photo-1464366400600-7168b8af9bc3',
  tables: 'photo-1511795409834-ef04bbd61622', aisle: 'photo-1519225421980-715cb0215aed', decor: 'photo-1520854221256-17451cc331bf',
  hallDecor: 'photo-1606800052052-a08af7148866', chairs: 'photo-1505236858219-8359eb29e329', party: 'photo-1530103862676-de8c9debad1d',
  birthday: 'photo-1492684223066-81342ee5ff30', conference: 'photo-1540575467063-178a50c2df87', conf2: 'photo-1511578314322-379afb476865',
  seminar: 'photo-1523580846011-d3a5bc25702b', meeting: 'photo-1556761175-5973dc0f32e7', concert: 'photo-1429962714451-bb934ecdc4ec',
  stage: 'photo-1516450360452-9312f5e86fc7', lights: 'photo-1469371670807-013ccf25f16a', food: 'photo-1555244162-803834f70033',
  plated: 'photo-1414235077428-338989a2e8c0', wedding2: 'photo-1465495976277-4387d4b0b4c6', couple: 'photo-1519741497674-611481863552',
  indian: 'photo-1583939003579-730e3918a45a', indian2: 'photo-1595407753234-0882f1e77954',
};
const P = (k, w) => U(PHOTOS[k], w);

export function seed({ demo = !config.prod } = {}) {
  tx(() => {
    if (get('SELECT 1 x FROM halls LIMIT 1')) return;
    const br = run(`INSERT INTO branches(name,city,address,phone,email,lat,lng) VALUES ('Main Branch','Guntur','Brodipet Main Road, Guntur, Andhra Pradesh 522002','+91 98765 43210','bookings@aurelia-hall.example',16.3067,80.4365)`).lastInsertRowid;

    const hallIns = `INSERT INTO halls(branch_id,slug,name,tagline,description,min_guests,max_guests,seating_capacity,dining_capacity,length_m,width_m,height_m,area_sqft,layouts,base_price,half_day_price,hourly_price,parking_two,parking_four,image,popularity)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const h1 = run(hallIns, br, 'grand-ballroom', 'Grand Ballroom', 'Our flagship hall for grand celebrations',
      'A pillar-free, fully air-conditioned ballroom with a 40-ft stage, crystal chandeliers and a dedicated bridal suite. Designed for traditional Telugu weddings, receptions and large corporate gatherings.',
      200, 1200, 1000, 800, 42, 30, 7.5, 13500, JSON.stringify(['banquet', 'theatre', 'classroom', 'u-shape']), 185000, 110000, 24000, 300, 120, U(PHOTOS.hero), 100).lastInsertRowid;
    const h2 = run(hallIns, br, 'royal-pavilion', 'Royal Pavilion', 'An intimate hall for up to 350 guests',
      'A warm, elegant mid-size hall perfect for engagements, birthdays, seminars and small receptions, with its own dining area and private entrance.',
      50, 350, 300, 240, 24, 16, 5.5, 4100, JSON.stringify(['banquet', 'theatre', 'classroom', 'u-shape']), 75000, 45000, 9500, 120, 40, U(PHOTOS.pavilion), 60).lastInsertRowid;

    const facs = [
      ['Air Conditioning', 'ac', 'comfort', 'Centralised, silent cooling that keeps every guest comfortable all day.', '120 TR central plant · zoned control', 1],
      ['Parking', 'parking', 'access', 'Ample, secure and attendant-managed parking for family and guests.', '120 cars · 300 two-wheelers', 1],
      ['Dining Hall', 'dining', 'food', 'Separate dining hall with buffet counters and seated dining options.', 'Up to 800 dining at once', 1],
      ['Commercial Kitchen', 'kitchen', 'food', 'Fully equipped kitchen for in-house or outside caterers.', 'Gas banks · cold storage · prep areas', 0],
      ['Stage', 'stage', 'event', 'Spacious stage with LED backdrop, ramp and bridal seating options.', '40 × 20 ft · 3 ft height', 1],
      ['Guest Rooms', 'rooms', 'comfort', 'Air-conditioned rooms for the families, the bride and the groom.', '12 rooms · bridal & groom suites', 1],
      ['Power Backup', 'power', 'infrastructure', 'Silent generators keep your event running through any outage.', '100% backup · automatic changeover', 0],
      ['Sound System', 'sound', 'event', 'Professional line-array speakers, wireless microphones and mixer.', 'Line-array · 8 wireless mics', 0],
      ['Lighting', 'lighting', 'event', 'Programmable ambient lighting, chandeliers and spot lighting.', 'DMX controlled · warm & colour modes', 0],
      ['Wi-Fi', 'wifi', 'infrastructure', 'High-speed Wi-Fi for conferences, live streams and guests.', '300 Mbps fibre', 0],
      ['Security', 'security', 'infrastructure', '24×7 guards, CCTV coverage and fire-safety compliance.', 'CCTV · fire alarms · trained guards', 0],
      ['Accessibility', 'access', 'access', 'Step-free entrance, ramps, lift and accessible restrooms.', 'Wheelchair ramps · accessible toilets', 0],
    ];
    facs.forEach((f, i) => {
      const id = run('INSERT INTO facilities(name,slug,icon,category,description,spec,featured,sort) VALUES (?,?,?,?,?,?,?,?)', f[0], f[0].toLowerCase().replace(/\W+/g, '-'), f[1], f[2], f[3], f[4], f[5], i).lastInsertRowid;
      run('INSERT INTO hall_facilities VALUES (?,?)', h1, id);
      if (!['Commercial Kitchen'].includes(f[0]) || true) run('INSERT INTO hall_facilities VALUES (?,?)', h2, id);
    });

    const evs = [
      ['weddings', 'Weddings', 'Muhurtham-ready halls with bridal suites, mandapam décor and grand dining.', 'indian', 'rings'],
      ['receptions', 'Receptions', 'Stage, lighting and dining designed for unforgettable receptions.', 'tables', 'glass'],
      ['engagements', 'Engagements', 'Intimate, beautifully dressed settings for your ring ceremony.', 'couple', 'ring'],
      ['birthdays', 'Birthdays', 'Milestone birthdays and kids parties with décor and entertainment.', 'birthday', 'cake'],
      ['corporate', 'Corporate Events', 'Product launches, annual days and awards nights, AV-ready.', 'meeting', 'brief'],
      ['conferences', 'Conferences', 'Plenary hall with projection, Wi-Fi and breakout rooms.', 'conference', 'mic'],
      ['seminars', 'Seminars', 'Classroom and theatre layouts for workshops and training.', 'seminar', 'board'],
      ['cultural', 'Cultural Events', 'Dance, music and festival programmes with stage and sound.', 'stage', 'mask'],
    ];
    evs.forEach((e, i) => run('INSERT INTO event_types(slug,name,description,image,icon,sort) VALUES (?,?,?,?,?,?)', e[0], e[1], e[2], P(e[3], 900), e[4], i));
    run(`INSERT INTO event_types(slug,name,description,image,icon,sort) VALUES ('other','Other Event','Something different? Tell us your requirements.',?, 'star', 99)`, P('lights', 900));

    const svcIns = 'INSERT INTO services(name,description,category,price,price_type) VALUES (?,?,?,?,?)';
    const S = {};
    [['Catering — Veg Buffet', 'Traditional Andhra vegetarian buffet with live counters', 'catering', 450, 'per_guest'],
      ['Catering — Premium Buffet', 'Extended menu with desserts, chaat and live counters', 'catering', 750, 'per_guest'],
      ['Floral Stage Décor', 'Fresh-flower stage, entrance arch and mandap styling', 'decoration', 45000, 'fixed'],
      ['Premium Theme Décor', 'Full-hall themed decoration with lighting and props', 'decoration', 120000, 'fixed'],
      ['Photography & Video', 'Candid photography, cinematic video and an album', 'photography', 35000, 'fixed'],
      ['Sound System Plus', 'Line-array PA, DJ console and wireless mics', 'sound', 12000, 'fixed'],
      ['Stage & Ambient Lighting', 'Programmable lighting, truss and spot lights', 'lighting', 15000, 'fixed'],
      ['Guest Room', 'Air-conditioned guest room for the day', 'rooms', 3500, 'fixed'],
      ['Valet Parking', 'Attendants and signage for guest parking', 'parking', 6000, 'fixed'],
      ['Extra AC Hours', 'Cooling beyond the booked window', 'ac', 2500, 'per_hour'],
      ['Projector & Screen', 'Full-HD projector, 12-ft screen and clicker', 'equipment', 5000, 'fixed'],
    ].forEach((s) => { S[s[0]] = run(svcIns, ...s).lastInsertRowid; });

    const pkIns = 'INSERT INTO packages(slug,name,tier,description,price,per_guest_price,includes_hall,guest_capacity,duration_hours,image,popular,popularity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
    const pk = (a, svc) => { const id = run(pkIns, ...a).lastInsertRowid; svc.forEach((n) => run('INSERT INTO package_services VALUES (?,?)', id, S[n])); return id; };
    pk(['basic', 'Basic', 'basic', 'Hall with AC and standard lighting — ideal when you bring your own caterer and decorator.', 0, 0, 0, 350, 6, P('chairs', 900), 0, 20], ['Stage & Ambient Lighting']);
    pk(['standard', 'Standard', 'standard', 'Hall plus veg buffet catering, sound and parking support for celebrations up to 500 guests.', 20000, 450, 0, 500, 8, P('tables', 900), 0, 50], ['Catering — Veg Buffet', 'Sound System Plus', 'Valet Parking']);
    pk(['premium', 'Premium', 'premium', 'Premium buffet, floral stage, lighting, sound and valet — a complete, polished event.', 45000, 750, 0, 800, 10, P('decor', 900), 1, 90], ['Catering — Premium Buffet', 'Floral Stage Décor', 'Stage & Ambient Lighting', 'Sound System Plus', 'Valet Parking']);
    pk(['wedding', 'Royal Wedding', 'wedding', 'Our signature all-inclusive wedding: hall, themed décor, premium dining, photography, rooms and parking.', 150000, 900, 1, 1200, 14, P('indian', 900), 1, 100], ['Catering — Premium Buffet', 'Premium Theme Décor', 'Photography & Video', 'Stage & Ambient Lighting', 'Sound System Plus', 'Valet Parking', 'Guest Room']);
    pk(['corporate', 'Corporate Day', 'corporate', 'Conference-ready setup with AV, projection, Wi-Fi support, tea/coffee and lunch buffet.', 25000, 400, 0, 600, 9, P('conference', 900), 0, 40], ['Projector & Screen', 'Sound System Plus', 'Catering — Veg Buffet']);
    pk(['custom', 'Custom', 'custom', 'Tell us what you need. We build a bespoke quotation around your event.', 0, 0, 0, null, null, P('lights', 900), 0, 10], []);

    [['morning', 'Morning', '06:00', '12:00'], ['afternoon', 'Afternoon', '12:00', '17:00'], ['evening', 'Evening', '17:00', '23:00'], ['full-day', 'Full Day', '06:00', '23:00']]
      .forEach((s) => run('INSERT INTO time_slots(slug,name,start_time,end_time) VALUES (?,?,?,?)', ...s));
    [['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas'], ['2027-01-01', "New Year's Day"], ['2027-01-14', 'Bhogi'], ['2027-01-15', 'Makar Sankranti'], ['2027-01-26', 'Republic Day'], ['2027-08-15', 'Independence Day']]
      .forEach((h) => run('INSERT INTO holidays VALUES (?,?)', ...h));
    run(`INSERT INTO coupons(code,description,type,value,min_amount,max_uses,valid_to) VALUES ('WELCOME10','10% off your first booking','percent',10,50000,200,'2027-12-31')`);
    run(`INSERT INTO coupons(code,description,type,value,min_amount,valid_to) VALUES ('SEASON5000','Seasonal offer — ₹5,000 off','fixed',5000,100000,'2027-03-31')`);

    const gal = [
      ['hall', 'The Grand Ballroom', 'hero', h1], ['hall', 'Ballroom evening', 'ballroom', h1], ['hall', 'Royal Pavilion', 'pavilion', h2],
      ['wedding', 'Wedding ceremony', 'aisle', null], ['wedding', 'Floral décor', 'decor', null], ['wedding', 'Traditional wedding', 'indian', null], ['wedding', 'Mandap styling', 'indian2', null], ['wedding', 'Couple portraits', 'couple', null], ['wedding', 'Reception tables', 'tables', null],
      ['decoration', 'Hall dressing', 'hallDecor', null], ['decoration', 'Table settings', 'wedding2', null],
      ['corporate', 'Conference setup', 'conference', null], ['corporate', 'Plenary session', 'conf2', null], ['corporate', 'Seminar hall', 'seminar', null], ['corporate', 'Business meeting', 'meeting', null],
      ['events', 'Celebration lights', 'lights', null], ['events', 'Cultural evening', 'stage', null], ['events', 'Festival night', 'concert', null], ['events', 'Birthday party', 'birthday', null], ['events', 'Party décor', 'party', null],
      ['dining', 'Banquet dining', 'plated', null], ['dining', 'Buffet counters', 'food', null],
    ];
    gal.forEach((g, i) => run('INSERT INTO gallery(hall_id,category,title,alt,url,sort) VALUES (?,?,?,?,?,?)', g[3], g[0], g[1], `${g[1]} at the convention hall`, P(g[2]), i));
    run(`INSERT INTO gallery(category,title,alt,type,url,before_url,sort) VALUES ('decoration','From empty hall to dream wedding','Before and after decoration of the hall','before_after',?,?,100)`, P('hero'), P('chairs'));

    [['Ramesh Babu', 'Hall Manager', '+91 98480 11111', 'ramesh@aurelia-hall.example', 'Operations, vendor coordination, event-day supervision', 'Mon–Sun, 8am–10pm'],
      ['Lakshmi Devi', 'Booking Executive', '+91 98480 22222', 'lakshmi@aurelia-hall.example', 'Enquiries, site visits, quotations', 'Mon–Sat, 9am–7pm'],
      ['Srinivas Rao', 'Head of Décor', '+91 98480 33333', 'srinivas@aurelia-hall.example', 'Stage and hall decoration teams', 'On event days'],
      ['Anitha K', 'Accounts', '+91 98480 44444', 'accounts@aurelia-hall.example', 'Invoices, receipts, refunds', 'Mon–Sat, 10am–6pm']]
      .forEach((s) => run('INSERT INTO staff(name,role,phone,email,responsibilities,availability) VALUES (?,?,?,?,?,?)', ...s));

    // Admin account (production requires SEED_ADMIN_PASSWORD; dev gets a documented default).
    if (config.seedAdminPassword) run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Super Admin',?, '+91 98765 43210', ?, 'super_admin')`, config.seedAdminEmail, hashPassword(config.seedAdminPassword));
    if (demo) seedDemo(h1, h2);
  });
}

function seedDemo(h1, h2) {
  const pw = (p) => hashPassword(p);
  run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Hall Manager','manager@hall.local','+91 98480 11111',?, 'manager')`, pw('Manager@12345'));
  run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Front Desk','staff@hall.local','+91 98480 22222',?, 'staff')`, pw('Staff@12345'));
  const cust = run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Demo Customer','customer@example.com','+91 90000 12345',?, 'customer')`, pw('Customer@12345')).lastInsertRowid;
  const others = ['Sravani Reddy', 'Kiran Kumar', 'Mahesh Naidu', 'Divya Chowdary', 'Prasad Rao', 'Hima Bindu'].map((n, i) =>
    run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?, 'customer')`, n, `${n.split(' ')[0].toLowerCase()}@example.com`, `+91 9000${i}00000`, pw('Customer@12345')).lastInsertRowid);
  const ev = Object.fromEntries(all('SELECT slug, id FROM event_types').map((e) => [e.slug, e.id]));
  const rows = [ // [user, hall, event, pkg, date, start, end, guests, total, status, review]
    [others[0], h1, 'weddings', 4, -150, '06:00', '23:00', 900, 640000, 'completed', [5, 'A dream wedding', 'The team handled 900 guests effortlessly. Décor and dining were superb — our relatives are still talking about it.']],
    [others[1], h1, 'receptions', 3, -120, '17:00', '23:00', 600, 380000, 'completed', [5, 'Elegant and seamless', 'Beautiful ballroom, spotless service and the stage lighting was fantastic.']],
    [others[2], h2, 'engagements', 2, -90, '17:00', '22:00', 250, 160000, 'completed', [4, 'Lovely venue', 'Warm, intimate hall with great food. Parking was easy even with so many guests.']],
    [others[3], h1, 'corporate', 5, -60, '09:00', '17:00', 400, 290000, 'completed', [5, 'Perfect for our annual day', 'Projection, sound and Wi-Fi all worked flawlessly. Highly professional.']],
    [others[4], h2, 'birthdays', 2, -30, '12:00', '17:00', 150, 95000, 'completed', [5, 'Great for family functions', 'Staff were so helpful and flexible with the décor. Will book again!']],
    [cust, h2, 'seminars', 5, 25, '10:00', '16:00', 120, 88000, 'confirmed', null],
    [others[5], h1, 'weddings', 4, 48, '06:00', '23:00', 800, 720000, 'confirmed', null],
    [others[0], h1, 'receptions', 3, 70, '17:00', '23:00', 500, 330000, 'reserved', null],
    [others[2], h2, 'engagements', 2, 33, '17:00', '22:00', 200, 140000, 'pending', null],
  ];
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  rows.forEach(([uid, hall, evSlug, pkg, off, st, en, guests, total, status, rev], i) => {
    const u = get('SELECT * FROM users WHERE id=?', uid), date = day(off);
    const [sh, sm] = st.split(':').map(Number), [eh, em] = en.split(':').map(Number);
    const sub = Math.round(total / 1.18), tax = total - sub, adv = Math.round(total * 0.3);
    const paid = status === 'completed' ? total : status === 'confirmed' ? adv : 0;
    const created = new Date(Date.now() + (off - 25) * 864e5).toISOString().slice(0, 19).replace('T', ' ');
    const id = run(`INSERT INTO bookings(ref,user_id,hall_id,event_type_id,package_id,customer_name,phone,email,event_date,start_time,end_time,start_min,end_min,buffer_min,guests,status,hold_expires_at,subtotal,tax,total,advance_due,paid_amount,breakdown,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,60,?,?,?,?,?,?,?,?,?,?)`,
      `BK-DEMO-${String(i + 1).padStart(4, '0')}`, uid, hall, ev[evSlug], pkg, u.name, u.phone || '+91 90000 00000', u.email, date, st, en, sh * 60 + sm, eh * 60 + em, guests, status,
      status === 'pending' ? new Date(Date.now() + 864e5).toISOString().slice(0, 19).replace('T', ' ') : null, sub, tax, total, adv, paid,
      JSON.stringify({ lines: [{ type: 'hall', label: 'Demo booking', amount: sub }], tax_label: 'GST', tax_percent: 18 }), created).lastInsertRowid;
    if (paid) {
      const kind = paid >= total ? 'advance' : 'advance';
      run(`INSERT INTO payments(booking_id,kind,provider,provider_order_id,provider_payment_id,amount,status,receipt_no,paid_at) VALUES (?,?,?,?,?,?, 'paid', ?, ?)`, id, kind, 'mock', `order_demo_${i}`, `pay_demo_${i}`, adv, `RCP-DEMO-${i + 1}`, created);
      if (paid > adv) run(`INSERT INTO payments(booking_id,kind,provider,provider_order_id,provider_payment_id,amount,status,receipt_no,paid_at) VALUES (?, 'balance', 'mock', ?, ?, ?, 'paid', ?, ?)`, id, `order_demo_b${i}`, `pay_demo_b${i}`, paid - adv, `RCP-DEMO-B${i + 1}`, new Date(Date.parse(date) - 3 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
    }
    if (rev) run(`INSERT INTO reviews(booking_id,user_id,author,event_label,rating,title,body,status) VALUES (?,?,?,?,?,?,?, 'approved')`, id, uid, u.name, evSlug, rev[0], rev[1], rev[2]);
  });
  [['Anil', '+91 98000 11111', 'Wedding on a Saturday in December for 700 guests — please share rates.', 'new'], ['Sunitha', '+91 98000 22222', 'Looking for a conference hall for 150 people next month.', 'contacted'],
    ['Venkat', '+91 98000 33333', 'Need a quote for a sangeet night.', 'follow_up'], ['Rajeshwari', '+91 98000 44444', 'Booked the Royal Pavilion for engagement.', 'converted']]
    .forEach((e) => run('INSERT INTO enquiries(name,phone,message,status,source) VALUES (?,?,?,?, \'website\')', e[0], e[1], e[2], e[3]));
}
