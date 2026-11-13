import { html, raw, safeUrl, type Raw } from '../lib/html';
import { isOfferLive, priceLine } from '../../../shared/pricing';
import { mediaSrc, type VideoSource } from '../../../shared/media';
import type { PublicPackage, CouponRow } from '../lib/catalog';
import { taka, bnDigits } from '../lib/util';

const GRADIENTS = ['#3b82f6,#8b5cf6', '#6366f1,#ec4899', '#06b6d4,#6366f1', '#8b5cf6,#d946ef', '#0ea5e9,#22d3ee', '#7c3aed,#2563eb'];

export const TIER_BN: Record<string, string> = { basic: 'বেসিক', standard: 'রেডি সাইট', premium: 'প্রিমিয়াম', custom: 'কাস্টম' };
export const tierLabel = (t: string) => TIER_BN[t] || t;

/** Screenshot captions from the file name (cover.webp → হোমপেজ …). Uploaded images get a numbered caption. */
const SHOT_BN: Record<string, string> = {
  cover: 'হোমপেজ', section: 'হোমপেজের আরও অংশ', product: 'পণ্যের পেজ', checkout: 'চেকআউট', admin: 'অ্যাডমিন ড্যাশবোর্ড',
  sidebar: 'অ্যাডমিন সাইডবার', header: 'হেডার ও মেনু', footer: 'ফুটার', mobile: 'মোবাইল ভিউ',
};
export function shotCaption(src: string, i: number): string {
  const name = (src.split('/').pop() || '').replace(/\.\w+$/, '');
  return SHOT_BN[name] || `স্ক্রিনশট ${bnDigits(i + 1)}`;
}
/** Portrait shots (phone screen, sidebar) are shown whole instead of cropped. */
export const isTallShot = (src: string) => /\/(mobile|sidebar)\.\w+$/.test(src) || /[-_](mobile|phone)\b/i.test(src);

function hostOf(u: string): string {
  try { return u ? new URL(u).host : ''; } catch { return ''; }
}

/** Browser-frame mockup around a real screenshot/video. Without one: a branded placeholder (never a fake screenshot). */
export function browserFrame(
  p: { id: number; name: string; cover?: string; demoUrl?: string; demoVideo?: string },
  opts: { eager?: boolean; video?: boolean; src?: string; alt?: string } = {},
): Raw {
  const src = opts.src ?? p.cover ?? '';
  const g = GRADIENTS[p.id % GRADIENTS.length];
  const media = opts.video && p.demoVideo
    ? html`<video src="${p.demoVideo}" ${src ? html`poster="${src}"` : ''} muted loop playsinline autoplay preload="none" aria-label="${p.name} ডেমো ভিডিও"></video>`
    : src
      ? html`<img src="${src}" alt="${opts.alt || `${p.name} — স্ক্রিনশট`}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" width="1440" height="900" class="${isTallShot(src) ? 'is-tall' : ''}">`
      : html`<div class="frame-placeholder" style="--g:${g}"><span>${p.name}</span><small>স্ক্রিনশট শীঘ্রই যোগ হবে</small></div>`;
  return html`<div class="browser-frame"><div class="bf-bar"><i></i><i></i><i></i><span class="bf-url">${hostOf(p.demoUrl || '') || 'লাইভ ডেমো'}</span></div><div class="bf-body">${media}</div></div>`;
}

export function phoneFrame(src: string, alt: string): Raw {
  return html`<div class="phone-frame"><span class="pf-notch" aria-hidden="true"></span><img src="${src}" alt="${alt}" loading="lazy" decoding="async" width="390" height="844"></div>`;
}

