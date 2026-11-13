import { Hono, type Context } from 'hono';
import type { AppBindings } from '../env';
import { fail, ok, readJson } from '../lib/http';
import { getSettings } from '../lib/settings';
import { rateLimit } from '../lib/ratelimit';
import { clampStr, clientIp, isEmail, normalizeBdPhone, randomToken, nowIso, publicOrigin, toInt } from '../lib/util';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { readAttribution } from '../lib/attribution';
import { sendMetaEvent } from '../lib/meta-capi';
import { notifyAdmins } from '../lib/audit';
import { getOrder, newOrderNumber, confirmPayment } from '../lib/orders';
import { driveFetch, driveFileId, driveMeta, serviceAccount } from '../lib/google';
import { portalToken } from '../lib/portal-token';
import { availableMethods, startPayment } from './orders';
import { layout } from '../views/layout';
import { ctx, notFound, whatsapp } from './pages';
import * as CV from '../views/courses';
import {
  loadPublicCourses, loadCourseCategories, loadCourseRow, loadCurriculum, publicCourse, publicCurriculum, groupLessons, lessonContent, isPrivateKey,
  currentStudent, createStudentSession, destroyStudentSession, activeEnrollment,
  type LessonRow, type StudentRow,
} from '../lib/courses';
import { PAYMENT_STATUS_BN, type PaymentStatus, type PaymentMethod } from '../../../shared/status';

export const courses = new Hono<AppBindings>();

/** The student area lives on the Worker (sign-in cookies); public pages may be on the GitHub Pages copy. */
const studentUrl = (c: Context<AppBindings>) => `${c.env.SITE_URL.replace(/\/$/, '')}/student`;

/* ================= Public pages ================= */
courses.get('/courses', async (c) => {
  const [cats, list] = await Promise.all([loadCourseCategories(c.env), loadPublicCourses(c.env)]);
  return layout(
    await ctx(c, { title: 'অনলাইন কোর্স', description: 'ডিজিটাল মার্কেটিং, ওয়েব ডেভেলপমেন্ট, পাইথন — লেসন ধরে ধরে বাংলায় শিখুন।', pageType: 'category', ogImage: list.find((x) => x.cover)?.cover }),
    CV.coursesPage(cats, list, studentUrl(c)),
  );
});

courses.get('/course-category/:slug', async (c) => {
  const cats = await loadCourseCategories(c.env);
  const cat = cats.find((x) => x.slug === c.req.param('slug'));
  if (!cat) return notFound(c);
  const list = await loadPublicCourses(c.env);
  return layout(await ctx(c, { title: `${cat.name} কোর্স`, description: cat.description, pageType: 'category' }), CV.courseCategoryPage(cat, cats, list));
});

async function coursePageResponse(c: Context<AppBindings>, bare: boolean) {
  const row = await loadCourseRow(c.env, c.req.param('slug') || '');
  if (!row || !['published', 'coming_soon'].includes(row.status)) return notFound(c);
  const course = publicCourse(row, row.lesson_count);
  const { sections, lessons } = await loadCurriculum(c.env, row.id);
  const eventId = `vc_${randomToken(12)}`;
  return layout(
    await ctx(c, {
      title: course.title, description: course.subtitle || course.title, pageType: 'package', ogImage: course.cover || undefined, hideChrome: bare,
      // Same ViewContent as packages (browser pixel + server CAPI with this event id), marked as a course.
      pageEvent: { name: 'ViewContent', eventId, customData: { content_ids: [`course-${course.id}`], content_type: 'product', content_name: course.title, content_category: `কোর্স: ${course.categoryName}`, value: course.price, currency: 'BDT' } },
    }),
    CV.coursePage(course, publicCurriculum(sections, lessons, c.env.SITE_URL, !!serviceAccount(c.env)), { enrollUrl: `/enroll/${course.slug}`, whatsapp: await whatsapp(c.env), studentUrl: studentUrl(c), notEnrolled: c.req.query('not_enrolled') === '1' }),
  );
}
courses.get('/course/:slug', (c) => coursePageResponse(c, false));
/** Ad landing page: the same sales page without the site menu, so the only way forward is to enrol. */
courses.get('/lp/course/:slug', (c) => coursePageResponse(c, true));

// /enroll/<slug>, not /course/<slug>/enroll: on GitHub Pages a course/<slug>/ folder would shadow course/<slug>.html.
courses.get('/enroll/:slug', async (c) => {
  const row = await loadCourseRow(c.env, c.req.param('slug'));
  if (!row || row.status !== 'published') return row && row.status === 'coming_soon' ? c.redirect(`/course/${row.slug}#notify`) : notFound(c);
  const s = await getSettings(c.env);
  const course = publicCourse(row, row.lesson_count);
  return layout(await ctx(c, { title: `ভর্তি — ${course.title}`, pageType: 'checkout', noindex: true }), CV.enrollPage(course, availableMethods(c.env, s), studentUrl(c)));
});

