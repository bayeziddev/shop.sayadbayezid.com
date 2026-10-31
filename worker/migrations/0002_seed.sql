-- Starter data. Every price, tier and add-on below is an ADJUSTABLE ASSUMPTION
-- (see docs/SPEC.md §18) — edit from the admin panel, not here.

INSERT INTO counters (name, value) VALUES ('invoice', 0), ('order', 0);

INSERT INTO settings (key, value) VALUES
 ('brand_name', '"সাইয়াদ বায়েজিদ ওয়েব স্টুডিও"'),
 ('brand_tagline', '"লাইভ ডেমো দেখুন, দাম জেনে নিন — আপনার ব্যবসার ওয়েবসাইট আমরা বানিয়ে দেব"'),
 ('contact_phone', '""'),
 ('contact_email', '""'),
 ('contact_address', '"ঢাকা, বাংলাদেশ"'),
 ('business_hours', '"শনি – বৃহস্পতি, সকাল ১০টা – রাত ৮টা"'),
 ('meta_pixel_id', '"1469319801771203"'),
 ('ga4_id', '"G-HY9255GJYE"'),
 ('gtm_id', '"GTM-P5BR4D3F"'),
 ('clarity_id', '""'),
 ('pay_sslcommerz_enabled', 'true'),
 ('pay_stripe_enabled', 'false'),
 ('pay_bank_enabled', 'true'),
 ('pay_manual_mfs_enabled', 'false'),
 ('manual_bkash_number', '""'),
 ('manual_nagad_number', '""'),
 ('manual_rocket_number', '""'),
 ('bank_details', '""'),
 ('usd_rate', '122'),
 ('referral_enabled', 'true'),
 ('referral_percent', '5'),
 ('stuck_threshold_days', '3'),
 ('lead_followup_hours', '24'),
 ('lead_followup_max', '2'),
 ('onboarding_dismissed', 'false'),
 ('page_about', '"আমরা বাংলাদেশের ছোট ও মাঝারি ব্যবসার জন্য দ্রুত, সুন্দর ও বিক্রি-বান্ধব ওয়েবসাইট তৈরি করি। আমাদের প্রতিটি প্যাকেজের লাইভ ডেমো আছে — কেনার আগেই আপনি দেখে নিতে পারবেন আপনার সাইট কেমন হবে।\n\nআমাদের কাজের ধরন খুব সহজ: আপনি প্যাকেজ বাছাই করবেন, আমরা আপনার তথ্য নিয়ে সাইট বানাব, আপনি রিভিউ করে অনুমোদন দিলে সাইট লাইভ হবে।"'),
 ('page_refund', '"পেমেন্ট নিশ্চিত হওয়ার পর আপনার প্রজেক্টের কাজ শুরু হয়। কাজ শুরুর আগে (তথ্য জমা দেওয়ার আগে) বাতিল করলে সম্পূর্ণ অর্থ ফেরত দেওয়া হবে।\n\nডেভেলপমেন্ট শুরু হওয়ার পর বাতিল করলে সম্পন্ন কাজের অনুপাতে অর্থ কেটে রেখে বাকি অর্থ ফেরত দেওয়া হবে।\n\nডেলিভারি ও আপনার অনুমোদনের পর কোনো অর্থ ফেরতযোগ্য নয়। ফেরতের অর্থ যে মাধ্যমে পরিশোধ করেছেন সেই মাধ্যমেই ৭–১০ কর্মদিবসের মধ্যে পাঠানো হবে।\n\n(এই নীতিমালাটি একটি খসড়া — আপনার ব্যবসার নিয়ম অনুযায়ী অ্যাডমিন প্যানেল থেকে সম্পাদনা করুন।)"'),
 ('page_terms', '"এই সাইট থেকে অর্ডার করার মাধ্যমে আপনি আমাদের সেবার শর্তাবলিতে সম্মত হচ্ছেন। প্রতিটি প্যাকেজে যা অন্তর্ভুক্ত তা প্যাকেজ পেজে স্পষ্টভাবে উল্লেখ আছে; এর বাইরের কাজ আলাদা উদ্ধৃতির মাধ্যমে করা হবে।\n\nআপনার দেওয়া লোগো, ছবি ও লেখার মালিকানা আপনার। আপনার সাইটের জন্য তৈরি কোড ডেলিভারির পর আপনি ব্যবহার করতে পারবেন।\n\n(এই শর্তাবলিটি একটি খসড়া — আইনি পরামর্শ নিয়ে চূড়ান্ত করুন।)"'),
 ('page_privacy', '"আমরা আপনার নাম, ফোন নম্বর, ইমেইল ও প্রজেক্টের তথ্য শুধুমাত্র আপনার অর্ডার সম্পন্ন করা ও আপনার সাথে যোগাযোগের জন্য ব্যবহার করি। প্রজেক্টের ব্যবসায়িক তথ্য এনক্রিপ্ট করে সংরক্ষণ করা হয়।\n\nআমাদের বিজ্ঞাপনের কার্যকারিতা মাপার জন্য এই সাইটে মেটা পিক্সেল, গুগল অ্যানালিটিক্স ও মাইক্রোসফট ক্ল্যারিটি ব্যবহার করা হয়। এগুলো আপনার ব্রাউজারে কুকি রাখতে পারে। ফেসবুকে মিল খোঁজার জন্য আপনার ফোন/ইমেইল এক-মুখী হ্যাশ করে পাঠানো হয় — আসল নম্বর বা ইমেইল পাঠানো হয় না।\n\nআপনার তথ্য মুছে ফেলতে চাইলে আমাদের সাথে যোগাযোগ করুন।"');