export function priceBlock(p: PublicPackage, now: number): Raw {
  const line = priceLine({ id: p.id, categoryId: p.categoryId, basePrice: p.basePrice, addons: [], offers: p.offers }, { packageId: p.id, addons: [] }, now);
  // data-live-price: the static (GitHub Pages) copy refreshes this from the API, so a new price or offer shows at once.
  if (line.offerDiscount > 0) {
    return html`<div class="price" data-live-price="${p.id}"><strong>${taka(line.total)}</strong> <s>${taka(line.subtotal)}</s></div>`;
  }
  return html`<div class="price" data-live-price="${p.id}"><strong>${taka(p.basePrice)}</strong> <span class="price-from">এককালীন</span></div>`;
}

/** Today's price of a package without add-ons: the base price minus the best live offer. */
export function currentPrice(p: PublicPackage, now: number): number {
  return priceLine({ id: p.id, categoryId: p.categoryId, basePrice: p.basePrice, addons: [], offers: p.offers }, { packageId: p.id, addons: [] }, now).total;
}

/** Offer badge slot (kept even when empty, so the static copy can show an offer added after it was built). */
export function offerSlot(p: PublicPackage, now: number): Raw {
  const offer = liveOffer(p, now);
  return html`<span class="live-offer" data-live-offer="${p.id}">${offer ? offerBadge(offer) : ''}</span>`;
}

export function liveOffer(p: PublicPackage, now: number) {
  return p.offers.filter((o) => isOfferLive(o, now)).sort((a, b) => (a.endsAt || '9').localeCompare(b.endsAt || '9'))[0];
}

/** Countdown timer. Server renders the end time; JS ticks it and reloads prices when it hits zero. */
export function countdown(endsAt: string | null, label = 'অফার শেষ হবে'): Raw {
  if (!endsAt) return raw('');
  return html`<div class="countdown" data-countdown="${endsAt}" role="timer"><span class="cd-label">${label}</span> <span class="cd-val">—</span></div>`;
}

export function offerBadge(o: { discountType: 'percent' | 'flat'; discountValue: number; title?: string }): Raw {
  return html`<span class="badge badge-offer">${o.discountType === 'percent' ? `${bnDigits(o.discountValue)}% ছাড়` : `${taka(o.discountValue)} ছাড়`}</span>`;
}

export function couponChip(c: CouponRow): Raw {
  return html`<button type="button" class="coupon-chip" data-copy="${c.code}" title="কোড কপি করুন">কুপন: <strong>${c.code}</strong> · ${c.discount_type === 'percent' ? `${bnDigits(c.discount_value)}%` : taka(c.discount_value)} ছাড় — কপি করুন</button>`;
}

export function couponsFor(p: PublicPackage, coupons: CouponRow[]): CouponRow[] {
  return coupons.filter((c) => c.scope === 'sitewide' || (c.scope === 'category' && c.scope_id === p.categoryId) || (c.scope === 'package' && c.scope_id === p.id));
}

/** "লাইভ ডেমো দেখুন" link with the data the tracker needs for the DemoClick event. */
export function demoLink(p: { id: number; name: string }, url: string, label: string, cls = 'btn btn-ghost'): Raw {
  const u = safeUrl(url);
  if (!u) return raw('');
  return html`<a class="${cls}" href="${u}" target="_blank" rel="noopener" data-demo-click data-package-id="${p.id}" data-package-name="${p.name}" data-demo-label="${label}">${label} <span aria-hidden="true">↗</span></a>`;
}

