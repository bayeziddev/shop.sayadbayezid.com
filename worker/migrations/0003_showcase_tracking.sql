-- Rich demo details, successful-delivery portfolio, internal-traffic flag, tracking log.

-- Packages: cover, any-link video, and the "why buy" content blocks (all editable in admin).
ALTER TABLE packages ADD COLUMN cover_image TEXT NOT NULL DEFAULT '';   -- R2 key or https URL
ALTER TABLE packages ADD COLUMN video_url TEXT NOT NULL DEFAULT '';     -- YouTube/Vimeo/Facebook/Drive/mp4 URL or R2 key
ALTER TABLE packages ADD COLUMN solution TEXT NOT NULL DEFAULT '';      -- "আপনার সমস্যার সমাধান"
ALTER TABLE packages ADD COLUMN benefits TEXT NOT NULL DEFAULT '[]';    -- JSON string[]: "আপনার লাভ"
ALTER TABLE packages ADD COLUMN why_us TEXT NOT NULL DEFAULT '[]';      -- JSON string[] "শিরোনাম | বিবরণ" (empty = site-wide list)
ALTER TABLE packages ADD COLUMN demo_links TEXT NOT NULL DEFAULT '[]';  -- JSON [{label,url}]: extra demos (admin panel, seller panel…)
ALTER TABLE packages ADD COLUMN demo_login TEXT NOT NULL DEFAULT '';    -- demo sign-in hint shown next to the demo buttons
UPDATE packages SET video_url = demo_video_key WHERE demo_video_key IS NOT NULL AND demo_video_key != '' AND video_url = '';

-- Successfully delivered client websites (public "সফল ডেলিভারি" page).
CREATE TABLE portfolio (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  client_name  TEXT NOT NULL DEFAULT '',
  category_id  INTEGER,
  package_id   INTEGER,
  live_url     TEXT NOT NULL DEFAULT '',
  cover_image  TEXT NOT NULL DEFAULT '',
  images       TEXT NOT NULL DEFAULT '[]',
  video_url    TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  result       TEXT NOT NULL DEFAULT '',
  testimonial  TEXT NOT NULL DEFAULT '',
  delivered_at TEXT,
  is_featured  INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_portfolio_active ON portfolio(is_active, sort_order);

-- Design gallery ("ডিজাইন গ্যালারি"): checkout, sidebar, footer, header… screens a visitor can compare.
CREATE TABLE design_samples (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('hero','header','footer','checkout','product','sidebar','dashboard','mobile','section','other')),
  title       TEXT NOT NULL,
  image       TEXT NOT NULL,                 -- R2 key, /assets/… path or https URL
  package_id  INTEGER,
  demo_url    TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_design_kind ON design_samples(is_active, kind, sort_order);

-- Visits from the owner's own browser (?sb_internal=1) never feed ad platforms.
ALTER TABLE orders ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;

-- Every Conversions API attempt, for the admin "ট্র্যাকিং" diagnostics page (kept 30 days).
CREATE TABLE tracking_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event       TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  http_status INTEGER,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_tracking_created ON tracking_log(created_at);