/* ================= Enrol: create the student (or use the existing one) and a course order ================= */
courses.post('/api/courses/:slug/order', async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, 'course-order', ip, 10, 600);
  const body = await readJson<Record<string, unknown>>(c);
  if (clampStr(body.website, 10)) fail(422, 'অনুরোধটি গ্রহণ করা যায়নি'); // honeypot
  const row = await loadCourseRow(c.env, c.req.param('slug'));
  if (!row || row.status !== 'published') fail(404, 'কোর্সটি এখন ভর্তির জন্য খোলা নেই');
  const s = await getSettings(c.env);

  const name = clampStr(body.name, 100);
  const phone = normalizeBdPhone(clampStr(body.phone, 30));
  const email = clampStr(body.email, 200).toLowerCase();
  const password = String(body.password ?? '');
  if (name.length < 2) fail(422, 'আপনার নাম লিখুন', 'name');
  if (!phone || !phone.startsWith('880')) fail(422, 'সঠিক মোবাইল নম্বর দিন (০১XXXXXXXXX)', 'phone');
  if (email && !isEmail(email)) fail(422, 'ইমেইল ঠিকানাটি সঠিক নয়', 'email');
  if (body.agree !== true) fail(422, 'শর্তাবলিতে সম্মতি দিন', 'agree');
  const free = row.price === 0;
  const method = (free ? 'free' : clampStr(body.payment_method, 30)) as PaymentMethod;
  if (!free && !availableMethods(c.env, s).some((m) => m.id === method)) fail(422, 'পেমেন্ট মাধ্যম বেছে নিন', 'payment_method');

  // The account: a new one with this password, or the existing one for this number (its password is never replaced here).
  let student = await c.env.DB.prepare('SELECT * FROM students WHERE phone = ?').bind(phone).first<StudentRow>();
  const existing = !!student;
  if (student?.is_blocked) fail(403, 'এই অ্যাকাউন্টটি বন্ধ আছে — আমাদের সাথে যোগাযোগ করুন');
  if (!student) {
    if (password.length < 6) fail(422, 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন', 'password');
    student = await c.env.DB.prepare('INSERT INTO students (name, phone, email, password_hash) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(name, phone, email, await hashPassword(password)).first<StudentRow>();
  }
  if (await activeEnrollment(c.env, student!.id, row.id)) {
    return ok(c, { alreadyEnrolled: true, studentUrl: studentUrl(c) });
  }

  const attr = readAttribution(body.attribution, c.req.header('cookie') || '');
  const orderNo = await newOrderNumber(c.env);
  const initiateId = `ic_${randomToken(12)}`;
  const purchaseId = `pu_${randomToken(12)}`;
  const ua = clampStr(c.req.header('user-agent'), 400);
  const sourceUrl = attr.source_url || `${publicOrigin(c.env)}/enroll/${row.slug}`;
  const ins = await c.env.DB.prepare(
    `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, business_name, payment_method, subtotal, total,
       initiate_event_id, purchase_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc, landing_page_id, client_ip, user_agent, source_url, is_internal, kind, student_id)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'course', ?) RETURNING id`,
  ).bind(
    orderNo, name, phone, email, method, row.price, row.price, initiateId, purchaseId,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.utm_term, attr.fbclid, attr.fbp, attr.fbc, attr.landing_page_id, ip, ua, sourceUrl, attr.internal ? 1 : 0, student!.id,
  ).first<{ id: number }>();
  const orderId = ins!.id;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO order_items (order_id, package_id, package_name, base_price, addons, subtotal, offer_discount, total, course_id) VALUES (?, 0, ?, ?, ?, ?, 0, ?, ?)')
      .bind(orderId, row.title, row.price, '[]', row.price, row.price, row.id),
    c.env.DB.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor) VALUES (?, NULL, ?, ?, ?)').bind(orderId, 'pending_payment', 'কোর্সে ভর্তির অর্ডার', 'client'),
  ]);
  const order = (await getOrder(c.env, orderId))!;

  c.executionCtx.waitUntil(Promise.all([
    sendMetaEvent(c.env, s.meta_pixel_id, {
      internal: attr.internal, name: 'InitiateCheckout', eventId: initiateId, sourceUrl,
      user: { email, phone, firstName: name, ip, userAgent: ua, fbp: attr.fbp, fbc: attr.fbc, externalId: phone },
      customData: { currency: 'BDT', value: row.price, content_ids: [`course-${row.id}`], content_type: 'product', content_name: row.title, num_items: 1 },
    }),
    notifyAdmins(c.env, 'new_order', `নতুন কোর্স ভর্তি ${orderNo} — ${row.title}${free ? ' (ফ্রি)' : ' (পেমেন্টের অপেক্ষায়)'}`, `#/orders/${orderId}`),
  ]).catch((e) => console.error(e)));

  // A free course opens at once; a paid one only after the payment is confirmed.
  if (free) await confirmPayment(c.env, orderId, { gateway: 'manual', amount: 0, actor: 'system:free' }, c.executionCtx);
  const pay = free ? { redirectUrl: null } : await startPayment(c, order, row.title);
  const token = await portalToken(c.env, orderNo);
  return ok(c, {
    orderNumber: orderNo, total: row.price, initiateEventId: initiateId, existingAccount: existing, free,
    redirectUrl: pay.redirectUrl, orderUrl: `/order/${encodeURIComponent(orderNo)}?t=${token}`, studentUrl: studentUrl(c),
  }, 201);
});