export function packageCard(p: PublicPackage, coupons: CouponRow[], now: number): Raw {
  const offer = liveOffer(p, now);
  const cs = couponsFor(p, coupons).slice(0, 1);
  const soon = p.status === 'coming_soon';
  return html`<article class="card pkg-card ${soon ? 'is-soon' : ''}" data-cat="${p.categorySlug || ''}" data-edit="package:${p.id}">
  <a href="/package/${p.slug}" class="pkg-media" aria-label="${p.name} — বিস্তারিত দেখুন">${browserFrame(p)}${p.video ? html`<span class="pkg-video-badge">▶ ভিডিও</span>` : ''}</a>
  <div class="pkg-body">
    <div class="pkg-tags"><span class="badge">${p.categoryName || tierLabel(p.tier)}</span>${offerSlot(p, now)}${soon ? html`<span class="badge badge-soon">শীঘ্রই আসছে</span>` : ''}</div>
    <h3><a href="/package/${p.slug}">${p.name}</a></h3>
    <p class="muted">${p.shortDescription}</p>
    ${p.features.length ? html`<ul class="mini-features">${p.features.slice(0, 3).map((f) => html`<li>${f}</li>`)}</ul>` : ''}
    <div class="pkg-price-row">${priceBlock(p, now)}<span class="muted small">${bnDigits(p.deliveryDays)} কর্মদিবসে ডেলিভারি</span></div>
    ${offer?.endsAt ? countdown(offer.endsAt) : ''}
    ${cs.map(couponChip)}
    <div class="pkg-actions">
      <a class="btn btn-primary" href="/package/${p.slug}">${soon ? 'বিস্তারিত দেখুন' : 'বিস্তারিত ও অর্ডার'} <span aria-hidden="true">→</span></a>
      ${demoLink(p, p.demoUrl, 'লাইভ ডেমো')}
    </div>
  </div>
</article>`;
}

/** Click-to-play video: only a thumbnail loads until the visitor presses play (fast pages, no third-party cookies before intent). */
export function videoPlayer(v: VideoSource | null, title: string, poster: string, p?: { id: number; name: string }): Raw {
  if (!v) return raw('');
  const track = p ? html` data-video-play data-package-id="${p.id}" data-package-name="${p.name}"` : '';
  if (v.kind === 'file') {
    return html`<div class="video-box"><video src="${v.src}" ${poster ? html`poster="${poster}"` : ''} controls playsinline preload="none" aria-label="${title}"${track}></video></div>`;
  }
  if (v.kind === 'link') {
    return html`<div class="video-box video-link"><a class="btn btn-primary btn-lg" href="${v.href}" target="_blank" rel="noopener"${track}>▶ ভিডিওটি দেখুন ↗</a></div>`;
  }
  const thumb = v.kind === 'youtube' ? v.thumb : poster;
  return html`<div class="video-box"><button type="button" class="lite-video" data-embed="${v.embed}" aria-label="${title} — ভিডিও চালান"${track} ${thumb ? html`style="background-image:url('${thumb}')"` : ''}><span class="lv-play" aria-hidden="true">▶</span><span class="lv-title">${title}</span></button></div>`;
}

export function stars(n: number): Raw {
  const r = Math.max(0, Math.min(5, Math.round(n)));
  return html`<span class="stars" aria-label="${bnDigits(r)} তারকা">${'★'.repeat(r)}<span class="dim">${'★'.repeat(5 - r)}</span></span>`;
}

export interface ReviewView { author_name: string; author_business: string; rating: number; body: string; is_verified: number; package_name?: string }

export function reviewCard(r: ReviewView): Raw {
  return html`<figure class="card review">${stars(r.rating)}<blockquote>${r.body}</blockquote><figcaption><strong>${r.author_name}</strong>${r.author_business ? html` · ${r.author_business}` : ''}${r.is_verified ? html` <span class="badge badge-verified" title="এই রিভিউ একটি সম্পন্ন অর্ডারের সাথে যুক্ত">✓ যাচাইকৃত ক্লায়েন্ট</span>` : ''}</figcaption></figure>`;
}

export function faqList(items: { question: string; answer: string }[]): Raw {
  if (!items.length) return raw('');
  return html`<div class="faq">${items.map((f) => html`<details><summary>${f.question}</summary><div>${f.answer}</div></details>`)}</div>`;
}

/** "শিরোনাম | বিবরণ" cards (benefits, why us). */
export function pointCards(items: { title: string; text: string }[], icon = '✓'): Raw {
  return html`<div class="point-grid">${items.map((it, i) => html`<div class="card point"><span class="point-ico" aria-hidden="true">${icon === '#' ? bnDigits(i + 1) : icon}</span><div><h3>${it.title}</h3>${it.text ? html`<p class="muted">${it.text}</p>` : ''}</div></div>`)}</div>`;
}