INSERT INTO categories (slug, name, description, icon, sort_order) VALUES
 ('fashion',  'ফ্যাশন',          'ফ্যাশন ব্র্যান্ড ও বুটিকের জন্য আকর্ষণীয় অনলাইন শপ',        '👗', 1),
 ('clothing', 'ক্লোদিং ও পোশাক',  'পোশাকের দোকানের জন্য সাইজ-ভ্যারিয়েন্টসহ ই-কমার্স সাইট',     '👕', 2),
 ('gadgets',  'গ্যাজেট ও টেক',     'গ্যাজেট, মোবাইল ও এক্সেসরিজ বিক্রির জন্য দ্রুতগতির শপ',       '📱', 3),
 ('herbal',   'হারবাল ও প্রাকৃতিক', 'হারবাল, অর্গানিক ও প্রাকৃতিক পণ্যের বিশ্বাসযোগ্য অনলাইন শপ',   '🌿', 4),
 ('news',     'নিউজ পোর্টাল',     'সংবাদ প্রকাশের জন্য দ্রুত, এসইও-বান্ধব নিউজ পোর্টাল',          '📰', 5),
 ('blog',     'ব্লগ পাবলিশার',     'লেখালেখি ও কনটেন্ট প্রকাশের জন্য পরিচ্ছন্ন ব্লগ সাইট',          '✍️', 6);

-- E-commerce tiers
INSERT INTO packages (category_id, slug, name, tier, short_description, description, base_price, delivery_days, features, sort_order, is_featured)
SELECT c.id, c.slug || '-basic', c.name || ' বেসিক', 'basic',
  'ছোট ব্যবসার জন্য দ্রুত চালু করার মতো সম্পূর্ণ অনলাইন শপ',
  'যারা দ্রুত অনলাইনে বিক্রি শুরু করতে চান তাদের জন্য। পণ্য তালিকা, কার্ট, ক্যাশ অন ডেলিভারি অর্ডার ও অর্ডার ম্যানেজমেন্টসহ মোবাইল-ফ্রেন্ডলি সাইট।',
  12000, 7,
  '["মোবাইল-ফ্রেন্ডলি রেসপনসিভ ডিজাইন","সর্বোচ্চ ১০০টি পণ্য","কার্ট ও ক্যাশ অন ডেলিভারি চেকআউট","অর্ডার ম্যানেজমেন্ট অ্যাডমিন প্যানেল","মৌলিক এসইও সেটআপ","১ মাস ফ্রি সাপোর্ট"]',
  1, 0
