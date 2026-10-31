import { describe, expect, it } from 'vitest';
import { hashUser, buildPayload } from '../../worker/src/lib/meta-capi';
import { normalizeBdPhone, sha256Hex } from '../../worker/src/lib/util';
import { esc, html } from '../../worker/src/lib/html';
import { stripeVerifyWebhook } from '../../worker/src/lib/payment/stripe';
import { hmacSha256Hex, hashPassword, verifyPassword, encryptJson, decryptJson } from '../../worker/src/lib/crypto';
import { canTransition } from '../../shared/status';
import { formatInvoiceNumber } from '../../worker/src/lib/orders';

describe('Meta CAPI user data', () => {
  it('hashes normalized email and Bangladeshi phone (incl. Bangla digits)', async () => {
    const u = await hashUser({ email: ' Client@Example.com ', phone: '০১৭১১-০০০০০০' });
    expect(u.em).toEqual([await sha256Hex('client@example.com')]);
    expect(u.ph).toEqual([await sha256Hex('8801711000000')]);
    expect(JSON.stringify(u)).not.toContain('client@example.com');
  });
  it('builds a payload carrying the shared event_id', async () => {
    const p = await buildPayload({ name: 'Lead', eventId: 'ld_abc', sourceUrl: 'https://x', user: {} });
    expect(p.data[0].event_id).toBe('ld_abc');
    expect(p.data[0].action_source).toBe('website');
  });
});

describe('helpers', () => {
  it('normalizes BD phones', () => {
    expect(normalizeBdPhone('+880 1711-000000')).toBe('8801711000000');
    expect(normalizeBdPhone('01211000000')).toBe('');
  });
  it('escapes HTML in templates', () => {
    expect(html`<p>${'<script>x</script>'}</p>`.value).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
    expect(esc(`"'`)).toBe('&quot;&#39;');
  });
  it('formats sequential invoice numbers', () => {
    expect(formatInvoiceNumber(7, new Date('2026-01-01T00:00:00Z'))).toBe('INV-2026-000007');
  });
  it('enforces the project pipeline', () => {
    expect(canTransition('pending_payment', 'in_development')).toBe(false);
    expect(canTransition('client_review', 'revisions')).toBe(true);
    expect(canTransition('completed', 'in_development')).toBe(false);
  });
});

describe('crypto', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('round-trips encrypted requirements', async () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const e = await encryptJson(key, { business_name: 'রহিম ফ্যাশন' });
    expect(e.payload).not.toContain('রহিম');
    expect(await decryptJson(key, e.payload, e.iv)).toEqual({ business_name: 'রহিম ফ্যাশন' });
  });
  it('verifies Stripe webhook signatures', async () => {
    const env = { STRIPE_WEBHOOK_SECRET: 'whsec_test' } as never;
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacSha256Hex('whsec_test', `${t}.{"a":1}`);
    expect(await stripeVerifyWebhook(env, '{"a":1}', `t=${t},v1=${sig}`)).toBe(true);
    expect(await stripeVerifyWebhook(env, '{"a":2}', `t=${t},v1=${sig}`)).toBe(false);
    expect(await stripeVerifyWebhook(env, '{"a":1}', `t=${t - 1000},v1=${sig}`)).toBe(false);
  });
});
