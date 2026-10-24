// Demo catalogue for first run. Idempotent: does nothing when halls already exist.
// Every business detail below (names, prices, capacities, reviews) is PLACEHOLDER content to be replaced from the admin panel.
// Photos are hot-linked from images.unsplash.com (see public/js/images.js for the same catalogue on the client).
import { all, get, run, tx, migrate } from './index.js';
import { hashPassword } from '../lib/security.js';
import { config } from '../config.js';

const U = (id, w = 1600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const T = (id) => U(id, 700);

// Verified against Unsplash search pages (event-venue, wedding-venue, banquet-hall, conference-hall, ...).
const P = {
  chandelierHall: '1675247488725-22d1b78e75db',
  banquetRound: '1768851142332-75f3d1b47452',
  banquetRound2: '1768508951405-10e83c4a2872',
  ballroomTables: '1783314867628-220ab03cac99',
  longBanquet: '1762765684665-6b6855bb6fe6',
  emptyBanquetRed: '1759477274116-e3cb02d2b9d8',
  emptyChairs: '1577058071107-96a5a1dbe120',
  weddingRoom: '1665607437981-973dcd6a22bb',
  floralHall: '1779308936221-89739e035a53',
  floralArch: '1670529776180-60e4132ab90c',
  tableFlowers: '1511795409834-ef04bbd61622',
  dinnerSetting: '1519167758481-83f550bb49b3',
  partyTable: '1464366400600-7168b8af9bc3',
  flowerAisle: '1469371670807-013ccf25f16a',
  candleTable: '1653821355736-0c2598d0a63e',
  colorfulTables: '1759124650320-d629a3d73d9f',
  blackLinen: '1641996250159-9d2bbfb483fa',
  canopyCouple: '1587271636175-90d58cdad458',
  canopyRitual: '1587271407850-8d438ca9fdf2',
  bride: '1610173827043-9db50e0d8ef9',
  confRoundTables: '1511578314322-379afb476865',
  confAudience: '1540575467063-178a50c2df87',
  speaker: '1587825140708-dfaf72ae4b04',
  panel: '1582192730841-2a682d7375f9',
  screenTalk: '1505373877841-8d25f7d46678',
  boardroom: '1431540015161-0bf868a2d407',
  stageLights: '1576514129883-2f1d47a65da6',
  stageHaze: '1600779547877-be592ef5aad3',
  concert: '1670028514318-0ac718c0590d',
  birthdayBalloons: '1583875762487-5f8f7c718d14',
  birthdayDecor: '1531956531700-dc0ee0f1f9a5',
  buffet: '1555244162-803834f70033',
  buffet2: '1722477936580-84aa10762b0b',
  wineGlasses: '1519225421980-715cb0215aed',
};

const j = (v) => JSON.stringify(v);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function seedIfEmpty() {
  migrate();
  if (get('SELECT COUNT(*) c FROM halls').c > 0) return false;
  const adminEmail = config.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  let adminPass = config.env.SEED_ADMIN_PASSWORD;
  let generated = false;
  if (!adminPass && !config.isProd) { adminPass = 'Admin@12345'; generated = true; }
  const adminHash = adminPass ? await hashPassword(adminPass) : null;

  tx(() => {
    const branch = run(`INSERT INTO branches(name,city,address,phone,email,lat,lng) VALUES(?,?,?,?,?,?,?)`,
      'Main Branch', 'Guntur', 'Main Road, Guntur, Andhra Pradesh 522001', '+91 90000 00000', 'bookings@example.com', 16.3067, 80.4365).id;

    // ---------- facilities ----------
    const fac = {};
    [
      ['ac', 'Air Conditioning', 'comfort', 'snowflake', 'Centralised, whisper-quiet AC with zoned control. 180 TR capacity in the Grand Ballroom.', 1],
      ['parking', 'Parking', 'access', 'car', '150 four-wheeler and 400 two-wheeler bays with attendants. Valet available on request.', 1],
      ['dining', 'Dining Area', 'food', 'utensils', 'Dedicated air-conditioned dining hall that seats 400 at a time, separate from the main stage hall.', 1],
      ['kitchen', 'Commercial Kitchen', 'food', 'chef', 'Fully equipped catering kitchen with gas banks, cold storage and wash area. Bring your caterer or use ours.', 1],
      ['stage', 'Stage', 'event', 'stage', '40 x 20 ft modular stage with steps, ramp and a hydraulic backdrop frame.', 1],
      ['rooms', 'Guest & Bridal Rooms', 'comfort', 'bed', 'Six air-conditioned changing and rest rooms with attached washrooms.', 1],
      ['power-backup', 'Power Backup', 'safety', 'bolt', 'Silent 625 kVA generator with automatic changeover - no interruption during your event.', 1],
      ['sound', 'Sound System', 'event', 'speaker', 'Line-array speakers, wireless microphones and an operator on request.', 0],
      ['lighting', 'Lighting', 'event', 'bulb', 'Warm architectural lighting, dimmable chandeliers and programmable stage lights.', 0],
      ['wifi', 'High-speed Wi-Fi', 'comfort', 'wifi', 'Fibre broadband across all halls, ideal for conferences and live streaming.', 0],
      ['security', 'Security & CCTV', 'safety', 'shield', '24x7 guards, CCTV coverage, fire-safety systems and trained crowd management.', 1],
      ['accessibility', 'Wheelchair Access', 'access', 'wheelchair', 'Step-free entrances, ramps, a lift to the upper level and accessible washrooms.', 1],
      ['decoration', 'In-house Decoration', 'event', 'sparkles', 'Our design team handles stage, entrance, floral and mandap decor within your budget.', 1],
    ].forEach(([slug, name, category, icon, description, featured], i) => {
      fac[slug] = run('INSERT INTO facilities(slug,name,category,icon,description,is_featured,sort_order) VALUES(?,?,?,?,?,?,?)', slug, name, category, icon, description, featured, i).id;
    });

    // ---------- halls ----------
    const halls = [
      {
        slug: 'aurum-grand-ballroom', name: 'Aurum Grand Ballroom', tagline: 'Our flagship hall for weddings and grand receptions',
        description: 'A pillar-free, chandelier-lit ballroom with a 40 ft stage, warm wood accents and a separate dining hall. Designed for large weddings and receptions where every guest should feel part of the celebration.',
        min: 300, max: 1200, seating: 1000, dining: 800, l: 42, w: 26, h: 8, hourly: 15000, half: 70000, full: 130000, buffer: 90, hero: P.chandelierHall,
        layouts: [['theatre', 'Theatre', 1200, 'Rows of chairs facing the stage'], ['banquet', 'Banquet rounds', 800, 'Round tables of 10'], ['dining', 'Buffet dining', 900, 'Long tables with buffet counters'], ['ushape', 'U-shape', 120, 'Boardroom-style U for large meetings'], ['custom', 'Custom', 1000, 'Mandap-centred layouts on request']],
        fac: ['ac', 'parking', 'dining', 'kitchen', 'stage', 'rooms', 'power-backup', 'sound', 'lighting', 'wifi', 'security', 'accessibility', 'decoration'],
      },
      {
        slug: 'royal-orchid-hall', name: 'Royal Orchid Hall', tagline: 'Elegant mid-size hall for engagements, birthdays and receptions',
        description: 'A graceful 450-guest hall with a built-in stage, warm ambient lighting and direct access to the garden lawn. Perfect for engagements, birthdays, cultural programmes and intimate receptions.',
        min: 100, max: 450, seating: 380, dining: 300, l: 28, w: 17, h: 6, hourly: 8000, half: 38000, full: 70000, buffer: 60, hero: P.floralHall,
        layouts: [['theatre', 'Theatre', 450, 'Chairs facing the stage'], ['banquet', 'Banquet rounds', 300, 'Rounds of 10'], ['dining', 'Buffet dining', 350, 'Buffet with seating'], ['classroom', 'Classroom', 180, 'Desks and chairs for workshops']],
        fac: ['ac', 'parking', 'dining', 'kitchen', 'stage', 'rooms', 'power-backup', 'sound', 'lighting', 'wifi', 'security', 'accessibility', 'decoration'],
      },
      {
        slug: 'emerald-conference-suite', name: 'Emerald Conference Suite', tagline: 'Corporate-ready suite for conferences, seminars and training',
        description: 'A modern 150-seat conference suite with projection, tiered acoustics, breakout space and high-speed Wi-Fi. Built for seminars, training days, college events and board offsites.',
        min: 15, max: 150, seating: 150, dining: 80, l: 16, w: 10, h: 4, hourly: 3500, half: 16000, full: 28000, buffer: 30, hero: P.confRoundTables,
        layouts: [['theatre', 'Theatre', 150, 'Auditorium style'], ['classroom', 'Classroom', 80, 'Desks facing the front'], ['ushape', 'U-shape', 40, 'Workshop U'], ['banquet', 'Round tables', 72, 'Team-based tables']],
        fac: ['ac', 'parking', 'power-backup', 'sound', 'lighting', 'wifi', 'security', 'accessibility', 'stage'],
      },
    ];
    const hallIds = [];
    halls.forEach((h, i) => {
      const id = run(`INSERT INTO halls(branch_id,slug,name,tagline,description,min_guests,max_guests,seating_capacity,dining_capacity,length_m,width_m,height_m,area_sqm,base_hourly,base_half_day,base_full_day,per_guest_rate,buffer_minutes,is_ac,hero_image,sort_order)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        branch, h.slug, h.name, h.tagline, h.description, h.min, h.max, h.seating, h.dining, h.l, h.w, h.h, h.l * h.w, h.hourly, h.half, h.full, 0, h.buffer, 1, U(h.hero), i).id;
      hallIds.push(id);
      h.layouts.forEach(([kind, name, capacity, description]) => run('INSERT INTO hall_layouts(hall_id,kind,name,capacity,description) VALUES(?,?,?,?,?)', id, kind, name, capacity, description));
      h.fac.forEach((slug) => run('INSERT INTO hall_facilities(hall_id,facility_id,details) VALUES(?,?,?)', id, fac[slug], null));
    });
    run('UPDATE hall_facilities SET details=? WHERE hall_id=? AND facility_id=?', '180 TR centralised system', hallIds[0], fac.ac);
    run('UPDATE hall_facilities SET details=? WHERE hall_id=? AND facility_id=?', '150 cars / 400 two-wheelers', hallIds[0], fac.parking);
    run('UPDATE hall_facilities SET details=? WHERE hall_id=? AND facility_id=?', '100 cars / 250 two-wheelers', hallIds[1], fac.parking);
    run('UPDATE hall_facilities SET details=? WHERE hall_id=? AND facility_id=?', '40 cars / 100 two-wheelers', hallIds[2], fac.parking);

    // ---------- event categories ----------
    const ev = {};
    [
      ['wedding', 'Weddings', 'Muhurtham, mandap and a feast to remember.', P.canopyCouple, [{ key: 'bride_name', label: "Bride's name", type: 'text' }, { key: 'groom_name', label: "Groom's name", type: 'text' }, { key: 'muhurtham_time', label: 'Muhurtham time', type: 'time' }, { key: 'rituals', label: 'Ritual / ceremony style', type: 'text' }, { key: 'rooms_needed', label: 'Rooms needed', type: 'number' }]],
      ['reception', 'Receptions', 'Stage, dinner and dance floor for the big evening.', P.ballroomTables, [{ key: 'host_family', label: 'Host family', type: 'text' }, { key: 'dinner_time', label: 'Dinner time', type: 'time' }, { key: 'stage_setup', label: 'Stage setup preference', type: 'text' }]],
      ['engagement', 'Engagements', 'An intimate, beautifully styled ring ceremony.', P.flowerAisle, [{ key: 'couple_names', label: 'Couple names', type: 'text' }, { key: 'ceremony_time', label: 'Ceremony time', type: 'time' }]],
      ['birthday', 'Birthdays', 'Balloons, cakes and a hall full of joy.', P.birthdayBalloons, [{ key: 'celebrant', label: 'Celebrant name', type: 'text' }, { key: 'age', label: 'Turning age', type: 'number' }, { key: 'theme', label: 'Theme', type: 'text' }]],
      ['corporate', 'Corporate Events', 'Annual days, launches and client dinners.', P.boardroom, [{ key: 'company', label: 'Company / organisation', type: 'text' }, { key: 'av_needs', label: 'AV needs (projector, mics...)', type: 'text' }]],
      ['conference', 'Conferences', 'Multi-session events with AV and catering.', P.confAudience, [{ key: 'organisation', label: 'Organisation', type: 'text' }, { key: 'sessions', label: 'Number of sessions', type: 'number' }, { key: 'av_needs', label: 'AV needs', type: 'text' }]],
      ['seminar', 'Seminars & Workshops', 'Focused sessions for colleges and teams.', P.screenTalk, [{ key: 'institution', label: 'Institution / organiser', type: 'text' }, { key: 'layout', label: 'Preferred layout', type: 'text' }]],
      ['cultural', 'Cultural Events', 'Dance, music and community programmes.', P.stageHaze, [{ key: 'programme', label: 'Programme type', type: 'text' }, { key: 'performers', label: 'Number of performers', type: 'number' }]],
    ].forEach(([slug, name, description, image, extra], i) => {
      ev[slug] = run('INSERT INTO events(slug,name,description,image,extra_fields,sort_order) VALUES(?,?,?,?,?,?)', slug, name, description, U(image, 900), j(extra), i).id;
    });
    run('INSERT INTO events(slug,name,description,image,extra_fields,is_other,sort_order) VALUES(?,?,?,?,?,1,99)', 'other', 'Other Event', 'Something different? Tell us what you have in mind.', U(P.colorfulTables, 900), j([{ key: 'describe', label: 'Describe your event and requirements', type: 'textarea' }]));

    // ---------- services ----------
    const sv = {};
    [
      ['catering-veg', 'Vegetarian catering', 'Catering', 'per_guest', 650, 'per guest', 'Full vegetarian menu with 3 starters, 2 curries, biryani, sweets and live counters.'],
      ['catering-nonveg', 'Non-vegetarian catering', 'Catering', 'per_guest', 850, 'per guest', 'Mixed menu with chicken and mutton specialities.'],
      ['decor-classic', 'Classic decoration', 'Decoration', 'flat', 35000, null, 'Floral stage backdrop, entrance arch and table centrepieces.'],
      ['decor-premium', 'Premium decoration', 'Decoration', 'flat', 95000, null, 'Themed stage, hanging florals, aisle styling and lighting design.'],
      ['decor-royal', 'Royal mandap decoration', 'Decoration', 'flat', 180000, null, 'Full mandap build, grand entrance, photo booth and fragrance design.'],
      ['photo', 'Photography', 'Photography', 'flat', 45000, null, 'Two photographers, 400+ edited photos delivered in a private gallery.'],
      ['photo-cinema', 'Photography + cinematic video', 'Photography', 'flat', 95000, null, 'Photo team plus a cinematic highlight film and full-event recording.'],
      ['sound-pro', 'Professional sound system', 'Sound', 'flat', 12000, null, 'Line-array speakers, 6 wireless mics and an operator.'],
      ['lighting-fx', 'Stage & effect lighting', 'Lighting', 'flat', 15000, null, 'Moving heads, par cans and a lighting operator.'],
      ['dj', 'DJ & dance floor', 'Entertainment', 'flat', 22000, null, 'DJ, console and LED dance floor.'],
      ['rooms', 'Air-conditioned rooms', 'Rooms', 'per_unit', 3500, 'per room', 'Bridal, groom or guest rooms with attached washrooms.'],
      ['valet', 'Valet parking', 'Parking', 'flat', 6000, null, 'Four attendants to manage arrivals and parking.'],
      ['ac-extra', 'Extended AC cooling', 'AC', 'per_hour', 1800, 'per hour', 'Pre-cooling before guests arrive and extra hours of cooling.'],
      ['generator', 'Dedicated generator', 'Power', 'flat', 8000, null, 'Dedicated generator operator for outdoor or stage equipment.'],
      ['led-wall', 'LED video wall', 'Equipment', 'flat', 28000, null, '12 x 8 ft LED wall with a video operator.'],
      ['projector', 'Projector & screen', 'Equipment', 'flat', 5000, null, 'HD projector, screen and wireless presenter.'],
      ['lunch-tea', 'Conference lunch & tea', 'Catering', 'per_guest', 450, 'per guest', 'Welcome tea, working lunch and evening snacks.'],
    ].forEach(([slug, name, category, pricing_type, price, unit_label, description], i) => {
      sv[slug] = run('INSERT INTO services(slug,name,category,pricing_type,price,unit_label,description,sort_order) VALUES(?,?,?,?,?,?,?,?)', slug, name, category, pricing_type, price, unit_label, description, i).id;
    });

    // ---------- packages ----------
    const pk = (hall, slug, name, tier, description, price, perGuest, includesHall, min, max, hours, images, highlights, featured, sort, svcs) => {
      const id = run(`INSERT INTO packages(hall_id,slug,name,tier,description,price,per_guest_price,includes_hall,min_guests,max_guests,duration_hours,images,highlights,is_featured,sort_order)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, hall, slug, name, tier, description, price, perGuest, includesHall, min, max, hours, j(images.map((x) => U(x, 900))), j(highlights), featured, sort).id;
      svcs.forEach(([s, q = 1]) => run('INSERT INTO package_services(package_id,service_id,quantity) VALUES(?,?,?)', id, sv[s], q));
    };
    pk(null, 'basic', 'Basic', 'basic', 'The essentials, bundled at a saving. Add to any hall booking.', 28000, 0, 0, 50, 1200, 6, [P.dinnerSetting], ['Classic decoration', 'Professional sound', 'Two AC rooms', 'Parking support'], 0, 1,
      [['decor-classic'], ['sound-pro'], ['rooms', 2]]);
    pk(null, 'standard', 'Standard', 'standard', 'A balanced bundle for engagements, birthdays and receptions.', 68000, 0, 0, 100, 1200, 8, [P.tableFlowers], ['Classic decoration', 'Sound + stage lighting', 'Photography', 'Three AC rooms', 'Valet parking'], 0, 2,
      [['decor-classic'], ['sound-pro'], ['lighting-fx'], ['photo'], ['rooms', 3], ['valet']]);
    pk(null, 'premium', 'Premium', 'premium', 'Premium decor, full AV and photography with video - our most popular add-on bundle.', 178000, 0, 0, 200, 1200, 10, [P.ballroomTables], ['Premium themed decoration', 'Photography + cinematic video', 'DJ and dance floor', 'LED video wall', 'Four AC rooms', 'Valet parking'], 1, 3,
      [['decor-premium'], ['photo-cinema'], ['sound-pro'], ['lighting-fx'], ['dj'], ['led-wall'], ['rooms', 4], ['valet'], ['generator']]);
    pk(hallIds[0], 'wedding-royal', 'Royal Wedding', 'wedding', 'The complete Grand Ballroom wedding: hall, royal mandap, catering and all the details.', 330000, 750, 1, 400, 1200, 12, [P.canopyRitual, P.floralArch], ['Grand Ballroom for 12 hours', 'Royal mandap decoration', 'Vegetarian catering built in (per guest)', 'Photography + cinematic video', 'DJ and dance floor', 'Five AC rooms', 'Valet parking'], 1, 4,
      [['decor-royal'], ['photo-cinema'], ['sound-pro'], ['lighting-fx'], ['dj'], ['rooms', 5], ['valet'], ['generator']]);
    pk(hallIds[1], 'wedding-classic', 'Classic Wedding', 'wedding', 'Royal Orchid Hall for a heartfelt wedding or reception, with decor and catering.', 175000, 650, 1, 150, 450, 10, [P.floralHall, P.canopyCouple], ['Royal Orchid Hall for 10 hours', 'Classic decoration', 'Vegetarian catering built in (per guest)', 'Photography', 'Three AC rooms'], 0, 5,
      [['decor-classic'], ['photo'], ['sound-pro'], ['rooms', 3]]);
    pk(hallIds[2], 'corporate-day', 'Corporate Day', 'corporate', 'Emerald Suite for a working day: AV, Wi-Fi, tea and lunch for every delegate.', 22000, 450, 1, 15, 150, 8, [P.confAudience, P.screenTalk], ['Emerald Suite for 8 hours', 'Projector and screen', 'Professional sound', 'Tea + working lunch (per delegate)', 'High-speed Wi-Fi'], 0, 6,
      [['projector'], ['sound-pro']]);
    pk(null, 'custom', 'Custom Package', 'custom', 'Tell us what you need and we will prepare a personalised quotation within one working day.', 0, 0, 0, 1, 20000, 8, [P.colorfulTables], ['Built around your plan and budget', 'Quotation within one working day'], 0, 7, []);

    // ---------- pricing rules ----------
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,weekdays,multiplier,priority) VALUES(NULL,'Weekend','weekend','0,6',1.15,1)`);
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,weekdays,multiplier,priority) VALUES(NULL,'Friday evening','weekend','5',1.05,0)`);
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,start_date,end_date,recurring_yearly,multiplier,priority) VALUES(NULL,'Sankranti festival days','holiday','01-13','01-16',1,1.25,5)`);
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,start_date,end_date,recurring_yearly,multiplier,priority) VALUES(NULL,'Ugadi week','holiday','03-28','04-03',1,1.2,5)`);
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,start_date,end_date,recurring_yearly,multiplier,priority) VALUES(NULL,'Diwali week','holiday','2026-11-06','2026-11-10',0,1.3,5)`);
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,start_date,end_date,recurring_yearly,multiplier,priority) VALUES(NULL,'Peak wedding season','peak','11-15','02-15',1,1.2,2)`);
    run(`INSERT INTO pricing_rules(hall_id,name,rule_type,start_date,end_date,recurring_yearly,multiplier,priority) VALUES(NULL,'Monsoon off-season','offseason','06-15','09-15',1,0.85,2)`);

    // ---------- coupons ----------
    run(`INSERT INTO coupons(code,description,discount_type,value,min_amount,max_discount) VALUES('WELCOME10','Welcome offer - 10% off',?,10,100000,25000)`, 'percent');
    run(`INSERT INTO coupons(code,description,discount_type,value,min_amount) VALUES('FLAT5000','Rs. 5,000 off bookings above Rs. 50,000',?,5000,50000)`, 'fixed');
    run(`INSERT INTO coupons(code,description,discount_type,value,min_amount,max_discount,valid_from,valid_to,auto_apply) VALUES('FESTIVE5','Festive season offer - 5% off',?,5,75000,15000,'2026-10-01','2026-12-31',1)`, 'percent');

    // ---------- staff ----------
    [
      ['Venkata Rao', 'General Manager', '+91 90000 00001', 'Overall operations, vendor relations, VIP bookings', 'Mon-Sun, 9 AM - 8 PM'],
      ['Lakshmi Prasanna', 'Bookings Coordinator', '+91 90000 00002', 'Site visits, enquiries, quotations and payments', 'Mon-Sat, 9 AM - 7 PM'],
      ['Suresh Babu', 'Events Supervisor', '+91 90000 00003', 'On-day hall setup, AV and housekeeping teams', 'Rostered by event'],
      ['Anitha Reddy', 'Decor & Design Lead', '+91 90000 00004', 'Decoration planning and vendor coordination', 'Mon-Sat, 10 AM - 6 PM'],
      ['Ramesh Naidu', 'Security Head', '+91 90000 00005', 'Guards, CCTV, crowd and parking management', 'Rostered by event'],
    ].forEach(([name, role, phone, resp, avail]) => run('INSERT INTO staff(branch_id,name,role_title,phone,responsibilities,availability) VALUES(?,?,?,?,?,?)', branch, name, role, phone, resp, avail));

    // ---------- gallery ----------
    const items = [
      [hallIds[0], 'Halls', P.chandelierHall, 'Grand Ballroom', 'Chandelier-lit ballroom set with banquet tables'],
      [hallIds[0], 'Halls', P.banquetRound, 'Banquet rounds', 'Elegant banquet hall set for an event with round tables'],
      [hallIds[0], 'Halls', P.longBanquet, 'Long-table banquet', 'Long tables set for a banquet in a grand hall'],
      [hallIds[1], 'Halls', P.floralHall, 'Royal Orchid Hall', 'Wedding reception hall with a floral archway'],
      [hallIds[2], 'Halls', P.confRoundTables, 'Emerald Conference Suite', 'Conference room with round tables and projection screens'],
      [hallIds[0], 'Weddings', P.canopyCouple, 'Under the floral canopy', 'A couple in traditional attire under a floral canopy'],
      [hallIds[0], 'Weddings', P.canopyRitual, 'Mandap ceremony', 'A couple performing a wedding ritual under a floral canopy in a ballroom'],
      [hallIds[1], 'Weddings', P.floralArch, 'Floral archway', 'White floral archway with gold chairs for a wedding'],
      [hallIds[1], 'Decoration', P.flowerAisle, 'Flower aisle', 'White and pink flower arrangement along the aisle'],
      [hallIds[0], 'Decoration', P.candleTable, 'Candle and floral tables', 'Table set with candles and flowers'],
      [hallIds[0], 'Decoration', P.colorfulTables, 'Colourful centrepieces', 'Tables set with colourful floral arrangements'],
      [hallIds[1], 'Birthdays', P.birthdayBalloons, 'Balloon celebrations', 'Birthday balloons and decor'],
      [hallIds[1], 'Birthdays', P.birthdayDecor, 'Birthday setups', 'Birthday decoration'],
      [hallIds[2], 'Corporate', P.speaker, 'Keynote on stage', 'Speaker addressing a large audience on stage'],
      [hallIds[2], 'Corporate', P.panel, 'Panel discussion', 'Panel discussion on a stage in an auditorium'],
      [hallIds[2], 'Corporate', P.boardroom, 'Boardroom setup', 'Conference table and chairs'],
      [hallIds[1], 'Events', P.stageHaze, 'Stage & lighting', 'Stage with blue spotlights and haze'],
      [hallIds[1], 'Events', P.concert, 'Cultural evening', 'A stage with a crowd of people'],
      [hallIds[0], 'Catering', P.buffet, 'Buffet service', 'Buffet table with silver chafing dishes'],
      [hallIds[0], 'Catering', P.buffet2, 'Live counters', 'A buffet with many different types of food'],
    ];
    items.forEach(([hall, cat, id, title, alt], i) => run(
      'INSERT INTO gallery(hall_id,category,media_type,url,thumb_url,title,alt,sort_order) VALUES(?,?,?,?,?,?,?,?)', hall, cat, 'image', U(id), T(id), title, alt, i));
    // before / after decoration transformation
    run('INSERT INTO gallery(hall_id,category,media_type,url,thumb_url,before_url,title,alt,sort_order) VALUES(?,?,?,?,?,?,?,?,?)',
      hallIds[1], 'Before & After', 'image', U(P.floralHall), T(P.floralHall), U(P.emptyChairs), 'Hall transformation', 'The hall before and after decoration', 100);
    run('INSERT INTO gallery(hall_id,category,media_type,url,thumb_url,before_url,title,alt,sort_order) VALUES(?,?,?,?,?,?,?,?,?)',
      hallIds[0], 'Before & After', 'image', U(P.ballroomTables), T(P.ballroomTables), U(P.emptyBanquetRed), 'Banquet set-up', 'An empty banquet hall and the same hall set for an event', 101);

    // ---------- sample testimonials (flagged is_sample=1; replace with real reviews from the admin panel) ----------
    [
      ['Sample: Priya & Karthik', 'Wedding', 5, 'A flawless wedding', 'The team handled everything from the mandap to the parking. Our families were thrilled.', hallIds[0]],
      ['Sample: Ravi Teja', 'Reception', 5, 'Grand and welcoming', 'The ballroom looked spectacular and the staff were courteous all evening.', hallIds[0]],
      ['Sample: Sneha Reddy', 'Birthday', 4, 'Perfect for a family function', 'Easy booking, transparent pricing and a beautiful hall for the 60th birthday celebration.', hallIds[1]],
      ['Sample: Dr. Murali', 'Conference', 5, 'Professional and well equipped', 'Projection, Wi-Fi and catering ran smoothly for our two-day CME programme.', hallIds[2]],
    ].forEach(([n, e, r, t, b, h]) => run('INSERT INTO reviews(hall_id,author_name,event_label,rating,title,body,status,is_sample) VALUES(?,?,?,?,?,?,?,1)', h, n, e, r, t, b, 'approved'));

    // ---------- super admin ----------
    if (adminHash) {
      const uid = run(`INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)`, 'Super Admin', adminEmail, '+919000000000', adminHash, 'super_admin').id;
      run('INSERT INTO admins(user_id,job_title) VALUES(?,?)', uid, 'Owner');
    }
  });

  console.log('  Seeded demo catalogue (3 halls, packages, services, pricing rules, gallery).');
  if (adminHash) console.log(`  Super admin: ${adminEmail}${generated ? `  /  ${adminPass}   <- development default; change it now` : ''}`);
  else console.log('  No admin created: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, then run `npm run seed` on an empty database.');
  return true;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  await seedIfEmpty();
}