/* ================= Student sign-in ================= */
courses.post('/api/student/login', async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, 'student-login', ip, 15, 900);
  const body = await readJson<{ phone?: string; password?: string }>(c);
  const phone = normalizeBdPhone(clampStr(body.phone, 30));
  const password = String(body.password ?? '');
  const bad = () => fail(401, 'মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়');
  if (!phone || !password) bad();
  const st = await c.env.DB.prepare('SELECT * FROM students WHERE phone = ?').bind(phone).first<StudentRow>();
  if (!st) { await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=').catch(() => false); bad(); }
  if (st!.is_blocked) fail(403, 'এই অ্যাকাউন্টটি বন্ধ আছে — আমাদের সাথে যোগাযোগ করুন');
  if (st!.locked_until && st!.locked_until > nowIso()) fail(429, 'অনেকবার ভুল পাসওয়ার্ড — ১৫ মিনিট পর আবার চেষ্টা করুন');
  if (!(await verifyPassword(password, st!.password_hash))) {
    const fails = st!.failed_logins + 1;
    await c.env.DB.prepare('UPDATE students SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .bind(fails, fails >= 8 ? new Date(Date.now() + 15 * 60_000).toISOString() : null, st!.id).run();
    bad();
  }
  await createStudentSession(c, st!.id);
  return ok(c, { name: st!.name });
});

courses.post('/api/student/logout', async (c) => {
  await destroyStudentSession(c);
  return ok(c, { loggedOut: true });
});