/** "এখন যা হচ্ছে → এই সাইটে যা হবে": each client problem next to how the site removes it. */
export function problemGrid(items: { title: string; text: string }[]): Raw {
  return html`<div class="pain-grid">${items.map((it) => html`<div class="card pain-card">
    <p class="pain"><span class="pain-ico" aria-hidden="true">✕</span><span><span class="sr-only">সমস্যা: </span>${it.title}</span></p>
    ${it.text ? html`<p class="fix"><span class="fix-ico" aria-hidden="true">✓</span><span><span class="sr-only">সমাধান: </span>${it.text}</span></p>` : ''}
  </div>`)}</div>`;
}

/** Orders needed to earn back the price, and roughly how many days at a given daily rate. */
export function roiNumbers(price: number, profitPerOrder: number, ordersPerDay: number): { orders: number; days: number } | null {
  if (!(price > 0) || !(profitPerOrder > 0)) return null;
  const orders = Math.ceil(price / profitPerOrder);
  return { orders, days: ordersPerDay > 0 ? Math.ceil(orders / ordersPerDay) : 0 };
}

/** Cost-recovery calculator. Works without JavaScript (server-rendered result); app.js recalculates as the visitor types. */
export function roiCalculator(price: number, roi: { profit: number; orders: number }): Raw {
  const r = roiNumbers(price, roi.profit, roi.orders);
  return html`<form class="card roi" data-roi data-price="${price}">
    <h3>খরচ কতদিনে উঠে আসবে? — নিজের সংখ্যা বসিয়ে দেখুন</h3>
    <div class="roi-inputs">
      <label>প্রতি অর্ডারে আপনার লাভ (৳)<input type="number" inputmode="numeric" min="1" max="10000000" step="1" name="profit" value="${roi.profit}" data-roi-profit></label>
      <label>এই সাইট থেকে দিনে কয়টি অর্ডার<input type="number" inputmode="numeric" min="0" max="100000" step="1" name="orders" value="${roi.orders}" data-roi-orders></label>
    </div>
    <p class="roi-out" data-roi-out aria-live="polite">${r ? html`${taka(price)} উঠে আসবে <strong>${bnDigits(r.orders)}টি অর্ডারে</strong>${r.days ? html` — দিনে ${bnDigits(roi.orders)}টি হলে প্রায় <strong>${bnDigits(r.days)} দিনে</strong>` : ''}। এরপর প্রতিটি অর্ডারের লাভ পুরোটাই আপনার।` : ''}</p>
    <p class="small muted">এটি শুধু আপনার দেওয়া সংখ্যার সাধারণ হিসাব, বিক্রির নিশ্চয়তা নয় — বিক্রি নির্ভর করে আপনার পণ্য, দাম আর মার্কেটিংয়ের উপর। শুরুর সংখ্যাগুলো উদাহরণ মাত্র। সাইটের দাম একবারই; বিক্রি থেকে কোনো কমিশন নেওয়া হয় না।</p>
  </form>`;
}

export interface ShopCategory { id: number; slug: string; name: string; icon: string; description: string; image_key: string | null }

/**
 * Packages grouped by business type, with the categories in a sidebar (a narrow icon rail on phones).
 * Default: every group on one page; sidebar links jump to each group and app.js highlights the group in view.
 * `only`: a category page — the sidebar links to the other category pages and only this category's packages show.
 */
