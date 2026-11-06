import { test, expect } from '@playwright/test';

/** Lead box, design gallery, package page — what a visitor coming from an ad sees. */

test('lead box opens by itself after 10 seconds on a first visit', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('dialog.leadbox')).toHaveCount(0);
  await page.clock.runFor(11_000);
  await expect(page.locator('dialog.leadbox')).toBeVisible();
  await expect(page.locator('.lb-msg.bot').last()).toContainText('ওয়েবসাইট');
  // Dismissed → it does not come back on the next page.
  await page.locator('[data-lb-close]').click();
  await page.goto('/packages');
  await page.clock.runFor(15_000);
  await expect(page.locator('dialog.leadbox[open]')).toHaveCount(0);
});

test('lead box: one-tap questions, contact at 75%, then WhatsApp hand-off', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-leadbox-open]').first().click();
  const box = page.locator('dialog.leadbox');
  await expect(box).toBeVisible();
  await box.getByRole('button', { name: /ই-কমার্স ওয়েবসাইট/ }).click();
  await box.getByRole('button', { name: /গ্যাজেট ও টেক/ }).click();
  await box.getByRole('button', { name: /নতুন ব্যবসা শুরু করছি/ }).click();
  await box.getByRole('button', { name: /এই মাসের মধ্যে/ }).click();
  await expect(box.locator('.lb-demo').first()).toBeVisible();
  await box.locator('.lb-demo-pick').first().click();
  await expect(box.locator('.lb-progress')).toHaveAttribute('aria-valuenow', '75');
  // Earlier answers stay visible as a conversation.
  await expect(box.locator('.lb-msg.me')).toHaveCount(5);
  await box.locator('input[name=name]').fill('ই২ই ক্লায়েন্ট');
  await box.locator('input[name=phone]').fill('01712345678');
  await box.getByRole('button', { name: /ফ্রি প্রস্তাব নিন/ }).click();
  await expect(box.getByRole('heading', { name: /ধন্যবাদ/ })).toBeVisible();
  await expect(box.locator('[data-lb-wa]')).toHaveAttribute('href', /^https:\/\/wa\.me\/8801519601517\?text=/);
  await expect(box.locator('.lb-progress')).toHaveAttribute('aria-valuenow', '100');
  // Phones hand over to WhatsApp after 3 s — stop it so the test stays on the page (desktop has no auto-redirect).
  if (await box.locator('[data-lb-cancel]').count()) await box.locator('[data-lb-cancel]').click();
});

test('lead box asks again for a wrong WhatsApp number', async ({ page }) => {
  await page.goto('/contact');
  await page.locator('[data-leadbox-from="contact"]').click();
  const box = page.locator('dialog.leadbox');
  for (const name of [/সিঙ্গেল প্রোডাক্ট/, /হারবাল/, /চালু আছে — ফেসবুক/, /শুধু খোঁজ/]) await box.getByRole('button', { name }).first().click();
  await box.getByRole('button', { name: /এখনো ঠিক করিনি/ }).click();
  await box.locator('input[name=name]').fill('রহিম');
  await box.locator('input[name=phone]').fill('12345');
  await box.getByRole('button', { name: /ফ্রি প্রস্তাব নিন/ }).click();
  await expect(box.locator('[data-lb-msg]')).toContainText('হোয়াটসঅ্যাপ নম্বর');
  await box.locator('[data-lb-back]').click();
  await expect(box.locator('.lb-demo').first()).toBeVisible();
});

test('design gallery filters by type and opens a screenshot', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sb_leadbox_v1', JSON.stringify({ done: Date.now() })));
  await page.goto('/designs');
  await page.locator('[data-filter="checkout"]').click();
  await expect(page).toHaveURL(/kind=checkout/);
  const visible = page.locator('.design-card:not([data-filter-hidden])');
  expect(await visible.count()).toBeGreaterThan(5);
  for (const k of await visible.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(k).toBe('checkout');
  await visible.first().locator('[data-lightbox]').click();
  await expect(page.locator('dialog.lightbox')).toBeVisible();
});

test('package page: screenshots, demo buttons and a working order button', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('sb_leadbox_v1', JSON.stringify({ done: Date.now() })));
  await page.goto('/package/cwb-gaming');
  await expect(page.locator('h1')).toContainText('CWB Gaming');
  await expect(page.locator('.demo-btns a')).toHaveCount(3); // marketplace, admin, seller
  await expect(page.locator('.tour-row').first()).toBeVisible(); // screenshot feature tour
  await expect(page.locator('.az-card').first()).toBeVisible();   // A-to-Z features
  await expect(page.locator('.addons')).toHaveCount(0);            // one fixed price
  if (info.project.name === 'mobile') {
    await expect(page.locator('[data-sticky-cta]')).toBeHidden();
    await page.locator('#features').scrollIntoViewIfNeeded(); // one jump, past the order button
    await expect(page.locator('[data-sticky-cta]')).toBeVisible();
  }
  await page.locator('[data-order-now-proxy]').first().click();
  await page.waitForURL('**/checkout');
});

test('pages have no horizontal overflow, down to small 360px phones', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('sb_leadbox_v1', JSON.stringify({ done: Date.now() })));
  // Mobile also checks a 360px phone: font metrics differ between machines, so leave real headroom.
  const widths = info.project.name === 'mobile' ? [page.viewportSize()!.width, 360] : [page.viewportSize()!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/packages', '/designs', '/portfolio', '/package/sidra-jewellery', '/contact', '/checkout']) {
      await page.goto(path);
      // Compare with the intended width: a too-wide element makes mobile Chrome zoom out and widen innerWidth too.
      const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, width);
      expect(overflow, `${path} @ ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
