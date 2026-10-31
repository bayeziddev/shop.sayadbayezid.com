import { Hono, type Context } from 'hono';
import type { AppBindings } from '../env';
import { fail, ok, readJson, requireMedia } from '../lib/http';
import { verifyPortalToken, portalToken } from '../lib/portal-token';
import { changeProjectStatus, getOrderByNumber, getOrderItems, type OrderRow } from '../lib/orders';
import { encryptJson, decryptJson } from '../lib/crypto';
import { clampStr, clientIp, parseJson, randomToken, toInt, nowIso } from '../lib/util';
import { rateLimit } from '../lib/ratelimit';
import { notifyAdmins } from '../lib/audit';
import { PROJECT_STATUS_BN, PAYMENT_STATUS_BN, PAYMENT_METHOD_BN, PROJECT_STATUSES, type ProjectStatus, type PaymentMethod, type PaymentStatus } from '../../../shared/status';

export const portal = new Hono<AppBindings>();

export const REQUIREMENT_FIELDS = [
  { key: 'business_name', label: 'ব্যবসার নাম', type: 'text', required: true, max: 150 },
  { key: 'business_description', label: 'আপনার ব্যবসা সম্পর্কে সংক্ষেপে', type: 'textarea', required: true, max: 3000 },
  { key: 'target_customers', label: 'আপনার ক্রেতা কারা?', type: 'textarea', required: false, max: 1000 },
  { key: 'domain_preference', label: 'পছন্দের ডোমেইন (থাকলে লিখুন)', type: 'text', required: false, max: 200 },
  { key: 'has_domain', label: 'ডোমেইন কি আগেই কেনা আছে?', type: 'select', options: ['হ্যাঁ, কেনা আছে', 'না, কিনে দিতে হবে', 'নিশ্চিত নই'], required: true, max: 50 },
  { key: 'brand_colors', label: 'পছন্দের রং / ব্র্যান্ড কালার', type: 'text', required: false, max: 200 },
  { key: 'reference_sites', label: 'যে সাইটগুলো আপনার ভালো লাগে (লিংক)', type: 'textarea', required: false, max: 2000 },
  { key: 'pages_needed', label: 'যে পেজগুলো লাগবে', type: 'textarea', required: false, max: 1500 },
  { key: 'products_count', label: 'আনুমানিক পণ্য / পোস্ট সংখ্যা', type: 'text', required: false, max: 50 },
  { key: 'content_ready', label: 'লেখা ও ছবি কি প্রস্তুত?', type: 'select', options: ['সব প্রস্তুত', 'কিছু প্রস্তুত', 'এখনো না'], required: true, max: 50 },
  { key: 'social_links', label: 'ফেসবুক পেজ / সোশ্যাল লিংক', type: 'textarea', required: false, max: 1000 },
  { key: 'whatsapp', label: 'কাজের জন্য হোয়াটসঅ্যাপ নম্বর', type: 'text', required: false, max: 30 },
  { key: 'notes', label: 'অন্য কিছু জানাতে চান?', type: 'textarea', required: false, max: 3000 },
] as const;

const EDITABLE_REQ: ProjectStatus[] = ['confirmed', 'requirements_collected'];
const MAX_UPLOAD = 10 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.[\w.]+)|text\/plain)$/;

async function authed(c: Context<AppBindings>): Promise<OrderRow> {
  const no = c.req.param('no') || '';
  const token = c.req.query('t') || c.req.header('x-portal-token') || '';
  if (!(await verifyPortalToken(c.env, no, token))) fail(404, 'অর্ডার পাওয়া যায়নি');
  const order = await getOrderByNumber(c.env, no);
  if (!order) fail(404, 'অর্ডার পাওয়া যায়নি');
  return order;
}

