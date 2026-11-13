import { test, expect, type APIResponse, type Page } from '@playwright/test';

/**
 * Course sale, end to end: the admin prices and publishes a course and adds private lesson content →
 * a student enrols and pays by bank transfer → nothing opens until an admin confirms the money →
 * then the course is in the student's profile and the lessons play, private links included.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sb_leadbox_v1', JSON.stringify({ done: Date.now() })));
});

const SLUG = 'facebook-digital-marketing';
const PRIVATE_LINK = 'https://drive.google.com/drive/folders/e2e-private-course-folder';

/** First-run setup (whichever spec gets there first) and a staff session in this page's browser context. */
async function adminLogin(page: Page) {
  const r = page.request;
  await r.post('/api/admin/auth/setup', { data: { token: 'e2e-setup-token', name: 'অ্যাডমিন', email: 'admin@e2e.local', password: 'e2e-password-123' } });
  const login = await r.post('/api/admin/auth/login', { data: { email: 'admin@e2e.local', password: 'e2e-password-123' } });
  expect(login.ok()).toBeTruthy();
  // The admin API's CSRF check wants this header on every change, as the admin app sends it.
  const headers = { 'x-requested-with': 'admin' };
  return {
    get: (url: string) => r.get(url, { headers }),
    put: (url: string, o: { data: unknown }) => r.put(url, { ...o, headers }),
  };
}
const data = async (res: APIResponse) => (await res.json()).data;

test('admin publishes a course → student enrols and pays → admin confirms → the course opens in the profile', async ({ page, browser }, info) => {
  test.skip(info.project.name === 'mobile', 'full flow runs once; mobile is covered by the layout test');

  // 1) Admin: price, publish, and put private content in two lessons.
  const admin = await (await browser.newContext()).newPage();
  const api = await adminLogin(admin);
  const course = (await data(await api.get(`/api/admin/courses?q=${SLUG}`))).items[0];
  const cur = await data(await api.get(`/api/admin/courses/${course.id}/curriculum`));
  const [first, second] = cur.lessons;
  expect((await api.put(`/api/admin/course-lessons/${first.id}`, { data: { video_url: 'https://youtu.be/dQw4w9WgXcQ', is_preview: 1 } })).ok()).toBeTruthy();
  expect((await api.put(`/api/admin/course-lessons/${second.id}`, { data: { kind: 'link', link_url: PRIVATE_LINK, body: 'শুধু ভর্তি শিক্ষার্থীদের নোট' } })).ok()).toBeTruthy();
  // A private file must come from the private upload, never a public path.
  expect((await api.put(`/api/admin/course-lessons/${second.id}`, { data: { file_key: 'public/2026-11/x.pdf' } })).status()).toBe(422);
  expect((await api.put(`/api/admin/courses/${course.id}`, { data: { price: 1500, regular_price: 2000, status: 'published' } })).ok()).toBeTruthy();

  // The course editor lists the lessons.
  await admin.goto(`/admin/#/courses/${course.id}`);
  await expect(admin.locator('[data-lessons]')).toContainText(second.title);

  // 2) Visitor: the sales page shows the price and the lesson list, never the private content.
  await page.goto(`/course/${SLUG}`);
  await expect(page.locator('h1')).toContainText('ফেসবুক ও ডিজিটাল মার্কেটিং');
  await expect(page.locator('.course-buy-price .c-price')).toHaveText('৳১,৫০০');
  await expect(page.locator('.cur-lesson').filter({ hasText: second.title })).toContainText('🔒');
  expect(await page.content()).not.toContain(PRIVATE_LINK);

  // 3) Enrol and pay by bank transfer.
  await page.locator('[data-enroll-main]').click();
  await page.waitForURL(`**/enroll/${SLUG}`);
  await page.fill('input[name=name]', 'পরীক্ষা শিক্ষার্থী');
  await page.fill('input[name=phone]', '01722000111');
  await page.fill('input[name=password]', 'student-pass-1');
  await page.check('input[value=bank_transfer]');
  await page.check('input[name=agree]');
  await page.locator('[data-enroll-submit]').click();
  await page.waitForURL('**/order/**');
  await expect(page.locator('h1')).toContainText('পেমেন্ট বাকি');
  const orderNo = decodeURIComponent(page.url().split('/order/')[1].split('?')[0]);
  await page.fill('input[name=trx_id]', 'BANK-REF-COURSE-1');
  await page.fill('input[name=sender]', 'পরীক্ষা ব্যাংক');
  await page.getByRole('button', { name: 'পেমেন্টের তথ্য জমা দিন' }).click();
  await expect(page.locator('h1')).toContainText('যাচাই করা হচ্ছে');

  // 4) Not paid yet: the student can sign in, but the course is not open.
  await page.goto('/student');
  await page.fill('input[name=phone]', '01722000111');
  await page.fill('input[name=password]', 'student-pass-1');
  await page.getByRole('button', { name: 'লগইন' }).click();
  await expect(page.locator('.student-head h1')).toContainText('পরীক্ষা শিক্ষার্থী');
  await expect(page.locator('.my-course')).toHaveCount(0);
  await expect(page.locator('.pending-list')).toContainText(orderNo);
  await page.goto(`/learn/${SLUG}/${second.id}`);
  await expect(page).toHaveURL(new RegExp(`/course/${SLUG}\\?not_enrolled=1`));
  expect(await page.content()).not.toContain(PRIVATE_LINK);

  // 5) Admin confirms the money arrived (the order is a course order, with no project steps).
  const order = (await data(await api.get(`/api/admin/orders?q=${encodeURIComponent(orderNo)}`))).items[0];
  expect(order.kind).toBe('course');
  await admin.goto(`/admin/#/orders/${order.id}`);
  await expect(admin.locator('.slide')).toContainText('কোর্স অর্ডার');
  await admin.check('[data-paid-confirm]');
  await admin.click('[data-verify]');
  await expect(admin.locator('.slide')).toContainText('প্রোফাইলে চালু');

  // 6) Student: the course is in the profile; the lessons open, private link and notes included.
  await page.goto('/student');
  await expect(page.locator('.my-course')).toContainText('ফেসবুক ও ডিজিটাল মার্কেটিং');
  await page.locator('.my-course .btn-primary').click();
  await expect(page.locator('.learn-main h1')).toHaveText(first.title);
  await page.locator('[data-lesson-done]').click();
  await expect(page.locator('.learn-main h1')).toHaveText(second.title);
  await expect(page.locator('.learn-main a[href^="https://drive.google.com"]')).toHaveAttribute('href', PRIVATE_LINK);
  await expect(page.locator('.lesson-notes')).toContainText('শুধু ভর্তি শিক্ষার্থীদের নোট');
  await expect(page.locator('.learn-side .cur-lesson.is-done')).toHaveCount(1);

  // 7) Admin: the access is listed with its order; switching it off closes the lessons again.
  await admin.goto(`/admin/#/enrollments?course_id=${course.id}`);
  const row = admin.locator('tr', { hasText: 'পরীক্ষা শিক্ষার্থী' });
  await expect(row).toContainText(orderNo);
  await row.getByRole('button', { name: 'বন্ধ করুন' }).click();
  // Wait for the saved state (the list reloads with "turn back on"), not for text the button already had.
  await expect(row.getByRole('button', { name: 'আবার চালু' })).toBeVisible();
  await page.goto(`/learn/${SLUG}/${second.id}`);
  await expect(page).toHaveURL(new RegExp(`/course/${SLUG}\\?not_enrolled=1`));
});
