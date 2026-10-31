import type { Env } from '../env';
import { html, raw, jsonScript, esc, safeUrl, type Raw } from '../lib/html';
import type { SiteSettings } from '../lib/settings';

export interface BannerRow { id: number; kind: 'bar' | 'popup'; title: string; body: string; cta_label: string; cta_url: string; image_key: string | null; target: string }

export interface PageCtx {
  env: Env;
  settings: SiteSettings;
  title: string;
  description?: string;
  path: string;
  pageType: 'home' | 'category' | 'package' | 'checkout' | 'order' | 'portal' | 'static' | 'landing' | 'quiz' | 'notfound';
  banners?: BannerRow[];
  /** Browser-side pixel event for this page view; the Worker mirrors it via CAPI using the same eventId. */
  pageEvent?: { name: 'ViewContent'; eventId: string; customData: Record<string, unknown> };
  /** Only set when a real, gateway-confirmed, live-mode payment exists. */
  purchaseEvent?: { eventId: string; value: number; contentIds: string[]; orderNumber: string };
  landingPageId?: number;
  noindex?: boolean;
  hideChrome?: boolean;
  ogImage?: string;
}

export function logoSvg(size = 36): Raw {
  return raw(`<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect x="2" y="2" width="44" height="44" rx="13" fill="url(#lg)"/><path d="M18 15 9.5 24 18 33M30 15l8.5 9L30 33" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M26.5 13 21.5 35" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/></svg>`);
}

function trackingConfig(ctx: PageCtx) {
  const prod = ctx.env.APP_ENV === 'production';
  const s = ctx.settings;
  // Outside production nothing third-party is loaded, so no test traffic can reach the real pixel.
  return {
    pixelId: prod ? s.meta_pixel_id : '',
    ga4: prod ? s.ga4_id : '',
    gtm: prod ? s.gtm_id : '',
    clarity: prod ? s.clarity_id : '',
    pageEvent: ctx.pageEvent || null,
    purchase: prod && ctx.env.PAYMENT_MODE === 'live' ? ctx.purchaseEvent || null : null,
    landingPageId: ctx.landingPageId || null,
  };
}

export function layout(ctx: PageCtx, body: Raw): Response {
  const s = ctx.settings;
  const fullTitle = ctx.title ? `${ctx.title} | ${s.brand_name}` : `${s.brand_name} — ${s.brand_tagline}`;
  const desc = ctx.description || s.brand_tagline;
  const canonical = `${ctx.env.SITE_URL}${ctx.path}`;
  const bar = (ctx.banners || []).find((b) => b.kind === 'bar');
  const popup = (ctx.banners || []).find((b) => b.kind === 'popup');
  const page = html`<!doctype html>
<html lang="bn" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
${ctx.noindex ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="bn_BD">
${ctx.ogImage ? html`<meta property="og:image" content="${ctx.env.SITE_URL}${ctx.ogImage}">` : ''}
<meta name="theme-color" content="#0b0a1f" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f6fb" media="(prefers-color-scheme: light)">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/anek-bangla-bengali-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/hind-siliguri-bengali-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
<script src="/assets/js/theme.js"></script>
${jsonScript('track-config', trackingConfig(ctx))}
<script src="/assets/js/track.js" defer></script>
<script src="/assets/js/app.js" type="module"></script>
</head>
<body class="page-${ctx.pageType}">
<a class="skip" href="#main">মূল অংশে যান</a>
${bar ? html`<div class="promo-bar" data-banner="${bar.id}"><span><strong>${bar.title}</strong> ${bar.body}</span>${bar.cta_url && safeUrl(bar.cta_url) ? html`<a href="${safeUrl(bar.cta_url)}">${bar.cta_label || 'বিস্তারিত'}</a>` : ''}<button class="promo-close" aria-label="বন্ধ করুন" data-close-banner="${bar.id}">×</button></div>` : ''}
${ctx.hideChrome ? '' : header(ctx)}
<main id="main">${body}</main>
${ctx.hideChrome ? miniFooter(ctx) : footer(ctx)}
${chatLauncher()}
${popup ? html`<dialog class="popup" data-popup="${popup.id}"><button class="popup-x" aria-label="বন্ধ করুন" data-close-popup>×</button>${popup.image_key ? html`<img src="/media/${popup.image_key}" alt="" loading="lazy">` : ''}<h3>${popup.title}</h3><p>${popup.body}</p>${safeUrl(popup.cta_url) ? html`<a class="btn btn-primary" href="${safeUrl(popup.cta_url)}">${popup.cta_label || 'বিস্তারিত দেখুন'}</a>` : ''}</dialog>` : ''}
<div class="toast-wrap" aria-live="polite"></div>
</body>
</html>`;
  return new Response(page.value, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': ctx.noindex ? 'private, no-store' : 'public, max-age=0, s-maxage=60' },
  });
}

