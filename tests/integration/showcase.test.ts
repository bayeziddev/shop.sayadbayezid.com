import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import loginFixture from '../fixtures/admin-login.json';

const BASE = 'http://localhost:8787';
const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const call = async (path: string, init?: RequestInit) => {
  const r = await SELF.fetch(BASE + path, init);
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any, headers: r.headers };
};
const page = async (path: string) => {
  const r = await SELF.fetch(BASE + path);
  return { status: r.status, html: await r.text(), headers: r.headers };
};
async function adminSession(): Promise<Record<string, string>> {
  await call('/api/admin/auth/setup', json(loginFixture.setup));
  const r = await SELF.fetch(BASE + '/api/admin/auth/login', json(loginFixture.login));
  return { cookie: (r.headers.get('set-cookie') || '').split(';')[0], 'x-requested-with': 'admin', origin: BASE };
}

describe('ready-made packages (one fixed price: ৳12,000)', () => {
  it('lists every website at ৳12,000 with a cover, a live demo, A-to-Z features and a screenshot tour — and no add-on surcharges', async () => {
    const r = await call('/api/packages');
    expect(r.body.data).toHaveLength(16);
    for (const p of r.body.data) {
      expect(p.basePrice, p.slug).toBe(12000);
      expect(p.addons, p.slug).toEqual([]);
      expect(p.cover).toMatch(/^\/assets\/demos\/[\w-]+\/cover\.webp$/);
      expect(p.demoUrl).toMatch(/^https:\/\/(demu\.sayadbayezid\.com\/|vandarmart\.com$)/);
      expect(p.featureGroups.length, p.slug).toBeGreaterThan(0);
      expect(p.tour.length, p.slug).toBeGreaterThan(2);
    }
    const gm = r.body.data.find((p: any) => p.slug === 'gadget-market');
    expect(gm.images.length).toBeGreaterThanOrEqual(4);
    expect(gm.demoLinks[0].label).toContain('অ্যাডমিন');
    expect(gm.benefits[0]).toHaveProperty('title');
    expect(gm.solution.length).toBeGreaterThan(50);
  });

  it('hides the old generic example packages that had no live demo', async () => {
    expect((await call('/api/packages/fashion-premium')).status).toBe(404);
    const row = await env.DB.prepare(`SELECT status FROM packages WHERE slug = 'fashion-premium'`).first<{ status: string }>();
    expect(row?.status).toBe('inactive'); // kept, not deleted — can be re-enabled from admin
  });

  it('renders the package page with every section and clear calls to action', async () => {
    const { status, html } = await page('/package/gadget-market');
    expect(status).toBe(200);
    for (const text of ['এই সাইট আপনার কোন ঝামেলা মেটাবে', 'আপনার ব্যবসার লাভ', 'এই প্যাকেজে যা থাকছে', 'ফিচার ট্যুর — স্ক্রিনশটে দেখুন', 'কেন আমাদের কাছ থেকে নেবেন', 'ক্লায়েন্ট রিভিউ', 'এখনই অর্ডার করুন', 'লাইভ ডেমো দেখুন', 'অ্যাডমিন প্যানেল ডেমো', 'data-demo-click', 'data-sticky-cta']) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('og:image" content="https://shop.example.com/assets/demos/gadget-market/cover.webp');
  });
});

