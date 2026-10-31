import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { priceLine } from '../../shared/pricing';
import pkgFixture from '../fixtures/package-list.json';
import orderFixture from '../fixtures/create-order.json';
import loginFixture from '../fixtures/admin-login.json';

const BASE = 'http://localhost:8787';
const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const call = async (path: string, init?: RequestInit) => {
  const r = await SELF.fetch(BASE + path, init);
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any, headers: r.headers };
};

async function enableBankTransfer() {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('bank_details', '"পরীক্ষা ব্যাংক, হিসাব ১২৩"') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
  await env.KV.delete('settings:v1');
}

async function packageBySlug(slug: string) {
  const r = await call('/api/packages/' + slug);
  return r.body.data;
}

/** Resolve the fixture's human-readable add-on names into ids. */
async function fixtureItems() {
  const out = [];
  for (const item of orderFixture.items) {
    const p = await packageBySlug(item.packageSlug);
    out.push({ packageId: p.id, addons: item.addons.map((a) => ({ addonId: p.addons.find((x: any) => x.name === a.name).id, quantity: a.quantity })) });
  }
  return out;
}

async function adminSession(): Promise<Record<string, string>> {
  await call('/api/admin/auth/setup', json(loginFixture.setup));
  const r = await SELF.fetch(BASE + '/api/admin/auth/login', json(loginFixture.login));
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, 'x-requested-with': 'admin', origin: BASE };
}

async function placeOrder(extra: Record<string, unknown> = {}) {
  const { items: _i, ...rest } = orderFixture;
  return call('/api/orders', json({ ...rest, items: await fixtureItems(), ...extra }));
}

beforeEach(enableBankTransfer);

