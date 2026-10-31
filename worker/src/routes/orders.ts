import { Hono, type Context } from 'hono';
import type { AppBindings, Env } from '../env';
import { fail, ok, readJson } from '../lib/http';
import { getSettings, type SiteSettings } from '../lib/settings';
import { findCoupon, loadPricingPackages } from '../lib/catalog';
import { priceCart, PricingError, COUPON_ERROR_BN, type LineSelection, type CartPrice } from '../../../shared/pricing';
import { rateLimit } from '../lib/ratelimit';
import { clampStr, clientIp, isEmail, normalizeBdPhone, randomToken, taka, toInt, bnDigits, nowIso } from '../lib/util';
import { readAttribution } from '../lib/attribution';
import { confirmPayment, getOrder, getOrderByNumber, getOrderItems, newOrderNumber, type OrderRow } from '../lib/orders';
import { portalToken, verifyPortalToken } from '../lib/portal-token';
import { sendMetaEvent } from '../lib/meta-capi';
import { notifyAdmins } from '../lib/audit';
import { sslcommerzConfigured, sslcommerzInit, sslcommerzValidate } from '../lib/payment/sslcommerz';
import { stripeConfigured, stripeCreateSession, stripeVerifyWebhook } from '../lib/payment/stripe';
import { PAYMENT_METHOD_BN, type PaymentMethod } from '../../../shared/status';
import { invoiceHtml } from '../views/pages';

export const orders = new Hono<AppBindings>();

/** Payment methods visible at checkout, based on what is actually configured. */
export function availableMethods(env: Env, s: SiteSettings): { id: PaymentMethod; label: string; hint: string }[] {
  const out: { id: PaymentMethod; label: string; hint: string }[] = [];
  const ssl = s.pay_sslcommerz_enabled && sslcommerzConfigured(env);
  const mfs = s.pay_manual_mfs_enabled;
  if (ssl || (mfs && s.manual_bkash_number)) out.push({ id: 'bkash', label: 'বিকাশ', hint: ssl ? 'নিরাপদ পেমেন্ট পেজে বিকাশ দিয়ে পরিশোধ' : 'সেন্ড মানি করে ট্রানজেকশন আইডি দিন' });
  if (ssl || (mfs && s.manual_nagad_number)) out.push({ id: 'nagad', label: 'নগদ', hint: ssl ? 'নিরাপদ পেমেন্ট পেজে নগদ দিয়ে পরিশোধ' : 'সেন্ড মানি করে ট্রানজেকশন আইডি দিন' });
  if (ssl || (mfs && s.manual_rocket_number)) out.push({ id: 'rocket', label: 'রকেট', hint: ssl ? 'নিরাপদ পেমেন্ট পেজে রকেট দিয়ে পরিশোধ' : 'সেন্ড মানি করে ট্রানজেকশন আইডি দিন' });
  if (ssl) out.push({ id: 'card', label: 'ভিসা / মাস্টারকার্ড', hint: 'ডেবিট বা ক্রেডিট কার্ড' });
  if (s.pay_bank_enabled && s.bank_details.trim()) out.push({ id: 'bank_transfer', label: 'ব্যাংক ট্রান্সফার', hint: 'ট্রান্সফারের পর রেফারেন্স নম্বর দিন — আমরা যাচাই করব' });
  if (s.pay_stripe_enabled && stripeConfigured(env)) out.push({ id: 'stripe', label: 'আন্তর্জাতিক কার্ড', hint: 'দেশের বাইরের ক্লায়েন্টদের জন্য (মার্কিন ডলারে)' });
  return out;
}

const usesGateway = (env: Env, s: SiteSettings, m: PaymentMethod) =>
  m === 'stripe' ? 'stripe' : m === 'bank_transfer' ? 'manual' : s.pay_sslcommerz_enabled && sslcommerzConfigured(env) ? 'sslcommerz' : 'manual';