describe('videos from any link', () => {
  it('plays YouTube links through the privacy-enhanced player only after a click', async () => {
    const h = await adminSession();
    const p = (await call('/api/packages/sidra-jewellery')).body.data;
    const r = await call(`/api/admin/packages/${p.id}`, json({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }, h, 'PUT'));
    expect(r.status).toBe(200);
    const { html, headers } = await page('/package/sidra-jewellery');
    expect(html).toContain('data-embed="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html).not.toContain('<iframe'); // nothing third-party loads before the visitor presses play
    expect(headers.get('content-security-policy')).toContain('https://www.youtube-nocookie.com');
  });

  it('rejects a video or image that is neither an upload nor a web link', async () => {
    const h = await adminSession();
    const p = (await call('/api/packages/sidra-jewellery')).body.data;
    expect((await call(`/api/admin/packages/${p.id}`, json({ video_url: 'javascript:alert(1)' }, h, 'PUT'))).status).toBe(422);
    expect((await call(`/api/admin/packages/${p.id}`, json({ images: ['https://cdn.example.com/a.webp', '../etc/passwd'] }, h, 'PUT'))).status).toBe(422);
  });
});

describe('design gallery & successful deliveries', () => {
  it('shows checkout, sidebar, footer… designs with an order button for each', async () => {
    const { status, html } = await page('/designs');
    expect(status).toBe(200);
    for (const kind of ['চেকআউট', 'সাইডবার', 'ফুটার', 'হেডার ও মেনু', 'মোবাইল ভিউ', 'বাটন ডিজাইন']) expect(html, kind).toContain(kind);
    expect(html).toContain('এই ডিজাইনে অর্ডার করুন');
  });

  it('lists only real deliveries (Vandar Mart to start with) and shows new ones added in admin', async () => {
    const before = (await page('/portfolio')).html;
    expect(before).toContain('Vandar Mart');
    expect((before.match(/class="card work-card"/g) || []).length).toBe(1); // nothing invented
    const h = await adminSession();
    const r = await call('/api/admin/portfolio', json({ title: 'রহিম ফ্যাশন হাউস', client_name: 'রহিম', live_url: 'https://rahim.example.com', cover_image: '/assets/demos/lks-attire/cover.webp', is_featured: 1 }, h));
    expect(r.status).toBe(201);
    const { html } = await page('/portfolio');
    expect(html).toContain('রহিম ফ্যাশন হাউস');
    expect(html).toContain('href="https://rahim.example.com"');
    expect((await page('/')).html).toContain('সফল ডেলিভারি');
    expect((await call('/api/admin/portfolio', json({ title: 'x', live_url: 'ftp://bad' }, h))).status).toBe(422);
  });

  it('lists the new pages in the sitemap so the GitHub Pages copy includes them', async () => {
    const xml = await (await SELF.fetch(BASE + '/sitemap.xml')).text();
    for (const p of ['/packages', '/designs', '/portfolio', '/package/cwb-gaming']) expect(xml).toContain(`https://shop.example.com${p}<`);
  });
});

describe('lead box (multi-step lead capture)', () => {
  it('is configured on browsing pages and offered from the header', async () => {
    const home = await page('/');
    expect(home.html).toContain('id="leadbox-config"');
    expect(home.html).toMatch(/"auto":true/);
    expect(home.html).toContain('data-leadbox-open');
    expect((await page('/checkout')).html).toMatch(/"auto":false/); // never interrupts a checkout
  });

  it('saves the answers, links the chosen demo, hands off to WhatsApp and stays out of reports when internal', async () => {
    const r = await call('/api/leads', json({
      source: 'leadbox', name: 'করিম', phone: '01712345678', website: '',
      answers: { site_type: 'ই-কমার্স ওয়েবসাইট', category: 'গ্যাজেট ও টেক', stage: 'নতুন ব্যবসা শুরু করছি', timeline: 'এই মাসের মধ্যে', demo: 'gadget-market', evil: 'dropped' },
      page_url: 'https://shop.example.com/', attribution: { utm_source: 'facebook', utm_campaign: 'nov', internal: true },
    }));
    expect(r.status).toBe(201);
    expect(r.body.data.eventId).toMatch(/^ld_/);
    expect(r.body.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/8801519601517\?text=/);
    expect(decodeURIComponent(r.body.data.whatsappUrl)).toContain('করিম');
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(r.body.data.leadId).first<any>();
    expect(lead.source).toBe('leadbox');
    expect(lead.is_internal).toBe(1);
    expect(lead.phone).toBe('8801712345678');
    const gm = await env.DB.prepare(`SELECT id FROM packages WHERE slug = 'gadget-market'`).first<{ id: number }>();
    expect(lead.package_id).toBe(gm!.id);
    expect(JSON.parse(lead.quiz_result)).toEqual({ site_type: 'ই-কমার্স ওয়েবসাইট', category: 'গ্যাজেট ও টেক', stage: 'নতুন ব্যবসা শুরু করছি', timeline: 'এই মাসের মধ্যে', demo: 'gadget-market' });
    expect(lead.message).toContain('কবে চালু করতে চান: এই মাসের মধ্যে');
  });

  it('needs a real WhatsApp number', async () => {
    const r = await call('/api/leads', json({ source: 'leadbox', name: 'করিম', phone: '12345', answers: {} }));
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('হোয়াটসঅ্যাপ');
  });
});

describe('tracking accuracy', () => {
  it('mirrors page views from the public storefront domain, ignores foreign URLs, and never Purchase', async () => {
    const ok = await call('/api/track', json({ event: 'PageView', eventId: 'pv_abcdef123456', url: 'https://shop.example.com/package/gadget-market' }));
    expect(ok.body.data).toEqual({ accepted: true });
    const foreign = await call('/api/track', json({ event: 'PageView', eventId: 'pv_abcdef123456', url: 'https://evil.example/x' }));
    expect(foreign.body.data).toEqual({ sent: false });
    expect((await call('/api/track', json({ event: 'LeadBoxStep', eventId: 'lb_abcdef123456', url: 'https://shop.example.com/', customData: { step: 'type', answer: 'x' } }))).body.data).toEqual({ accepted: true });
    expect((await call('/api/track', json({ event: 'Purchase', eventId: 'pu_abcdef123456', url: 'https://shop.example.com/' }))).status).toBe(422);
  });

  it('tells the owner what is wrong with the setup, and links GA4 across the two domains', async () => {
    const h = await adminSession();
    const r = await call('/api/admin/tracking', { headers: h });
    expect(r.status).toBe(200);
    expect(r.body.data.config.publicOrigin).toBe('https://shop.example.com');
    expect(r.body.data.warnings.some((w: any) => w.text.includes('স্যান্ডবক্স'))).toBe(true);
    expect((await call('/api/admin/tracking/test-event', json({}, h))).status).toBe(422); // needs a test code first
    const html = (await page('/')).html;
    expect(html).toContain('"linkDomains":["shop.example.com","localhost:8787"]');
  });

  it('keeps internal (owner/test) orders and leads out of the reports', async () => {
    await call('/api/leads', json({ source: 'leadbox', name: 'মালিক নিজে', phone: '01711111111', answers: {}, attribution: { internal: true } }));
    await call('/api/leads', json({ source: 'contact', name: 'আসল ক্লায়েন্ট', phone: '01722222222', message: 'হ্যালো' }));
    const h = await adminSession();
    const r = await call('/api/admin/reports', { headers: h });
    const internalLeads = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE is_internal = 1').first<{ n: number }>();
    expect(internalLeads!.n).toBeGreaterThan(0);
    const counted = r.body.data.leadsBySource.reduce((s: number, x: any) => s + x.leads, 0);
    const real = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE is_internal = 0').first<{ n: number }>();
    expect(counted).toBe(real!.n);
  });
});

describe('contact details & admin on the main domain', () => {
  it('shows WhatsApp, email, Facebook and the map in the footer, plus a team login link to the Worker admin', async () => {
    const { html } = await page('/contact');
    for (const s of ['https://wa.me/message/TDYG575YENF6F1', 'info@sayadbayezid.com', 'support@sayadbayezid.com', 'facebook.com/bayeziddme', 'https://maps.app.goo.gl/xEWYQwSmQAYAC1DFA', 'আউলিয়াবাদ, কালিহাতী, টাঙ্গাইল', 'http://localhost:8787/admin/']) {
      expect(html, s).toContain(s);
    }
  });
});

describe('full details on every package page', () => {
  it('shows the screenshot tour, A-to-Z features, the common list and the package FAQ — with one fixed price', async () => {
    const { html } = await page('/package/gadget-market');
    for (const text of ['ফিচার ট্যুর — স্ক্রিনশটে দেখুন', 'A থেকে Z — সব ফিচার এক জায়গায়', 'অ্যাডমিন প্যানেল — দোকান চালানো', 'প্রতিটি সাইটে যা থাকছে', 'Gadget Market — প্রশ্নোত্তর', 'অ্যাডমিন প্যানেল থেকে আমি নিজে কী কী করতে পারব?', 'মোট দাম — এককালীন', 'কোনো লুকানো খরচ নেই']) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain('অ্যাড-অন যোগ করুন');
    expect(html).toContain('৳১২,০০০');
  });

  it('adds Vandar Mart with its shop link only, the video tutorial, and lists it as a real delivery', async () => {
    const p = (await call('/api/packages/vandarmart')).body.data;
    expect(p.demoUrl).toBe('https://vandarmart.com');
    expect(p.demoLinks).toEqual([]); // no admin link on the public page
    expect(p.video.kind).toBe('youtube');
    expect(p.tour.length).toBe(20);
    const { html } = await page('/package/vandarmart');
    expect(html).not.toMatch(/vandarmart\.com\/admin/);
    const works = (await page('/portfolio')).html;
    expect(works).toContain('ABS VAI LTD');
    expect(works).toContain('href="https://vandarmart.com"');
  });

  it('lets the admin preview frame the site, but no other website', async () => {
    const { headers } = await page('/');
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('accepts edits to the A-to-Z groups and the tour from admin, and rejects a bad tour image', async () => {
    const h = await adminSession();
    const p = (await call('/api/packages/zamil-shop-bd')).body.data;
    const ok = await call(`/api/admin/packages/${p.id}`, json({ feature_groups: [{ title: 'নতুন গ্রুপ', items: ['এক', 'দুই'] }], screen_tour: [{ image: 'https://cdn.example.com/x.webp', title: 'নতুন স্ক্রিন', text: 'বিবরণ' }] }, h, 'PUT'));
    expect(ok.status).toBe(200);
    const after = (await call('/api/packages/zamil-shop-bd')).body.data;
    expect(after.featureGroups).toEqual([{ title: 'নতুন গ্রুপ', items: ['এক', 'দুই'] }]);
    expect(after.tour[0].title).toBe('নতুন স্ক্রিন');
    expect((await call(`/api/admin/packages/${p.id}`, json({ screen_tour: [{ image: 'javascript:alert(1)', title: 'x' }] }, h, 'PUT'))).status).toBe(422);
  });
});

describe('sales copy written from the client\'s side', () => {
  it('gives every package its problems → solutions, how it works, benefits, profit points and calculator values', async () => {
    const r = await call('/api/packages');
    for (const p of r.body.data) {
      expect(p.problems.length, p.slug).toBeGreaterThanOrEqual(4);
      for (const it of p.problems) { expect(it.title, p.slug).toBeTruthy(); expect(it.text, p.slug).toBeTruthy(); }
      expect(p.how.length, p.slug).toBeGreaterThanOrEqual(4);
      expect(p.benefits.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.profit.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.roi.profit, p.slug).toBeGreaterThan(0);
      expect(p.shortDescription.length, p.slug).toBeGreaterThan(40);
      expect(p.solution, p.slug).toContain('\n\n'); // the problem first, then how the site solves it
    }
  });

  it('shows the problem → solution grid, the day-to-day flow, the profit points and a working calculator on the package page', async () => {
    const { html } = await page('/package/gadget-market');
    for (const text of ['এখন যা হচ্ছে → এই সাইটে যা হবে', 'class="pain-grid"', 'কীভাবে কাজ করবে — ক্রেতা আসা থেকে ডেলিভারি', 'class="flow"', 'লাভের হিসাব — টাকা কোথা থেকে আসে, কোথায় বাঁচে', 'খরচ কতদিনে উঠে আসবে?', 'data-roi', 'বিক্রির নিশ্চয়তা নয়', 'href="#how"', 'href="#profit"']) {
      expect(html, text).toContain(text);
    }
    // Server-rendered result for the example values (৳12,000 ÷ ৳250 = 48 orders; 5 a day ≈ 10 days) — works without JavaScript.
    expect(html).toContain('<strong>৪৮টি অর্ডারে</strong>');
    expect(html).toContain('<strong>১০ দিনে</strong>');
  });

  it('opens the home page with the visitor\'s problems and the honest FAQ answers', async () => {
    const { html } = await page('/');
    for (const text of ['অনলাইনে বিক্রি করতে গিয়ে এই ঝামেলাগুলো কি হচ্ছে?', 'ইনবক্সে অর্ডার হারিয়ে যায়', 'নিজের অনলাইন দোকানে', 'বিক্রি থেকে কোনো কমিশন নেই', 'ওয়েবসাইট বানালেই কি বিক্রি বাড়বে?', 'কেনার আগেই নিশ্চিত হন']) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain('প্রয়োজনীয় অ্যাড-অন যোগ করুন');
  });

  it('lets the admin edit every new part, and hides the calculator when its value is 0', async () => {
    const h = await adminSession();
    const p = (await call('/api/packages/prakriti-herbal')).body.data;
    const ok = await call(`/api/admin/packages/${p.id}`, json({ problems: ['পুরনো সমস্যা | নতুন সমাধান'], how_it_works: ['প্রথম ধাপ | যা হয়'], profit_points: ['লাভ | কারণ'], roi_profit: 0, roi_orders: 0 }, h, 'PUT'));
    expect(ok.status).toBe(200);
    const after = (await call('/api/packages/prakriti-herbal')).body.data;
    expect(after.problems).toEqual([{ title: 'পুরনো সমস্যা', text: 'নতুন সমাধান' }]);
    expect(after.how[0].title).toBe('প্রথম ধাপ');
    expect(after.roi).toEqual({ profit: 0, orders: 0 });
    const { html } = await page('/package/prakriti-herbal');
    expect(html).toContain('পুরনো সমস্যা');
    expect(html).not.toContain('data-roi');
    expect((await call(`/api/admin/packages/${p.id}`, json({ roi_profit: -5 }, h, 'PUT'))).status).toBe(422);
    // Home page problems come from settings
    expect((await call('/api/admin/settings', json({ home_problems: 'নিজের সমস্যা | নিজের সমাধান' }, h, 'PUT'))).status).toBe(200);
    expect((await page('/')).html).toContain('নিজের সমস্যা');
  });
});
