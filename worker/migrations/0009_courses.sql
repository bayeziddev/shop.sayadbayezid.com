-- Online courses: categories (unlimited, from admin), courses with a section → lesson curriculum, student accounts,
-- enrollments that open only after a confirmed payment, and per-lesson progress.
-- Course orders reuse the existing orders pipeline (gateways, manual send-money, admin verification, invoice,
-- Meta Pixel / Conversions API / GA4 Purchase), marked with orders.kind = 'course'.

CREATE TABLE course_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  image_key   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE courses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER NOT NULL REFERENCES course_categories(id),
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  subtitle         TEXT NOT NULL DEFAULT '',          -- one line under the title (cards, landing hero)
  description      TEXT NOT NULL DEFAULT '',          -- long text, paragraphs separated by a blank line
  cover_image      TEXT NOT NULL DEFAULT '',          -- upload key, /assets path or https link
  promo_video_url  TEXT NOT NULL DEFAULT '',          -- public intro video (YouTube / Vimeo / Drive / file)
  price            INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  regular_price    INTEGER NOT NULL DEFAULT 0 CHECK (regular_price >= 0), -- shown struck through when higher than price
  level            TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced','all')),
  language         TEXT NOT NULL DEFAULT 'বাংলা',
  duration_text    TEXT NOT NULL DEFAULT '',          -- e.g. "১২ ঘণ্টা ভিডিও"
  outcomes         TEXT NOT NULL DEFAULT '[]',        -- JSON string[]: what the student will be able to do
  audience         TEXT NOT NULL DEFAULT '[]',        -- JSON string[]: who it is for
  requirements     TEXT NOT NULL DEFAULT '[]',        -- JSON string[]
  includes         TEXT NOT NULL DEFAULT '[]',        -- JSON string[]: what comes with it (lifetime access, files …)
  faqs             TEXT NOT NULL DEFAULT '[]',        -- JSON string[] "প্রশ্ন | উত্তর"
  instructor_name  TEXT NOT NULL DEFAULT '',
  instructor_bio   TEXT NOT NULL DEFAULT '',
  instructor_photo TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','coming_soon','archived')),
  is_featured      INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_courses_category ON courses(category_id, status, sort_order);

CREATE TABLE course_sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_course_sections ON course_sections(course_id, sort_order);

-- Lesson content (video / link / file / notes) is private: it is only ever sent to an enrolled student,
-- except a lesson marked as a free preview.
CREATE TABLE course_lessons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id    INTEGER REFERENCES course_sections(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video','link','file','text')),
  video_url     TEXT NOT NULL DEFAULT '',  -- private YouTube (unlisted) / Vimeo / Google Drive / uploaded file
  link_url      TEXT NOT NULL DEFAULT '',  -- private link: Drive folder, Google Doc, live class, group …
  file_key      TEXT NOT NULL DEFAULT '',  -- private R2 upload (private/courses/…), downloaded through an access check
  body          TEXT NOT NULL DEFAULT '',  -- notes shown under the lesson
  duration_text TEXT NOT NULL DEFAULT '',
  is_preview    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_course_lessons ON course_lessons(course_id, section_id, sort_order);

CREATE TABLE students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL UNIQUE,     -- normalised 8801XXXXXXXXX: the login
  email          TEXT NOT NULL DEFAULT '',
  password_hash  TEXT NOT NULL,
  is_blocked     INTEGER NOT NULL DEFAULT 0,
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_login_at  TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Access to a course. Created when a course order's payment is confirmed (gateway or admin verification),
-- or by an admin by hand. Never on order creation.
CREATE TABLE enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  order_id    INTEGER,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  source      TEXT NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase','admin','free')),
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (student_id, course_id)
);
CREATE INDEX idx_enrollments_course ON enrollments(course_id, status);

CREATE TABLE lesson_progress (
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id    INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  course_id    INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (student_id, lesson_id)
);
CREATE INDEX idx_progress_course ON lesson_progress(student_id, course_id);