courses.post('/api/student/password', async (c) => {
  const st = await currentStudent(c);
  if (!st) fail(401, 'অনুগ্রহ করে লগইন করুন');
  await rateLimit(c.env, 'student-pw', String(st!.id), 10, 900);
  const body = await readJson<{ current?: string; next?: string }>(c);
  if (!(await verifyPassword(String(body.current ?? ''), st!.password_hash))) fail(422, 'বর্তমান পাসওয়ার্ড সঠিক নয়', 'current');
  const next = String(body.next ?? '');
  if (next.length < 6) fail(422, 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন', 'next');
  await c.env.DB.prepare('UPDATE students SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(next), nowIso(), st!.id).run();
  return ok(c, { changed: true });
});

/** Mark a lesson done / not done (only in a course the student is enrolled in). */
courses.post('/api/student/progress', async (c) => {
  const st = await currentStudent(c);
  if (!st) fail(401, 'অনুগ্রহ করে লগইন করুন');
  const body = await readJson<{ lessonId?: unknown; done?: unknown }>(c);
  const lesson = await c.env.DB.prepare('SELECT id, course_id FROM course_lessons WHERE id = ? AND is_active = 1').bind(toInt(body.lessonId)).first<{ id: number; course_id: number }>();
  if (!lesson || !(await activeEnrollment(c.env, st!.id, lesson.course_id))) fail(404, 'লেসন পাওয়া যায়নি');
  if (body.done === false) await c.env.DB.prepare('DELETE FROM lesson_progress WHERE student_id = ? AND lesson_id = ?').bind(st!.id, lesson!.id).run();
  else await c.env.DB.prepare('INSERT OR IGNORE INTO lesson_progress (student_id, lesson_id, course_id) VALUES (?, ?, ?)').bind(st!.id, lesson!.id, lesson!.course_id).run();
  return ok(c, { done: body.done !== false });
});

/* ================= Student pages (Worker only) ================= */
/** A private page: never cached by the browser or any proxy. */
function privatePage(res: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'private, no-store');
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

courses.get('/student', async (c) => {
  const st = await currentStudent(c);
  if (!st) {
    const next = c.req.query('next') || '';
    const res = layout(await ctx(c, { title: 'আমার কোর্স — লগইন', pageType: 'static', noindex: true }), CV.studentLoginPage(/^\/learn\/[\w-]+(\/\d+)?$/.test(next) ? next : '', next ? 'এই কোর্সটি দেখতে আগে লগইন করুন।' : ''));
    return privatePage(res);
  }
  const [enr, pend] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT e.course_id, co.slug FROM enrollments e JOIN courses co ON co.id = e.course_id WHERE e.student_id = ? AND e.status = 'active' ORDER BY e.created_at DESC`).bind(st.id),
    c.env.DB.prepare(`SELECT o.order_number, o.total, o.payment_status, oi.package_name FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.student_id = ? AND o.kind = 'course' AND o.payment_status != 'paid' AND o.project_status != 'cancelled' ORDER BY o.id DESC LIMIT 10`).bind(st.id),
  ]);
  const enrolled = enr.results as { course_id: number; slug: string }[];
  const my: CV.MyCourse[] = [];
  for (const e of enrolled) {
    const row = await loadCourseRow(c.env, e.slug);
    if (!row || row.status === 'draft') continue;
    const { sections, lessons } = await loadCurriculum(c.env, row.id);
    const ordered = groupLessons(sections, lessons).flatMap((g) => g.lessons);
    const doneIds = new Set((await c.env.DB.prepare('SELECT lesson_id FROM lesson_progress WHERE student_id = ? AND course_id = ?').bind(st.id, row.id).all<{ lesson_id: number }>()).results.map((r) => r.lesson_id));
    const done = ordered.filter((l) => doneIds.has(l.id)).length;
    my.push({ course: publicCourse(row, ordered.length), done, total: ordered.length, nextLessonId: ordered.find((l) => !doneIds.has(l.id))?.id ?? null });
  }
  const pending: CV.MyOrder[] = [];
  for (const o of pend.results as { order_number: string; total: number; payment_status: string; package_name: string }[]) {
    pending.push({ orderNumber: o.order_number, title: o.package_name, total: o.total, paymentLabel: PAYMENT_STATUS_BN[o.payment_status as PaymentStatus] || o.payment_status, url: `/order/${encodeURIComponent(o.order_number)}?t=${await portalToken(c.env, o.order_number)}` });
  }
  const res = layout(
    await ctx(c, { title: 'আমার কোর্স', pageType: 'static', noindex: true }),
    CV.studentDashboard({ name: st.name, phone: st.phone.replace(/^880/, '0'), courses: my, pending, coursesUrl: `${publicOrigin(c.env)}/courses` }),
  );
  return privatePage(res);
});

async function learn(c: Context<AppBindings>) {
  const slug = c.req.param('slug') || '';
  const st = await currentStudent(c);
  const lessonParam = c.req.param('lesson');
  if (!st) return c.redirect(`/student?next=${encodeURIComponent(`/learn/${slug}${lessonParam ? `/${lessonParam}` : ''}`)}`);
  const row = await loadCourseRow(c.env, slug);
  if (!row || row.status === 'draft') return notFound(c);
  // The access rule: an active enrollment, which exists only after a confirmed payment (or an admin grant).
  if (!(await activeEnrollment(c.env, st.id, row.id))) return c.redirect(`/course/${row.slug}?not_enrolled=1`); // the Worker serves the sales page too
  const { sections, lessons } = await loadCurriculum(c.env, row.id);
  const groups = groupLessons(sections, lessons);
  const ordered = groups.flatMap((g) => g.lessons);
  if (!ordered.length) return notFound(c);
  const doneIds = new Set((await c.env.DB.prepare('SELECT lesson_id FROM lesson_progress WHERE student_id = ? AND course_id = ?').bind(st.id, row.id).all<{ lesson_id: number }>()).results.map((r) => r.lesson_id));
  const current: LessonRow | undefined = lessonParam ? ordered.find((l) => l.id === toInt(lessonParam)) : ordered.find((l) => !doneIds.has(l.id)) || ordered[0];
  if (!current) return notFound(c);
  const i = ordered.indexOf(current);
  const res = layout(
    await ctx(c, { title: `${current.title} — ${row.title}`, pageType: 'static', noindex: true }),
    CV.learnPage({
      course: publicCourse(row, ordered.length),
      sections: groups.map((g) => ({ title: g.section?.title || 'অন্যান্য লেসন', lessons: g.lessons.map((l) => ({ id: l.id, title: l.title, kind: l.kind, durationText: l.duration_text, done: doneIds.has(l.id) })) })),
      current: lessonContent(current, !!serviceAccount(c.env)), currentDone: doneIds.has(current.id),
      prevId: ordered[i - 1]?.id ?? null, nextId: ordered[i + 1]?.id ?? null,
      done: ordered.filter((l) => doneIds.has(l.id)).length, total: ordered.length,
    }),
  );
  return privatePage(res, { 'x-robots-tag': 'noindex' });
}
/** A lesson's private file, streamed only to an enrolled student (or anyone, for a free preview lesson). */
courses.get('/learn/file/:lesson{[0-9]+}', async (c) => {
  const l = await c.env.DB.prepare('SELECT * FROM course_lessons WHERE id = ? AND is_active = 1').bind(toInt(c.req.param('lesson'))).first<LessonRow>();
  const driveId = l && serviceAccount(c.env) && /^https?:/.test(l.file_key) ? driveFileId(l.file_key) : null;
  if (!l || !l.file_key || (!driveId && !c.env.MEDIA)) return notFound(c);
  if (!l.is_preview) {
    const st = await currentStudent(c);
    if (!st || !(await activeEnrollment(c.env, st.id, l.course_id))) return c.text('এই ফাইলটি শুধু ভর্তি হওয়া শিক্ষার্থীদের জন্য', 403);
  }
  if (driveId) return driveResponse(c, driveId, null, 'attachment');
  if (!c.env.MEDIA) return notFound(c);
  const obj = await c.env.MEDIA.get(l.file_key);
  if (!obj) return notFound(c);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-robots-tag', 'noindex');
  const name = l.file_key.split('/').pop() || 'file';
  headers.set('content-disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`);
  return new Response(obj.body, { headers });
});

/**
 * A Google Drive file shared only with the service account, streamed through the Worker. Status, length and
 * Content-Range come from Google (so seeking works); the Drive link and the token stay on the server.
 */
async function driveResponse(c: Context<AppBindings>, id: string, range: string | null | undefined, disposition: 'inline' | 'attachment') {
  try {
    const upstream = await driveFetch(c.env, id, range);
    if (!upstream.ok && upstream.status !== 206) {
      console.error('drive stream failed', upstream.status);
      return c.text('ফাইলটি খোলা যায়নি — একটু পরে আবার চেষ্টা করুন, সমস্যা থাকলে আমাদের জানান।', 502);
    }
    const headers = new Headers();
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, no-store');
    headers.set('x-robots-tag', 'noindex');
    if (disposition === 'attachment') {
      const name = (await driveMeta(c.env, id).catch(() => null))?.name || 'file';
      headers.set('content-disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    } else headers.set('content-disposition', 'inline');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    console.error('drive stream error', (e as Error).message);
    return c.text('ফাইলটি খোলা যায়নি — একটু পরে আবার চেষ্টা করুন।', 502);
  }
}

/** Privately uploaded lesson video: streamed (with Range for seeking) only to an enrolled student, or for a free preview. */
courses.get('/learn/video/:lesson{[0-9]+}', async (c) => {
  const l = await c.env.DB.prepare('SELECT * FROM course_lessons WHERE id = ? AND is_active = 1').bind(toInt(c.req.param('lesson'))).first<LessonRow>();
  const driveId = l && serviceAccount(c.env) && /^https?:/.test(l.video_url) ? driveFileId(l.video_url) : null;
  if (!l || (!driveId && (!isPrivateKey(l.video_url) || !c.env.MEDIA))) return notFound(c);
  if (!l.is_preview) {
    const st = await currentStudent(c);
    if (!st || !(await activeEnrollment(c.env, st.id, l.course_id))) return c.text('এই ভিডিওটি শুধু ভর্তি হওয়া শিক্ষার্থীদের জন্য', 403);
  }
  const range = c.req.header('range');
  if (driveId) return driveResponse(c, driveId, range, 'inline');
  if (!c.env.MEDIA) return notFound(c);
  const obj = await c.env.MEDIA.get(l.video_url, range ? { range: c.req.raw.headers } : undefined);
  if (!obj) return notFound(c);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-robots-tag', 'noindex');
  headers.set('content-disposition', 'inline');
  const r = (obj as R2ObjectBody & { range?: { offset?: number; length?: number; suffix?: number } }).range;
  if (range && r) {
    const offset = r.offset ?? (r.suffix !== undefined ? obj.size - r.suffix : 0);
    const length = r.length ?? obj.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
});

courses.get('/learn/:slug', learn);
courses.get('/learn/:slug/:lesson{[0-9]+}', learn);

