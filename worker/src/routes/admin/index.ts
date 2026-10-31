import { Hono } from 'hono';
import type { AppBindings, AdminUser } from '../../env';
import { fail, ok, readJson } from '../../lib/http';
import { createSession, destroySession, requireAdmin, requirePerm, assertPerm } from '../../lib/auth';
import { permissionsFor } from '../../lib/rbac';
import { hashPassword, verifyPassword, decryptJson } from '../../lib/crypto';
import { rateLimit } from '../../lib/ratelimit';
import { audit } from '../../lib/audit';
import { clampStr, clientIp, nowIso, parseJson, safeEqual, toInt, randomToken, taka } from '../../lib/util';
import { getSettings, saveSettings, SETTINGS_DEFAULTS, type SiteSettings } from '../../lib/settings';
import { registerResources } from './resources';
import { listRows, toCsv, csvResponse, type ResourceDef } from './crud';
import { changeProjectStatus, confirmPayment, getOrder, getOrderItems, issueReferralCoupon } from '../../lib/orders';
import { portalToken } from '../../lib/portal-token';
import { PROJECT_STATUSES, PROJECT_STATUS_BN, TRANSITIONS, LEAD_STATUSES, type ProjectStatus } from '../../../../shared/status';
import { buildProvider, getAIConfig, keyStatus, PROVIDER_SECRETS, PROVIDER_DEFAULT_MODELS, type AIConfigRow } from '../../lib/ai-providers';
import { sslcommerzConfigured } from '../../lib/payment/sslcommerz';
import { stripeConfigured } from '../../lib/payment/stripe';
import { REQUIREMENT_FIELDS } from '../portal';

export const admin = new Hono<AppBindings>();

/* ---------------- Auth (public part) ---------------- */
admin.get('/auth/status', async (c) => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  return ok(c, { needsSetup: (n?.n || 0) === 0 });
});

/** First-run: create the first Super Admin. Requires the ADMIN_SETUP_TOKEN secret, and only works while no admin exists. */
admin.post('/auth/setup', async (c) => {
  await rateLimit(c.env, 'setup', clientIp(c.req.raw), 5, 900);
  const b = await readJson<{ token?: string; name?: string; email?: string; password?: string }>(c);
  if (!c.env.ADMIN_SETUP_TOKEN || !b.token || !safeEqual(b.token, c.env.ADMIN_SETUP_TOKEN)) fail(403, 'সেটআপ টোকেন সঠিক নয়');
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  if ((n?.n || 0) > 0) fail(409, 'সেটআপ আগেই সম্পন্ন হয়েছে');
  const email = clampStr(b.email, 200).toLowerCase();
  const name = clampStr(b.name, 100);
  if (!email.includes('@') || !name) fail(422, 'নাম ও ইমেইল দিন');
  if (!b.password || b.password.length < 10) fail(422, 'পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে');
  const r = await c.env.DB.prepare("INSERT INTO admins (email, name, password_hash, role) VALUES (?, ?, ?, 'super_admin') RETURNING id").bind(email, name, await hashPassword(b.password)).first<{ id: number }>();
  await audit(c.env, r!.id, 'setup', 'admin', r!.id, { email }, clientIp(c.req.raw));
  return ok(c, { created: true }, 201);
});

admin.post('/auth/login', async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, 'login-ip', ip, 10, 900);
  const b = await readJson<{ email?: string; password?: string }>(c);
  const email = clampStr(b.email, 200).toLowerCase();
  await rateLimit(c.env, 'login-user', email || 'none', 8, 900);
  const row = await c.env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first<AdminUser & { password_hash: string; is_active: number }>();
  // Always run a hash to keep timing similar for unknown users.
  const valid = row ? await verifyPassword(b.password || '', row.password_hash) : (await hashPassword('timing-equaliser'), false);
  if (!row || !valid || !row.is_active) {
    await audit(c.env, row?.id ?? null, 'login_failed', 'admin', row?.id ?? null, { email }, ip);
    fail(401, 'ইমেইল বা পাসওয়ার্ড সঠিক নয়');
  }
  await createSession(c, { id: row.id, email: row.email, name: row.name, role: row.role });
  await c.env.DB.prepare('UPDATE admins SET last_login_at = ?, last_seen_at = ? WHERE id = ?').bind(nowIso(), nowIso(), row.id).run();
  await audit(c.env, row.id, 'login', 'admin', row.id, {}, ip);
  return ok(c, { name: row.name, role: row.role });
});

/* ---------------- Everything below requires a session ---------------- */
admin.use('*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p.endsWith('/auth/login') || p.endsWith('/auth/setup') || p.endsWith('/auth/status')) return next();
  return requireAdmin(c, next);
});

admin.post('/auth/logout', async (c) => {
  await destroySession(c);
  return ok(c, { loggedOut: true });
});

admin.get('/auth/me', (c) => {
  const a = c.get('admin');
  return ok(c, { ...a, permissions: permissionsFor(a.role) });
});

admin.post('/auth/password', async (c) => {
  const a = c.get('admin');
  const b = await readJson<{ current?: string; next?: string }>(c);
  const row = await c.env.DB.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(a.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(b.current || '', row.password_hash))) fail(422, 'বর্তমান পাসওয়ার্ড সঠিক নয়');
  if (!b.next || b.next.length < 10) fail(422, 'নতুন পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে');
  await c.env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.next), a.id).run();
  await audit(c.env, a.id, 'password_change', 'admin', a.id, {}, clientIp(c.req.raw));
  return ok(c, { changed: true });
});

registerResources(admin);