export function manualInstructions(env: Env, m: PaymentMethod, s: SiteSettings, total: number, orderNo: string): { title: string; lines: string[] } | null {
  const num = m === 'bkash' ? s.manual_bkash_number : m === 'nagad' ? s.manual_nagad_number : m === 'rocket' ? s.manual_rocket_number : '';
  if (m === 'bank_transfer') return { title: 'ব্যাংক ট্রান্সফারের নির্দেশনা', lines: [`মোট ${taka(total)} নিচের হিসাবে পাঠান। রেফারেন্সে লিখুন: ${orderNo}`, s.bank_details] };
  if (['bkash', 'nagad', 'rocket'].includes(m) && s.pay_manual_mfs_enabled && num && usesGateway(env, s, m) === 'manual')
    return { title: `${PAYMENT_METHOD_BN[m]} সেন্ড মানির নির্দেশনা`, lines: [`${num} নম্বরে ${taka(total)} সেন্ড মানি করুন। রেফারেন্সে লিখুন: ${orderNo}`, 'তারপর নিচে ট্রানজেকশন আইডি দিন।'] };
  return null;
}

function parseSelections(raw: unknown): LineSelection[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) fail(422, 'কার্টে কোনো সঠিক প্যাকেজ নেই');
  return raw.map((l: { packageId?: unknown; addons?: unknown }) => ({
    packageId: toInt(l?.packageId),
    addons: Array.isArray(l?.addons) ? l.addons.slice(0, 30).map((a: { addonId?: unknown; quantity?: unknown }) => ({ addonId: toInt(a?.addonId), quantity: toInt(a?.quantity) })) : [],
  }));
}

/** Authoritative price from database values. The client total is never used. */
export async function serverPrice(env: Env, selections: LineSelection[], couponCode: string | null): Promise<CartPrice> {
  const pkgs = await loadPricingPackages(env, selections.map((s) => s.packageId));
  const coupon = await findCoupon(env, couponCode);
  try {
    return priceCart(pkgs, selections, couponCode, coupon, Date.now());
  } catch (e) {
    if (e instanceof PricingError) {
      const msg = { unknown_package: 'একটি প্যাকেজ এখন আর পাওয়া যাচ্ছে না — কার্ট হালনাগাদ করুন', unknown_addon: 'একটি অ্যাড-অন এখন আর পাওয়া যাচ্ছে না', bad_quantity: 'অ্যাড-অনের সংখ্যা সঠিক নয়', empty_cart: 'কার্ট খালি' }[e.code];
      fail(422, msg, e.code);
    }
    throw e;
  }
}

orders.post('/api/pricing/quote', async (c) => {
  await rateLimit(c.env, 'quote', clientIp(c.req.raw), 120, 60);
  const body = await readJson<{ items: unknown; couponCode?: string }>(c);
  const price = await serverPrice(c.env, parseSelections(body.items), clampStr(body.couponCode, 40) || null);
  return ok(c, { ...price, couponMessage: price.couponError ? COUPON_ERROR_BN[price.couponError] : null });
});

async function startPayment(c: Context<AppBindings>, order: OrderRow, productName: string): Promise<{ redirectUrl: string | null }> {
  const s = await getSettings(c.env);
  const via = usesGateway(c.env, s, order.payment_method as PaymentMethod);
  if (via === 'sslcommerz') {
    const tranId = `${order.order_number}-${randomToken(4)}`;
    const r = await sslcommerzInit(c.env, {
      tranId, amount: order.total, method: order.payment_method,
      customer: { name: order.customer_name, email: order.customer_email, phone: order.customer_phone }, productName,
    }).catch((e) => { console.error(e); fail(502, 'পেমেন্ট গেটওয়েতে সংযোগ করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।', 'gateway_error'); });
    await c.env.DB.prepare('UPDATE orders SET gateway = ?, gateway_tran_id = ?, gateway_session = ?, updated_at = ? WHERE id = ?').bind('sslcommerz', tranId, r.sessionKey, nowIso(), order.id).run();
    return { redirectUrl: r.redirectUrl };
  }
  if (via === 'stripe') {
    const cents = Math.ceil((order.total / Math.max(1, s.usd_rate)) * 100);
    const r = await stripeCreateSession(c.env, { orderNumber: order.order_number, amountUsdCents: cents, productName, email: order.customer_email })
      .catch((e) => { console.error(e); fail(502, 'পেমেন্ট গেটওয়েতে সংযোগ করা যায়নি।', 'gateway_error'); });
    await c.env.DB.prepare('UPDATE orders SET gateway = ?, gateway_session = ?, updated_at = ? WHERE id = ?').bind('stripe', r.sessionId, nowIso(), order.id).run();
    return { redirectUrl: r.redirectUrl };
  }
  return { redirectUrl: null }; // manual — order page shows instructions
}

