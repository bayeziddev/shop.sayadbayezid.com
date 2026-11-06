-- Multi-step lead box ("লিড বক্স") + the business's real contact details + instant lead alerts.

-- 1) leads.source gains 'leadbox'. SQLite cannot alter a CHECK constraint, so the table is rebuilt
--    (same columns, same data, same index). Nothing references leads with a foreign key.
CREATE TABLE leads_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source              TEXT NOT NULL CHECK (source IN ('quote','chat','quiz','landing','contact','leadbox')),
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
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  is_internal         INTEGER NOT NULL DEFAULT 0
);
INSERT INTO leads_new (id, source, name, phone, email, business_name, message, package_id, quiz_result, status, notes, next_follow_up_at, last_contacted_at,
  auto_followups_sent, assigned_admin_id, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, landing_page_id, source_url,
  created_at, updated_at, is_internal)
SELECT id, source, name, phone, email, business_name, message, package_id, quiz_result, status, notes, next_follow_up_at, last_contacted_at,
  auto_followups_sent, assigned_admin_id, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, landing_page_id, source_url,
  created_at, updated_at, is_internal FROM leads;
DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;
CREATE INDEX idx_leads_status ON leads(status, created_at);
CREATE INDEX idx_leads_phone ON leads(phone);

-- 2) Contact details (filled only where the owner has not set anything yet — admin edits always win).
UPDATE settings SET value = '"01519601517"' WHERE key = 'contact_phone' AND value IN ('""', 'null');
UPDATE settings SET value = '"info@sayadbayezid.com"' WHERE key = 'contact_email' AND value IN ('""', 'null');
UPDATE settings SET value = '"আউলিয়াবাদ, কালিহাতী, টাঙ্গাইল"' WHERE key = 'contact_address' AND value IN ('""', 'null', '"ঢাকা, বাংলাদেশ"');
INSERT INTO settings (key, value) VALUES
 ('support_email', '"support@sayadbayezid.com"'),
 ('whatsapp_number', '"8801519601517"'),
 ('whatsapp_link', '"https://wa.me/message/TDYG575YENF6F1"'),
 ('facebook_page', '"bayeziddme"'),
 ('map_url', '"https://maps.app.goo.gl/xEWYQwSmQAYAC1DFA"'),
 ('lead_alert_emails', '"info@sayadbayezid.com, support@sayadbayezid.com"'),
 ('booking_url', '""'),
 ('lead_box_enabled', 'true'),
 ('lead_box_delay', '10'),
 ('lead_box_auto_whatsapp', 'true'),
 ('lead_box_title', '"আপনার ব্যবসার জন্য কেমন ওয়েবসাইট চান?"')
ON CONFLICT(key) DO NOTHING;

-- Chat launcher: WhatsApp + Messenger point at the real accounts (if not set yet).
UPDATE chat_settings SET whatsapp_number = '8801519601517' WHERE id = 1 AND whatsapp_number = '';
UPDATE chat_settings SET messenger_page = 'bayeziddme' WHERE id = 1 AND messenger_page = '';