/* ---------------- Dashboard ---------------- */
function health(c: { env: AppBindings['Bindings'] }, s: SiteSettings) {
  const e = c.env;
  return [
    { key: 'payment', label: 'অনলাইন পেমেন্ট (এসএসএলকমার্জ)', ok: sslcommerzConfigured(e) && s.pay_sslcommerz_enabled, hint: sslcommerzConfigured(e) ? (e.PAYMENT_MODE === 'live' ? 'লাইভ মোড' : 'স্যান্ডবক্স মোড — আসল টাকা নেওয়া হচ্ছে না') : 'স্টোর আইডি ও পাসওয়ার্ড সিক্রেট যোগ করুন' },
    { key: 'bank', label: 'ব্যাংক ট্রান্সফার', ok: s.pay_bank_enabled && !!s.bank_details.trim(), hint: 'সিস্টেম সেটিংসে ব্যাংকের নাম, হিসাব নম্বর ও শাখা দিন' },
    { key: 'stripe', label: 'আন্তর্জাতিক কার্ড', ok: stripeConfigured(e) && s.pay_stripe_enabled, hint: 'ঐচ্ছিক' },
    { key: 'pixel', label: 'মেটা পিক্সেল', ok: !!s.meta_pixel_id, hint: s.meta_pixel_id ? '' : 'পিক্সেল আইডি দিন' },
    { key: 'capi', label: 'কনভার্সন এপিআই', ok: !!e.META_CAPI_TOKEN && e.APP_ENV === 'production', hint: e.META_CAPI_TOKEN ? (e.APP_ENV === 'production' ? '' : 'শুধু প্রোডাকশনে চালু হয়') : 'META_CAPI_TOKEN সিক্রেট যোগ করুন' },
    { key: 'ga4', label: 'গুগল অ্যানালিটিক্স', ok: !!s.ga4_id, hint: '' },
    { key: 'clarity', label: 'মাইক্রোসফট ক্ল্যারিটি', ok: !!s.clarity_id, hint: 'ঐচ্ছিক — হিটম্যাপের জন্য' },
    { key: 'ai', label: 'এআই কনটেন্ট (জেমিনি)', ok: !!e.GEMINI_API_KEY, hint: 'GEMINI_API_KEY সিক্রেট যোগ করুন' },
    { key: 'email', label: 'ইমেইল নোটিফিকেশন', ok: !!(e.RESEND_API_KEY && e.EMAIL_FROM), hint: 'ঐচ্ছিক' },
    { key: 'sms', label: 'এসএমএস নোটিফিকেশন', ok: !!e.SMS_API_URL, hint: 'ঐচ্ছিক' },
    { key: 'whatsapp', label: 'হোয়াটসঅ্যাপ নোটিফিকেশন', ok: !!(e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID), hint: 'ঐচ্ছিক' },
    { key: 'encryption', label: 'তথ্য এনক্রিপশন কী', ok: !!e.DATA_ENCRYPTION_KEY, hint: 'আবশ্যক — DATA_ENCRYPTION_KEY' },
  ];
}

admin.get('/dashboard', async (c) => {
  const s = await getSettings(c.env);
  const dhakaMidnight = new Date(Math.floor((Date.now() + 6 * 3600_000) / 86_400_000) * 86_400_000 - 6 * 3600_000).toISOString();
  const stuckBefore = new Date(Date.now() - s.stuck_threshold_days * 86_400_000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const db = c.env.DB;
  const [kpi, chart, recent, newLeads, chats, stuck, pendingPay, pendingReviews, onboarding, online] = await db.batch([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM orders WHERE created_at >= ?1) AS orders_today,
      (SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE payment_status='paid' AND paid_at >= ?1) AS revenue_today,
      (SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE payment_status='paid' AND paid_at >= ?2) AS revenue_30d,
      (SELECT COUNT(*) FROM leads WHERE created_at >= ?1) AS leads_today,
      (SELECT COUNT(*) FROM chat_conversations WHERE status='escalated') AS active_chats,
      (SELECT COUNT(*) FROM orders WHERE project_status IN ('confirmed','requirements_collected','in_development','client_review','revisions')) AS awaiting_delivery`).bind(dhakaMidnight, since30),
    db.prepare(`SELECT substr(datetime(paid_at, '+6 hours'), 1, 10) AS day, COUNT(*) AS orders, SUM(paid_amount) AS revenue FROM orders WHERE payment_status='paid' AND paid_at >= ? GROUP BY day ORDER BY day`).bind(since30),
    db.prepare(`SELECT id, order_number, customer_name, total, payment_status, project_status, created_at FROM orders ORDER BY id DESC LIMIT 8`),
    db.prepare(`SELECT id, name, phone, source, created_at FROM leads WHERE status = 'new' ORDER BY id DESC LIMIT 10`),
    db.prepare(`SELECT id, session_id, visitor_name, visitor_phone, lead_id, updated_at FROM chat_conversations WHERE status = 'escalated' ORDER BY updated_at DESC LIMIT 10`),
    db.prepare(`SELECT id, order_number, customer_name, project_status, status_changed_at FROM orders WHERE project_status IN ('confirmed','requirements_collected','in_development','client_review','revisions') AND status_changed_at < ? ORDER BY status_changed_at LIMIT 10`).bind(stuckBefore),
    db.prepare(`SELECT id, order_number, customer_name, total, manual_trx_id FROM orders WHERE payment_status = 'pending_verification' ORDER BY id LIMIT 10`),
    db.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'`),
    db.prepare(`SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM packages) AS packages, (SELECT COUNT(*) FROM packages WHERE demo_url != '') AS with_demo, (SELECT whatsapp_number != '' OR messenger_page != '' FROM chat_settings WHERE id = 1) AS chat_connected`),
    db.prepare(`SELECT id, name, role, last_seen_at FROM admins WHERE is_active = 1 ORDER BY last_seen_at DESC`),
  ]);
  const ob = onboarding.results[0] as { categories: number; packages: number; with_demo: number; chat_connected: number };
  const h = health(c, s);
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  return ok(c, {
    kpi: kpi.results[0],
    chart: chart.results,
    recentOrders: recent.results,
    attention: { newLeads: newLeads.results, escalatedChats: chats.results, stuckOrders: stuck.results, pendingPayments: pendingPay.results, pendingReviews: (pendingReviews.results[0] as { n: number }).n },
    health: h,
    onboarding: s.onboarding_dismissed ? null : [
      { key: 'category', label: 'প্রথম ক্যাটাগরি যোগ করুন', done: ob.categories > 0, link: '#/categories' },
      { key: 'package', label: 'প্রথম প্যাকেজ ও লাইভ ডেমো লিংক যোগ করুন', done: ob.with_demo > 0, link: '#/packages' },
      { key: 'payment', label: 'একটি পেমেন্ট মাধ্যম সংযুক্ত করুন', done: h.find((x) => x.key === 'payment')!.ok || h.find((x) => x.key === 'bank')!.ok, link: '#/settings' },
      { key: 'chat', label: 'হোয়াটসঅ্যাপ / মেসেঞ্জার সংযুক্ত করুন', done: !!ob.chat_connected, link: '#/chat-settings' },
    ],
    staff: (online.results as { id: number; name: string; role: string; last_seen_at: string | null }[]).map((a) => ({ ...a, online: !!a.last_seen_at && a.last_seen_at > fiveMinAgo })),
    statusLabels: PROJECT_STATUS_BN,
  });
});