orders.post('/api/orders', async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, 'order', ip, 10, 600);
  const body = await readJson<Record<string, unknown>>(c);
  const s = await getSettings(c.env);

  const name = clampStr(body.name, 100);
  const phone = normalizeBdPhone(clampStr(body.phone, 30));
  const email = clampStr(body.email, 200).toLowerCase();
  const business = clampStr(body.business_name, 150);
  const method = clampStr(body.payment_method, 30) as PaymentMethod;
  if (name.length < 2) fail(422, 'আপনার নাম লিখুন', 'name');
  if (!phone) fail(422, 'সঠিক মোবাইল নম্বর দিন', 'phone');
  if (email && !isEmail(email)) fail(422, 'ইমেইল ঠিকানাটি সঠিক নয়', 'email');
  if (!availableMethods(c.env, s).some((m) => m.id === method)) fail(422, 'পেমেন্ট মাধ্যম বেছে নিন', 'payment_method');
  if (body.agree !== true) fail(422, 'শর্তাবলিতে সম্মতি দিন', 'agree');

  const selections = parseSelections(body.items);
  const couponCode = clampStr(body.couponCode, 40) || null;
  const price = await serverPrice(c.env, selections, couponCode);
  if (price.couponError) fail(422, COUPON_ERROR_BN[price.couponError], 'coupon');
  // If the browser showed a different total (e.g. an offer expired mid-session), tell the client instead of silently charging another amount.
  const expected = toInt(body.expectedTotal, -1);
  if (expected >= 0 && expected !== price.total) {
    return c.json({ ok: false, error: `দাম হালনাগাদ হয়েছে: সর্বশেষ মোট ${taka(price.total)}। অনুগ্রহ করে আবার নিশ্চিত করুন।`, code: 'price_changed', data: price }, 409);
  }

  const attr = readAttribution(body.attribution, c.req.header('cookie') || '');
  const orderNo = await newOrderNumber(c.env);
  const initiateId = `ic_${randomToken(12)}`;
  const purchaseId = `pu_${randomToken(12)}`;
  const ua = clampStr(c.req.header('user-agent'), 400);
  const ins = await c.env.DB.prepare(
    `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, business_name, payment_method, subtotal, offer_discount, coupon_id, coupon_code, coupon_discount, total,
       initiate_event_id, purchase_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc, landing_page_id, referral_code, client_ip, user_agent, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(
    orderNo, name, phone, email, business, method, price.subtotal, price.offerDiscount, price.couponId, price.couponCode, price.couponDiscount, price.total,
    initiateId, purchaseId, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.utm_term, attr.fbclid, attr.fbp, attr.fbc, attr.landing_page_id,
    attr.referral_code || (price.couponCode?.startsWith('REF') ? price.couponCode : ''), ip, ua, attr.source_url || `${c.env.SITE_URL}/checkout`,
  ).first<{ id: number }>();
  const orderId = ins!.id;
  await c.env.DB.batch([
    ...price.lines.map((l) =>
      c.env.DB.prepare('INSERT INTO order_items (order_id, package_id, package_name, base_price, addons, subtotal, offer_id, offer_discount, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(orderId, l.packageId, l.packageName || '', l.basePrice, JSON.stringify(l.addons), l.subtotal, l.offerId, l.offerDiscount, l.total),
    ),
    c.env.DB.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor) VALUES (?, NULL, ?, ?, ?)').bind(orderId, 'pending_payment', 'অর্ডার তৈরি', 'client'),
  ]);
  const order = (await getOrder(c.env, orderId))!;
  const productName = price.lines.map((l) => l.packageName).join(', ');

  // InitiateCheckout: the order now really exists server-side → fire CAPI; browser fires the same event_id.
  c.executionCtx.waitUntil(Promise.all([
    sendMetaEvent(c.env, s.meta_pixel_id, {
      name: 'InitiateCheckout', eventId: initiateId, sourceUrl: order.source_url,
      user: { email, phone, firstName: name, ip, userAgent: ua, fbp: attr.fbp, fbc: attr.fbc, externalId: phone },
      customData: { currency: 'BDT', value: price.total, content_ids: price.lines.map((l) => String(l.packageId)), content_type: 'product', num_items: price.lines.length },
    }),
    notifyAdmins(c.env, 'new_order', `নতুন অর্ডার ${orderNo} — ${taka(price.total)} (পেমেন্টের অপেক্ষায়)`, `#/orders/${orderId}`),
  ]).catch((e) => console.error(e)));

  const pay = await startPayment(c, order, productName);
  const token = await portalToken(c.env, orderNo);
  return ok(c, {
    orderNumber: orderNo,
    token,
    total: price.total,
    initiateEventId: initiateId,
    redirectUrl: pay.redirectUrl,
    orderUrl: `/order/${encodeURIComponent(orderNo)}?t=${token}`,
  }, 201);
});

