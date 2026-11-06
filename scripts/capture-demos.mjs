#!/usr/bin/env node
/**
 * Screenshot every demo product into public/assets/demos/<slug>/ (WebP), for the package pages,
 * the cards and the design gallery.
 *
 *   node scripts/capture-demos.mjs <path-to-websites-tamplate-checkout> [--builds <dir>] [--only slug,slug]
 *
 * The demos are served from the local checkout (no network needed for the demos themselves).
 * Analytics/pixel requests made by the demos are BLOCKED while capturing, so no screenshot run ever
 * sends a page view to a real GA4 / Meta Pixel / Clarity account.
 *
 * React/Vue demos must be built first; pass --builds <dir> where <dir>/<name>/dist (or <name>/dist)
 * holds each build named in demo-catalog.mjs (capture.build).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';
import { PRODUCTS } from './demo-catalog.mjs';

const args = process.argv.slice(2);
const repo = resolve(args[0] || '../websites-tamplate');
const buildsDir = args.includes('--builds') ? resolve(args[args.indexOf('--builds') + 1]) : null;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const cdnDir = args.includes('--cdn') ? resolve(args[args.indexOf('--cdn') + 1]) : null;
const outRoot = resolve('public/assets/demos');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };

/** Tiny static server: / → template checkout (or `base`), /__build/<name>/ → <builds>/<name>/dist. */
function serve(port, base = repo) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let root = base;
      const m = path.match(/^\/__build\/([a-z0-9_-]+)(\/.*)?$/);
      if (m && buildsDir) { root = join(buildsDir, m[1], 'dist'); path = m[2] || '/'; }
      let file = normalize(join(root, path));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

const BLOCK = /(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|connect\.facebook\.net|facebook\.com\/tr|clarity\.ms|hotjar|doubleclick\.net)/;
const CDN = {
  'chart.js@4.4.4/dist/chart.umd.min.js': 'chart.js-4.4.4/package/dist/chart.umd.js',
  'jsbarcode@3.11.6/dist/JsBarcode.all.min.js': 'jsbarcode-3.11.6/package/dist/JsBarcode.all.min.js',
  'qrcode-generator@1.4.4/qrcode.min.js': 'qrcode-generator-1.4.4/package/qrcode.js',
};

async function prep(page) {
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (BLOCK.test(u)) return route.abort();
    const cdn = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(.+)$/);
    if (cdn) {
      const local = cdnDir && CDN[cdn[1]];
      if (local) return route.fulfill({ body: await readFile(join(cdnDir, local)), contentType: 'text/javascript' });
      return route.abort();
    }
    if (/^https:\/\/images\.unsplash\.com/.test(u)) return route.abort();
    return route.continue();
  });
}

/** Hide promo popups / cookie bars so the screenshot shows the page itself. */
async function tidy(page) {
  await page.keyboard.press('Escape').catch(() => {});
  // Consent/analytics prompts: always answer "no" (we never want a screenshot run counted as a visitor).
  const no = page.locator('button').filter({ hasText: /^\s*(not now|no thanks|decline|reject all|reject)\s*$/i }).first();
  if (await no.count().catch(() => 0)) await no.click({ timeout: 1500 }).catch(() => {});
  await page.addStyleTag({ content: '.popup-scrim,.promo-popup,[class*="cookie"],[id*="cookie"],.toast,.toasts{display:none!important}' }).catch(() => {});
  await page.waitForTimeout(300);
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.waitForTimeout(3000));
  await page.waitForTimeout(1800);
  await tidy(page);
}

let conv;
async function toWebp(png, quality = 0.8) {
  const b64 = png.toString('base64');
  const out = await conv.evaluate(async ({ b64, quality }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', quality).split(',')[1];
  }, { b64, quality });
  return Buffer.from(out, 'base64');
}

async function save(dir, name, png, q) {
  await writeFile(join(dir, `${name}.webp`), await toWebp(png, q));
  return name;
}

/** Element screenshot of the first visible match, capped in height. */
async function shootEl(page, selectors, maxH) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 200 || box.height < 40) continue;
    if (box.height > maxH) {
      return page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: maxH }, fullPage: true });
    }
    return el.screenshot();
  }
  return null;
}

const ADD = /কার্টে যোগ|কার্টে নিন|ব্যাগে যোগ|Add to cart|Add to bag|ADD TO CART/i;