/* ---------------- Orders / projects ---------------- */
const ordersList: ResourceDef = {
  table: 'orders', entity: 'order', writePerm: 'orders.write', fields: [],
  searchCols: ['order_number', 'invoice_number', 'customer_name', 'customer_phone', 'customer_email', 'business_name'],
  filterCols: ['project_status', 'payment_status', 'payment_method', 'utm_campaign'], orderBy: 'id DESC',
};

admin.get('/orders', async (c) => ok(c, await listRows(c, ordersList)));

admin.get('/orders/export.csv', requirePerm('export'), async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 10000').all<Record<string, unknown>>()).results;
  await audit(c.env, c.get('admin').id, 'export', 'orders', null, { count: rows.length }, clientIp(c.req.raw));
  return csvResponse('orders', toCsv(rows.map((r) => ({ ...r, project_status: PROJECT_STATUS_BN[r.project_status as ProjectStatus] })), [
    { key: 'order_number', label: 'অর্ডার নম্বর' }, { key: 'invoice_number', label: 'ইনভয়েস নম্বর' }, { key: 'created_at', label: 'তারিখ' },
    { key: 'customer_name', label: 'নাম' }, { key: 'customer_phone', label: 'ফোন' }, { key: 'customer_email', label: 'ইমেইল' }, { key: 'business_name', label: 'ব্যবসা' },
    { key: 'total', label: 'মোট' }, { key: 'payment_method', label: 'পেমেন্ট মাধ্যম' }, { key: 'payment_status', label: 'পেমেন্ট অবস্থা' }, { key: 'project_status', label: 'প্রজেক্ট অবস্থা' },
    { key: 'coupon_code', label: 'কুপন' }, { key: 'utm_source', label: 'ইউটিএম সোর্স' }, { key: 'utm_campaign', label: 'ইউটিএম ক্যাম্পেইন' }, { key: 'utm_content', label: 'ইউটিএম কনটেন্ট' }, { key: 'landing_page_id', label: 'ল্যান্ডিং পেজ' },
  ]));
});

admin.get('/orders/:id', async (c) => {
  const id = toInt(c.req.param('id'));
  const o = await getOrder(c.env, id);
  if (!o) fail(404, 'অর্ডার পাওয়া যায়নি');
  const [items, history, messages, files, req] = await Promise.all([
    getOrderItems(c.env, id),
    c.env.DB.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id').bind(id).all(),
    c.env.DB.prepare('SELECT m.*, a.name AS admin_name FROM order_messages m LEFT JOIN admins a ON a.id = m.admin_id WHERE order_id = ? ORDER BY m.id').bind(id).all(),
    c.env.DB.prepare('SELECT id, kind, filename, size, content_type, created_at FROM order_files WHERE order_id = ? ORDER BY id').bind(id).all(),
    c.env.DB.prepare('SELECT submitted_at, updated_at FROM project_requirements WHERE order_id = ?').bind(id).first(),
  ]);
  const token = await portalToken(c.env, o.order_number);
  return ok(c, {
    order: { ...o, delivery_links: parseJson(o.delivery_links, []) },
    items: items.map((i) => ({ ...i, addons: parseJson(i.addons, []) })),
    history: history.results, messages: messages.results, files: files.results,
    requirementsSubmitted: req,
    nextStatuses: o.payment_status === 'paid' ? TRANSITIONS[o.project_status] : ['cancelled'],
    portalUrl: `/portal/${encodeURIComponent(o.order_number)}?t=${token}`,
    invoiceUrl: `/invoice/${encodeURIComponent(o.order_number)}?t=${token}`,
  });
});