/** Retry payment for an unpaid order. */
orders.post('/api/orders/:no/pay', async (c) => {
  await rateLimit(c.env, 'pay', clientIp(c.req.raw), 10, 600);
  const no = c.req.param('no');
  const body = await readJson<{ token?: string }>(c);
  if (!(await verifyPortalToken(c.env, no, body.token))) fail(404, 'অর্ডার পাওয়া যায়নি');
  const order = await getOrderByNumber(c.env, no);
  if (!order || order.payment_status === 'paid' || order.project_status === 'cancelled') fail(409, 'এই অর্ডারে নতুন করে পেমেন্টের প্রয়োজন নেই');
  const items = await getOrderItems(c.env, order.id);
  return ok(c, await startPayment(c, order, items.map((i) => i.package_name).join(', ')));
});

/** Manual bank transfer / send-money: client submits TrxID → a human verifies → only then is it 'paid'. */
orders.post('/api/orders/:no/manual-payment', async (c) => {
  await rateLimit(c.env, 'manual', clientIp(c.req.raw), 10, 600);
  const no = c.req.param('no');
  const body = await readJson<{ token?: string; trx_id?: string; sender?: string }>(c);
  if (!(await verifyPortalToken(c.env, no, body.token))) fail(404, 'অর্ডার পাওয়া যায়নি');
  const trx = clampStr(body.trx_id, 60);
  const sender = clampStr(body.sender, 60);
  if (trx.length < 4) fail(422, 'সঠিক ট্রানজেকশন আইডি দিন');
  const r = await c.env.DB.prepare(
    "UPDATE orders SET manual_trx_id = ?, manual_sender = ?, payment_status = 'pending_verification', updated_at = ? WHERE order_number = ? AND payment_status IN ('unpaid','failed')",
  ).bind(trx, sender, nowIso(), no).run();
  if (!r.meta.changes) fail(409, 'এই অর্ডারের পেমেন্ট তথ্য আগেই জমা হয়েছে');
  const o = await getOrderByNumber(c.env, no);
  await notifyAdmins(c.env, 'payment', `পেমেন্ট যাচাই প্রয়োজন: ${no} (ট্রানজেকশন ${trx})`, `#/orders/${o!.id}`);
  return ok(c, { status: 'pending_verification' });
});