-- Course orders travel through the same orders table and payment pipeline as website orders.
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'website';   -- 'website' | 'course'
ALTER TABLE orders ADD COLUMN student_id INTEGER;
ALTER TABLE order_items ADD COLUMN course_id INTEGER;
CREATE INDEX idx_orders_student ON orders(student_id);

-- Starter categories (add as many as you like in Admin → কোর্স ক্যাটাগরি).
INSERT INTO course_categories (slug, name, description, icon, sort_order) VALUES
 ('digital-marketing', 'ডিজিটাল মার্কেটিং', 'ফেসবুক বিজ্ঞাপন, পিক্সেল-ট্র্যাকিং আর অনলাইনে বিক্রি বাড়ানোর হাতে-কলমে কোর্স', '📣', 1),
 ('web-development', 'ওয়েব ডেভেলপমেন্ট', 'ওয়েবসাইট বানানো শিখুন — HTML, CSS, JavaScript থেকে পূর্ণ প্রজেক্ট', '💻', 2),
 ('python', 'পাইথন প্রোগ্রামিং', 'শূন্য থেকে পাইথন — অটোমেশন, ডেটা আর ছোট প্রজেক্ট', '🐍', 3);

-- A first course, shown as "শীঘ্রই আসছে" until the owner sets the price, adds the lesson links and publishes it.
-- The lessons below are an outline only (titles) — no video or link is invented.
INSERT INTO courses (category_id, slug, title, subtitle, description, price, regular_price, level, duration_text, outcomes, audience, requirements, includes, faqs, status, is_featured, sort_order)
SELECT id, 'facebook-digital-marketing', 'ফেসবুক ও ডিজিটাল মার্কেটিং — বিজ্ঞাপন থেকে বিক্রি',
 'নিজের ব্যবসার বিজ্ঞাপন নিজে চালান: পেজ, কনটেন্ট, অ্যাডস ম্যানেজার, পিক্সেল-কনভার্সন এপিআই আর বিক্রি বাড়ানোর কৌশল — লেসন ধরে ধরে',
 'বিজ্ঞাপনে টাকা যাচ্ছে কিন্তু বিক্রি আসছে না, বা কাকে দিয়ে বিজ্ঞাপন চালাবেন বুঝছেন না? এই কোর্সে শুরু থেকে শেখানো হয় — ফেসবুক পেজ আর কনটেন্ট সাজানো, অ্যাডস ম্যানেজারে সঠিক ক্যাম্পেইন বানানো, অডিয়েন্স বাছাই, আর মেটা পিক্সেল, কনভার্সন এপিআই ও গুগল অ্যানালিটিক্স দিয়ে কোন বিজ্ঞাপন সত্যিই বিক্রি আনছে তা মাপা।\n\nপ্রতিটি লেসন ছোট ভিডিও আর হাতে-কলমে কাজ — দেখে সাথে সাথে নিজের পেজে করে ফেলবেন।',
 0, 0, 'beginner', '',
 '["নিজের ফেসবুক পেজ ও কনটেন্ট বিক্রির উপযোগী করে সাজানো","অ্যাডস ম্যানেজারে সঠিক উদ্দেশ্যে ক্যাম্পেইন, অ্যাড সেট ও অ্যাড বানানো","অডিয়েন্স বাছাই, রিটার্গেটিং ও লুকঅ্যালাইক","মেটা পিক্সেল, কনভার্সন এপিআই ও জিএ৪ বসানো ও যাচাই করা","কোন বিজ্ঞাপন কত বিক্রি আনছে তা মেপে বাজেট ঠিক করা"]',
 '["নিজের ব্যবসার বিজ্ঞাপন নিজে চালাতে চান এমন উদ্যোক্তা","ফেসবুক পেজে বিক্রি করেন কিন্তু বিজ্ঞাপনে লাভ পাচ্ছেন না","ডিজিটাল মার্কেটিং দিয়ে ক্যারিয়ার শুরু করতে চান"]',
 '["একটি স্মার্টফোন বা কম্পিউটার আর ইন্টারনেট","একটি ফেসবুক অ্যাকাউন্ট — বাকিটা কোর্সেই শেখানো হবে"]',
 '["লেসন ধরে ধরে ভিডিও","কোর্সের সাথে দরকারি লিংক ও ফাইল","একবার কিনলে আপনার প্রোফাইলে কোর্সটি থাকবে"]',
 '["কোর্সটি কীভাবে দেখব? | পেমেন্ট নিশ্চিত হওয়ার পর আপনার মোবাইল নম্বর আর পাসওয়ার্ড দিয়ে লগইন করলে প্রোফাইলে কোর্সটি পাবেন — সেখান থেকে লেসন ধরে ধরে দেখবেন।","পেমেন্ট কীভাবে করব? | বিকাশ, নগদ, রকেট, কার্ড বা ব্যাংক — যেগুলো চালু আছে চেকআউটে দেখাবে। সেন্ড মানি করলে ট্রানজেকশন আইডি দিন; আমরা যাচাই করে কোর্স চালু করে দেব।"]',
 'coming_soon', 1, 1