/** Decrypt client requirements — restricted & audit-logged (treated like payment data). */
admin.get('/orders/:id/requirements', requirePerm('requirements.read'), async (c) => {
  const id = toInt(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT * FROM project_requirements WHERE order_id = ?').bind(id).first<{ encrypted_payload: string; iv: string; submitted_at: string }>();
  if (!r) fail(404, 'ক্লায়েন্ট এখনো তথ্য জমা দেননি');
  const values = await decryptJson<Record<string, string>>(c.env.DATA_ENCRYPTION_KEY, r.encrypted_payload, r.iv).catch(() => fail(500, 'তথ্য ডিক্রিপ্ট করা যায়নি — এনক্রিপশন কী পরীক্ষা করুন'));
  await audit(c.env, c.get('admin').id, 'view_requirements', 'order', id, {}, clientIp(c.req.raw));
  return ok(c, { fields: REQUIREMENT_FIELDS, values, submittedAt: r.submitted_at });
});

admin.post('/orders/:id/status', requirePerm('orders.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ status?: string; note?: string }>(c);
  const o = await getOrder(c.env, id);
  if (!o) fail(404, 'অর্ডার পাওয়া যায়নি');
  const to = b.status as ProjectStatus;
  if (!PROJECT_STATUSES.includes(to)) fail(422, 'অবস্থা সঠিক নয়');
  if (to === 'confirmed') fail(422, '“নিশ্চিত” অবস্থা শুধু পেমেন্ট নিশ্চিত হলেই আসে');
  if (to === 'cancelled') assertPerm(c, 'orders.payment');
  if (to === 'client_review' && !o.preview_url) fail(422, 'ক্লায়েন্ট রিভিউর আগে প্রিভিউ লিংক যোগ করুন');
  try {
    await changeProjectStatus(c.env, o, to, `admin:${c.get('admin').id}`, clampStr(b.note, 500), { ctx: c.executionCtx, force: to === 'cancelled' });
  } catch (e) {
    const m = String((e as Error).message);
    if (m === 'payment_required') fail(422, 'পেমেন্ট নিশ্চিত না হওয়া পর্যন্ত প্রজেক্ট এগোনো যাবে না');
    if (m.startsWith('invalid_transition')) fail(422, `“${PROJECT_STATUS_BN[o.project_status]}” থেকে “${PROJECT_STATUS_BN[to]}” এ সরাসরি যাওয়া যায় না`);
    if (m === 'concurrent_update') fail(409, 'অন্য কেউ এইমাত্র অবস্থা বদলেছেন — পেজ রিফ্রেশ করুন');
    throw e;
  }
  if (to === 'completed') await issueReferralCoupon(c.env, o);
  await audit(c.env, c.get('admin').id, 'status', 'order', id, { to, note: b.note }, clientIp(c.req.raw));
  return ok(c, { status: to });
});

/** A human verified a bank transfer / send-money TrxID (or a risk-flagged gateway payment) against the statement. */
admin.post('/orders/:id/verify-payment', requirePerm('orders.payment'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ amount?: number; confirm?: boolean }>(c);
  const o = await getOrder(c.env, id);
  if (!o) fail(404, 'অর্ডার পাওয়া যায়নি');
  if (b.confirm !== true) fail(422, 'নিশ্চিত করুন যে টাকা আসলেই হিসাবে জমা হয়েছে');
  if (!['pending_verification', 'unpaid', 'failed'].includes(o.payment_status)) fail(409, 'এই অর্ডারের পেমেন্ট যাচাইয়ের প্রয়োজন নেই');
  const amount = toInt(b.amount, -1);
  if (amount < o.total) fail(422, `প্রাপ্ত টাকা মোট মূল্যের (${taka(o.total)}) চেয়ে কম`);
  await confirmPayment(c.env, id, { gateway: 'manual', tranId: o.manual_trx_id || undefined, amount, actor: `admin:${c.get('admin').id}` }, c.executionCtx);
  await audit(c.env, c.get('admin').id, 'verify_payment', 'order', id, { amount, trx: o.manual_trx_id }, clientIp(c.req.raw));
  return ok(c, { paid: true });
});

admin.post('/orders/:id/reject-payment', requirePerm('orders.payment'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ note?: string }>(c);
  const r = await c.env.DB.prepare("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status = 'pending_verification'").bind(nowIso(), id).run();
  if (!r.meta.changes) fail(409, 'এই অর্ডারের পেমেন্ট যাচাইয়ের অপেক্ষায় নেই');
  await audit(c.env, c.get('admin').id, 'reject_payment', 'order', id, { note: b.note }, clientIp(c.req.raw));
  return ok(c, { rejected: true });
});

admin.put('/orders/:id', requirePerm('orders.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ internal_notes?: string; preview_url?: string; delivery_links?: { label: string; url: string }[]; assigned_admin_id?: number | null }>(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (b.internal_notes !== undefined) { sets.push('internal_notes = ?'); binds.push(clampStr(b.internal_notes, 10000)); }
  if (b.preview_url !== undefined) {
    const u = clampStr(b.preview_url, 500);
    if (u && !/^https?:\/\//.test(u)) fail(422, 'প্রিভিউ লিংক https:// দিয়ে শুরু হতে হবে');
    sets.push('preview_url = ?'); binds.push(u);
  }
  if (Array.isArray(b.delivery_links)) {
    const links = b.delivery_links.slice(0, 20).map((l) => ({ label: clampStr(l.label, 100), url: clampStr(l.url, 500) })).filter((l) => /^https?:\/\//.test(l.url));
    sets.push('delivery_links = ?'); binds.push(JSON.stringify(links));
  }
  if (b.assigned_admin_id !== undefined) { sets.push('assigned_admin_id = ?'); binds.push(b.assigned_admin_id ? toInt(b.assigned_admin_id) : null); }
  if (!sets.length) fail(422, 'পরিবর্তনের কিছু নেই');
  sets.push('updated_at = ?'); binds.push(nowIso());
  await c.env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  await audit(c.env, c.get('admin').id, 'update', 'order', id, { fields: Object.keys(b) }, clientIp(c.req.raw));
  return ok(c, { saved: true });
});

admin.post('/orders/:id/messages', requirePerm('orders.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ body?: string }>(c);
  const body = clampStr(b.body, 4000);
  if (!body) fail(422, 'বার্তা লিখুন');
  await c.env.DB.prepare("INSERT INTO order_messages (order_id, author, admin_id, kind, body) VALUES (?, 'admin', ?, 'message', ?)").bind(id, c.get('admin').id, body).run();
  return ok(c, { saved: true }, 201);
});

admin.post('/orders/:id/files', requirePerm('orders.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  if (!(await getOrder(c.env, id))) fail(404, 'অর্ডার পাওয়া যায়নি');
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) fail(422, 'ফাইল বেছে নিন');
  if (file.size > 95 * 1024 * 1024) fail(422, 'ফাইল খুব বড় (সর্বোচ্চ ৯৫ মেগাবাইট) — বড় ফাইলের জন্য ডেলিভারি লিংক ব্যবহার করুন');
  const safeName = file.name.replace(/[^\w.\-ঀ-৿ ]+/g, '_').slice(0, 120) || 'file';
  const key = `private/orders/${id}/delivery/${randomToken(8)}-${safeName}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  await c.env.DB.prepare("INSERT INTO order_files (order_id, kind, r2_key, filename, content_type, size) VALUES (?, 'delivery', ?, ?, ?, ?)").bind(id, key, safeName, file.type || 'application/octet-stream', file.size).run();
  await audit(c.env, c.get('admin').id, 'upload', 'order', id, { filename: safeName }, clientIp(c.req.raw));
  return ok(c, { uploaded: true }, 201);
});

admin.get('/orders/:id/files/:fid', async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM order_files WHERE id = ? AND order_id = ?').bind(toInt(c.req.param('fid')), toInt(c.req.param('id'))).first<{ r2_key: string; filename: string; content_type: string; kind: string }>();
  if (!f) fail(404, 'ফাইল পাওয়া যায়নি');
  if (f.kind === 'requirement_asset') assertPerm(c, 'requirements.read');
  const obj = await c.env.MEDIA.get(f.r2_key);
  if (!obj) fail(404, 'ফাইল পাওয়া যায়নি');
  return new Response(obj.body, { headers: { 'content-type': f.content_type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`, 'cache-control': 'private, no-store' } });
});

