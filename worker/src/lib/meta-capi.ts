import type { Env } from '../env';
import { normalizeBdPhone, sha256Hex } from './util';

/**
 * Meta Conversions API.
 *
 * Hard rules (docs/SPEC.md §11):
 *  - The browser pixel and CAPI share the same `event_id` for deduplication.
 *  - Purchase is only ever sent from `sendPurchaseIfPaid`, which requires a
 *    gateway-validated (or human-verified) payment AND PAYMENT_MODE = 'live'.
 *  - In any non-production environment nothing is sent at all.
 */
export type MetaEventName = 'PageView' | 'ViewContent' | 'Lead' | 'InitiateCheckout' | 'Purchase';

export interface MetaUserInput {
  email?: string;
  phone?: string;
  firstName?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  externalId?: string;
}

export interface MetaEventInput {
  name: MetaEventName;
  eventId: string;
  sourceUrl: string;
  user: MetaUserInput;
  customData?: Record<string, unknown>;
  eventTime?: number;
}

export async function hashUser(u: MetaUserInput): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const email = (u.email || '').trim().toLowerCase();
  if (email) out.em = [await sha256Hex(email)];
  const phone = normalizeBdPhone(u.phone || '');
  if (phone) out.ph = [await sha256Hex(phone)];
  const fn = (u.firstName || '').trim().toLowerCase().split(/\s+/)[0];
  if (fn) out.fn = [await sha256Hex(fn)];
  if (u.externalId) out.external_id = [await sha256Hex(u.externalId)];
  if (u.ip) out.client_ip_address = u.ip;
  if (u.userAgent) out.client_user_agent = u.userAgent;
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  out.country = [await sha256Hex('bd')];
  return out;
}

export function trackingEnabled(env: Env): boolean {
  return env.APP_ENV === 'production' && !!env.META_CAPI_TOKEN;
}

export async function buildPayload(ev: MetaEventInput) {
  return {
    data: [
      {
        event_name: ev.name,
        event_time: ev.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        event_source_url: ev.sourceUrl,
        action_source: 'website',
        user_data: await hashUser(ev.user),
        custom_data: ev.customData ?? {},
      },
    ],
  };
}

export async function sendMetaEvent(env: Env, pixelId: string, ev: MetaEventInput): Promise<{ sent: boolean; reason?: string }> {
  if (ev.name === 'Purchase') return { sent: false, reason: 'purchase_must_use_sendPurchaseIfPaid' };
  return send(env, pixelId, ev);
}

async function send(env: Env, pixelId: string, ev: MetaEventInput): Promise<{ sent: boolean; reason?: string }> {
  if (!trackingEnabled(env)) return { sent: false, reason: 'disabled_in_this_environment' };
  if (!pixelId) return { sent: false, reason: 'no_pixel' };
  const version = env.META_GRAPH_VERSION || 'v21.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN!)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(await buildPayload(ev)),
  });
  if (!res.ok) {
    console.error('CAPI error', ev.name, res.status, (await res.text()).slice(0, 300));
    return { sent: false, reason: `http_${res.status}` };
  }
  return { sent: true };
}

export interface PaidOrderForCapi {
  id: number;
  order_number: string;
  payment_status: string;
  purchase_event_id: string;
  purchase_sent_at: string | null;
  total: number;
  paid_amount: number | null;
  customer_email: string;
  customer_phone: string;
  customer_name: string;
  client_ip: string;
  user_agent: string;
  fbp: string;
  fbc: string;
  source_url: string;
  gateway: string | null;
}

/**
 * The ONLY path that can emit a Purchase event. Requires:
 *   payment_status === 'paid'  (set exclusively by gateway validation or a human verifying a bank transfer)
 *   PAYMENT_MODE === 'live'    (sandbox payments never reach the production pixel)
 * Idempotent via purchase_sent_at.
 */
export async function sendPurchaseIfPaid(env: Env, pixelId: string, order: PaidOrderForCapi, contentIds: string[]): Promise<{ sent: boolean; reason?: string }> {
  if (order.payment_status !== 'paid') return { sent: false, reason: 'not_paid' };
  if (env.PAYMENT_MODE !== 'live') return { sent: false, reason: 'sandbox_payment' };
  if (order.purchase_sent_at) return { sent: false, reason: 'already_sent' };
  const claimed = await env.DB.prepare("UPDATE orders SET purchase_sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND purchase_sent_at IS NULL AND payment_status = 'paid'")
    .bind(order.id).run();
  if (!claimed.meta.changes) return { sent: false, reason: 'already_sent' };
  const r = await send(env, pixelId, {
    name: 'Purchase',
    eventId: order.purchase_event_id,
    sourceUrl: order.source_url,
    user: { email: order.customer_email, phone: order.customer_phone, firstName: order.customer_name, ip: order.client_ip, userAgent: order.user_agent, fbp: order.fbp, fbc: order.fbc, externalId: order.customer_phone },
    customData: { currency: 'BDT', value: order.paid_amount ?? order.total, content_type: 'product', content_ids: contentIds, order_id: order.order_number },
  });
  if (!r.sent && r.reason !== 'disabled_in_this_environment') {
    // allow a retry later
    await env.DB.prepare('UPDATE orders SET purchase_sent_at = NULL WHERE id = ?').bind(order.id).run();
  }
  return r;
}