FROM categories c WHERE c.slug IN ('fashion','clothing','gadgets','herbal');

INSERT INTO packages (category_id, slug, name, tier, short_description, description, base_price, delivery_days, features, sort_order, is_featured)
SELECT c.id, c.slug || '-premium', c.name || ' প্রিমিয়াম', 'premium',
  'বিজ্ঞাপন চালানো ব্যবসার জন্য ট্র্যাকিং ও অটোমেশনসহ পূর্ণাঙ্গ শপ',
  'নিয়মিত ফেসবুক বিজ্ঞাপন চালান এমন ব্যবসার জন্য। সীমাহীন পণ্য, অফার ও কুপন সিস্টেম, ডেলিভারি চার্জ জোন, রিপোর্ট ড্যাশবোর্ড ও অগ্রাধিকার সাপোর্টসহ।',
  25000, 14,
  '["বেসিকের সবকিছু","সীমাহীন পণ্য ও ভ্যারিয়েন্ট","অফার, কাউন্টডাউন ও কুপন সিস্টেম","ডেলিভারি জোন ও চার্জ সেটআপ","সেলস রিপোর্ট ড্যাশবোর্ড","গতির জন্য বিশেষ অপ্টিমাইজেশন","৩ মাস অগ্রাধিকার সাপোর্ট"]',
  2, 1
FROM categories c WHERE c.slug IN ('fashion','clothing','gadgets','herbal');

-- News
INSERT INTO packages (category_id, slug, name, tier, short_description, description, base_price, delivery_days, features, sort_order, is_featured)
SELECT id, 'news-basic', 'নিউজ পোর্টাল বেসিক', 'basic',
  'স্থানীয় বা নিশ সংবাদমাধ্যমের জন্য দ্রুতগতির নিউজ সাইট',
  'ক্যাটাগরিভিত্তিক সংবাদ, ব্রেকিং নিউজ টিকার, একাধিক রিপোর্টার অ্যাকাউন্ট ও বিজ্ঞাপনের জায়গাসহ নিউজ পোর্টাল।',
  15000, 10,
  '["ক্যাটাগরিভিত্তিক সংবাদ বিন্যাস","ব্রেকিং নিউজ টিকার","৫টি রিপোর্টার অ্যাকাউন্ট","বিজ্ঞাপনের জায়গা","সোশ্যাল শেয়ার ও এসইও","১ মাস ফ্রি সাপোর্ট"]',
  1, 0 FROM categories WHERE slug = 'news';
INSERT INTO packages (category_id, slug, name, tier, short_description, description, base_price, delivery_days, features, sort_order, is_featured)
SELECT id, 'news-premium', 'নিউজ পোর্টাল প্রিমিয়াম', 'premium',
  'বড় ট্রাফিক সামলানোর মতো পূর্ণাঙ্গ সংবাদমাধ্যম প্ল্যাটফর্ম',
  'সীমাহীন রিপোর্টার, এডিটরিয়াল ওয়ার্কফ্লো, ভিডিও নিউজ, ই-পেপার সেকশন ও উচ্চ-ট্রাফিক অপ্টিমাইজেশনসহ।',
  30000, 21,
  '["বেসিকের সবকিছু","সীমাহীন রিপোর্টার ও এডিটর","এডিটরিয়াল অনুমোদন ওয়ার্কফ্লো","ভিডিও নিউজ ও ই-পেপার সেকশন","উচ্চ ট্রাফিকের জন্য ক্যাশিং","৩ মাস অগ্রাধিকার সাপোর্ট"]',
  2, 1 FROM categories WHERE slug = 'news';

