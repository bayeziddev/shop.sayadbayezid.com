import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import loginFixture from '../fixtures/admin-login.json';
import { contentIdOf } from '../../worker/src/lib/orders';

const BASE = 'http://localhost:8787';
const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const call = async (path: string, init?: RequestInit) => {
  const r = await SELF.fetch(BASE + path, { redirect: 'manual', ...init });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any, headers: r.headers };
};
const page = async (path: string, headers: Record<string, string> = {}) => {
  const r = await SELF.fetch(BASE + path, { redirect: 'manual', headers });
  return { status: r.status, html: await r.text(), headers: r.headers };
};
async function adminSession(): Promise<Record<string, string>> {
  await call('/api/admin/auth/setup', json(loginFixture.setup));
  const r = await SELF.fetch(BASE + '/api/admin/auth/login', json(loginFixture.login));
  return { cookie: (r.headers.get('set-cookie') || '').split(';')[0], 'x-requested-with': 'admin', origin: BASE };
}
async function studentLogin(phone: string, password: string): Promise<Record<string, string>> {
  const r = await SELF.fetch(BASE + '/api/student/login', json({ phone, password }));
  expect(r.status).toBe(200);
  return { cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

const SLUG = 'facebook-digital-marketing';
const PRIVATE_LINK = 'https://drive.google.com/drive/folders/integration-private';
const FILE_KEY = 'private/courses/2026-11/test-sheet.pdf';
const VIDEO_KEY = 'private/courses/2026-11/test-lesson.mp4';

beforeAll(async () => {
  // Bank transfer is the one payment path that needs no gateway keys.
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('bank_details', '"পরীক্ষা ব্যাংক, হিসাব ১২৩"') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
  await env.KV.delete('settings:v1');
});

/** Price + publish the seeded course and put private content into its lessons (in learning order). */
async function publishSeededCourse(h: Record<string, string>) {
  const course = (await call(`/api/admin/courses?q=${SLUG}`, { headers: h })).body.data.items[0];
  const { lessons } = (await call(`/api/admin/courses/${course.id}/curriculum`, { headers: h })).body.data;
  await env.MEDIA!.put(FILE_KEY, 'PDF-BYTES', { httpMetadata: { contentType: 'application/pdf' } });
  await env.MEDIA!.put(VIDEO_KEY, '0123456789VIDEO', { httpMetadata: { contentType: 'video/mp4' } });
  expect((await call(`/api/admin/course-lessons/${lessons[1].id}`, json({ link_url: PRIVATE_LINK, file_key: FILE_KEY, video_url: VIDEO_KEY, body: 'গোপন নোট' }, h, 'PUT'))).status).toBe(200);
  expect((await call(`/api/admin/courses/${course.id}`, json({ price: 1500, regular_price: 2000, status: 'published' }, h, 'PUT'))).status).toBe(200);
  return { course, lessons };
}

async function enrol(phone: string, method = 'bank_transfer', slug = SLUG) {
  const r = await call(`/api/courses/${slug}/order`, json({ name: 'পরীক্ষা শিক্ষার্থী', phone, password: 'student-pass-1', payment_method: method, agree: true }, { origin: BASE }));
  return r;
}

describe('courses: categories from the admin, public pages and the coming-soon state', () => {
  it('lets the admin add any number of course categories and lists them on /courses once they have a course', async () => {
    const h = await adminSession();
    const r = await call('/api/admin/course-categories', json({ name: 'গ্রাফিক ডিজাইন', slug: 'graphic-design', icon: '🎨' }, h));
    expect(r.status).toBe(201);
    const lookups = (await call('/api/admin/lookups', { headers: h })).body.data;
    expect(lookups.courseCategories.map((c: any) => c.slug)).toContain('graphic-design');
    // No course yet: not in the sidebar, not in the sitemap.
    expect((await page('/courses')).html).not.toContain('course-cat-graphic-design');
    expect((await page('/sitemap.xml')).html).not.toContain('/course-category/graphic-design');
    // A category that has courses cannot be deleted.
    const dm = lookups.courseCategories.find((c: any) => c.slug === 'digital-marketing');
    expect((await call(`/api/admin/course-categories/${dm.id}`, { method: 'DELETE', headers: h })).status).toBe(409);
  });

  it('shows a coming-soon course with its lesson list and an interest form — no enrolment yet', async () => {
    const { status, html } = await page(`/course/${SLUG}`);
    expect(status).toBe(200);
    for (const t of ['কোর্সের লেসন — ধাপে ধাপে', 'শীঘ্রই আসছে', 'চালু হলে জানতে চাই', 'data-lead-form', 'বিজ্ঞাপন']) expect(html, t).toContain(t);
    expect(html).not.toContain('data-enroll-main');
    expect((await page(`/enroll/${SLUG}`)).status).toBe(302);
    expect((await enrol('01799000001')).status).toBe(404);
  });

  it('refuses to publish a course that has no lessons', async () => {
    const h = await adminSession();
    const cat = (await call('/api/admin/lookups', { headers: h })).body.data.courseCategories[0];
    const r = await call('/api/admin/courses', json({ category_id: cat.id, title: 'খালি কোর্স', slug: 'empty-course', price: 500 }, h));
    expect(r.status).toBe(201);
    expect((await call(`/api/admin/courses/${r.body.data.id}`, json({ status: 'published' }, h, 'PUT'))).status).toBe(422);
  });
});

describe('courses: a course opens only after the payment is confirmed', () => {
  it('sells, keeps the content private, then opens the course in the student profile after an admin confirms the money', async () => {
    const h = await adminSession();
    const { course, lessons } = await publishSeededCourse(h);

    // Sales page: price, ViewContent with the course content id, no private content anywhere.
    const sales = await page(`/course/${SLUG}`);
    expect(sales.html).toContain('data-enroll-main');
    expect(sales.html).toContain(`"content_ids":["course-${course.id}"]`);
    for (const secret of [PRIVATE_LINK, FILE_KEY, VIDEO_KEY, 'গোপন নোট']) expect(sales.html, secret).not.toContain(secret);
    expect((await page(`/lp/course/${SLUG}`)).html).not.toContain('class="nav-links"'); // ad page: no site menu

    // Enrol: an order of kind "course" and a student account — but no enrollment.
    const o = await enrol('01799000002');
    expect(o.status).toBe(201);
    const order = await env.DB.prepare('SELECT * FROM orders WHERE order_number = ?').bind(o.body.data.orderNumber).first<any>();
    expect(order.kind).toBe('course');
    expect(order.total).toBe(1500);
    const item = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(order.id).first<any>();
    expect(item.course_id).toBe(course.id);
    expect(contentIdOf(item)).toBe(`course-${course.id}`);
    const enrolled = () => env.DB.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE student_id = ? AND status = 'active'").bind(order.student_id).first<{ n: number }>();
    expect((await enrolled())!.n).toBe(0);

    // The student can sign in, but lessons, files and private videos stay closed.
    const s = await studentLogin('01799000002', 'student-pass-1');
    const learn = await page(`/learn/${SLUG}/${lessons[1].id}`, s);
    expect(learn.status).toBe(302);
    expect(learn.headers.get('location')).toBe(`/course/${SLUG}?not_enrolled=1`);
    expect((await page(`/learn/file/${lessons[1].id}`, s)).status).toBe(403);
    expect((await page(`/learn/video/${lessons[1].id}`, s)).status).toBe(403);
    expect((await page(`/media/${FILE_KEY}`)).status).toBe(404); // private uploads are never public media
    const dash = await page('/student', s);
    expect(dash.html).toContain(o.body.data.orderNumber); // waiting for payment
    expect(dash.html).not.toContain('class="card my-course"');

    // Bank reference submitted → still closed until a human confirms.
    const token = new URL(BASE + o.body.data.orderUrl).searchParams.get('t');
    expect((await call(`/api/orders/${o.body.data.orderNumber}/manual-payment`, json({ token, trx_id: 'BANK-777', sender: 'ব্যাংক' }))).status).toBe(200);
    expect((await enrolled())!.n).toBe(0);

    // Admin confirms → enrollment opens, the order is complete, the student sees the course.
    expect((await call(`/api/admin/orders/${order.id}/verify-payment`, json({ amount: 1500, confirm: true }, h))).status).toBe(200);
    expect((await enrolled())!.n).toBe(1);
    const paid = await env.DB.prepare('SELECT payment_status, project_status FROM orders WHERE id = ?').bind(order.id).first<any>();
    expect(paid).toEqual({ payment_status: 'paid', project_status: 'completed' });
    const detail = (await call(`/api/admin/orders/${order.id}`, { headers: h })).body.data;
    expect(detail.course.enrollments[0].status).toBe('active');
    expect(detail.nextStatuses).toEqual(['cancelled']);

    const open = await page(`/learn/${SLUG}/${lessons[1].id}`, s);
    expect(open.status).toBe(200);
    expect(open.headers.get('cache-control')).toContain('no-store');
    expect(open.html).toContain(PRIVATE_LINK);
    expect(open.html).toContain('গোপন নোট');
    expect(open.html).toContain(`/learn/video/${lessons[1].id}`);
    const file = await SELF.fetch(`${BASE}/learn/file/${lessons[1].id}`, { headers: s });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toContain('attachment');
    expect(await file.text()).toBe('PDF-BYTES');
    const part = await SELF.fetch(`${BASE}/learn/video/${lessons[1].id}`, { headers: { ...s, range: 'bytes=0-3' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 0-3/15');
    expect(await part.text()).toBe('0123');

    // Progress is saved per lesson.
    expect((await call('/api/student/progress', json({ lessonId: lessons[0].id, done: true }, s))).status).toBe(200);
    expect((await page('/student', s)).html).toMatch(/১\/১৪ লেসন সম্পন্ন/);

    // Another student cannot reach this course.
    await enrol('01799000003');
    const other = await studentLogin('01799000003', 'student-pass-1');
    expect((await page(`/learn/file/${lessons[1].id}`, other)).status).toBe(403);

    // Refund: cancelling the order closes the course again.
    expect((await call(`/api/admin/orders/${order.id}/status`, json({ status: 'cancelled', note: 'ফেরত' }, h))).status).toBe(200);
    expect((await enrolled())!.n).toBe(0);
    expect((await page(`/learn/${SLUG}`, s)).status).toBe(302);
  });

  it('does not count course sales as delivered website projects on the home page', async () => {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE project_status = 'completed' AND kind = 'website'").first<{ n: number }>();
    const html = (await page('/')).html;
    if (!r!.n) expect(html).not.toContain('প্রজেক্ট সফলভাবে সম্পন্ন');
  });

  it('opens a free course at once — and sends no Purchase for it', async () => {
    const h = await adminSession();
    const cat = (await call('/api/admin/lookups', { headers: h })).body.data.courseCategories[0];
    const c = (await call('/api/admin/courses', json({ category_id: cat.id, title: 'ফ্রি পরিচিতি কোর্স', slug: 'free-intro', price: 0 }, h))).body.data;
    expect((await call('/api/admin/course-lessons', json({ course_id: c.id, title: 'প্রথম লেসন', kind: 'text', body: 'স্বাগতম' }, h))).status).toBe(201);
    expect((await call(`/api/admin/courses/${c.id}`, json({ status: 'published' }, h, 'PUT'))).status).toBe(200);
    const o = await enrol('01799000004', '', 'free-intro');
    expect(o.status).toBe(201);
    expect(o.body.data.free).toBe(true);
    const s = await studentLogin('01799000004', 'student-pass-1');
    expect((await page('/learn/free-intro', s)).status).toBe(200);
    const order = await env.DB.prepare('SELECT * FROM orders WHERE order_number = ?').bind(o.body.data.orderNumber).first<any>();
    expect(order.payment_status).toBe('paid');
    const purchase = await env.DB.prepare("SELECT COUNT(*) AS n FROM tracking_log WHERE event = 'Purchase' AND status = 'sent'").first<{ n: number }>();
    expect(purchase!.n).toBe(0);
    // The order page fires no browser Purchase for a free enrolment.
    expect((await page(o.body.data.orderUrl)).html).not.toContain('"purchase":{');
  });

  it('an existing account keeps its password when the same number enrols again', async () => {
    const r = await enrol('01799000003'); // enrolled above with student-pass-1
    expect(r.body.data.existingAccount).toBe(true);
    const again = await call(`/api/courses/${SLUG}/order`, json({ name: 'অন্য', phone: '01799000003', password: 'other-password', payment_method: 'bank_transfer', agree: true }, { origin: BASE }));
    expect(again.status).toBe(201);
    expect((await SELF.fetch(BASE + '/api/student/login', json({ phone: '01799000003', password: 'other-password' }))).status).toBe(401);
  });
});

describe('courses: admin tools', () => {
  it('uploads lesson files privately and refuses unknown file types', async () => {
    const h = await adminSession();
    const fd = new FormData();
    fd.append('file', new File(['%PDF-1.4'], 'হ্যান্ডআউট sheet.pdf', { type: 'application/pdf' }));
    fd.append('private', '1');
    const r = await call('/api/admin/uploads', { method: 'POST', headers: h, body: fd });
    expect(r.status).toBe(201);
    expect(r.body.data.key).toMatch(/^private\/courses\/\d{4}-\d{2}\/[\w-]+\.pdf$/);
    expect((await page(`/media/${r.body.data.key}`)).status).toBe(404);
    const bad = new FormData();
    bad.append('file', new File(['MZ'], 'virus.exe', { type: 'application/octet-stream' }));
    bad.append('private', '1');
    expect((await call('/api/admin/uploads', { method: 'POST', headers: h, body: bad })).status).toBe(422);
  });

  it('gives a course by hand, resets a forgotten password and blocks a student', async () => {
    const h = await adminSession();
    const course = (await call(`/api/admin/courses?q=${SLUG}`, { headers: h })).body.data.items[0];
    const g = await call('/api/admin/enrollments/grant', json({ phone: '01799000005', name: 'উপহার শিক্ষার্থী', password: 'gift-pass-1', courseId: course.id, note: 'অফলাইন পেমেন্ট' }, h));
    expect(g.status).toBe(201);
    expect(g.body.data.created).toBe(true);
    const s = await studentLogin('01799000005', 'gift-pass-1');
    expect((await page(`/learn/${SLUG}`, s)).status).toBe(200);
    const enr = (await call(`/api/admin/enrollments?student_id=${g.body.data.studentId}`, { headers: h })).body.data.items[0];
    expect(enr.source).toBe('admin');
    // Password reset by staff: the old one stops working, the old session is signed out.
    expect((await call(`/api/admin/students/${g.body.data.studentId}`, json({ password: 'new-pass-22' }, h, 'PUT'))).status).toBe(200);
    expect((await SELF.fetch(BASE + '/api/student/login', json({ phone: '01799000005', password: 'gift-pass-1' }))).status).toBe(401);
    expect((await page(`/learn/${SLUG}`, s)).status).toBe(302);
    const s2 = await studentLogin('01799000005', 'new-pass-22');
    // Blocked: no more lessons.
    expect((await call(`/api/admin/students/${g.body.data.studentId}`, json({ is_blocked: 1 }, h, 'PUT'))).status).toBe(200);
    expect((await page(`/learn/${SLUG}`, s2)).status).toBe(302);
    const list = (await call('/api/admin/students?q=01799000005', { headers: h })).body.data.items[0];
    expect(list).not.toHaveProperty('password_hash');
  });
});