portal.get('/api/portal/:no', async (c) => {
  const o = await authed(c);
  const paid = o.payment_status === 'paid';
  const [items, history, messages, files, req, review, ref] = await Promise.all([
    getOrderItems(c.env, o.id),
    c.env.DB.prepare('SELECT to_status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY id').bind(o.id).all<{ to_status: ProjectStatus; note: string; created_at: string }>(),
    c.env.DB.prepare('SELECT author, kind, body, created_at FROM order_messages WHERE order_id = ? ORDER BY id').bind(o.id).all(),
    c.env.DB.prepare('SELECT id, kind, filename, size, created_at FROM order_files WHERE order_id = ? ORDER BY id').bind(o.id).all<{ id: number; kind: string; filename: string; size: number; created_at: string }>(),
    c.env.DB.prepare('SELECT encrypted_payload, iv, submitted_at, updated_at FROM project_requirements WHERE order_id = ?').bind(o.id).first<{ encrypted_payload: string; iv: string; submitted_at: string; updated_at: string }>(),
    c.env.DB.prepare('SELECT rating, body, status FROM reviews WHERE order_id = ?').bind(o.id).first(),
    o.project_status === 'completed' ? c.env.DB.prepare('SELECT code, discount_value FROM coupons WHERE referrer_order_id = ?').bind(o.id).first<{ code: string; discount_value: number }>() : Promise.resolve(null),
  ]);
  let requirements: Record<string, string> | null = null;
  if (req && paid) requirements = await decryptJson<Record<string, string>>(c.env.DATA_ENCRYPTION_KEY, req.encrypted_payload, req.iv).catch(() => null);
  const deliveredPhase = ['delivered', 'completed'].includes(o.project_status);
  const token = await portalToken(c.env, o.order_number);
  return ok(c, {
    order: {
      orderNumber: o.order_number, invoiceNumber: o.invoice_number, customerName: o.customer_name, businessName: o.business_name,
      total: o.total, subtotal: o.subtotal, offerDiscount: o.offer_discount, couponDiscount: o.coupon_discount, couponCode: o.coupon_code,
      paymentStatus: o.payment_status, paymentStatusLabel: PAYMENT_STATUS_BN[o.payment_status as PaymentStatus],
      paymentMethodLabel: PAYMENT_METHOD_BN[o.payment_method as PaymentMethod] || o.payment_method,
      projectStatus: o.project_status, projectStatusLabel: PROJECT_STATUS_BN[o.project_status],
      createdAt: o.created_at, paidAt: o.paid_at,
      previewUrl: ['client_review', 'revisions', 'delivered', 'completed'].includes(o.project_status) ? o.preview_url : '',
      deliveryLinks: deliveredPhase ? parseJson<{ label: string; url: string }[]>(o.delivery_links, []) : [],
      orderUrl: `/order/${encodeURIComponent(o.order_number)}?t=${token}`,
      invoiceUrl: o.invoice_number ? `/invoice/${encodeURIComponent(o.order_number)}?t=${token}` : null,
    },
    pipeline: PROJECT_STATUSES.filter((s) => s !== 'cancelled').map((s) => ({ key: s, label: PROJECT_STATUS_BN[s] })),
    items: items.map((i) => ({ name: i.package_name, total: i.total, addons: parseJson<{ name?: string; quantity: number }[]>(i.addons, []) })),
    history: history.results.map((h) => ({ ...h, label: PROJECT_STATUS_BN[h.to_status] || h.to_status })),
    messages: messages.results,
    files: files.results.filter((f) => f.kind === 'requirement_asset' || deliveredPhase).map((f) => ({ ...f, url: `/api/portal/${encodeURIComponent(o.order_number)}/files/${f.id}?t=${token}` })),
    requirements: { fields: REQUIREMENT_FIELDS, values: requirements, submittedAt: req?.submitted_at || null, editable: paid && EDITABLE_REQ.includes(o.project_status), locked: !paid },
    canReview: deliveredPhase && !review,
    review,
    canApprove: o.project_status === 'client_review',
    canRequestRevision: ['client_review', 'delivered'].includes(o.project_status),
    referral: ref ? { code: ref.code, percent: ref.discount_value } : null,
  });
});

