import type { Env } from '../env';
import { canTransition, PROJECT_STATUS_BN, type ProjectStatus } from '../../../shared/status';
import { audit, notifyAdmins } from './audit';
import { sendPurchaseIfPaid, type PaidOrderForCapi } from './meta-capi';
import { notifyStatusChange, notifyAdminEmail } from './notify';
import { getSettings } from './settings';
import { nowIso, randomToken, taka } from './util';

/** Anything with waitUntil (ExecutionContext). */
export type Waiter = { waitUntil(p: Promise<unknown>): void };

export interface OrderRow extends PaidOrderForCapi {
  invoice_number: string | null;
  business_name: string;
  payment_method: string;
  project_status: ProjectStatus;
  subtotal: number;
  offer_discount: number;
  coupon_id: number | null;
  coupon_code: string | null;
  coupon_discount: number;
  currency: string;
  gateway_session: string | null;
  gateway_tran_id: string | null;
  gateway_val_id: string | null;
  manual_trx_id: string | null;
  manual_sender: string | null;
  paid_at: string | null;
  initiate_event_id: string;
  utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; utm_term: string;
  fbclid: string;
  landing_page_id: number | null;
  referral_code: string;
  internal_notes: string;
  preview_url: string;
  delivery_links: string;
  assigned_admin_id: number | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow { id: number; order_id: number; package_id: number; package_name: string; base_price: number; addons: string; subtotal: number; offer_id: number | null; offer_discount: number; total: number }

export async function nextCounter(env: Env, name: 'invoice' | 'order'): Promise<number> {
  const r = await env.DB.prepare('UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value').bind(name).first<{ value: number }>();
  if (!r) {
    await env.DB.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)').bind(name).run();
    return nextCounter(env, name);
  }
  return r.value;
}

export function formatInvoiceNumber(n: number, date = new Date()): string {
  return `INV-${date.getUTCFullYear()}-${String(n).padStart(6, '0')}`;
}

export async function newOrderNumber(env: Env): Promise<string> {
  const n = await nextCounter(env, 'order');
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `ORD-${ymd}-${String(n).padStart(4, '0')}`;
}

export const getOrder = (env: Env, id: number) => env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
export const getOrderByNumber = (env: Env, no: string) => env.DB.prepare('SELECT * FROM orders WHERE order_number = ?').bind(no).first<OrderRow>();
export const getOrderItems = async (env: Env, id: number) => (await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(id).all<OrderItemRow>()).results;

/** Move a project along the pipeline; records history and notifies the client. */
export async function changeProjectStatus(
  env: Env,
  order: OrderRow,
  to: ProjectStatus,
  actor: string,
  note = '',
  opts: { force?: boolean; ctx?: Waiter } = {},
): Promise<void> {
  const from = order.project_status;
  if (from === to) return;
  if (!opts.force && !canTransition(from, to)) throw new Error(`invalid_transition:${from}->${to}`);
  if (to !== 'cancelled' && to !== 'pending_payment' && order.payment_status !== 'paid') throw new Error('payment_required');
  const r = await env.DB.prepare('UPDATE orders SET project_status = ?, status_changed_at = ?, updated_at = ? WHERE id = ? AND project_status = ?')
    .bind(to, nowIso(), nowIso(), order.id, from).run();
  if (!r.meta.changes) throw new Error('concurrent_update');
  await env.DB.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor) VALUES (?, ?, ?, ?, ?)').bind(order.id, from, to, note, actor).run();
  order.project_status = to;
  const p = notifyStatusChange(env, order, to, note).catch((e) => console.error('notify failed', e));
  if (opts.ctx) opts.ctx.waitUntil(p);
  else await p;
}

export interface PaymentConfirmation {
  gateway: 'sslcommerz' | 'stripe' | 'manual';
  tranId?: string;
  valId?: string;
  amount: number; // BDT
  actor: string; // 'system' (gateway) or 'admin:<id>' (verified bank transfer / MFS)
}

