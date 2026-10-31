import { html, raw, safeUrl, type Raw } from '../lib/html';
import { isOfferLive, priceLine } from '../../../shared/pricing';
import type { PublicPackage, CouponRow } from '../lib/catalog';
import { taka, bnDigits } from '../lib/util';

const GRADIENTS = ['#3b82f6,#8b5cf6', '#6366f1,#ec4899', '#06b6d4,#6366f1', '#8b5cf6,#d946ef', '#0ea5e9,#22d3ee', '#7c3aed,#2563eb'];

/** Browser-frame mockup. Uses the real screenshot/video if present, otherwise a branded placeholder (never a fake screenshot). */
export function browserFrame(p: Pick<PublicPackage, 'name' | 'images' | 'demoVideo' | 'demoUrl' | 'id'>, opts: { eager?: boolean; video?: boolean } = {}): Raw {
  const host = (() => {
    try { return p.demoUrl ? new URL(p.demoUrl).host : ''; } catch { return ''; }
  })();
  const g = GRADIENTS[p.id % GRADIENTS.length];
  const media = opts.video && p.demoVideo
    ? html`<video src="${p.demoVideo}" ${p.images[0] ? html`poster="${p.images[0]}"` : ''} muted loop playsinline autoplay preload="none" aria-label="${p.name} ডেমো ভিডিও"></video>`
    : p.images[0]
      ? html`<img src="${p.images[0]}" alt="${p.name} এর স্ক্রিনশট" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" width="1200" height="750">`
      : html`<div class="frame-placeholder" style="--g:${g}"><span>${p.name}</span><small>স্ক্রিনশট শীঘ্রই যোগ হবে</small></div>`;
  return html`<div class="browser-frame"><div class="bf-bar"><i></i><i></i><i></i><span class="bf-url">${host || 'ডেমো'}</span></div><div class="bf-body">${media}</div></div>`;
}

export function priceBlock(p: PublicPackage, now: number): Raw {
  const line = priceLine({ id: p.id, categoryId: p.categoryId, basePrice: p.basePrice, addons: [], offers: p.offers }, { packageId: p.id, addons: [] }, now);
  if (line.offerDiscount > 0) {
    return html`<div class="price"><span class="price-from">শুরু</span> <strong>${taka(line.total)}</strong> <s>${taka(line.subtotal)}</s></div>`;
  }
  return html`<div class="price"><span class="price-from">শুরু</span> <strong>${taka(p.basePrice)}</strong></div>`;
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
  return html`<button type="button" class="coupon-chip" data-copy="${c.code}" title="কোড কপি করুন">কুপন: <strong>${c.code}</strong> · ${c.discount_type === 'percent' ? `${bnDigits(c.discount_value)}%` : taka(c.discount_value)} ছাড়</button>`;
}

export function couponsFor(p: PublicPackage, coupons: CouponRow[]): CouponRow[] {
  return coupons.filter((c) => c.scope === 'sitewide' || (c.scope === 'category' && c.scope_id === p.categoryId) || (c.scope === 'package' && c.scope_id === p.id));
}

export function packageCard(p: PublicPackage, coupons: CouponRow[], now: number): Raw {
  const offer = liveOffer(p, now);
  const cs = couponsFor(p, coupons).slice(0, 1);
  const soon = p.status === 'coming_soon';
  return html`<article class="card pkg-card ${soon ? 'is-soon' : ''}">
  <a href="/package/${p.slug}" class="pkg-media" aria-label="${p.name}">${browserFrame(p)}</a>
  <div class="pkg-body">
    <div class="pkg-tags"><span class="badge">${p.tier === 'premium' ? 'প্রিমিয়াম' : p.tier === 'basic' ? 'বেসিক' : p.tier}</span>${offer ? offerBadge(offer) : ''}${soon ? html`<span class="badge badge-soon">শীঘ্রই আসছে</span>` : ''}</div>
    <h3><a href="/package/${p.slug}">${p.name}</a></h3>
    <p class="muted">${p.shortDescription}</p>
    ${priceBlock(p, now)}
    ${offer?.endsAt ? countdown(offer.endsAt) : ''}
    ${cs.map(couponChip)}
    <div class="pkg-actions">
      <a class="btn btn-primary" href="/package/${p.slug}">${soon ? 'বিস্তারিত দেখুন' : 'কাস্টমাইজ ও অর্ডার'}</a>
      ${safeUrl(p.demoUrl) ? html`<a class="btn btn-ghost" href="${safeUrl(p.demoUrl)}" target="_blank" rel="noopener">লাইভ ডেমো ↗</a>` : ''}
    </div>
  </div>
</article>`;
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

export function leadForm(opts: { source: 'quote' | 'contact' | 'landing'; packageId?: number; title?: string; landingPageId?: number; compact?: boolean }): Raw {
  return html`<form class="card form lead-form" data-lead-form data-source="${opts.source}" ${opts.packageId ? html`data-package-id="${opts.packageId}"` : ''} ${opts.landingPageId ? html`data-landing-id="${opts.landingPageId}"` : ''}>
  ${opts.title ? html`<h3>${opts.title}</h3>` : ''}
  <div class="grid-2">
    <label>আপনার নাম<input name="name" required maxlength="100" autocomplete="name"></label>
    <label>মোবাইল নম্বর<input name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="০১XXXXXXXXX"></label>
  </div>
  ${opts.compact ? '' : html`<div class="grid-2"><label>ইমেইল (ঐচ্ছিক)<input name="email" type="email" maxlength="200" autocomplete="email"></label><label>ব্যবসার নাম (ঐচ্ছিক)<input name="business_name" maxlength="150"></label></div>`}
  <label>${opts.source === 'quote' ? 'আপনার চাহিদা লিখুন' : 'বার্তা'}<textarea name="message" rows="${opts.compact ? 2 : 4}" maxlength="3000" ${opts.source === 'quote' ? raw('required') : ''} placeholder="${opts.source === 'quote' ? 'কী ধরনের সাইট, কয়টি পেজ, কোনো রেফারেন্স সাইট…' : ''}"></textarea></label>
  <button class="btn btn-primary btn-block">${opts.source === 'quote' ? 'কোটেশন চাই' : 'পাঠান'}</button>
  <p class="form-msg" data-form-msg role="status"></p>
</form>`;
}