/** Requirements intake — hard-gated behind a confirmed payment (§5). Stored encrypted. */
portal.post('/api/portal/:no/requirements', async (c) => {
  await rateLimit(c.env, 'req', clientIp(c.req.raw), 20, 600);
  const o = await authed(c);
  if (o.payment_status !== 'paid') fail(403, 'পেমেন্ট নিশ্চিত হওয়ার পর তথ্য জমা দেওয়া যাবে', 'payment_required');
  if (!EDITABLE_REQ.includes(o.project_status)) fail(409, 'ডেভেলপমেন্ট শুরু হয়ে গেছে — পরিবর্তনের জন্য বার্তা পাঠান');
  const b = await readJson<Record<string, unknown>>(c);
  const values: Record<string, string> = {};
  for (const f of REQUIREMENT_FIELDS) {
    const v = clampStr(b[f.key], f.max);
    if (f.required && !v) fail(422, `“${f.label}” পূরণ করুন`, f.key);
    if (f.type === 'select' && v && !(f.options as readonly string[]).includes(v)) fail(422, `“${f.label}” সঠিক নয়`, f.key);
    values[f.key] = v;
  }
  const enc = await encryptJson(c.env.DATA_ENCRYPTION_KEY, values);
  await c.env.DB.prepare(
    `INSERT INTO project_requirements (order_id, encrypted_payload, iv) VALUES (?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET encrypted_payload = excluded.encrypted_payload, iv = excluded.iv, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).bind(o.id, enc.payload, enc.iv).run();
  if (values.business_name && !o.business_name) await c.env.DB.prepare('UPDATE orders SET business_name = ? WHERE id = ?').bind(values.business_name, o.id).run();
  if (o.project_status === 'confirmed') {
    await changeProjectStatus(c.env, o, 'requirements_collected', 'client', 'ক্লায়েন্ট তথ্য জমা দিয়েছেন', { ctx: c.executionCtx });
    await notifyAdmins(c.env, 'client_feedback', `${o.order_number}: ক্লায়েন্ট প্রজেক্টের তথ্য জমা দিয়েছেন`, `#/orders/${o.id}`);
  }
  return ok(c, { saved: true });
});

portal.post('/api/portal/:no/upload', async (c) => {
  await rateLimit(c.env, 'upload', clientIp(c.req.raw), 30, 600);
  const o = await authed(c);
  if (o.payment_status !== 'paid') fail(403, 'পেমেন্ট নিশ্চিত হওয়ার পর ফাইল আপলোড করা যাবে', 'payment_required');
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM order_files WHERE order_id = ? AND kind = 'requirement_asset'").bind(o.id).first<{ n: number }>();
  if ((count?.n || 0) >= 30) fail(422, 'সর্বোচ্চ ৩০টি ফাইল আপলোড করা যায়');
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) fail(422, 'ফাইল বেছে নিন');
  if (file.size > MAX_UPLOAD) fail(422, 'ফাইলের আকার সর্বোচ্চ ১০ মেগাবাইট হতে পারে');
  if (!ALLOWED_TYPES.test(file.type)) fail(422, 'এই ধরনের ফাইল গ্রহণযোগ্য নয় (ছবি, পিডিএফ, ডক বা জিপ দিন)');
  const safeName = file.name.replace(/[^\w.\-ঀ-৿ ]+/g, '_').slice(0, 120) || 'file';
  const key = `private/orders/${o.id}/req/${randomToken(8)}-${safeName}`;
  await requireMedia(c.env).put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  const r = await c.env.DB.prepare("INSERT INTO order_files (order_id, kind, r2_key, filename, content_type, size) VALUES (?, 'requirement_asset', ?, ?, ?, ?) RETURNING id").bind(o.id, key, safeName, file.type, file.size).first<{ id: number }>();
  return ok(c, { id: r!.id, filename: safeName }, 201);
});