-- Blog
INSERT INTO packages (category_id, slug, name, tier, short_description, description, base_price, delivery_days, features, sort_order, is_featured)
SELECT id, 'blog-basic', 'ব্লগ বেসিক', 'basic',
  'ব্যক্তিগত বা ব্র্যান্ড ব্লগের জন্য পরিচ্ছন্ন, দ্রুত সাইট',
  'সুন্দর পড়ার অভিজ্ঞতা, ক্যাটাগরি ও ট্যাগ, মন্তব্য ও নিউজলেটার সাবস্ক্রিপশনসহ ব্লগ সাইট।',
  8000, 5,
  '["পরিচ্ছন্ন পড়ার উপযোগী ডিজাইন","ক্যাটাগরি ও ট্যাগ","মন্তব্য সিস্টেম","নিউজলেটার সাবস্ক্রিপশন ফর্ম","এসইও সেটআপ"]',
  1, 0 FROM categories WHERE slug = 'blog';
INSERT INTO packages (category_id, slug, name, tier, short_description, description, base_price, delivery_days, features, sort_order, is_featured)
SELECT id, 'blog-premium', 'ব্লগ প্রিমিয়াম', 'premium',
  'একাধিক লেখক ও আয়ের সুযোগসহ পেশাদার ব্লগ প্ল্যাটফর্ম',
  'একাধিক লেখক, বিজ্ঞাপন স্লট, প্রিমিয়াম কনটেন্ট সেকশন ও বিস্তারিত অ্যানালিটিক্সসহ।',
  15000, 10,
  '["বেসিকের সবকিছু","একাধিক লেখক অ্যাকাউন্ট","বিজ্ঞাপন স্লট","প্রিমিয়াম কনটেন্ট সেকশন","বিস্তারিত পাঠক অ্যানালিটিক্স","২ মাস সাপোর্ট"]',
  2, 1 FROM categories WHERE slug = 'blog';

-- Add-ons (price deltas are assumptions)
INSERT INTO package_addons (package_id, name, description, price_delta, max_quantity, sort_order)
SELECT id, 'অতিরিক্ত পেজ', 'প্রতিটি অতিরিক্ত তথ্য-পেজ (যেমন: আমাদের সম্পর্কে, সাইজ গাইড)', 1000, 10, 1 FROM packages;
INSERT INTO package_addons (package_id, name, description, price_delta, max_quantity, sort_order)
SELECT id, 'এআই চ্যাটবট', 'আপনার পণ্য ও প্রশ্নোত্তর জানা স্বয়ংক্রিয় চ্যাট সহকারী', 5000, 1, 2 FROM packages;
INSERT INTO package_addons (package_id, name, description, price_delta, max_quantity, sort_order)
SELECT id, 'কাস্টম ডোমেইন সেটআপ', 'আপনার ডোমেইন কানেক্ট, এসএসএল ও ইমেইল রেকর্ড সেটআপ', 1500, 1, 3 FROM packages;
INSERT INTO package_addons (package_id, name, description, price_delta, max_quantity, sort_order)
SELECT id, 'অতিরিক্ত ল্যান্ডিং পেজ', 'বিজ্ঞাপন ক্যাম্পেইনের জন্য আলাদা ল্যান্ডিং পেজ', 3000, 5, 4 FROM packages;
INSERT INTO package_addons (package_id, name, description, price_delta, max_quantity, sort_order)
SELECT id, 'মেটা পিক্সেল ও কনভার্সন এপিআই', 'সঠিক বিজ্ঞাপন ট্র্যাকিং — ব্রাউজার ও সার্ভার দুই দিক থেকেই', 3500, 1, 5 FROM packages;
INSERT INTO package_addons (package_id, name, description, price_delta, max_quantity, sort_order)
SELECT p.id, 'অনলাইন পেমেন্ট গেটওয়ে', 'বিকাশ, নগদ ও কার্ড পেমেন্ট গ্রহণের ব্যবস্থা', 4000, 1, 6
FROM packages p JOIN categories c ON c.id = p.category_id WHERE c.slug IN ('fashion','clothing','gadgets','herbal');