describe('catalog (package-list fixture)', () => {
  it('lists every seeded category and package with public fields only', async () => {
    const r = await call('/api/packages');
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(pkgFixture.expectedPackageCount);
    expect(new Set(r.body.data.map((p: any) => p.categorySlug))).toEqual(new Set(pkgFixture.expectedCategories));
    for (const f of pkgFixture.requiredFields) expect(r.body.data[0]).toHaveProperty(f);
    expect(r.body.data[0]).not.toHaveProperty('ai_draft');
  });

  it('renders the storefront in Bangla with the brand name', async () => {
    const r = await SELF.fetch(BASE + '/');
    const page = await r.text();
    expect(r.status).toBe(200);
    expect(page).toContain('lang="bn"');
    expect(page).toContain('Cwb Agency');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
});

describe('server-side price verification', () => {
  it('server quote equals the client-side configurator total', async () => {
    const p = await packageBySlug('fashion-premium');
    const items = await fixtureItems();
    const client = priceLine({ id: p.id, categoryId: p.categoryId, basePrice: p.basePrice, addons: p.addons, offers: p.offers }, items[0], Date.now());
    const r = await call('/api/pricing/quote', json({ items }));
    expect(r.body.data.total).toBe(client.total);
    expect(r.body.data.total).toBe(25000 + 2 * 1000 + 5000);
  });

  it('ignores a tampered client total and refuses to charge a different amount', async () => {
    const r = await placeOrder({ expectedTotal: 100 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('price_changed');
    expect(r.body.data.total).toBe(32000);
  });

  it('expired offers stop discounting', async () => {
    const p = await packageBySlug('fashion-premium');
    await env.DB.prepare("INSERT INTO offers (scope, scope_id, discount_type, discount_value, ends_at) VALUES ('package', ?, 'percent', 50, ?)").bind(p.id, new Date(Date.now() - 1000).toISOString()).run();
    const r = await call('/api/pricing/quote', json({ items: [{ packageId: p.id, addons: [] }] }));
    expect(r.body.data.offerDiscount).toBe(0);
  });
});

describe('order → payment → requirements (create-order fixture)', () => {
  it('blocks requirements intake until payment is confirmed, then assigns sequential invoices', async () => {
    const h = await adminSession();
    const o1 = await placeOrder();
    expect(o1.status).toBe(201);
    const { orderNumber, token } = o1.body.data;

    const blocked = await call(`/api/portal/${orderNumber}/requirements`, json({ business_name: 'x' }, { 'x-portal-token': token }));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('payment_required');

    // Staff cannot skip ahead without a confirmed payment.
    const skip = await call('/api/admin/orders/1/status', json({ status: 'in_development' }, h));
    expect(skip.status).toBe(422);

    await call(`/api/orders/${orderNumber}/manual-payment`, json({ token, trx_id: 'TRX-9981', sender: 'ব্যাংক' }));
    const verify = await call('/api/admin/orders/1/verify-payment', json({ amount: 32000, confirm: true }, h));
    expect(verify.status).toBe(200);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = 1').first<any>();
    expect(order.payment_status).toBe('paid');
    expect(order.project_status).toBe('confirmed');
    expect(order.invoice_number).toMatch(/^INV-\d{4}-000001$/);
    // Sandbox mode: a Purchase event must never be sent.
    expect(order.purchase_sent_at).toBeNull();
    expect(order.utm_content).toBe('ad-01');

    const ok = await call(`/api/portal/${orderNumber}/requirements`, json({ business_name: 'পরীক্ষা ফ্যাশন', business_description: 'শাড়ি', has_domain: 'নিশ্চিত নই', content_ready: 'সব প্রস্তুত' }, { 'x-portal-token': token }));
    expect(ok.status).toBe(200);
    const stored = await env.DB.prepare('SELECT encrypted_payload FROM project_requirements WHERE order_id = 1').first<any>();
    expect(stored.encrypted_payload).not.toContain('শাড়ি');

    const o2 = await placeOrder();
    await call(`/api/orders/${o2.body.data.orderNumber}/manual-payment`, json({ token: o2.body.data.token, trx_id: 'TRX-9982', sender: 'ব্যাংক' }));
    await call('/api/admin/orders/2/verify-payment', json({ amount: 32000, confirm: true }, h));
    const inv2 = await env.DB.prepare('SELECT invoice_number FROM orders WHERE id = 2').first<any>();
    expect(inv2.invoice_number).toMatch(/-000002$/);

    const invoice = await SELF.fetch(`${BASE}/invoice/${orderNumber}?t=${token}`);
    expect(await invoice.text()).toContain(order.invoice_number);
  });

  it('rejects a wrong portal token', async () => {
    const o = await placeOrder();
    const r = await call(`/api/portal/${o.body.data.orderNumber}?t=wrong`);
    expect(r.status).toBe(404);
  });
});

describe('admin auth & RBAC (admin-login fixture)', () => {
  it('rejects bad credentials and cross-site mutations', async () => {
    await call('/api/admin/auth/setup', json(loginFixture.setup));
    expect((await call('/api/admin/auth/login', json(loginFixture.badLogin))).status).toBe(401);
    const h = await adminSession();
    const noHeader = await call('/api/admin/categories', json({ name: 'x', slug: 'x' }, { cookie: h.cookie }));
    expect(noHeader.status).toBe(403);
    expect((await call('/api/admin/categories')).status).toBe(401);
  });

  it('read-only viewers cannot write', async () => {
    const h = await adminSession();
    await call('/api/admin/staff', json({ name: 'দর্শক', email: 'viewer@test.local', role: 'viewer', password: 'viewer-pass-123' }, h));
    const r = await SELF.fetch(BASE + '/api/admin/auth/login', json({ email: 'viewer@test.local', password: 'viewer-pass-123' }));
    const vh = { cookie: (r.headers.get('set-cookie') || '').split(';')[0], 'x-requested-with': 'admin' };
    expect((await call('/api/admin/categories')).status).toBe(401);
    expect((await call('/api/admin/categories', { headers: vh })).status).toBe(200);
    expect((await call('/api/admin/categories', json({ name: 'নতুন', slug: 'new-cat' }, vh))).status).toBe(403);
  });

  it('AI drafts are never published until a human approves', async () => {
    const h = await adminSession();
    const p = await packageBySlug('blog-basic');
    await env.DB.prepare('UPDATE packages SET ai_draft = ? WHERE id = ?').bind(JSON.stringify({ title: 'এআই শিরোনাম', shortDescription: 'ক', description: 'খ' }), p.id).run();
    expect((await packageBySlug('blog-basic')).name).toBe(p.name);
    await call(`/api/admin/packages/${p.id}/approve-draft`, json({}, h));
    expect((await packageBySlug('blog-basic')).name).toBe('এআই শিরোনাম');
  });
});

describe('tracking & landing pages', () => {
  it('the browser beacon cannot trigger Purchase / Lead / InitiateCheckout', async () => {
    for (const event of ['Purchase', 'Lead', 'InitiateCheckout']) {
      expect((await call('/api/track', json({ event, eventId: 'abcdefgh1234', url: BASE + '/' }))).status).toBe(422);
    }
  });

  it('leads return a shared event id and keep UTM attribution', async () => {
    const r = await call('/api/leads', json({ source: 'quote', name: 'করিম', phone: '01811000000', message: 'নিউজ সাইট চাই', attribution: { utm_campaign: 'news1' } }));
    expect(r.status).toBe(201);
    expect(r.body.data.eventId).toMatch(/^ld_/);
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(r.body.data.leadId).first<any>();
    expect(lead.utm_campaign).toBe('news1');
    expect(lead.lead_event_id).toBe(r.body.data.eventId);
  });

  it('landing pages can be published and retired without a developer', async () => {
    const h = await adminSession();
    const c = await call('/api/admin/landing-pages', json({ title: 'ঈদ ক্যাম্পেইন', slug: 'eid-2026', status: 'published', blocks: [{ type: 'hero', heading: 'ঈদ অফার' }, { type: 'lead_form' }] }, h));
    expect(c.status).toBe(201);
    expect((await SELF.fetch(BASE + '/lp/eid-2026')).status).toBe(200);
    await call(`/api/admin/landing-pages/${c.body.data.id}`, { ...json({ status: 'retired' }, h), method: 'PUT' });
    expect((await SELF.fetch(BASE + '/lp/eid-2026')).status).toBe(404);
  });
});

describe('canonical host', () => {
  it('redirects www.<site> to the bare site host', async () => {
    const r = await SELF.fetch('http://www.localhost:8787/faq?x=1', { redirect: 'manual' });
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('http://localhost:8787/faq?x=1');
  });
});