admin.delete('/orders/:id/files/:fid', requirePerm('orders.write'), async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM order_files WHERE id = ? AND order_id = ?').bind(toInt(c.req.param('fid')), toInt(c.req.param('id'))).first<{ id: number; r2_key: string }>();
  if (!f) fail(404, 'ফাইল পাওয়া যায়নি');
  await c.env.MEDIA.delete(f.r2_key);
  await c.env.DB.prepare('DELETE FROM order_files WHERE id = ?').bind(f.id).run();
  await audit(c.env, c.get('admin').id, 'delete_file', 'order', c.req.param('id'), { file: f.id }, clientIp(c.req.raw));
  return ok(c, { deleted: true });
});

/* ---------------- Leads ---------------- */
const leadsDef: ResourceDef = {
  table: 'leads', entity: 'lead', writePerm: 'leads.write', fields: [],
  searchCols: ['name', 'phone', 'email', 'business_name', 'message'], filterCols: ['status', 'source', 'utm_campaign'], orderBy: 'id DESC',
};
admin.get('/leads', async (c) => ok(c, await listRows(c, leadsDef)));
admin.get('/leads/export.csv', requirePerm('export'), async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 10000').all<Record<string, unknown>>()).results;
  await audit(c.env, c.get('admin').id, 'export', 'leads', null, { count: rows.length }, clientIp(c.req.raw));
  return csvResponse('leads', toCsv(rows, [
    { key: 'id', label: 'আইডি' }, { key: 'created_at', label: 'তারিখ' }, { key: 'source', label: 'উৎস' }, { key: 'name', label: 'নাম' }, { key: 'phone', label: 'ফোন' },
    { key: 'email', label: 'ইমেইল' }, { key: 'business_name', label: 'ব্যবসা' }, { key: 'message', label: 'বার্তা' }, { key: 'status', label: 'অবস্থা' },
    { key: 'utm_source', label: 'ইউটিএম সোর্স' }, { key: 'utm_campaign', label: 'ইউটিএম ক্যাম্পেইন' }, { key: 'utm_content', label: 'ইউটিএম কনটেন্ট' }, { key: 'landing_page_id', label: 'ল্যান্ডিং পেজ' },
  ]));
});
admin.get('/leads/:id', async (c) => {
  const l = await c.env.DB.prepare('SELECT l.*, p.name AS package_name FROM leads l LEFT JOIN packages p ON p.id = l.package_id WHERE l.id = ?').bind(toInt(c.req.param('id'))).first();
  if (!l) fail(404, 'লিড পাওয়া যায়নি');
  return ok(c, l);
});
admin.put('/leads/:id', requirePerm('leads.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ status?: string; notes?: string; next_follow_up_at?: string | null; assigned_admin_id?: number | null }>(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (b.status !== undefined) {
    if (!(LEAD_STATUSES as readonly string[]).includes(b.status)) fail(422, 'অবস্থা সঠিক নয়');
    sets.push('status = ?'); binds.push(b.status);
    if (b.status === 'contacted' || b.status === 'follow_up') { sets.push('last_contacted_at = ?'); binds.push(nowIso()); }
  }
  if (b.notes !== undefined) { sets.push('notes = ?'); binds.push(clampStr(b.notes, 10000)); }
  if (b.next_follow_up_at !== undefined) { sets.push('next_follow_up_at = ?'); binds.push(b.next_follow_up_at ? new Date(b.next_follow_up_at).toISOString() : null); }
  if (b.assigned_admin_id !== undefined) { sets.push('assigned_admin_id = ?'); binds.push(b.assigned_admin_id || null); }
  if (!sets.length) fail(422, 'পরিবর্তনের কিছু নেই');
  sets.push('updated_at = ?'); binds.push(nowIso());
  await c.env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  await audit(c.env, c.get('admin').id, 'update', 'lead', id, b as Record<string, unknown>, clientIp(c.req.raw));
  return ok(c, { saved: true });
});
/** One-tap "followed up". */
admin.post('/leads/:id/followed-up', requirePerm('leads.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  const s = await getSettings(c.env);
  await c.env.DB.prepare("UPDATE leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, last_contacted_at = ?, next_follow_up_at = ?, updated_at = ? WHERE id = ?")
    .bind(nowIso(), new Date(Date.now() + s.lead_followup_hours * 3600_000 * 2).toISOString(), nowIso(), id).run();
  await audit(c.env, c.get('admin').id, 'followed_up', 'lead', id, {}, clientIp(c.req.raw));
  return ok(c, { saved: true });
});
admin.delete('/leads/:id', requirePerm('leads.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
  await audit(c.env, c.get('admin').id, 'delete', 'lead', id, {}, clientIp(c.req.raw));
  return ok(c, { deleted: true });
});

/* ---------------- Reviews export ---------------- */
admin.get('/reviews-export.csv', requirePerm('export'), async (c) => {
  const rows = (await c.env.DB.prepare('SELECT r.*, p.name AS package_name FROM reviews r LEFT JOIN packages p ON p.id = r.package_id ORDER BY r.id DESC').all<Record<string, unknown>>()).results;
  return csvResponse('reviews', toCsv(rows, [
    { key: 'id', label: 'আইডি' }, { key: 'created_at', label: 'তারিখ' }, { key: 'author_name', label: 'নাম' }, { key: 'package_name', label: 'প্যাকেজ' },
    { key: 'rating', label: 'রেটিং' }, { key: 'body', label: 'রিভিউ' }, { key: 'status', label: 'অবস্থা' }, { key: 'is_verified', label: 'যাচাইকৃত' },
  ]));
});