/* ---------------- SSLCommerz ---------------- */
async function handleSslValidation(c: Context<AppBindings>, valId: string, tranId: string, source: string): Promise<OrderRow | null> {
  if (!valId || !sslcommerzConfigured(c.env)) return null;
  const v = await sslcommerzValidate(c.env, valId);
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE gateway_tran_id = ?').bind(v.tranId || tranId).first<OrderRow>();
  await c.env.DB.prepare('INSERT OR IGNORE INTO payment_events (gateway, external_id, order_id, status, payload) VALUES (?, ?, ?, ?, ?)')
    .bind('sslcommerz', `${source}:${valId}`, order?.id ?? null, v.valid ? 'valid' : 'invalid', JSON.stringify(v.raw)).run();
  if (!order) return null;
  if (!v.valid || v.tranId !== order.gateway_tran_id || v.currency !== 'BDT' || v.amount + 0.5 < order.total) {
    console.warn('SSLCommerz validation rejected', { order: order.order_number, valid: v.valid, amount: v.amount, currency: v.currency });
    if (order.payment_status === 'unpaid') await c.env.DB.prepare("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status = 'unpaid'").bind(nowIso(), order.id).run();
    return order;
  }
  if (v.riskLevel > 0) {
    // Gateway flagged as risky: hold for a human check instead of auto-confirming.
    await c.env.DB.prepare("UPDATE orders SET payment_status = 'pending_verification', gateway_val_id = ?, manual_trx_id = ?, updated_at = ? WHERE id = ? AND payment_status != 'paid'").bind(v.valId, v.valId, nowIso(), order.id).run();
    await notifyAdmins(c.env, 'payment', `ঝুঁকিপূর্ণ হিসেবে চিহ্নিত পেমেন্ট — যাচাই করুন: ${order.order_number}`, `#/orders/${order.id}`);
    return order;
  }
  await confirmPayment(c.env, order.id, { gateway: 'sslcommerz', tranId: v.tranId, valId: v.valId, amount: v.amount, actor: 'system' }, c.executionCtx);
  return getOrder(c.env, order.id);
}

orders.post('/api/payments/sslcommerz/ipn', async (c) => {
  const form = await c.req.parseBody();
  await handleSslValidation(c, String(form.val_id || ''), String(form.tran_id || ''), 'ipn');
  return c.text('OK');
});

/** Browser return (SSLCommerz POSTs the form to success/fail/cancel URLs). */
const sslReturn = async (c: Context<AppBindings>) => {
  const r = c.req.query('r') || 'fail';
  const form = c.req.method === 'POST' ? await c.req.parseBody() : {};
  const tranId = String(form.tran_id || c.req.query('tran_id') || '');
  let order: OrderRow | null = null;
  if (r === 'success') order = await handleSslValidation(c, String(form.val_id || ''), tranId, 'return');
  if (!order && tranId) order = await c.env.DB.prepare('SELECT * FROM orders WHERE gateway_tran_id = ?').bind(tranId).first<OrderRow>();
  if (!order) return c.redirect('/account');
  const t = await portalToken(c.env, order.order_number);
  return c.redirect(`/order/${encodeURIComponent(order.order_number)}?t=${t}${order.payment_status === 'paid' ? '' : `&r=${r}`}`, 303);
};
orders.post('/payments/sslcommerz/return', sslReturn);
orders.get('/payments/sslcommerz/return', sslReturn);

/* ---------------- Stripe ---------------- */
orders.post('/api/payments/stripe/webhook', async (c) => {
  const payload = await c.req.text();
  if (!(await stripeVerifyWebhook(c.env, payload, c.req.header('stripe-signature')))) return c.text('bad signature', 400);
  const evt = JSON.parse(payload) as { id: string; type: string; data: { object: { id: string; payment_status?: string; client_reference_id?: string; amount_total?: number } } };
  const ins = await c.env.DB.prepare('INSERT OR IGNORE INTO payment_events (gateway, external_id, status, payload) VALUES (?, ?, ?, ?)').bind('stripe', evt.id, evt.type, '{}').run();
  if (!ins.meta.changes) return c.text('duplicate');
  if (evt.type === 'checkout.session.completed' && evt.data.object.payment_status === 'paid') {
    const order = await getOrderByNumber(c.env, evt.data.object.client_reference_id || '');
    if (order && order.gateway_session === evt.data.object.id) {
      // Amount is charged in USD; the BDT order total is what was quoted, verified by session id match.
      await confirmPayment(c.env, order.id, { gateway: 'stripe', tranId: evt.data.object.id, amount: order.total, actor: 'system' }, c.executionCtx);
    }
  }
  return c.text('ok');
});