/** Open the first product, return its screenshot, then put it in the cart. */
async function productAndCart(page) {
  let shot = null;
  const link = page.locator('main a[href*="/product"], a[href*="product.html"], a[href*="/product/"], a[href*="/single/"]').first();
  if (await link.count()) {
    await link.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await tidy(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const broken = await page.locator('text=/Failed to fetch|Something went wrong|not found/i').count().catch(() => 0);
    if (!broken) shot = await page.screenshot();
  }
  // Variant pickers (size / colour) must be chosen before "add to cart" works.
  for (const sel of ['.size-opts button:not([disabled])', '[data-size]:not([disabled])', '.colour-opts button', '[class*="size"] button:not([disabled])']) {
    const opt = page.locator(sel).first();
    if (await opt.count().catch(() => 0)) { await opt.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
  }
  const btn = page.locator('button, a, input[type=submit]').filter({ hasText: ADD }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  return shot;
}

async function captureProduct(browser, base, p) {
  const dir = join(outRoot, p.slug);
  await mkdir(dir, { recursive: true });
  const c = p.capture;
  // Demos that use absolute paths (/styles.css) get their own server rooted at their folder.
  const own = c.root ? await serve(4378, join(repo, c.root)) : null;
  if (own) base = 'http://127.0.0.1:4378';
  const prefix = c.build ? `${base}/__build/${c.build}/` : `${base}/`;
  const url = (x) => (x.startsWith('#') ? null : prefix + x);
  const got = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await prep(desktop); await prep(mobile);
  try {
    if (c.store) {
      await open(desktop, url(c.store));
      got.push(await save(dir, 'cover', await desktop.screenshot(), 0.8));
      const header = await shootEl(desktop, ['header.site-header', 'header', '.navbar', 'nav'], 320);
      if (header) got.push(await save(dir, 'header', header, 0.85));
      await desktop.evaluate(() => window.scrollTo(0, window.innerHeight * 0.95));
      await desktop.waitForTimeout(900);
      got.push(await save(dir, 'section', await desktop.screenshot(), 0.8));
      await desktop.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await desktop.waitForTimeout(900);
      const footer = await shootEl(desktop, ['footer.site-footer', 'footer'], 700);
      if (footer) got.push(await save(dir, 'footer', footer, 0.85));

      await open(mobile, url(c.store));
      got.push(await save(dir, 'mobile', await mobile.screenshot(), 0.78));

      if (c.checkout) {
        await open(desktop, c.checkout.startsWith('#') ? `${url(c.store)}?shot=2#/shop` : url(c.store));
        const product = await productAndCart(desktop);
        if (product) got.push(await save(dir, 'product', product, 0.8));
        await open(desktop, c.checkout.startsWith('#') ? `${url(c.store)}?shot=3${c.checkout}` : url(c.checkout));
        got.push(await save(dir, 'checkout', await desktop.screenshot(), 0.8));
      }
    }
    if (c.admin) {
      const a = c.admin.includes('#') ? `${prefix}${c.admin.replace(/#.*/, '')}?shot=1#${c.admin.split('#')[1]}` : url(c.admin);
      await open(desktop, a);
      if (c.adminLogin && (await desktop.locator('input[type=password]').count())) {
        await desktop.locator('input:not([type=password]):not([type=hidden]):not([type=checkbox])').first().fill(c.adminLogin[0]);
        await desktop.locator('input[type=password]').first().fill(c.adminLogin[1]);
        await desktop.locator('input[type=password]').first().press('Enter');
        await desktop.waitForTimeout(2500);
        await tidy(desktop);
      }
      got.push(await save(dir, c.store ? 'admin' : 'cover', await desktop.screenshot(), 0.8));
      const side = await shootEl(desktop, ['aside', '.sidebar', '[class*="sidebar"]', 'nav.side', 'nav[aria-label]'], 900);
      if (side) got.push(await save(dir, 'sidebar', side, 0.85));
      if (!c.store) {
        await open(mobile, a);
        got.push(await save(dir, 'mobile', await mobile.screenshot(), 0.78));
        await desktop.evaluate(() => window.scrollTo(0, window.innerHeight * 0.95));
        await desktop.waitForTimeout(700);
        got.push(await save(dir, 'section', await desktop.screenshot(), 0.8));
      }
    }
  } finally {
    await desktop.close(); await mobile.close();
    own?.close();
  }
  return got;
}

const server = await serve(4377);
const browser = await chromium.launch({ args: ['--no-sandbox'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
conv = await browser.newPage();
const manifestPath = join(outRoot, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
try {
  for (const p of PRODUCTS) {
    if (only && !only.includes(p.slug)) continue;
    try {
      const shots = await captureProduct(browser, 'http://127.0.0.1:4377', p);
      manifest[p.slug] = shots;
      console.log(`✓ ${p.slug}: ${shots.join(', ')}`);
    } catch (e) {
      console.log(`! ${p.slug}: ${e.message.split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