INSERT INTO faqs (question, answer, scope, sort_order) VALUES
 ('ওয়েবসাইট তৈরি হতে কত দিন লাগে?', 'প্যাকেজভেদে সাধারণত ৫ থেকে ২১ কর্মদিবস। সময় গোনা শুরু হয় পেমেন্ট নিশ্চিত হওয়া এবং আপনার প্রয়োজনীয় তথ্য জমা দেওয়ার পর থেকে।', 'sitewide', 1),
 ('পেমেন্ট কীভাবে করব?', 'বিকাশ, নগদ, রকেট, ভিসা/মাস্টারকার্ড অথবা ব্যাংক ট্রান্সফারে পেমেন্ট করতে পারবেন। পেমেন্ট নিশ্চিত হলেই আপনার প্রজেক্টের কাজ শুরু হয়।', 'sitewide', 2),
 ('কেনার আগে সাইট কেমন হবে দেখতে পারব?', 'অবশ্যই। প্রতিটি প্যাকেজের লাইভ ডেমো আছে — প্যাকেজ পেজের “লাইভ ডেমো দেখুন” বোতামে চাপ দিলেই আসল সাইটটি খুলবে।', 'sitewide', 3),
 ('ডোমেইন ও হোস্টিং কি অন্তর্ভুক্ত?', 'ডোমেইন কেনার খরচ আলাদা। “কাস্টম ডোমেইন সেটআপ” অ্যাড-অন নিলে আপনার ডোমেইন কানেক্ট ও এসএসএল সেটআপ আমরা করে দেব।', 'sitewide', 4),
 ('ডেলিভারির পর পরিবর্তন করা যাবে?', 'হ্যাঁ। ডেলিভারির আগে রিভিউ ধাপে আপনি মতামত দিতে পারবেন এবং আমরা সংশোধন করে দেব। ডেলিভারির পর সাপোর্ট মেয়াদে ছোটখাটো পরিবর্তন বিনামূল্যে।', 'sitewide', 5),
 ('আমার চাহিদা প্যাকেজের সাথে না মিললে?', '“কোটেশন নিন” ফর্মে আপনার চাহিদা লিখে পাঠান — আমরা আপনার জন্য আলাদা মূল্য জানিয়ে দেব।', 'sitewide', 6);

INSERT INTO chat_settings (id, ai_enabled, whatsapp_enabled, whatsapp_number, whatsapp_message, messenger_enabled, messenger_page, greeting, knowledge, escalation_message)
VALUES (1, 1, 1, '', 'আসসালামু আলাইকুম, আমি একটি ওয়েবসাইট বানাতে আগ্রহী।', 1, '',
 'আসসালামু আলাইকুম! কোন ধরনের ওয়েবসাইট খুঁজছেন? প্যাকেজ, দাম বা কাজের ধাপ — যা জানতে চান জিজ্ঞেস করুন।',
 '', 'এই প্রশ্নের নিশ্চিত উত্তর দিতে আমাদের একজন প্রতিনিধি আপনার সাথে যোগাযোগ করবেন। অনুগ্রহ করে আপনার নাম ও ফোন নম্বর দিন।');

INSERT INTO ai_provider_configs (purpose, provider, model, secret_name, system_prompt, tone) VALUES
 ('content', 'gemini', 'gemini-2.5-flash', 'GEMINI_API_KEY',
  'তুমি একটি বাংলাদেশি ওয়েব ডেভেলপমেন্ট এজেন্সির কপিরাইটার। শুধুমাত্র প্রমিত বাংলায় লিখবে, কোনো ইংরেজি শব্দ ব্যবহার করবে না। মিথ্যা দাবি, অতিরঞ্জিত সংখ্যা বা প্রতিশ্রুতি দেবে না।',
  'আত্মবিশ্বাসী, পরিষ্কার ও বন্ধুত্বপূর্ণ'),
 ('chat', 'workers_ai', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '',
  'তুমি এই ওয়েবসাইটের সহায়ক। শুধু নিচে দেওয়া প্যাকেজ, দাম, প্রশ্নোত্তর ও কাজের ধাপ থেকে উত্তর দেবে, সবসময় বাংলায়। নিশ্চিত না হলে অনুমান করবে না।',
  'ভদ্র ও সংক্ষিপ্ত');