/* ---------------- Chats ---------------- */
admin.get('/chats', async (c) => {
  const status = c.req.query('status') || 'escalated';
  const r = await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE status = ? ORDER BY updated_at DESC LIMIT 100').bind(status).all();
  return ok(c, r.results.map((x) => ({ ...x, transcript: parseJson((x as { transcript: string }).transcript, []) })));
});
admin.post('/chats/:id/close', requirePerm('chat.write'), async (c) => {
  await c.env.DB.prepare("UPDATE chat_conversations SET status = 'closed', updated_at = ? WHERE id = ?").bind(nowIso(), toInt(c.req.param('id'))).run();
  return ok(c, { closed: true });
});
admin.get('/chat-settings', async (c) => ok(c, await c.env.DB.prepare('SELECT * FROM chat_settings WHERE id = 1').first()));
admin.put('/chat-settings', requirePerm('chat.write'), async (c) => {
  const b = await readJson<Record<string, unknown>>(c);
  const wa = clampStr(b.whatsapp_number, 20).replace(/[^\d+]/g, '');
  const page = clampStr(b.messenger_page, 200);
  await c.env.DB.prepare(
    `UPDATE chat_settings SET ai_enabled = ?, whatsapp_enabled = ?, whatsapp_number = ?, whatsapp_message = ?, messenger_enabled = ?, messenger_page = ?, greeting = ?, knowledge = ?, escalation_message = ?, updated_at = ? WHERE id = 1`,
  ).bind(b.ai_enabled ? 1 : 0, b.whatsapp_enabled ? 1 : 0, wa, clampStr(b.whatsapp_message, 300), b.messenger_enabled ? 1 : 0, page, clampStr(b.greeting, 500), clampStr(b.knowledge, 12000), clampStr(b.escalation_message, 500), nowIso()).run();
  await audit(c.env, c.get('admin').id, 'update', 'chat_settings', 1, { whatsapp_number: wa, messenger_page: page }, clientIp(c.req.raw));
  return ok(c, { saved: true });
});

/* ---------------- AI provider settings & content suggestions ---------------- */
admin.get('/ai/configs', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM ai_provider_configs ORDER BY purpose').all<AIConfigRow>()).results;
  return ok(c, {
    configs: rows.map((r) => ({ ...r, key: keyStatus(c.env, r.provider) })),
    providers: (Object.keys(PROVIDER_SECRETS) as AIConfigRow['provider'][]).map((p) => ({ id: p, secretName: PROVIDER_SECRETS[p], defaultModel: PROVIDER_DEFAULT_MODELS[p], key: keyStatus(c.env, p) })),
  });
});
admin.put('/ai/configs/:purpose', requirePerm('ai.configure'), async (c) => {
  const purpose = c.req.param('purpose');
  if (purpose !== 'content' && purpose !== 'chat') fail(404, 'পাওয়া যায়নি');
  const b = await readJson<{ provider?: string; model?: string; system_prompt?: string; tone?: string }>(c);
  if (!b.provider || !(b.provider in PROVIDER_SECRETS)) fail(422, 'প্রোভাইডার সঠিক নয়');
  const provider = b.provider as AIConfigRow['provider'];
  const model = clampStr(b.model, 120) || PROVIDER_DEFAULT_MODELS[provider];
  if (!/^[@\w./:-]+$/.test(model)) fail(422, 'মডেলের নাম সঠিক নয়');
  // Keys are never accepted here — only via `wrangler secret put`. We store the masked hint for display.
  await c.env.DB.prepare('UPDATE ai_provider_configs SET provider = ?, model = ?, secret_name = ?, key_hint = ?, system_prompt = ?, tone = ?, updated_at = ? WHERE purpose = ?')
    .bind(provider, model, PROVIDER_SECRETS[provider], keyStatus(c.env, provider).hint, clampStr(b.system_prompt, 4000), clampStr(b.tone, 200), nowIso(), purpose).run();
  await audit(c.env, c.get('admin').id, 'update', 'ai_config', purpose, { provider, model }, clientIp(c.req.raw));
  return ok(c, { saved: true });
});
admin.post('/ai/configs/:purpose/test', requirePerm('ai.use'), async (c) => {
  await rateLimit(c.env, 'ai-test', String(c.get('admin').id), 10, 600);
  const cfg = await getAIConfig(c.env, c.req.param('purpose') as 'content' | 'chat');
  if (!cfg) fail(404, 'পাওয়া যায়নি');
  let okFlag = false;
  let detail = '';
  try {
    const out = await buildProvider(c.env, cfg).generate({ system: 'শুধু বাংলায় এক শব্দে উত্তর দাও।', messages: [{ role: 'user', content: 'সংযোগ পরীক্ষা: "ঠিক আছে" লেখো।' }], maxTokens: 20 });
    okFlag = true;
    detail = out.slice(0, 80);
  } catch (e) {
    detail = String((e as Error).message).replace(/key=[^&\s]+/g, 'key=•••');
  }
  await c.env.DB.prepare('UPDATE ai_provider_configs SET last_test_at = ?, last_test_ok = ? WHERE id = ?').bind(nowIso(), okFlag ? 1 : 0, cfg.id).run();
  return ok(c, { ok: okFlag, detail });
});

