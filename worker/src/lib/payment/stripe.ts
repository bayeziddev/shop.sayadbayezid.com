import type { Env } from '../../env';
import { hmacSha256Hex } from '../crypto';
import { safeEqual } from '../util';

/** Stripe Checkout for international clients (charged in USD). */
export const stripeConfigured = (env: Env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

export async function stripeCreateSession(env: Env, input: { orderNumber: string; amountUsdCents: number; productName: string; email: string }): Promise<{ redirectUrl: string; sessionId: string }> {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(input.amountUsdCents),
    'line_items[0][price_data][product_data][name]': input.productName.slice(0, 200),
    client_reference_id: input.orderNumber,
    'metadata[order_number]': input.orderNumber,
    success_url: `${env.SITE_URL}/order/${encodeURIComponent(input.orderNumber)}?paid=stripe`,
    cancel_url: `${env.SITE_URL}/order/${encodeURIComponent(input.orderNumber)}?cancelled=1`,
  });
  if (input.email) body.set('customer_email', input.email);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
  if (!res.ok || !j.url || !j.id) throw new Error(`stripe_session_failed:${j.error?.message || res.status}`);
  return { redirectUrl: j.url, sessionId: j.id };
}

/** Verify the Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export async function stripeVerifyWebhook(env: Env, payload: string, header: string | undefined, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !env.STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSec - t) > 300) return false;
  const expected = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${t}.${payload}`);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return sigs.some((s) => safeEqual(s, expected));
}