/**
 * The single place where an order becomes paid. Idempotent.
 * Assigns the sequential invoice number, moves the project to `confirmed`,
 * consumes coupon usage, issues a referral code, notifies everyone and
 * (only in live mode) sends the Purchase event.
 */
export async function confirmPayment(env: Env, orderId: number, p: PaymentConfirmation, ctx?: Waiter): Promise<{ changed: boolean }> {
  const order = await getOrder(env, orderId);
  if (!order) throw new Error('order_not_found');
  if (order.payment_status === 'paid') return { changed: false };
  if (order.project_status === 'cancelled') throw new Error('order_cancelled');
  if (p.amount + 0.5 < order.total) throw new Error('amount_mismatch');

  const now = nowIso();
  // Claim the order first; only the winner allocates an invoice number, so the sequence has no gaps.
  const upd = await env.DB.prepare(
    `UPDATE orders SET payment_status = 'paid', paid_at = ?, paid_amount = ?, gateway = ?, gateway_tran_id = COALESCE(?, gateway_tran_id), gateway_val_id = COALESCE(?, gateway_val_id),
       project_status = 'confirmed', status_changed_at = ?, updated_at = ? WHERE id = ? AND payment_status != 'paid'`,
  ).bind(now, Math.round(p.amount), p.gateway, p.tranId ?? null, p.valId ?? null, now, now, orderId).run();
  if (!upd.meta.changes) return { changed: false };
  const invoiceNo = formatInvoiceNumber(await nextCounter(env, 'invoice'));
  await env.DB.prepare('UPDATE orders SET invoice_number = ? WHERE id = ?').bind(invoiceNo, orderId).run();

  const stmts = [
    env.DB.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor) VALUES (?, ?, ?, ?, ?)').bind(orderId, order.project_status, 'confirmed', `পেমেন্ট নিশ্চিত (${p.gateway})`, p.actor),
  ];
  if (order.coupon_id) stmts.push(env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').bind(order.coupon_id));
  await env.DB.batch(stmts);

  const fresh = (await getOrder(env, orderId))!;
  const items = await getOrderItems(env, orderId);
  const settings = await getSettings(env);

  const work = (async () => {
    await notifyAdmins(env, 'payment', `পেমেন্ট নিশ্চিত: ${fresh.order_number} — ${taka(fresh.total)}`, `#/orders/${orderId}`);
    await notifyAdminEmail(env, `নতুন পেমেন্ট: ${fresh.order_number}`, `${fresh.customer_name} (${fresh.customer_phone}) ${taka(fresh.total)} পরিশোধ করেছেন।`);
    await notifyStatusChange(env, fresh, 'confirmed');
    await sendPurchaseIfPaid(env, settings.meta_pixel_id, fresh, items.map((i) => String(i.package_id)));
  })().catch((e) => console.error('post-payment work failed', e));
  if (ctx) ctx.waitUntil(work);
  else await work;
  return { changed: true };
}

/** Issue a one-per-client referral coupon when a project completes. */
export async function issueReferralCoupon(env: Env, order: OrderRow): Promise<string | null> {
  const s = await getSettings(env);
  if (!s.referral_enabled || s.referral_percent <= 0) return null;
  const existing = await env.DB.prepare('SELECT code FROM coupons WHERE referrer_order_id = ?').bind(order.id).first<{ code: string }>();
  if (existing) return existing.code;
  const code = `REF${randomToken(4).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)}`;
  await env.DB.prepare(
    "INSERT INTO coupons (code, description, discount_type, discount_value, scope, referrer_order_id) VALUES (?, ?, 'percent', ?, 'sitewide', ?)",
  ).bind(code, `রেফারেল — ${order.customer_name} (${order.order_number})`, s.referral_percent, order.id).run();
  return code;
}

export async function cancelOrder(env: Env, order: OrderRow, actor: string, note: string): Promise<void> {
  await changeProjectStatus(env, order, 'cancelled', actor, note, { force: true });
}

export const statusLabel = (s: ProjectStatus) => PROJECT_STATUS_BN[s];

export { audit };
