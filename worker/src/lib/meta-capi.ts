import type { Env } from '../env';
import { normalizeBdPhone, sha256Hex } from './util';
import { getSettings } from './settings';

/**
 * Meta Conversions API.
 *
 * Hard rules (docs/SPEC.md §11):
 *  - The browser pixel and CAPI share the same `event_id` for deduplication.
 *  - Purchase is only ever sent from `sendPurchaseIfPaid`, which requires a
 *    gateway-validated (or human-verified) payment AND PAYMENT_MODE = 'live'.
 *  - In any non-production environment nothing is sent at all.
 */
export type MetaEventName = 'PageView' | 'ViewContent' | 'Lead' | 'InitiateCheckout' | 'Purchase' | 'LeadBoxStep';

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
  /** Owner's own browser (?sb_internal=1) or a test run: never sent to Meta. */
  internal?: boolean;
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

/** Crawlers, uptime checks and headless browsers are not people — their hits are never sent. */
export const BOT_UA = /bot\/|bot\b.*\+https?:|crawler|spider|slurp|\+https?:\/\/|HeadlessChrome|Lighthouse|PageSpeed|uptime|facebookexternalhit|curl\/|wget\/|python-requests|node-fetch|axios\/|go-http-client|okhttp/i;

export async function buildPayload(ev: MetaEventInput, testEventCode = '') {
  return {
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
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

/** Record a Conversions API attempt for Admin → ট্র্যাকিং. Successful PageView/ViewContent are sampled (1 in 20) to spare D1 writes. */
async function log(env: Env, ev: MetaEventInput, status: 'sent' | 'failed' | 'skipped', http: number | null, detail: string) {
  if (status === 'sent' && (ev.name === 'PageView' || ev.name === 'ViewContent' || ev.name === 'LeadBoxStep') && Math.random() >= 0.05) return;
  await env.DB.prepare('INSERT INTO tracking_log (event, event_id, status, http_status, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(ev.name, ev.eventId.slice(0, 64), status, http, detail.slice(0, 300)).run().catch(() => {});
}

async function send(env: Env, pixelId: string, ev: MetaEventInput): Promise<{ sent: boolean; reason?: string }> {
  if (!trackingEnabled(env)) return { sent: false, reason: 'disabled_in_this_environment' };
  if (!pixelId) { await log(env, ev, 'skipped', null, 'no_pixel'); return { sent: false, reason: 'no_pixel' }; }
  if (ev.internal) { await log(env, ev, 'skipped', null, 'internal_traffic'); return { sent: false, reason: 'internal_traffic' }; }
  if (ev.user.userAgent && BOT_UA.test(ev.user.userAgent)) { await log(env, ev, 'skipped', null, 'bot'); return { sent: false, reason: 'bot' }; }
  const s = await getSettings(env);
  const version = env.META_GRAPH_VERSION || 'v21.0';
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await buildPayload(ev, s.meta_test_event_code)),
    });
  } catch (e) {
    await log(env, ev, 'failed', null, `network: ${String(e)}`);
    return { sent: false, reason: 'network' };
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    console.error('CAPI error', ev.name, res.status, text);
    await log(env, ev, 'failed', res.status, text);
    return { sent: false, reason: `http_${res.status}` };
  }
  await log(env, ev, 'sent', res.status, s.meta_test_event_code ? `test:${s.meta_test_event_code}` : '');
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
  is_internal?: number;
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
  if (order.is_internal) return { sent: false, reason: 'internal_traffic' };
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