FROM course_categories WHERE slug = 'digital-marketing';

-- (D1 allows at most 5 terms in a compound SELECT, so the rows come from multi-row VALUES, which has no such limit.)
INSERT INTO course_sections (course_id, title, sort_order)
SELECT c.id, s.column1, s.column2 FROM courses c, (VALUES
  ('শুরু করার আগে', 1),
  ('ফেসবুক পেজ ও কনটেন্ট', 2),
  ('ফেসবুক বিজ্ঞাপন — অ্যাডস ম্যানেজার', 3),
  ('পিক্সেল, কনভার্সন এপিআই ও জিএ৪', 4),
  ('বিক্রি বাড়ানোর কৌশল', 5)
) s WHERE c.slug = 'facebook-digital-marketing';

INSERT INTO course_lessons (course_id, section_id, title, kind, is_preview, sort_order)
SELECT c.id, cs.id, l.column2, 'video', l.column3, l.column4
FROM courses c JOIN course_sections cs ON cs.course_id = c.id JOIN (VALUES
  (1, 'ডিজিটাল মার্কেটিং কী, আর বিক্রি কীভাবে আসে', 1, 1),
  (1, 'আপনার ক্রেতা কে — সহজ ফানেল', 0, 2),
  (2, 'বিক্রির উপযোগী ফেসবুক পেজ সাজানো', 0, 1),
  (2, 'পোস্ট, রিল ও ছবি — কী দিলে মানুষ থামে', 0, 2),
  (2, 'মেসেজের উত্তর আর অর্ডার নেওয়ার নিয়ম', 0, 3),
  (3, 'বিজনেস ম্যানেজার ও অ্যাড অ্যাকাউন্ট খোলা', 0, 1),
  (3, 'ক্যাম্পেইনের উদ্দেশ্য বাছাই', 0, 2),
  (3, 'অডিয়েন্স, বাজেট ও প্লেসমেন্ট', 0, 3),
  (3, 'যে অ্যাড ক্লিক পায় — লেখা, ছবি ও ভিডিও', 0, 4),
  (4, 'মেটা পিক্সেল বসানো ও ইভেন্ট যাচাই', 0, 1),
  (4, 'কনভার্সন এপিআই — কেন দরকার, কীভাবে কাজ করে', 0, 2),
  (4, 'গুগল অ্যানালিটিক্স ৪ ও ট্যাগ ম্যানেজার', 0, 3),
  (5, 'রিটার্গেটিং ও লুকঅ্যালাইক অডিয়েন্স', 0, 1),
  (5, 'রিপোর্ট পড়ে বাজেট বাড়ানো-কমানো', 0, 2)
) l ON l.column1 = cs.sort_order
WHERE c.slug = 'facebook-digital-marketing';