/** Auto-suggest: generates a DRAFT stored in packages.ai_draft. Never written to the live fields until a human approves. */
admin.post('/ai/suggest', requirePerm('ai.use'), async (c) => {
  await rateLimit(c.env, 'ai-suggest', String(c.get('admin').id), 30, 600);
  const b = await readJson<{ packageId?: number; name?: string; features?: string[]; notes?: string }>(c);
  const cfg = await getAIConfig(c.env, 'content');
  if (!cfg) fail(503, 'এআই কনটেন্ট সেটিংস কনফিগার করা নেই');
  const name = clampStr(b.name, 150);
  const features = (Array.isArray(b.features) ? b.features : []).map((f) => clampStr(f, 200)).filter(Boolean).slice(0, 30);
  if (!name) fail(422, 'প্যাকেজের নাম দিন');
  const system = `${cfg.system_prompt}\nলেখার ধরন: ${cfg.tone}\nশুধু JSON ফেরত দাও: {"title": string, "shortDescription": string (সর্বোচ্চ ১৫০ অক্ষর), "description": string (২–৩ অনুচ্ছেদ, \\n\\n দিয়ে আলাদা)}`;
  const prompt = `প্যাকেজের নাম: ${name}\nফিচার:\n${features.map((f) => `- ${f}`).join('\n')}\n${b.notes ? `অতিরিক্ত নির্দেশনা: ${clampStr(b.notes, 500)}` : ''}`;
  let draft: { title: string; shortDescription: string; description: string };
  try {
    const raw = await buildProvider(c.env, cfg).generate({ system, messages: [{ role: 'user', content: prompt }], json: true, maxTokens: 1200 });
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim()) as Record<string, unknown>;
    draft = { title: clampStr(parsed.title, 150), shortDescription: clampStr(parsed.shortDescription, 300), description: clampStr(parsed.description, 8000) };
    if (!draft.title || !draft.description) throw new Error('incomplete');
  } catch (e) {
    console.error('ai suggest failed', e);
    fail(502, 'এআই থেকে খসড়া পাওয়া যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।');
  }
  const packageId = toInt(b.packageId);
  if (packageId) await c.env.DB.prepare('UPDATE packages SET ai_draft = ? WHERE id = ?').bind(JSON.stringify({ ...draft, generatedAt: nowIso(), provider: cfg.provider }), packageId).run();
  await audit(c.env, c.get('admin').id, 'ai_suggest', 'package', packageId || null, { provider: cfg.provider }, clientIp(c.req.raw));
  return ok(c, { draft, status: 'draft' });
});

/** One-tap approve: a human copies the reviewed (and possibly edited) draft into the live fields. */
admin.post('/packages/:id/approve-draft', requirePerm('catalog.write'), async (c) => {
  const id = toInt(c.req.param('id'));
  const b = await readJson<{ name?: string; short_description?: string; description?: string }>(c);
  const p = await c.env.DB.prepare('SELECT ai_draft FROM packages WHERE id = ?').bind(id).first<{ ai_draft: string | null }>();
  if (!p?.ai_draft) fail(404, 'অনুমোদনের জন্য কোনো খসড়া নেই');
  const d = parseJson<{ title: string; shortDescription: string; description: string }>(p.ai_draft, { title: '', shortDescription: '', description: '' });
  const name = clampStr(b.name ?? d.title, 150);
  if (!name) fail(422, 'নাম খালি রাখা যাবে না');
  await c.env.DB.prepare('UPDATE packages SET name = ?, short_description = ?, description = ?, ai_draft = NULL, updated_at = ? WHERE id = ?')
    .bind(name, clampStr(b.short_description ?? d.shortDescription, 300), clampStr(b.description ?? d.description, 8000), nowIso(), id).run();
  await audit(c.env, c.get('admin').id, 'approve_ai_draft', 'package', id, {}, clientIp(c.req.raw));
  return ok(c, { approved: true });
});
admin.post('/packages/:id/discard-draft', requirePerm('catalog.write'), async (c) => {
  await c.env.DB.prepare('UPDATE packages SET ai_draft = NULL WHERE id = ?').bind(toInt(c.req.param('id'))).run();
  return ok(c, { discarded: true });
});

/* ---------------- Settings ---------------- */
admin.get('/settings', async (c) => ok(c, { settings: await getSettings(c.env), env: { appEnv: c.env.APP_ENV, paymentMode: c.env.PAYMENT_MODE, siteUrl: c.env.SITE_URL } }));
admin.put('/settings', requirePerm('settings.write'), async (c) => {
  const b = await readJson<Record<string, unknown>>(c);
  const patch: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(SETTINGS_DEFAULTS)) {
    if (!(k in b)) continue;
    const v = b[k];
    if (typeof def === 'boolean') patch[k] = v === true || v === 1 || v === '1' || v === 'true';
    else if (typeof def === 'number') { const n = Number(v); if (!Number.isFinite(n) || n < 0) fail(422, `${k} সংখ্যা হতে হবে`); patch[k] = n; }
    else patch[k] = clampStr(v, 20000);
  }
  if (typeof patch.meta_pixel_id === 'string' && patch.meta_pixel_id && !/^\d{10,20}$/.test(patch.meta_pixel_id)) fail(422, 'মেটা পিক্সেল আইডি শুধু সংখ্যা হবে');
  if (typeof patch.ga4_id === 'string' && patch.ga4_id && !/^G-[A-Z0-9]{4,15}$/.test(patch.ga4_id)) fail(422, 'জিএ৪ আইডি G- দিয়ে শুরু হবে');
  if (typeof patch.gtm_id === 'string' && patch.gtm_id && !/^GTM-[A-Z0-9]{4,12}$/.test(patch.gtm_id)) fail(422, 'জিটিএম আইডি GTM- দিয়ে শুরু হবে');
  if (typeof patch.clarity_id === 'string' && patch.clarity_id && !/^[a-z0-9]{6,20}$/.test(patch.clarity_id)) fail(422, 'ক্ল্যারিটি আইডি সঠিক নয়');
  await saveSettings(c.env, patch as Partial<SiteSettings>);
  await audit(c.env, c.get('admin').id, 'update', 'settings', null, { keys: Object.keys(patch) }, clientIp(c.req.raw));
  return ok(c, { saved: true });
});

