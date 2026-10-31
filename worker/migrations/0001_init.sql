-- Core schema. All timestamps are ISO-8601 UTC text. All money is integer Taka.
PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  icon         TEXT NOT NULL DEFAULT '',
  image_key    TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE packages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id       INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  tier              TEXT NOT NULL DEFAULT 'basic',
  short_description TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  base_price        INTEGER NOT NULL CHECK (base_price >= 0),
  delivery_days     INTEGER NOT NULL DEFAULT 7,
  demo_url          TEXT NOT NULL DEFAULT '',
  demo_video_key    TEXT,
  images            TEXT NOT NULL DEFAULT '[]',  -- JSON array of R2 keys
  features          TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','coming_soon')),
  is_featured       INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  ai_draft          TEXT,                        -- JSON {title, shortDescription, description} awaiting human approval
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_packages_category ON packages(category_id, status, sort_order);

CREATE TABLE package_addons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id   INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_delta  INTEGER NOT NULL CHECK (price_delta >= 0),
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= 1),
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_addons_package ON package_addons(package_id);

CREATE TABLE offers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  scope          TEXT NOT NULL CHECK (scope IN ('category','package')),
  scope_id       INTEGER NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent','flat')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  starts_at      TEXT,
  ends_at        TEXT,
  show_timer     INTEGER NOT NULL DEFAULT 1,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_offers_scope ON offers(scope, scope_id);

CREATE TABLE landing_pages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  blocks          TEXT NOT NULL DEFAULT '[]',  -- JSON array of page-builder blocks
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  utm_source      TEXT NOT NULL DEFAULT '',
  utm_medium      TEXT NOT NULL DEFAULT '',
  utm_campaign    TEXT NOT NULL DEFAULT '',
  published_at    TEXT,
  retired_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE coupons (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,
  description        TEXT NOT NULL DEFAULT '',
  discount_type      TEXT NOT NULL CHECK (discount_type IN ('percent','flat')),
  discount_value     INTEGER NOT NULL CHECK (discount_value > 0),
  scope              TEXT NOT NULL DEFAULT 'sitewide' CHECK (scope IN ('sitewide','category','package')),
  scope_id           INTEGER,
  starts_at          TEXT,
  expires_at         TEXT,
  usage_limit        INTEGER,
  used_count         INTEGER NOT NULL DEFAULT 0,
  min_subtotal       INTEGER NOT NULL DEFAULT 0,
  show_on_card       INTEGER NOT NULL DEFAULT 0,
  referrer_order_id  INTEGER,                   -- set for referral-program coupons
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number       TEXT NOT NULL UNIQUE,
  invoice_number     TEXT UNIQUE,              -- assigned sequentially when payment is confirmed
  customer_name      TEXT NOT NULL,
  customer_phone     TEXT NOT NULL,
  customer_email     TEXT NOT NULL DEFAULT '',
  business_name      TEXT NOT NULL DEFAULT '',
  payment_method     TEXT NOT NULL,
  payment_status     TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending_verification','paid','failed','refunded')),
  project_status     TEXT NOT NULL DEFAULT 'pending_payment',
  subtotal           INTEGER NOT NULL,
  offer_discount     INTEGER NOT NULL DEFAULT 0,
  coupon_id          INTEGER,
  coupon_code        TEXT,
  coupon_discount    INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'BDT',
  gateway            TEXT,
  gateway_session    TEXT,
  gateway_tran_id    TEXT,
  gateway_val_id     TEXT,
  manual_trx_id      TEXT,
  manual_sender      TEXT,
  paid_amount        INTEGER,
  paid_at            TEXT,
  initiate_event_id  TEXT NOT NULL,
  purchase_event_id  TEXT NOT NULL,
  purchase_sent_at   TEXT,
  utm_source         TEXT NOT NULL DEFAULT '',
  utm_medium         TEXT NOT NULL DEFAULT '',
  utm_campaign       TEXT NOT NULL DEFAULT '',
  utm_content        TEXT NOT NULL DEFAULT '',
  utm_term           TEXT NOT NULL DEFAULT '',
  fbclid             TEXT NOT NULL DEFAULT '',
  fbp                TEXT NOT NULL DEFAULT '',
  fbc                TEXT NOT NULL DEFAULT '',
  landing_page_id    INTEGER,
  referral_code      TEXT NOT NULL DEFAULT '',
  client_ip          TEXT NOT NULL DEFAULT '',
  user_agent         TEXT NOT NULL DEFAULT '',
  source_url         TEXT NOT NULL DEFAULT '',
  internal_notes     TEXT NOT NULL DEFAULT '',
  preview_url        TEXT NOT NULL DEFAULT '',
  delivery_links     TEXT NOT NULL DEFAULT '[]',
  assigned_admin_id  INTEGER,
  status_changed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_orders_status ON orders(project_status, status_changed_at);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_phone ON orders(customer_phone);
CREATE INDEX idx_orders_tran ON orders(gateway_tran_id);

CREATE TABLE order_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_id     INTEGER NOT NULL,
  package_name   TEXT NOT NULL,
  base_price     INTEGER NOT NULL,
  addons         TEXT NOT NULL DEFAULT '[]', -- JSON PricedAddon[]
  subtotal       INTEGER NOT NULL,
  offer_id       INTEGER,
  offer_discount INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL
);
CREATE INDEX idx_items_order ON order_items(order_id);

