-- Convention Hall Platform - initial schema
-- Times are stored as "naive business-local minutes since epoch" (start_ts / end_ts) so overlap checks are pure integer math.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','manager','admin','super_admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_phone ON users(phone);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization TEXT,
  address TEXT,
  saved_details TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  job_title TEXT,
  branch_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  lat REAL, lng REAL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  branch_id INTEGER REFERENCES branches(id),
  name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  phone TEXT, email TEXT,
  responsibilities TEXT,
  availability TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE halls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER REFERENCES branches(id),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  min_guests INTEGER NOT NULL DEFAULT 1,
  max_guests INTEGER NOT NULL,
  seating_capacity INTEGER,
  dining_capacity INTEGER,
  length_m REAL, width_m REAL, height_m REAL, area_sqm REAL,
  base_hourly INTEGER NOT NULL DEFAULT 0,
  base_half_day INTEGER NOT NULL DEFAULT 0,
  base_full_day INTEGER NOT NULL DEFAULT 0,
  per_guest_rate INTEGER NOT NULL DEFAULT 0,
  buffer_minutes INTEGER NOT NULL DEFAULT 60,
  is_ac INTEGER NOT NULL DEFAULT 1,
  hero_image TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE hall_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('theatre','dining','classroom','ushape','banquet','custom')),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  description TEXT
);
CREATE INDEX idx_layouts_hall ON hall_layouts(hall_id);

CREATE TABLE facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  icon TEXT,
  description TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE hall_facilities (
  hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  details TEXT,
  PRIMARY KEY (hall_id, facility_id)
);

-- "events" = event categories (Wedding, Reception, ...)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image TEXT,
  extra_fields TEXT NOT NULL DEFAULT '[]',
  is_other INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('flat','per_guest','per_hour','per_unit')),
  price INTEGER NOT NULL DEFAULT 0,
  unit_label TEXT,
  description TEXT,
  default_selected INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('basic','standard','premium','wedding','corporate','custom')),
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  per_guest_price INTEGER NOT NULL DEFAULT 0,
  includes_hall INTEGER NOT NULL DEFAULT 1,
  min_guests INTEGER NOT NULL DEFAULT 1,
  max_guests INTEGER NOT NULL DEFAULT 10000,
  duration_hours INTEGER NOT NULL DEFAULT 8,
  images TEXT NOT NULL DEFAULT '[]',
  highlights TEXT NOT NULL DEFAULT '[]',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE package_services (
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (package_id, service_id)
);

CREATE TABLE pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER REFERENCES halls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('weekend','holiday','peak','offseason')),
  weekdays TEXT,                 -- weekend rules: comma list of 0-6 (Sun=0)
  start_date TEXT, end_date TEXT, -- YYYY-MM-DD, or MM-DD when recurring_yearly=1
  recurring_yearly INTEGER NOT NULL DEFAULT 0,
  multiplier REAL NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  value INTEGER NOT NULL,
  min_amount INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  valid_from TEXT, valid_to TEXT,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  auto_apply INTEGER NOT NULL DEFAULT 0,  -- seasonal offers
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  hall_id INTEGER NOT NULL REFERENCES halls(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id),
  event_title TEXT,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  guests INTEGER NOT NULL,
  package_id INTEGER REFERENCES packages(id),
  status TEXT NOT NULL CHECK (status IN ('pending','held','reserved','confirmed','completed','cancelled','rejected','expired')),
  hold_expires_at INTEGER,       -- unix seconds
  requirements TEXT,
  event_details TEXT NOT NULL DEFAULT '{}',
  coupon_code TEXT,
  needs_quotation INTEGER NOT NULL DEFAULT 0,
  price_breakdown TEXT NOT NULL DEFAULT '{}',
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  advance_required INTEGER NOT NULL DEFAULT 0,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  rescheduled_from TEXT,
  cancellation_reason TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  refund_due INTEGER NOT NULL DEFAULT 0,
  admin_notes TEXT,
  reminder_sent TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'web',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_ts > start_ts),
  CHECK (guests > 0)
);
CREATE INDEX idx_bookings_hall_time ON bookings(hall_id, start_ts, end_ts);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_date ON bookings(event_date);
CREATE INDEX idx_bookings_phone ON bookings(phone);
CREATE INDEX idx_bookings_created ON bookings(created_at);

CREATE TABLE booking_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  pricing_type TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL,
  included INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_bs_booking ON booking_services(booking_id);

CREATE TABLE booking_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'id_proof',
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_docs_booking ON booking_documents(booking_id);