export function catalogBrowser(cats: ShopCategory[], pkgs: PublicPackage[], coupons: CouponRow[], now: number, imageUrl: (key: string) => string, opts: { only?: string } = {}): Raw {
  const groups = cats.map((c) => ({ c, items: pkgs.filter((p) => p.categoryId === c.id) })).filter((g) => g.items.length);
  const shown = opts.only ? groups.filter((g) => g.c.slug === opts.only) : groups;
  const icon = (c: ShopCategory) => (c.image_key ? html`<img src="${imageUrl(c.image_key)}" alt="" loading="lazy">` : html`<span aria-hidden="true">${c.icon}</span>`);
  return html`<div class="shop-layout" data-shop>
  <aside class="shop-side" aria-label="ক্যাটাগরি">
    <p class="side-title">ক্যাটাগরি</p>
    <nav class="side-nav">${groups.map(({ c, items }, i) => {
      const on = opts.only ? c.slug === opts.only : i === 0;
      const attrs = opts.only ? raw(on ? 'aria-current="page"' : '') : raw(`data-side-link="cat-${c.slug}"`);
      return html`<a href="${opts.only ? `/category/${c.slug}` : `#cat-${c.slug}`}" class="side-link ${on ? 'is-on' : ''}" ${attrs}>
      <span class="side-ico">${icon(c)}</span><span class="side-name">${c.name}</span><span class="side-count">${bnDigits(items.length)}</span></a>`;
    })}
    </nav>
  </aside>
  <div class="shop-main">${shown.map(({ c, items }) => html`<section class="shop-group" id="cat-${c.slug}" aria-labelledby="cat-${c.slug}-h">
    <header class="group-head" data-edit="category:${c.id}">
      <span class="group-ico">${icon(c)}</span>
      <div class="group-text"><h3 id="cat-${c.slug}-h">${c.name} <span class="group-count">${bnDigits(items.length)}টি</span></h3>${c.description ? html`<p class="muted">${c.description}</p>` : ''}</div>
      ${opts.only ? '' : html`<a class="link-cta group-all" href="/category/${c.slug}">সব দেখুন <span aria-hidden="true">→</span></a>`}
    </header>
    <div class="pkg-grid">${items.map((p) => packageCard(p, coupons, now))}</div>
  </section>`)}</div>
</div>`;
}

export interface DesignView { id: number; kind: string; title: string; image: string; demo_url: string; note: string; package_slug: string | null; package_name: string | null; package_id: number | null }
export const DESIGN_KINDS: [string, string][] = [
  ['hero', 'হোমপেজ / হিরো'], ['header', 'হেডার ও মেনু'], ['product', 'পণ্যের পেজ'], ['checkout', 'চেকআউট'], ['footer', 'ফুটার'],
  ['dashboard', 'অ্যাডমিন ড্যাশবোর্ড'], ['sidebar', 'সাইডবার'], ['mobile', 'মোবাইল ভিউ'], ['section', 'পেজ সেকশন'], ['other', 'অন্যান্য'],
];
export const designKindLabel = (k: string) => DESIGN_KINDS.find(([x]) => x === k)?.[1] || k;

export function designCard(d: DesignView): Raw {
  const src = mediaSrc(d.image);
  const tall = d.kind === 'mobile' || d.kind === 'sidebar';
  return html`<figure class="card design-card ${tall ? 'is-tall' : ''} kind-${d.kind}" data-kind="${d.kind}" data-edit="design:${d.id}">
  <button type="button" class="design-shot" data-lightbox="${src}" data-caption="${d.title}" aria-label="${d.title} — বড় করে দেখুন"><img src="${src}" alt="${d.title}" loading="lazy" decoding="async"></button>
  <figcaption>
    <span class="badge">${designKindLabel(d.kind)}</span>
    <strong>${d.title}</strong>
    ${d.note ? html`<span class="muted small">${d.note}</span>` : ''}
    <span class="design-actions">
      ${d.package_slug ? html`<a class="btn btn-primary btn-sm" href="/package/${d.package_slug}">এই ডিজাইনে অর্ডার করুন →</a>` : html`<a class="btn btn-primary btn-sm" href="/quote">এমন ডিজাইন চাই →</a>`}
      ${d.demo_url && d.package_id ? demoLink({ id: d.package_id, name: d.package_name || d.title }, d.demo_url, 'লাইভ দেখুন', 'btn btn-ghost btn-sm') : d.demo_url ? html`<a class="btn btn-ghost btn-sm" href="${safeUrl(d.demo_url)}" target="_blank" rel="noopener">লাইভ দেখুন ↗</a>` : ''}
    </span>
  </figcaption>
</figure>`;
}