CREATE TABLE order_status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  actor       TEXT NOT NULL,             -- 'system' | 'client' | 'admin:<id>'
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_history_order ON order_status_history(order_id);

CREATE TABLE order_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author     TEXT NOT NULL CHECK (author IN ('client','admin')),
  admin_id   INTEGER,
  kind       TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message','approval','revision_request')),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_order ON order_messages(order_id);

CREATE TABLE order_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('requirement_asset','delivery')),
  r2_key       TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_files_order ON order_files(order_id);

-- Client-submitted business details are encrypted at rest (AES-256-GCM, key = DATA_ENCRYPTION_KEY secret).
CREATE TABLE project_requirements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  encrypted_payload TEXT NOT NULL,
  iv                TEXT NOT NULL,
  key_version       INTEGER NOT NULL DEFAULT 1,
  submitted_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE leads (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source              TEXT NOT NULL CHECK (source IN ('quote','chat','quiz','landing','contact')),
  name                TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL DEFAULT '',
  business_name       TEXT NOT NULL DEFAULT '',
  message             TEXT NOT NULL DEFAULT '',
  package_id          INTEGER,
  quiz_result         TEXT,
  status              TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','follow_up','won','lost')),
  notes               TEXT NOT NULL DEFAULT '',
  next_follow_up_at   TEXT,
  last_contacted_at   TEXT,
  auto_followups_sent INTEGER NOT NULL DEFAULT 0,
  assigned_admin_id   INTEGER,
  lead_event_id       TEXT NOT NULL,
  utm_source          TEXT NOT NULL DEFAULT '',
  utm_medium          TEXT NOT NULL DEFAULT '',
  utm_campaign        TEXT NOT NULL DEFAULT '',
  utm_content         TEXT NOT NULL DEFAULT '',
  utm_term            TEXT NOT NULL DEFAULT '',
  fbclid              TEXT NOT NULL DEFAULT '',
  landing_page_id     INTEGER,
  source_url          TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_leads_status ON leads(status, created_at);

CREATE TABLE banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('bar','popup')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  cta_label  TEXT NOT NULL DEFAULT '',
  cta_url    TEXT NOT NULL DEFAULT '',
  image_key  TEXT,
  target     TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('all','home','category','package','landing')),
  starts_at  TEXT,
  ends_at    TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT 'sitewide' CHECK (scope IN ('sitewide','package')),
  package_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER,
  package_id      INTEGER,
  author_name     TEXT NOT NULL,
  author_business TEXT NOT NULL DEFAULT '',
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  is_verified     INTEGER NOT NULL DEFAULT 0,  -- 1 only when tied to a real completed order
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin','sales_support','project_manager','viewer')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Only metadata lives here. Real keys are Wrangler secrets referenced by `secret_name`.
CREATE TABLE ai_provider_configs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose       TEXT NOT NULL UNIQUE CHECK (purpose IN ('content','chat')),
  provider      TEXT NOT NULL CHECK (provider IN ('gemini','workers_ai','openai')),
  model         TEXT NOT NULL,
  secret_name   TEXT NOT NULL DEFAULT '',
  key_hint      TEXT NOT NULL DEFAULT '',  -- e.g. '••••a1b2', computed from the secret, never the key
  system_prompt TEXT NOT NULL DEFAULT '',
  tone          TEXT NOT NULL DEFAULT '',
  last_test_at  TEXT,
  last_test_ok  INTEGER,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE chat_settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  ai_enabled         INTEGER NOT NULL DEFAULT 1,
  whatsapp_enabled   INTEGER NOT NULL DEFAULT 1,
  whatsapp_number    TEXT NOT NULL DEFAULT '',
  whatsapp_message   TEXT NOT NULL DEFAULT '',
  messenger_enabled  INTEGER NOT NULL DEFAULT 1,
  messenger_page     TEXT NOT NULL DEFAULT '',
  greeting           TEXT NOT NULL DEFAULT '',
  knowledge          TEXT NOT NULL DEFAULT '',
  escalation_message TEXT NOT NULL DEFAULT '',
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE chat_conversations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'bot' CHECK (status IN ('bot','escalated','closed')),
  visitor_name  TEXT NOT NULL DEFAULT '',
  visitor_phone TEXT NOT NULL DEFAULT '',
  transcript    TEXT NOT NULL DEFAULT '[]',
  lead_id       INTEGER,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admin_notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,            -- new_order | payment | new_lead | chat_escalated | client_feedback | stuck
  title      TEXT NOT NULL,
  link       TEXT NOT NULL DEFAULT '',
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE notification_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT NOT NULL,            -- email | sms | whatsapp
  recipient  TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL,            -- sent | failed | skipped
  error      TEXT NOT NULL DEFAULT '',
  order_id   INTEGER,
  lead_id    INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    TEXT NOT NULL DEFAULT '{}',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_activity_created ON activity_log(created_at);

-- Payment webhooks are idempotent: each gateway transaction is processed once.
CREATE TABLE payment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway     TEXT NOT NULL,
  external_id TEXT NOT NULL,
  order_id    INTEGER,
  status      TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (gateway, external_id)
);
