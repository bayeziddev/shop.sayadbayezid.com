import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import loginFixture from '../fixtures/admin-login.json';

const BASE = 'http://localhost:8787';
const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const call = async (path: string, init?: RequestInit) => {
  const r = await SELF.fetch(BASE + path, init);
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};
const page = async (path: string) => (await SELF.fetch(BASE + path)).text();
async function adminSession(): Promise<Record<string, string>> {
  await call('/api/admin/auth/setup', json(loginFixture.setup));
  const r = await SELF.fetch(BASE + '/api/admin/auth/login', json(loginFixture.login));
  return { cookie: (r.headers.get('set-cookie') || '').split(';')[0], 'x-requested-with': 'admin', origin: BASE };
}

describe('LKs Attire: ৳12,000 with 50% off', () => {
  it('sells LKs Attire at ৳6,000 with ৳12,000 struck through — on cards, the package page and its order buttons', async () => {
    // (The live site's second LKs Attire package, "clothing-website", was made in the admin, so only production has it;
    // the migration gives it the same price and offer there.)
    for (const slug of ['lks-attire']) {
      const p = (await call(`/api/packages/${slug}`)).body.data;
      expect(p.basePrice, slug).toBe(12000);
      expect(p.offers.filter((o: any) => o.isActive).map((o: any) => [o.discountType, o.discountValue]), slug).toEqual([['percent', 50]]);
      const html = await page(`/package/${slug}`);
      expect(html).toContain(`data-live-price="${p.id}"><strong>৳৬,০০০</strong> <s>৳১২,০০০</s>`);
      expect(html).toContain(`data-live-offer="${p.id}"><span class="badge badge-offer">৫০% ছাড়</span>`);
      // The bottom order button and the phone's sticky bar show today's price, not the regular one.
      expect(html.match(new RegExp(`data-live-total="${p.id}">৳৬,০০০`, 'g'))?.length).toBe(2);
    }
  });

  it('charges the offer price at checkout (the server decides, not the page)', async () => {
    const p = (await call('/api/packages/lks-attire')).body.data;
    const r = await call('/api/pricing/quote', json({ items: [{ packageId: p.id, addons: [] }] }));
    expect(r.status).toBe(200);
    expect(r.body.data.subtotal).toBe(12000);
    expect(r.body.data.offerDiscount).toBe(6000);
    expect(r.body.data.total).toBe(6000);
  });
});

describe('admin: Google service account and public-site refresh', () => {
  it('reports that no service account is set, and the check says what to do', async () => {
    const h = await adminSession();
    expect((await call('/api/admin/google', { headers: h })).body.data).toMatchObject({ configured: false, secretSet: false });
    const r = await call('/api/admin/google/check', json({ url: 'https://drive.google.com/file/d/1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8/view' }, h));
    expect(r.status).toBe(200);
    expect(r.body.data.steps[0]).toMatchObject({ key: 'secret', ok: false });
    expect(r.body.data.steps[0].text).toContain('GOOGLE_SERVICES_JSON');
  });

  it('explains how to switch on instant public-site updates when no token is set', async () => {
    const h = await adminSession();
    const s = (await call('/api/admin/storefront', { headers: h })).body.data;
    expect(s).toMatchObject({ pages: true, token: false });
    const r = await call('/api/admin/storefront/refresh', json({}, h));
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('PAGES_REFRESH_TOKEN');
  });

  it('accepts a Google Drive link as a lesson file, but not other public links', async () => {
    const h = await adminSession();
    const course = (await call('/api/admin/courses?q=facebook', { headers: h })).body.data.items[0];
    const lesson = (await call(`/api/admin/courses/${course.id}/curriculum`, { headers: h })).body.data.lessons[0];
    expect((await call(`/api/admin/course-lessons/${lesson.id}`, json({ file_key: 'https://drive.google.com/file/d/1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8/view' }, h, 'PUT'))).status).toBe(200);
    expect((await call(`/api/admin/course-lessons/${lesson.id}`, json({ file_key: 'https://example.com/a.pdf' }, h, 'PUT'))).status).toBe(422);
    expect((await call(`/api/admin/course-lessons/${lesson.id}`, json({ file_key: '' }, h, 'PUT'))).status).toBe(200);
  });
});