/* ---------------- Invoice ---------------- */
async function invoiceData(c: Context<AppBindings>, no: string, autoPrint: boolean) {
  const order = await getOrderByNumber(c.env, no);
  if (!order) return null;
  const items = await getOrderItems(c.env, order.id);
  const s = await getSettings(c.env);
  return invoiceHtml({
    settings: s,
    order,
    items: items.map((i) => ({ ...i, addons: JSON.parse(i.addons || '[]') })),
    methodLabel: PAYMENT_METHOD_BN[order.payment_method as PaymentMethod] || order.payment_method,
    autoPrint,
  });
}

orders.get('/invoice/:no', async (c) => {
  const no = c.req.param('no');
  if (!(await verifyPortalToken(c.env, no, c.req.query('t')))) return c.text('পাওয়া যায়নি', 404);
  const order = await getOrderByNumber(c.env, no);
  // Paid invoices: real PDF via Browser Rendering (cached in R2) when the binding exists.
  if (order?.invoice_number && c.env.BROWSER && c.req.query('format') !== 'html') {
    const key = `invoices/${order.invoice_number}.pdf`;
    let obj = await c.env.MEDIA.get(key);
    if (!obj) {
      try {
        const puppeteer = (await import('@cloudflare/puppeteer')).default;
        const browser = await puppeteer.launch(c.env.BROWSER as never);
        const page = await browser.newPage();
        await page.goto(`${c.env.SITE_URL}/invoice/${encodeURIComponent(no)}?t=${c.req.query('t')}&format=html`, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
        await browser.close();
        await c.env.MEDIA.put(key, pdf, { httpMetadata: { contentType: 'application/pdf' } });
        obj = await c.env.MEDIA.get(key);
      } catch (e) {
        console.error('PDF render failed, falling back to printable HTML', e);
      }
    }
    if (obj) return new Response(obj.body, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${order.invoice_number}.pdf"`, 'cache-control': 'private, no-store' } });
  }
  const h = await invoiceData(c, no, c.req.query('format') !== 'html');
  if (!h) return c.text('পাওয়া যায়নি', 404);
  return c.html(h, 200, { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
});

/** Order status lookup (order number + phone). Shows status only; never the portal link or business data. */
orders.post('/api/orders/lookup', async (c) => {
  await rateLimit(c.env, 'lookup', clientIp(c.req.raw), 10, 600);
  const body = await readJson<{ order_number?: string; phone?: string }>(c);
  const o = await getOrderByNumber(c.env, clampStr(body.order_number, 40).toUpperCase());
  const phone = normalizeBdPhone(clampStr(body.phone, 30));
  if (!o || !phone || o.customer_phone !== phone) fail(404, 'এই তথ্যে কোনো অর্ডার পাওয়া যায়নি');
  // Re-send the private portal link to the phone/email on file.
  const { notifyStatusChange } = await import('../lib/notify');
  c.executionCtx.waitUntil(notifyStatusChange(c.env, o, o.project_status, 'আপনার অনুরোধে অর্ডারের লিংক আবার পাঠানো হলো।').catch(() => {}));
  return ok(c, { orderNumber: o.order_number, projectStatus: o.project_status, paymentStatus: o.payment_status, createdAt: o.created_at, total: o.total, totalLabel: taka(o.total), maskedPhone: bnDigits(o.customer_phone.replace(/^(\d{5})\d+(\d{3})$/, '$1•••$2')) });
});