portal.get('/api/portal/:no/files/:id', async (c) => {
  const o = await authed(c);
  const f = await c.env.DB.prepare('SELECT * FROM order_files WHERE id = ? AND order_id = ?').bind(toInt(c.req.param('id')), o.id).first<{ r2_key: string; filename: string; content_type: string; kind: string }>();
  if (!f) fail(404, 'ফাইল পাওয়া যায়নি');
  if (f.kind === 'delivery' && !['delivered', 'completed'].includes(o.project_status)) fail(403, 'ডেলিভারির পর ফাইল পাওয়া যাবে');
  const obj = await requireMedia(c.env).get(f.r2_key);
  if (!obj) fail(404, 'ফাইল পাওয়া যায়নি');
  return new Response(obj.body, { headers: { 'content-type': f.content_type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
});

/** Client Review step: free-form feedback, approval, or a revision request. */
portal.post('/api/portal/:no/messages', async (c) => {
  await rateLimit(c.env, 'msg', clientIp(c.req.raw), 20, 600);
  const o = await authed(c);
  if (o.payment_status !== 'paid') fail(403, 'পেমেন্ট নিশ্চিত হওয়ার পর বার্তা পাঠানো যাবে');
  const b = await readJson<{ body?: string; kind?: string }>(c);
  const kind = b.kind === 'approval' ? 'approval' : b.kind === 'revision_request' ? 'revision_request' : 'message';
  const body = clampStr(b.body, 4000) || (kind === 'approval' ? 'প্রিভিউ অনুমোদন করলাম।' : '');
  if (!body) fail(422, 'বার্তা লিখুন');
  if (kind === 'approval' && o.project_status !== 'client_review') fail(409, 'এখন অনুমোদনের ধাপ নয়');
  if (kind === 'revision_request' && !['client_review', 'delivered'].includes(o.project_status)) fail(409, 'এখন সংশোধনের অনুরোধ করা যাবে না');
  await c.env.DB.prepare("INSERT INTO order_messages (order_id, author, kind, body) VALUES (?, 'client', ?, ?)").bind(o.id, kind, body).run();
  if (kind === 'approval') await changeProjectStatus(c.env, o, 'delivered', 'client', 'ক্লায়েন্ট প্রিভিউ অনুমোদন করেছেন', { ctx: c.executionCtx });
  if (kind === 'revision_request') await changeProjectStatus(c.env, o, 'revisions', 'client', body.slice(0, 200), { ctx: c.executionCtx });
  await notifyAdmins(c.env, 'client_feedback', `${o.order_number}: ${kind === 'approval' ? 'ক্লায়েন্ট অনুমোদন দিয়েছেন' : kind === 'revision_request' ? 'ক্লায়েন্ট সংশোধন চেয়েছেন' : 'ক্লায়েন্টের নতুন বার্তা'}`, `#/orders/${o.id}`);
  return ok(c, { saved: true, status: o.project_status });
});

/** Verified review — tied to this real order; still moderated before it appears publicly. */
portal.post('/api/portal/:no/review', async (c) => {
  const o = await authed(c);
  if (!['delivered', 'completed'].includes(o.project_status)) fail(409, 'ডেলিভারির পর রিভিউ দেওয়া যাবে');
  const b = await readJson<{ rating?: number; body?: string; author_name?: string }>(c);
  const rating = toInt(b.rating);
  const body = clampStr(b.body, 2000);
  if (rating < 1 || rating > 5) fail(422, '১ থেকে ৫ এর মধ্যে রেটিং দিন');
  if (body.length < 5) fail(422, 'আপনার অভিজ্ঞতা কয়েক লাইনে লিখুন');
  const items = await getOrderItems(c.env, o.id);
  const r = await c.env.DB.prepare(
    `INSERT INTO reviews (order_id, package_id, author_name, author_business, rating, body, status, is_verified) SELECT ?, ?, ?, ?, ?, ?, 'pending', 1 WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE order_id = ?)`,
  ).bind(o.id, items[0]?.package_id ?? null, clampStr(b.author_name, 100) || o.customer_name, o.business_name, rating, body, o.id).run();
  if (!r.meta.changes) fail(409, 'আপনি আগেই রিভিউ দিয়েছেন');
  await notifyAdmins(c.env, 'review', `${o.order_number}: নতুন রিভিউ (অনুমোদনের অপেক্ষায়)`, '#/reviews');
  return ok(c, { saved: true, at: nowIso() }, 201);
});