/* ---------------- Media uploads (public assets: screenshots, demo clips, banners) ---------------- */
admin.post('/uploads', requirePerm('catalog.write'), async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) fail(422, 'ফাইল বেছে নিন');
  if (!/^(image\/(png|jpeg|webp|gif|avif|svg\+xml)|video\/(mp4|webm))$/.test(file.type)) fail(422, 'শুধু ছবি (পিএনজি/জেপিজি/ওয়েবপি) বা ভিডিও (এমপি৪/ওয়েবএম) আপলোড করা যাবে');
  if (file.size > 50 * 1024 * 1024) fail(422, 'ফাইল সর্বোচ্চ ৫০ মেগাবাইট');
  const ext = file.type.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  const key = `public/${new Date().toISOString().slice(0, 7)}/${randomToken(10)}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  await audit(c.env, c.get('admin').id, 'upload', 'media', key, { size: file.size, type: file.type }, clientIp(c.req.raw));
  return ok(c, { key, url: `/media/${key}` }, 201);
});

/* ---------------- Reports ---------------- */
admin.get('/reports', async (c) => {
  const from = c.req.query('from') ? new Date(c.req.query('from')!).toISOString() : new Date(Date.now() - 30 * 86_400_000).toISOString();
  const to = c.req.query('to') ? new Date(new Date(c.req.query('to')!).getTime() + 86_400_000).toISOString() : new Date(Date.now() + 60_000).toISOString();
  const db = c.env.DB;
  const [summary, byCampaign, byLanding, byPackage, byMethod, leadsBySource, funnel, referrals] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS orders, SUM(payment_status='paid') AS paid_orders, COALESCE(SUM(CASE WHEN payment_status='paid' THEN paid_amount END),0) AS revenue, COALESCE(AVG(CASE WHEN payment_status='paid' THEN paid_amount END),0) AS aov FROM orders WHERE created_at >= ? AND created_at < ?`).bind(from, to),
    db.prepare(`SELECT COALESCE(NULLIF(utm_source,''),'(সরাসরি)') AS source, COALESCE(NULLIF(utm_campaign,''),'—') AS campaign, COALESCE(NULLIF(utm_content,''),'—') AS content,
                  COUNT(*) AS orders, SUM(payment_status='paid') AS paid, COALESCE(SUM(CASE WHEN payment_status='paid' THEN paid_amount END),0) AS revenue,
                  (SELECT COUNT(*) FROM leads l WHERE COALESCE(NULLIF(l.utm_campaign,''),'—') = COALESCE(NULLIF(o.utm_campaign,''),'—') AND COALESCE(NULLIF(l.utm_content,''),'—') = COALESCE(NULLIF(o.utm_content,''),'—') AND l.created_at >= ? AND l.created_at < ?) AS leads
                FROM orders o WHERE created_at >= ? AND created_at < ? GROUP BY source, campaign, content ORDER BY revenue DESC LIMIT 100`).bind(from, to, from, to),
    db.prepare(`SELECT lp.id, lp.title, lp.slug, lp.status,
                  (SELECT COUNT(*) FROM leads l WHERE l.landing_page_id = lp.id AND l.created_at >= ?1 AND l.created_at < ?2) AS leads,
                  (SELECT COUNT(*) FROM orders o WHERE o.landing_page_id = lp.id AND o.created_at >= ?1 AND o.created_at < ?2) AS orders,
                  (SELECT COUNT(*) FROM orders o WHERE o.landing_page_id = lp.id AND o.payment_status='paid' AND o.created_at >= ?1 AND o.created_at < ?2) AS paid,
                  (SELECT COALESCE(SUM(paid_amount),0) FROM orders o WHERE o.landing_page_id = lp.id AND o.payment_status='paid' AND o.created_at >= ?1 AND o.created_at < ?2) AS revenue
                FROM landing_pages lp ORDER BY revenue DESC, leads DESC`).bind(from, to),
    db.prepare(`SELECT i.package_name, COUNT(*) AS sold, SUM(i.total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.payment_status='paid' AND o.created_at >= ? AND o.created_at < ? GROUP BY i.package_id ORDER BY revenue DESC`).bind(from, to),
    db.prepare(`SELECT payment_method, COUNT(*) AS orders, SUM(payment_status='paid') AS paid FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY payment_method`).bind(from, to),
    db.prepare(`SELECT source, COUNT(*) AS leads, SUM(status='won') AS won FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY source`).bind(from, to),
    db.prepare(`SELECT project_status, COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY project_status`).bind(from, to),
    db.prepare(`SELECT c.code, c.description, c.used_count FROM coupons c WHERE c.referrer_order_id IS NOT NULL AND c.used_count > 0 ORDER BY c.used_count DESC LIMIT 50`),
  ]);
  return ok(c, { from, to, summary: summary.results[0], byCampaign: byCampaign.results, byLanding: byLanding.results, byPackage: byPackage.results, byMethod: byMethod.results, leadsBySource: leadsBySource.results, funnel: funnel.results, referrals: referrals.results, statusLabels: PROJECT_STATUS_BN });
});

/* ---------------- Notifications, activity, lookups ---------------- */
admin.get('/notifications', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM admin_notifications ORDER BY id DESC LIMIT 50').all();
  const unread = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admin_notifications WHERE read_at IS NULL').first<{ n: number }>();
  return ok(c, { items: r.results, unread: unread?.n || 0 });
});
admin.post('/notifications/read', async (c) => {
  await c.env.DB.prepare('UPDATE admin_notifications SET read_at = ? WHERE read_at IS NULL').bind(nowIso()).run();
  return ok(c, { read: true });
});
admin.get('/activity', requirePerm('audit.read'), async (c) => {
  const r = await listRows(c, { table: 'activity_log', entity: 'activity', writePerm: 'audit.read', fields: [], searchCols: ['action', 'entity', 'entity_id'], filterCols: ['admin_id', 'entity'], orderBy: 'id DESC' });
  return ok(c, r);
});
admin.get('/lookups', async (c) => {
  const [cats, pkgs, staff] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, name, slug FROM categories ORDER BY sort_order, id'),
    c.env.DB.prepare('SELECT id, name, slug, category_id FROM packages ORDER BY category_id, sort_order, id'),
    c.env.DB.prepare('SELECT id, name, role FROM admins WHERE is_active = 1 ORDER BY name'),
  ]);
  return ok(c, { categories: cats.results, packages: pkgs.results, staff: staff.results, statuses: PROJECT_STATUSES.map((s) => ({ key: s, label: PROJECT_STATUS_BN[s] })), transitions: TRANSITIONS });
});
admin.get('/notification-log', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM notification_log ORDER BY id DESC LIMIT 100').all();
  return ok(c, r.results);
});
