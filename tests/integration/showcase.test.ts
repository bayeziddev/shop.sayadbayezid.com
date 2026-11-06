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

describe('ready-made demo packages (৳10,000 each)', () => {
  it('lists every demo product at ৳10,000 with cover, screenshots and extra demo links', async () => {
    const r = await call('/api/packages');
    expect(r.body.data).toHaveLength(15);
    for (const p of r.body.data) {
      expect(p.basePrice).toBe(10000);
      expect(p.cover).toMatch(/^\/assets\/demos\/[\w-]+\/cover\.webp$/);
      expect(p.demoUrl).toMatch(/^https:\/\/demu\.sayadbayezid\.com\//);
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
    for (const text of ['এই সাইট আপনার জন্য কী করবে', 'আপনার ব্যবসার লাভ', 'এই প্যাকেজে যা থাকছে', 'সব স্ক্রিনশট', 'কেন আমাদের কাছ থেকে নেবেন', 'ক্লায়েন্ট রিভিউ', 'এখনই অর্ডার করুন', 'লাইভ ডেমো দেখুন', 'অ্যাডমিন প্যানেল ডেমো', 'data-demo-click', 'data-sticky-cta']) {
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

  it('starts the portfolio empty (no invented work) and shows real deliveries added in admin', async () => {
    expect((await page('/portfolio')).html).toContain('শীঘ্রই এখানে আমাদের ডেলিভারি করা সাইট দেখাবো');
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