CREATE TABLE hall_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('blocked','maintenance')),
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_ts > start_ts)
);
CREATE INDEX idx_blocks_hall_time ON hall_blocks(hall_id, start_ts, end_ts);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'advance' CHECK (purpose IN ('advance','balance','full','other')),
  gateway TEXT NOT NULL,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','refunded','partially_refunded')),
  method TEXT,
  receipt_no TEXT UNIQUE,
  verified_at TEXT,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  recorded_by INTEGER REFERENCES users(id),
  notes TEXT,
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pay_booking ON payments(booking_id);
CREATE UNIQUE INDEX idx_pay_gateway_payment ON payments(gateway, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pay_gateway_order ON payments(gateway, gateway_order_id) WHERE gateway_order_id IS NOT NULL;

CREATE TABLE refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','processed','rejected')),
  reason TEXT,
  gateway_refund_id TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_refunds_booking ON refunds(booking_id);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL, total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoices_booking ON invoices(booking_id);

CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  event_type TEXT,
  event_date TEXT,
  guests INTEGER,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'enquiry_form',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','follow_up','converted','closed')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  follow_up_at TEXT,
  notes TEXT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_enq_status ON enquiries(status);
CREATE INDEX idx_enq_created ON enquiries(created_at);

CREATE TABLE quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT NOT NULL UNIQUE,
  enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT, email TEXT,
  hall_id INTEGER REFERENCES halls(id),
  event_title TEXT,
  event_date TEXT,
  guests INTEGER,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','expired','rejected')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  hall_id INTEGER REFERENCES halls(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  event_label TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  title TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_status ON reviews(status);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer','admin')),
  channel TEXT NOT NULL DEFAULT 'inapp' CHECK (channel IN ('inapp','email','sms','whatsapp')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  recipient TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  provider TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX idx_notif_user ON notifications(user_id, channel);
CREATE INDEX idx_notif_queue ON notifications(status, channel);

CREATE TABLE gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'hall',
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  url TEXT NOT NULL,
  thumb_url TEXT,
  before_url TEXT,
  title TEXT,
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_gallery_cat ON gallery(category, is_active);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE secrets (           -- AES-256-GCM encrypted; write-only through the API
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);

CREATE TABLE conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  path TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conv_kind ON conversions(kind, created_at);

-- ===========================================================================
-- BOOKING INTEGRITY: the database itself refuses overlapping blocking bookings.
-- A booking "blocks" the hall when it is confirmed/reserved, or held with a live hold.
-- The hall's buffer_minutes is applied on both sides of every booking.
-- ===========================================================================
CREATE TRIGGER trg_booking_no_overlap_ins BEFORE INSERT ON bookings
WHEN NEW.status IN ('confirmed','reserved') OR (NEW.status = 'held' AND NEW.hold_expires_at > CAST(strftime('%s','now') AS INTEGER))
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_CONFLICT') WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.hall_id = NEW.hall_id
      AND (b.status IN ('confirmed','reserved') OR (b.status = 'held' AND b.hold_expires_at > CAST(strftime('%s','now') AS INTEGER)))
      AND b.start_ts < NEW.end_ts + (SELECT buffer_minutes FROM halls WHERE id = NEW.hall_id)
      AND NEW.start_ts < b.end_ts + (SELECT buffer_minutes FROM halls WHERE id = NEW.hall_id)
  );
  SELECT RAISE(ABORT, 'HALL_BLOCKED') WHERE EXISTS (
    SELECT 1 FROM hall_blocks k
    WHERE k.hall_id = NEW.hall_id AND k.start_ts < NEW.end_ts AND NEW.start_ts < k.end_ts
  );
END;

CREATE TRIGGER trg_booking_no_overlap_upd BEFORE UPDATE ON bookings
WHEN NEW.status IN ('confirmed','reserved') OR (NEW.status = 'held' AND NEW.hold_expires_at > CAST(strftime('%s','now') AS INTEGER))
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_CONFLICT') WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.hall_id = NEW.hall_id AND b.id <> NEW.id
      AND (b.status IN ('confirmed','reserved') OR (b.status = 'held' AND b.hold_expires_at > CAST(strftime('%s','now') AS INTEGER)))
      AND b.start_ts < NEW.end_ts + (SELECT buffer_minutes FROM halls WHERE id = NEW.hall_id)
      AND NEW.start_ts < b.end_ts + (SELECT buffer_minutes FROM halls WHERE id = NEW.hall_id)
  );
  SELECT RAISE(ABORT, 'HALL_BLOCKED') WHERE EXISTS (
    SELECT 1 FROM hall_blocks k
    WHERE k.hall_id = NEW.hall_id AND k.start_ts < NEW.end_ts AND NEW.start_ts < k.end_ts
  );
END;

CREATE TRIGGER trg_block_no_overlap BEFORE INSERT ON hall_blocks
BEGIN
  SELECT RAISE(ABORT, 'BLOCK_CONFLICT') WHERE EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.hall_id = NEW.hall_id
      AND (b.status IN ('confirmed','reserved') OR (b.status = 'held' AND b.hold_expires_at > CAST(strftime('%s','now') AS INTEGER)))
      AND b.start_ts < NEW.end_ts AND NEW.start_ts < b.end_ts
  );
END;

-- Paid amounts can never exceed the refunded amount constraint
CREATE TRIGGER trg_refund_limit BEFORE UPDATE OF refunded_amount ON payments
WHEN NEW.refunded_amount > NEW.amount OR NEW.refunded_amount < 0
BEGIN
  SELECT RAISE(ABORT, 'REFUND_EXCEEDS_PAYMENT');
END;