function header(ctx: PageCtx): Raw {
  const s = ctx.settings;
  const link = (href: string, label: string) => html`<a href="${href}" ${ctx.path === href ? raw('aria-current="page"') : ''}>${label}</a>`;
  return html`<header class="site-header">
  <div class="container nav">
    <a class="brand" href="/">${logoSvg()}<span>${s.brand_name}</span></a>
    <nav class="nav-links" id="nav-links" aria-label="প্রধান মেনু">
      ${link('/', 'হোম')}
      ${link('/#categories', 'ক্যাটাগরি')}
      ${link('/quiz', 'কোন প্যাকেজ আমার জন্য?')}
      ${link('/faq', 'প্রশ্নোত্তর')}
      ${link('/contact', 'যোগাযোগ')}
      ${link('/account', 'আমার অর্ডার')}
    </nav>
    <div class="nav-actions">
      <button class="icon-btn" data-theme-toggle aria-label="থিম পরিবর্তন করুন"><span class="i-sun">☀</span><span class="i-moon">☾</span></button>
      <a class="icon-btn cart-btn" href="/checkout" aria-label="কার্ট"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg><span class="cart-count" data-cart-count hidden>০</span></a>
      <button class="icon-btn menu-btn" aria-controls="nav-links" aria-expanded="false" data-menu-toggle aria-label="মেনু">☰</button>
    </div>
  </div>
</header>`;
}

function footer(ctx: PageCtx): Raw {
  const s = ctx.settings;
  const y = new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(new Date().getFullYear());
  return html`<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand" href="/">${logoSvg(30)}<span>${s.brand_name}</span></a>
      <p class="muted">${s.brand_tagline}</p>
    </div>
    <div><h4>সেবা</h4><a href="/#categories">সব ক্যাটাগরি</a><a href="/quote">কাস্টম কোটেশন</a><a href="/quiz">প্যাকেজ বাছাই কুইজ</a></div>
    <div><h4>সহায়তা</h4><a href="/faq">প্রশ্নোত্তর</a><a href="/account">অর্ডারের অবস্থা</a><a href="/contact">যোগাযোগ</a><a href="/about">আমাদের সম্পর্কে</a></div>
    <div><h4>নীতিমালা</h4><a href="/refund-policy">রিফান্ড নীতি</a><a href="/terms">শর্তাবলি</a><a href="/privacy">গোপনীয়তা নীতি</a></div>
  </div>
  <div class="container footer-bottom">
    <span>© ${y} ${s.brand_name}</span>
    <span class="muted small">এই সাইটে বিজ্ঞাপনের ফলাফল মাপতে কুকি ব্যবহৃত হয় — <a href="/privacy">বিস্তারিত</a></span>
  </div>
</footer>`;
}

function miniFooter(ctx: PageCtx): Raw {
  return html`<footer class="site-footer mini"><div class="container footer-bottom"><span>${ctx.settings.brand_name}</span><span><a href="/privacy">গোপনীয়তা নীতি</a> · <a href="/terms">শর্তাবলি</a> · <a href="/refund-policy">রিফান্ড নীতি</a></span></div></footer>`;
}

function chatLauncher(): Raw {
  return html`<div class="chat" data-chat>
  <button class="chat-bubble" data-chat-open aria-haspopup="dialog" aria-expanded="false" aria-label="চ্যাট করুন">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
  </button>
  <div class="chat-panel" role="dialog" aria-label="চ্যাট" hidden>
    <div class="chat-head"><strong>কীভাবে কথা বলতে চান?</strong><button class="icon-btn" data-chat-close aria-label="বন্ধ করুন">×</button></div>
    <div class="chat-picker" data-chat-picker>
      <button class="chat-option" data-channel="ai" hidden><span class="co-ico">🤖</span><span><strong>এআই সাপোর্ট</strong><small>প্যাকেজ, দাম ও কাজের ধাপ নিয়ে সাথে সাথে উত্তর</small></span></button>
      <a class="chat-option" data-channel="whatsapp" target="_blank" rel="noopener" hidden><span class="co-ico">💬</span><span><strong>হোয়াটসঅ্যাপ</strong><small>সরাসরি আমাদের নম্বরে মেসেজ করুন</small></span></a>
      <a class="chat-option" data-channel="messenger" target="_blank" rel="noopener" hidden><span class="co-ico">✉️</span><span><strong>মেসেঞ্জার</strong><small>ফেসবুক পেজে মেসেজ করুন</small></span></a>
    </div>
    <div class="chat-ai" data-chat-ai hidden>
      <div class="chat-log" data-chat-log aria-live="polite"></div>
      <form class="chat-form" data-chat-form><input name="m" autocomplete="off" maxlength="600" placeholder="আপনার প্রশ্ন লিখুন…" aria-label="আপনার প্রশ্ন" required><button class="btn btn-primary btn-sm">পাঠান</button></form>
      <button class="link-btn" data-chat-back>← অন্য মাধ্যম বেছে নিন</button>
    </div>
  </div>
</div>`;
}

export const metaDesc = (s: string) => esc(s).slice(0, 160);
