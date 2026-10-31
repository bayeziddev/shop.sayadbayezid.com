import { test, expect } from '@playwright/test';

/**
 * Full conversion path: configure → pay → requirements intake.
 * Payment here is a bank transfer verified by an admin (the only path that can be
 * exercised without real gateway credentials). PAYMENT_MODE is sandbox, so no
 * Purchase event can reach any pixel.
 */
test.describe.configure({ mode: 'serial' });

test('configure → checkout → pay → requirements', async ({ page, browser }, info) => {
  test.skip(info.project.name === 'mobile', 'full flow runs once; mobile is covered by the layout test');

  // 1) Configure
  await page.goto('/package/fashion-premium');
  await expect(page.locator('h1')).toContainText('ফ্যাশন প্রিমিয়াম');
  await page.getByText('এআই চ্যাটবট').click();
  await page.locator('[data-stepper] [data-step="1"]').first().click();
  await page.locator('[data-stepper] [data-step="1"]').first().click();
  await expect(page.locator('[data-cfg="total"]')).toHaveText('৳৩২,০০০');

  // 2) Checkout — the summary must show the server-verified total, equal to the configurator's.
  await page.locator('[data-order-now]').click();
  await page.waitForURL('**/checkout');
  await expect(page.locator('[data-summary] .total strong')).toHaveText('৳৩২,০০০');
  await page.fill('input[name=name]', 'পরীক্ষা ক্লায়েন্ট');
  await page.fill('input[name=phone]', '01711000000');
  await page.fill('input[name=email]', 'e2e@example.com');
  await page.check('input[value=bank_transfer]');
  await page.check('input[name=agree]');
  await page.locator('[data-place-order]').click();
  await page.waitForURL('**/order/**');
  await expect(page.locator('h1')).toContainText('পেমেন্ট বাকি');
  const orderUrl = page.url();

  // 3) Client submits the bank reference
  await page.fill('input[name=trx_id]', 'BANK-REF-777');
  await page.fill('input[name=sender]', 'পরীক্ষা ব্যাংক');
  await page.getByRole('button', { name: 'পেমেন্টের তথ্য জমা দিন' }).click();
  await expect(page.locator('h1')).toContainText('যাচাই করা হচ্ছে');

  // Requirements are still locked
  const portalUrl = orderUrl.replace('/order/', '/portal/');
  await page.goto(portalUrl);
  await expect(page.getByText('পেমেন্ট নিশ্চিত হওয়ার পর এখানে')).toBeVisible();

  // 4) Admin verifies the payment
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/admin/');
  await admin.fill('input[name=token]', 'e2e-setup-token');
  await admin.fill('input[name=name]', 'অ্যাডমিন');
  await admin.fill('input[name=email]', 'admin@e2e.local');
  await admin.fill('input[name=password]', 'e2e-password-123');
  await admin.click('button.primary');
  await expect(admin.getByRole('heading', { name: 'অ্যাডমিন লগইন' })).toBeVisible();
  await admin.fill('input[name=email]', 'admin@e2e.local');
  await admin.fill('input[name=password]', 'e2e-password-123');
  await admin.click('button.primary');
  await admin.waitForSelector('.kpis');
  await admin.goto('/admin/#/orders/1');
  await admin.check('[data-paid-confirm]');
  await admin.click('[data-verify]');
  await expect(admin.locator('.slide')).toContainText('INV-');

  // 5) Requirements intake unlocks
  await page.goto(orderUrl);
  await expect(page.locator('h1')).toContainText('পেমেন্ট সফল');
  await page.getByRole('link', { name: /প্রজেক্টের তথ্য জমা দিন/ }).click();
  await page.fill('input[name=business_name]', 'পরীক্ষা ফ্যাশন');
  await page.fill('textarea[name=business_description]', 'আমরা শাড়ি ও থ্রি-পিস বিক্রি করি');
  await page.selectOption('select[name=has_domain]', 'না, কিনে দিতে হবে');
  await page.selectOption('select[name=content_ready]', 'কিছু প্রস্তুত');
  await page.getByRole('button', { name: 'তথ্য জমা দিন' }).click();
  await expect(page.locator('.timeline li.current')).toContainText('তথ্য সংগ্রহ সম্পন্ন');
});

test('chat bubble shows the channel picker first', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-chat-open]').click();
  await expect(page.locator('[data-chat-picker]')).toBeVisible();
  await expect(page.locator('[data-chat-ai]')).toBeHidden();
  await expect(page.locator('[data-channel="ai"]')).toBeVisible();
});

test('mobile layout has no horizontal overflow', async ({ page }) => {
  for (const path of ['/', '/package/fashion-premium', '/checkout']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
