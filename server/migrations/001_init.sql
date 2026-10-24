-- Convention Hall Booking: initial schema (SQLite)
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','manager','admin','super_admin')),
  active INTEGER NOT NULL DEFAULT 1,
  saved_details TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, city TEXT, address TEXT, phone TEXT, email TEXT,
  lat REAL, lng REAL, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE halls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  min_guests INTEGER NOT NULL DEFAULT 50,
  max_guests INTEGER NOT NULL,
  seating_capacity INTEGER NOT NULL,
  dining_capacity INTEGER NOT NULL,
  length_m REAL, width_m REAL, height_m REAL, area_sqft INTEGER,
  layouts TEXT NOT NULL DEFAULT '["banquet"]',
  base_price INTEGER NOT NULL,          -- full day
  half_day_price INTEGER NOT NULL,
  hourly_price INTEGER NOT NULL,
  parking_two INTEGER NOT NULL DEFAULT 0,
  parking_four INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  popularity INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, icon TEXT, category TEXT,
  description TEXT, spec TEXT, image TEXT, featured INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE hall_facilities (
  hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  PRIMARY KEY (hall_id, facility_id)
);

CREATE TABLE event_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, image TEXT, icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, description TEXT, category TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  price_type TEXT NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed','per_guest','per_hour')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('basic','standard','premium','wedding','corporate','custom')),
  description TEXT, price INTEGER NOT NULL DEFAULT 0, per_guest_price INTEGER NOT NULL DEFAULT 0,
  includes_hall INTEGER NOT NULL DEFAULT 0,
  guest_capacity INTEGER, duration_hours REAL, image TEXT,
  popular INTEGER NOT NULL DEFAULT 0, popularity INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE package_services (
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, service_id)
);

CREATE TABLE time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE holidays (date TEXT PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL, min_amount INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0,
  valid_from TEXT, valid_to TEXT, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id),
  hall_id INTEGER NOT NULL REFERENCES halls(id),
  event_type_id INTEGER REFERENCES event_types(id),
  package_id INTEGER REFERENCES packages(id),
  customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
  custom_event TEXT, requirements TEXT,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  buffer_min INTEGER NOT NULL DEFAULT 0,
  guests INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reserved','confirmed','completed','cancelled','rejected','expired')),
  hold_expires_at TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  advance_due INTEGER NOT NULL DEFAULT 0, paid_amount INTEGER NOT NULL DEFAULT 0,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT, breakdown TEXT,
  admin_notes TEXT, cancel_reason TEXT, reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_min > start_min)
);
CREATE INDEX idx_bookings_slot ON bookings(hall_id, event_date, status);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status, created_at);

-- Database-level double-booking guard: two reserved/confirmed bookings can never overlap
-- (taking the buffer between events into account), even if application code is bypassed.
CREATE TRIGGER bookings_no_overlap_ins BEFORE INSERT ON bookings
WHEN NEW.status IN ('reserved','confirmed')
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_CONFLICT') WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.hall_id = NEW.hall_id AND b.event_date = NEW.event_date
      AND b.status IN ('reserved','confirmed')
      AND NEW.start_min < b.end_min + NEW.buffer_min
      AND NEW.end_min + NEW.buffer_min > b.start_min);
END;
CREATE TRIGGER bookings_no_overlap_upd BEFORE UPDATE OF status, hall_id, event_date, start_min, end_min ON bookings
WHEN NEW.status IN ('reserved','confirmed')
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_CONFLICT') WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id <> NEW.id AND b.hall_id = NEW.hall_id AND b.event_date = NEW.event_date
      AND b.status IN ('reserved','confirmed')
      AND NEW.start_min < b.end_min + NEW.buffer_min
      AND NEW.end_min + NEW.buffer_min > b.start_min);
END;

CREATE TABLE booking_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id),
  name TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1, amount INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_bs_booking ON booking_services(booking_id);

CREATE TABLE booking_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'id_proof', original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE calendar_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  date TEXT NOT NULL, start_min INTEGER NOT NULL DEFAULT 0, end_min INTEGER NOT NULL DEFAULT 1440,
  status TEXT NOT NULL CHECK (status IN ('blocked','maintenance')),
  reason TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_blocks ON calendar_blocks(hall_id, date);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL CHECK (kind IN ('advance','balance','refund')),
  provider TEXT NOT NULL, provider_order_id TEXT UNIQUE, provider_payment_id TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','pending_refund','refunded')),
  receipt_no TEXT UNIQUE, note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), paid_at TEXT
);
CREATE INDEX idx_payments_booking ON payments(booking_id);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE, booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL, email TEXT, phone TEXT,
  hall_id INTEGER REFERENCES halls(id), event_date TEXT,
  items TEXT NOT NULL DEFAULT '[]', subtotal INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','expired')),
  valid_until TEXT, notes TEXT, created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  user_id INTEGER REFERENCES users(id),
  author TEXT NOT NULL, event_label TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, event_type TEXT, event_date TEXT, guests INTEGER,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','follow_up','converted','closed')),
  source TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL DEFAULT 'user' CHECK (audience IN ('user','admin')),
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'hall', title TEXT NOT NULL, alt TEXT,
  type TEXT NOT NULL DEFAULT 'image' CHECK (type IN ('image','video','before_after')),
  url TEXT NOT NULL, before_url TEXT, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, role TEXT NOT NULL, phone TEXT, email TEXT,
  responsibilities TEXT, availability TEXT, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, path TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_type ON analytics_events(type, created_at);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, user_label TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