export interface PortfolioView { id: number; title: string; client_name: string; live_url: string; cover_image: string; images: string; video_url: string; summary: string; result: string; testimonial: string; delivered_at: string | null; category_name: string | null; category_slug: string | null; package_slug: string | null }

export function portfolioCard(w: PortfolioView): Raw {
  const cover = mediaSrc(w.cover_image);
  const live = safeUrl(w.live_url);
  return html`<article class="card work-card" data-cat="${w.category_slug || ''}" data-edit="portfolio:${w.id}">
  <div class="work-media">${browserFrame({ id: w.id, name: w.title, cover, demoUrl: live })}</div>
  <div class="work-body">
    <div class="pkg-tags">${w.category_name ? html`<span class="badge">${w.category_name}</span>` : ''}<span class="badge badge-verified">✓ ডেলিভারি সম্পন্ন</span></div>
    <h3>${w.title}</h3>
    ${w.client_name ? html`<p class="small muted">ক্লায়েন্ট: ${w.client_name}</p>` : ''}
    ${w.summary ? html`<p>${w.summary}</p>` : ''}
    ${w.result ? html`<p class="work-result"><strong>ফলাফল:</strong> ${w.result}</p>` : ''}
    ${w.testimonial ? html`<blockquote class="work-quote">“${w.testimonial}”</blockquote>` : ''}
    <div class="pkg-actions">
      ${live ? html`<a class="btn btn-primary" href="${live}" target="_blank" rel="noopener" data-portfolio-click data-work="${w.title}">সাইটটি ভিজিট করুন ↗</a>` : ''}
      <a class="btn btn-ghost" href="${w.package_slug ? `/package/${w.package_slug}` : '/quote'}">${w.package_slug ? 'এমন সাইট চাই →' : 'আমারও এমন সাইট চাই →'}</a>
    </div>
  </div>
</article>`;
}

export function leadForm(opts: { source: 'quote' | 'contact' | 'landing'; packageId?: number; title?: string; landingPageId?: number; compact?: boolean; message?: string }): Raw {
  return html`<form class="card form lead-form" data-lead-form data-source="${opts.source}" ${opts.packageId ? html`data-package-id="${opts.packageId}"` : ''} ${opts.landingPageId ? html`data-landing-id="${opts.landingPageId}"` : ''}>
  ${opts.title ? html`<h3>${opts.title}</h3>` : ''}
  <div class="grid-2">
    <label>আপনার নাম<input name="name" required maxlength="100" autocomplete="name"></label>
    <label>মোবাইল নম্বর<input name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="০১XXXXXXXXX"></label>
  </div>
  ${opts.compact ? '' : html`<div class="grid-2"><label>ইমেইল (ঐচ্ছিক)<input name="email" type="email" maxlength="200" autocomplete="email"></label><label>ব্যবসার নাম (ঐচ্ছিক)<input name="business_name" maxlength="150"></label></div>`}
  <label>${opts.source === 'quote' ? 'আপনার চাহিদা লিখুন' : 'বার্তা'}<textarea name="message" rows="${opts.compact ? 2 : 4}" maxlength="3000" ${opts.source === 'quote' ? raw('required') : ''} placeholder="${opts.source === 'quote' ? 'কী ধরনের সাইট, কয়টি পেজ, কোনো রেফারেন্স সাইট…' : ''}">${opts.message || ''}</textarea></label>
  <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
  <button class="btn btn-primary btn-block">${opts.source === 'quote' ? 'কোটেশন চাই — ফ্রি' : opts.source === 'landing' ? 'আমার সাথে যোগাযোগ করুন' : 'বার্তা পাঠান'}</button>
  <p class="form-msg" data-form-msg role="status"></p>
</form>`;
}
