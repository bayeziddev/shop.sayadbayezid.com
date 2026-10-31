import { html, raw, paragraphs, safeUrl, jsonScript, type Raw } from '../lib/html';
import type { PublicPackage, CouponRow, CategoryRow } from '../lib/catalog';
import { mediaUrl } from '../lib/catalog';
import { taka, bnDigits, bnDate } from '../lib/util';
import { browserFrame, packageCard, priceBlock, liveOffer, countdown, offerBadge, couponChip, couponsFor, reviewCard, faqList, leadForm, stars, type ReviewView } from './components';
import type { SiteSettings } from '../lib/settings';

export interface HomeData {
  settings: SiteSettings;
  categories: (CategoryRow & { package_count: number; min_price: number | null })[];
  featured: PublicPackage[];
  coupons: CouponRow[];
  reviews: ReviewView[];
  faqs: { question: string; answer: string }[];
  stats: { clients: number; completed: number; reviewCount: number; reviewAvg: number };
  now: number;
}

export function homePage(d: HomeData): Raw {
  const showcase = d.featured.slice(0, 6);
  const proof = [
    d.stats.clients > 0 ? html`<div class="stat"><strong>${bnDigits(d.stats.clients)}</strong><span>ক্লায়েন্ট আমাদের সাথে কাজ করেছেন</span></div>` : '',
    d.stats.completed > 0 ? html`<div class="stat"><strong>${bnDigits(d.stats.completed)}</strong><span>প্রজেক্ট সফলভাবে সম্পন্ন</span></div>` : '',
    d.stats.reviewCount > 0 ? html`<div class="stat"><strong>${bnDigits(d.stats.reviewAvg.toFixed(1))}/৫</strong><span>${bnDigits(d.stats.reviewCount)}টি ক্লায়েন্ট রিভিউর গড়</span></div>` : '',
  ].filter(Boolean);
  return html`
<section class="hero mesh">
  <div class="container hero-grid">
    <div class="hero-copy reveal">
      <span class="eyebrow">ছোট ব্যবসার জন্য প্রস্তুত ওয়েবসাইট</span>
      <h1>আগে <span class="grad-text">লাইভ ডেমো</span> দেখুন,<br>তারপর আপনার সাইট অর্ডার করুন</h1>
      <p class="lead">${d.settings.brand_tagline}</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="#categories">প্যাকেজ দেখুন</a>
        <a class="btn btn-ghost btn-lg" href="/quote">কাস্টম কোটেশন নিন</a>
      </div>
      <ul class="hero-points"><li>✓ দাম আগেই স্পষ্ট</li><li>✓ পেমেন্টের পরেই কাজ শুরু</li><li>✓ অনুমোদনের আগে রিভিউ</li></ul>
    </div>
    ${showcase.length ? html`<div class="showcase reveal" data-rotator aria-roledescription="স্লাইডশো" aria-label="তৈরি করা সাইটের ডেমো">
      ${showcase.map((p, i) => html`<figure class="slide ${i === 0 ? 'is-active' : ''}" data-slide>
        ${browserFrame(p, { eager: i === 0, video: true })}
        <figcaption><span><strong>${p.name}</strong> · ${p.categoryName}</span>${safeUrl(p.demoUrl) ? html`<a href="${safeUrl(p.demoUrl)}" target="_blank" rel="noopener">লাইভ ডেমো খুলুন ↗</a>` : html`<a href="/package/${p.slug}">বিস্তারিত →</a>`}</figcaption>
      </figure>`)}
      <div class="dots">${showcase.map((_, i) => html`<button data-dot="${i}" aria-label="স্লাইড ${bnDigits(i + 1)}" ${i === 0 ? raw('aria-current="true"') : ''}></button>`)}</div>
    </div>` : ''}
  </div>
</section>

<section class="section" id="categories">
  <div class="container">
    <header class="section-head"><h2>আপনার ব্যবসার ধরন বেছে নিন</h2><p class="muted">প্রতিটি ক্যাটাগরিতে আমাদের তৈরি আসল সাইটের ডেমো আছে</p></header>
    <div class="cat-grid">
      ${d.categories.map((c) => html`<a class="card cat-card" href="/category/${c.slug}">
        ${c.image_key ? html`<img src="${mediaUrl(c.image_key)}" alt="" loading="lazy">` : html`<span class="cat-ico" aria-hidden="true">${c.icon}</span>`}
        <h3>${c.name}</h3><p class="muted">${c.description}</p>
        <span class="cat-meta">${bnDigits(c.package_count)}টি প্যাকেজ${c.min_price !== null ? html` · শুরু ${taka(c.min_price)}` : ''}</span>
      </a>`)}
    </div>
  </div>
</section>

<section class="section how">
  <div class="container">
    <header class="section-head"><h2>কীভাবে কাজ করে</h2></header>
    <ol class="steps">
      <li class="card"><span class="step-n">১</span><h3>প্যাকেজ বাছাই করুন</h3><p class="muted">লাইভ ডেমো দেখে প্যাকেজ বেছে নিন, প্রয়োজনীয় অ্যাড-অন যোগ করুন — দাম সাথে সাথে দেখতে পাবেন।</p></li>
      <li class="card"><span class="step-n">২</span><h3>আমরা বানাই</h3><p class="muted">পেমেন্টের পর আপনার ব্যবসার তথ্য দিন। প্রতিটি ধাপের আপডেট আপনার অর্ডার পেজে ও মেসেজে পাবেন।</p></li>
      <li class="card"><span class="step-n">৩</span><h3>আপনি লাইভ করুন</h3><p class="muted">প্রিভিউ দেখে মতামত দিন, সংশোধন শেষে অনুমোদন দিলেই আপনার সাইট লাইভ।</p></li>
    </ol>
  </div>
</section>

${d.featured.length ? html`<section class="section">
  <div class="container">
    <header class="section-head"><h2>জনপ্রিয় প্যাকেজ</h2></header>
    <div class="pkg-grid">${d.featured.slice(0, 6).map((p) => packageCard(p, d.coupons, d.now))}</div>
  </div>
</section>` : ''}

${proof.length || d.reviews.length ? html`<section class="section proof">
  <div class="container">
    ${proof.length ? html`<div class="stats">${proof}</div>` : ''}
    ${d.reviews.length ? html`<header class="section-head"><h2>ক্লায়েন্টরা যা বলছেন</h2></header><div class="review-grid">${d.reviews.map(reviewCard)}</div>` : ''}
  </div>
</section>` : ''}

${d.faqs.length ? html`<section class="section">
  <div class="container narrow">
    <header class="section-head"><h2>সাধারণ প্রশ্ন</h2></header>
    ${faqList(d.faqs.slice(0, 4))}
    <p class="center"><a class="btn btn-ghost" href="/faq">সব প্রশ্নোত্তর দেখুন</a></p>
  </div>
</section>` : ''}

<section class="section">
  <div class="container">
    <div class="cta-band mesh">
      <div><h2>কোন প্যাকেজ নেবেন বুঝতে পারছেন না?</h2><p>৪টি ছোট প্রশ্নের উত্তর দিন — আমরা আপনার জন্য উপযুক্ত প্যাকেজ সাজেস্ট করব।</p></div>
      <div class="cta-actions"><a class="btn btn-light btn-lg" href="/quiz">কুইজ শুরু করুন</a><a class="btn btn-outline-light btn-lg" href="/quote">কোটেশন নিন</a></div>
    </div>
  </div>
</section>`;
}

export function categoryPage(cat: CategoryRow, pkgs: PublicPackage[], coupons: CouponRow[], now: number, catOffer: ReturnType<typeof liveOffer>): Raw {
  return html`
<section class="page-hero mesh">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <span>${cat.name}</span></nav>
    <h1>${cat.icon} ${cat.name} ওয়েবসাইট</h1>
    <p class="lead">${cat.description}</p>
    ${catOffer ? html`<div class="offer-strip">${offerBadge(catOffer)} <span>${catOffer.title || 'এই ক্যাটাগরির সব প্যাকেজে অফার চলছে'}</span> ${countdown(catOffer.endsAt)}</div>` : ''}
  </div>
</section>
<section class="section">
  <div class="container">
    ${pkgs.length ? html`<div class="pkg-grid">${pkgs.map((p) => packageCard(p, coupons, now))}</div>` : html`<div class="empty card"><p>এই ক্যাটাগরিতে এখনো কোনো প্যাকেজ যোগ করা হয়নি।</p><a class="btn btn-primary" href="/quote">কাস্টম কোটেশন নিন</a></div>`}
    <div class="card quote-nudge"><div><h3>আপনার চাহিদা একটু আলাদা?</h3><p class="muted">প্যাকেজের বাইরে কিছু লাগলে জানান — আলাদা মূল্য জানিয়ে দেব।</p></div><a class="btn btn-ghost" href="/quote">কোটেশন চাই</a></div>
  </div>
</section>`;
}

export function packagePage(p: PublicPackage, d: { coupons: CouponRow[]; faqs: { question: string; answer: string }[]; reviews: ReviewView[]; now: number }): Raw {
  const offer = liveOffer(p, d.now);
  const cs = couponsFor(p, d.coupons);
  const soon = p.status === 'coming_soon';
  const avg = d.reviews.length ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length : 0;
  const gallery = [
    ...(p.demoVideo ? [{ type: 'video', src: p.demoVideo }] : []),
    ...p.images.map((src) => ({ type: 'img', src })),
  ];
  return html`
<section class="section pkg-detail">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <a href="/category/${p.categorySlug}">${p.categoryName}</a> › <span>${p.name}</span></nav>
    <div class="pkg-layout">
      <div class="pkg-left">
        <div class="gallery" data-gallery>
          <div class="gallery-main">${gallery.length ? gallery.map((g, i) => html`<div class="g-item ${i === 0 ? 'is-active' : ''}" data-g-item>${browserFrame({ ...p, images: g.type === 'img' ? [g.src] : p.images, demoVideo: g.type === 'video' ? g.src : '' }, { eager: i === 0, video: g.type === 'video' })}</div>`) : browserFrame(p, { eager: true })}</div>
          ${gallery.length > 1 ? html`<div class="gallery-thumbs">${gallery.map((g, i) => html`<button data-g-thumb="${i}" aria-label="ছবি ${bnDigits(i + 1)}" ${i === 0 ? raw('aria-current="true"') : ''}>${g.type === 'video' ? html`<span class="thumb-video">▶ ভিডিও</span>` : html`<img src="${g.src}" alt="" loading="lazy">`}</button>`)}</div>` : ''}
        </div>
        ${safeUrl(p.demoUrl) ? html`<a class="btn btn-ghost btn-block demo-btn" href="${safeUrl(p.demoUrl)}" target="_blank" rel="noopener">আসল লাইভ ডেমো সাইট খুলুন ↗</a>` : ''}
        <div class="card">
          <h2>এই প্যাকেজে যা থাকছে</h2>
          <ul class="features">${p.features.map((f) => html`<li>${f}</li>`)}</ul>
          <p class="muted">আনুমানিক ডেলিভারি: তথ্য পাওয়ার পর ${bnDigits(p.deliveryDays)} কর্মদিবস</p>
        </div>
        <div class="card prose"><h2>বিস্তারিত</h2>${paragraphs(p.description)}</div>
      </div>

      <aside class="pkg-right">
        <form class="card configurator" data-configurator>
          <div class="pkg-tags"><span class="badge">${p.tier === 'premium' ? 'প্রিমিয়াম' : 'বেসিক'}</span>${offer ? offerBadge(offer) : ''}${avg ? html`<span class="badge">${stars(avg)} ${bnDigits(d.reviews.length)}</span>` : ''}</div>
          <h1>${p.name}</h1>
          <p class="muted">${p.shortDescription}</p>
          ${offer?.endsAt ? countdown(offer.endsAt, offer.title || 'অফার শেষ হবে') : ''}
          <div class="cfg-base"><span>মূল প্যাকেজ</span><strong>${taka(p.basePrice)}</strong></div>
          ${p.addons.length ? html`<fieldset class="addons"><legend>অ্যাড-অন যোগ করুন</legend>
            ${p.addons.map((a) => a.maxQuantity > 1
              ? html`<div class="addon"><div class="addon-info"><strong>${a.name}</strong><small>${a.description}</small><span class="addon-price">প্রতিটি +${taka(a.priceDelta)}</span></div>
                  <div class="stepper" data-stepper><button type="button" data-step="-1" aria-label="কমান">−</button><input type="text" data-max="${a.maxQuantity}" value="০" name="addon-${a.id}" data-addon="${a.id}" aria-label="${a.name} সংখ্যা" inputmode="numeric" maxlength="2"><button type="button" data-step="1" aria-label="বাড়ান">+</button></div></div>`
              : html`<label class="addon"><div class="addon-info"><strong>${a.name}</strong><small>${a.description}</small><span class="addon-price">+${taka(a.priceDelta)}</span></div>
                  <span class="switch"><input type="checkbox" name="addon-${a.id}" data-addon="${a.id}"><span></span></span></label>`)}
          </fieldset>` : ''}
          <div class="cfg-summary" aria-live="polite">
            <div class="row"><span>সাবটোটাল</span><span data-cfg="subtotal">${taka(p.basePrice)}</span></div>
            <div class="row discount" data-cfg-row="offer" hidden><span>অফার ছাড়</span><span data-cfg="offer">—</span></div>
            <div class="row total"><span>মোট</span><strong data-cfg="total">${priceBlock(p, d.now)}</strong></div>
          </div>
          ${cs.map(couponChip)}
          ${soon
            ? html`<p class="notice">এই প্যাকেজটি শীঘ্রই আসছে। আগ্রহী হলে কোটেশন ফর্মে জানান।</p>`
            : html`<button class="btn btn-primary btn-lg btn-block" data-order-now>এখনই অর্ডার করুন</button>`}
          <a class="btn btn-ghost btn-block" href="/quote?package=${p.slug}">কাস্টম চাহিদা? কোটেশন নিন</a>
          <p class="small muted center">চূড়ান্ত দাম চেকআউটে সার্ভার থেকে যাচাই করা হয়</p>
        </form>
      </aside>
    </div>

    ${d.faqs.length ? html`<section class="section-sm"><h2>এই প্যাকেজ নিয়ে প্রশ্ন</h2>${faqList(d.faqs)}</section>` : ''}
    <section class="section-sm"><h2>ক্লায়েন্ট রিভিউ</h2>${d.reviews.length ? html`<div class="review-grid">${d.reviews.map(reviewCard)}</div>` : html`<p class="muted">এই প্যাকেজের এখনো কোনো রিভিউ নেই।</p>`}</section>
  </div>
</section>
${jsonScript('pkg-data', p)}`;
}

export function checkoutPage(s: SiteSettings, methods: { id: string; label: string; hint: string }[]): Raw {
  return html`
<section class="section">
  <div class="container">
    <h1>কার্ট ও চেকআউট</h1>
    <div class="checkout" data-checkout>
      <div class="co-left">
        <div class="card"><h2>আপনার অর্ডার</h2><div data-cart-lines><p class="muted">লোড হচ্ছে…</p></div></div>
        <form class="card form" data-checkout-form novalidate>
          <h2>আপনার তথ্য</h2>
          <div class="grid-2">
            <label>পূর্ণ নাম<input name="name" required maxlength="100" autocomplete="name"></label>
            <label>মোবাইল নম্বর<input name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="০১XXXXXXXXX"></label>
          </div>
          <div class="grid-2">
            <label>ইমেইল<input name="email" type="email" maxlength="200" autocomplete="email" placeholder="আপডেট পেতে দিন"></label>
            <label>ব্যবসার নাম<input name="business_name" maxlength="150"></label>
          </div>
          <h2>পেমেন্ট মাধ্যম</h2>
          ${methods.length ? html`<div class="pay-methods">${methods.map((m, i) => html`<label class="pay-method"><input type="radio" name="payment_method" value="${m.id}" ${i === 0 ? raw('checked') : ''}><span><strong>${m.label}</strong><small>${m.hint}</small></span></label>`)}</div>`
            : html`<p class="notice">এই মুহূর্তে অনলাইন পেমেন্ট চালু নেই। অনুগ্রহ করে <a href="/contact">যোগাযোগ করুন</a>।</p>`}
          <label class="check"><input type="checkbox" name="agree" required> আমি <a href="/terms" target="_blank">শর্তাবলি</a> ও <a href="/refund-policy" target="_blank">রিফান্ড নীতি</a> পড়েছি ও সম্মত</label>
          <p class="small muted">পেমেন্ট নিশ্চিত হওয়ার পর আপনার প্রজেক্টের তথ্য জমা দেওয়ার পেজ খুলে যাবে।</p>
        </form>
      </div>
      <aside class="co-right">
        <div class="card sticky">
          <h2>মূল্য সারাংশ</h2>
          <form class="coupon-form" data-coupon-form><input name="coupon" placeholder="কুপন কোড" maxlength="40" aria-label="কুপন কোড" autocapitalize="characters"><button class="btn btn-ghost btn-sm">প্রয়োগ</button></form>
          <p class="form-msg" data-coupon-msg role="status"></p>
          <div class="cfg-summary" data-summary aria-live="polite"></div>
          <button class="btn btn-primary btn-lg btn-block" data-place-order ${methods.length ? '' : raw('disabled')}>অর্ডার নিশ্চিত করে পেমেন্ট করুন</button>
          <p class="form-msg" data-order-msg role="status"></p>
        </div>
      </aside>
    </div>
  </div>
</section>`;
}

export interface OrderView {
  order_number: string; invoice_number: string | null; customer_name: string; payment_status: string; project_status: string;
  payment_method: string; total: number; subtotal: number; offer_discount: number; coupon_discount: number; coupon_code: string | null;
  manual_trx_id: string | null; created_at: string;
}

export function orderPage(o: OrderView, token: string, d: { statusLabel: string; paymentLabel: string; methodLabel: string; manual: null | { title: string; lines: string[] }; cancelled: boolean }): Raw {
  const paid = o.payment_status === 'paid';
  return html`
<section class="section">
  <div class="container narrow">
    <div class="card result ${paid ? 'is-success' : ''}">
      ${paid
        ? html`<div class="result-ico">✓</div><h1>পেমেন্ট সফল হয়েছে!</h1><p>ধন্যবাদ ${o.customer_name}। আপনার অর্ডার <strong>${o.order_number}</strong> নিশ্চিত হয়েছে। এখন প্রজেক্ট শুরু করতে আপনার ব্যবসার তথ্য জমা দিন।</p>
            <a class="btn btn-primary btn-lg" href="/portal/${o.order_number}?t=${token}">প্রজেক্টের তথ্য জমা দিন →</a>`
        : o.payment_status === 'pending_verification'
          ? html`<div class="result-ico">⏳</div><h1>পেমেন্ট যাচাই করা হচ্ছে</h1><p>আপনার ট্রানজেকশন আইডি <strong>${o.manual_trx_id}</strong> আমরা পেয়েছি। যাচাই শেষে আপনাকে জানানো হবে এবং তথ্য জমার পেজ খুলে যাবে।</p>`
          : d.cancelled
            ? html`<div class="result-ico">!</div><h1>পেমেন্ট সম্পন্ন হয়নি</h1><p>চিন্তার কিছু নেই — আপনার অর্ডার সংরক্ষিত আছে। নিচ থেকে আবার চেষ্টা করুন।</p>`
            : html`<div class="result-ico">৳</div><h1>পেমেন্ট বাকি আছে</h1><p>অর্ডার <strong>${o.order_number}</strong> তৈরি হয়েছে। পেমেন্ট সম্পন্ন হলেই কাজ শুরু হবে।</p>`}
      <dl class="kv">
        <dt>অর্ডার নম্বর</dt><dd>${o.order_number}</dd>
        ${o.invoice_number ? html`<dt>ইনভয়েস নম্বর</dt><dd>${o.invoice_number}</dd>` : ''}
        <dt>মোট</dt><dd>${taka(o.total)}</dd>
        <dt>পেমেন্ট মাধ্যম</dt><dd>${d.methodLabel}</dd>
        <dt>পেমেন্টের অবস্থা</dt><dd>${d.paymentLabel}</dd>
        <dt>প্রজেক্টের অবস্থা</dt><dd>${d.statusLabel}</dd>
      </dl>
      ${!paid && o.payment_status !== 'pending_verification' ? html`
        ${d.manual ? html`<div class="manual-pay"><h2>${d.manual.title}</h2>${d.manual.lines.map((l) => html`<p>${l}</p>`)}
          <form class="form" data-manual-form data-order="${o.order_number}" data-token="${token}">
            <div class="grid-2"><label>ট্রানজেকশন আইডি<input name="trx_id" required maxlength="60" autocomplete="off"></label><label>যে নম্বর/হিসাব থেকে পাঠিয়েছেন<input name="sender" required maxlength="60"></label></div>
            <button class="btn btn-primary">পেমেন্টের তথ্য জমা দিন</button><p class="form-msg" data-form-msg role="status"></p>
          </form></div>`
          : html`<button class="btn btn-primary btn-lg" data-retry-pay data-order="${o.order_number}" data-token="${token}">আবার পেমেন্ট করুন</button><p class="form-msg" data-form-msg role="status"></p>`}` : ''}
      <p class="small muted">এই পেজের লিংকটি সংরক্ষণ করে রাখুন — এখান থেকেই অর্ডারের সব আপডেট দেখতে পাবেন। ${paid ? html`<a href="/invoice/${o.order_number}?t=${token}" target="_blank">ইনভয়েস ডাউনলোড</a>` : ''}</p>
    </div>
  </div>
</section>`;
}

export function portalPage(): Raw {
  // Rendered client-side from /api/portal/* (the token stays in the URL fragment-free query, never in HTML caches).
  return html`<section class="section"><div class="container" data-portal><p class="muted">লোড হচ্ছে…</p></div></section>`;
}

export function accountPage(): Raw {
  return html`
<section class="section"><div class="container narrow">
  <h1>আমার অর্ডার</h1>
  <p class="muted">অর্ডার নম্বর ও যে মোবাইল নম্বর দিয়ে অর্ডার করেছিলেন তা দিন।</p>
  <form class="card form" data-lookup-form>
    <div class="grid-2"><label>অর্ডার নম্বর<input name="order_number" required maxlength="30" placeholder="ORD-…"></label><label>মোবাইল নম্বর<input name="phone" required inputmode="tel" maxlength="20"></label></div>
    <button class="btn btn-primary">অবস্থা দেখুন</button>
    <div class="form-msg" data-form-msg role="status"></div>
  </form>
</div></section>`;
}

export function staticPage(title: string, body: string): Raw {
  return html`<section class="page-hero mesh"><div class="container"><h1>${title}</h1></div></section><section class="section"><div class="container narrow card prose">${paragraphs(body)}</div></section>`;
}

export function faqPage(faqs: { question: string; answer: string }[]): Raw {
  return html`<section class="page-hero mesh"><div class="container"><h1>প্রশ্নোত্তর</h1><p class="lead">উত্তর না পেলে চ্যাট বাটনে চাপ দিন</p></div></section><section class="section"><div class="container narrow">${faqList(faqs)}</div></section>`;
}

export function contactPage(s: SiteSettings): Raw {
  return html`<section class="page-hero mesh"><div class="container"><h1>যোগাযোগ</h1></div></section>
<section class="section"><div class="container contact-grid">
  <div class="card">
    <h2>সরাসরি যোগাযোগ</h2>
    <dl class="kv">
      ${s.contact_phone ? html`<dt>ফোন</dt><dd><a href="tel:${s.contact_phone}">${s.contact_phone}</a></dd>` : ''}
      ${s.contact_email ? html`<dt>ইমেইল</dt><dd><a href="mailto:${s.contact_email}">${s.contact_email}</a></dd>` : ''}
      ${s.contact_address ? html`<dt>ঠিকানা</dt><dd>${s.contact_address}</dd>` : ''}
      ${s.business_hours ? html`<dt>সময়</dt><dd>${s.business_hours}</dd>` : ''}
    </dl>
    <p class="muted">দ্রুত উত্তরের জন্য নিচের ডান কোণের চ্যাট বাটন ব্যবহার করুন।</p>
  </div>
  ${leadForm({ source: 'contact', title: 'বার্তা পাঠান' })}
</div></section>`;
}

export function quotePage(pkgName: string | null, pkgId: number | undefined): Raw {
  return html`<section class="page-hero mesh"><div class="container"><h1>কাস্টম কোটেশন</h1><p class="lead">${pkgName ? `${pkgName} — আপনার বাড়তি চাহিদা জানান` : 'আপনার চাহিদা জানান, আমরা স্পষ্ট মূল্য জানিয়ে দেব'}</p></div></section>
<section class="section"><div class="container narrow">${leadForm({ source: 'quote', packageId: pkgId })}</div></section>`;
}

export function quizPage(pkgs: PublicPackage[]): Raw {
  const slim = pkgs.filter((p) => p.status === 'active').map((p) => ({ id: p.id, slug: p.slug, name: p.name, categorySlug: p.categorySlug, tier: p.tier, basePrice: p.basePrice }));
  return html`<section class="page-hero mesh"><div class="container"><h1>কোন প্যাকেজ আপনার জন্য?</h1><p class="lead">৪টি প্রশ্ন, এক মিনিট</p></div></section>
<section class="section"><div class="container narrow"><div class="card quiz" data-quiz></div></div></section>
${jsonScript('quiz-packages', slim)}`;
}

export function notFoundPage(): Raw {
  return html`<section class="section"><div class="container narrow center"><h1>পেজটি পাওয়া যায়নি</h1><p class="muted">লিংকটি ভুল হতে পারে অথবা পেজটি সরিয়ে ফেলা হয়েছে।</p><a class="btn btn-primary" href="/">হোমে ফিরে যান</a></div></section>`;
}

/* ---------- Landing pages (admin page builder) ---------- */
export type LPBlock =
  | { type: 'hero'; heading: string; subheading?: string; ctaLabel?: string; ctaHref?: string; image?: string }
  | { type: 'offer'; title: string; text?: string; endsAt?: string; couponCode?: string }
  | { type: 'features'; title?: string; items: string[] }
  | { type: 'packages'; title?: string; packageSlugs?: string[]; categorySlug?: string }
  | { type: 'testimonials'; title?: string }
  | { type: 'faq'; title?: string; items: { q: string; a: string }[] }
  | { type: 'cta'; heading: string; text?: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'lead_form'; title?: string }
  | { type: 'text'; heading?: string; body: string }
  | { type: 'video'; src: string; caption?: string };

export function landingPage(lp: { id: number; title: string }, blocks: LPBlock[], d: { packages: PublicPackage[]; coupons: CouponRow[]; reviews: ReviewView[]; now: number }): Raw {
  const out = blocks.map((b) => {
    switch (b.type) {
      case 'hero':
        return html`<section class="hero mesh lp-hero"><div class="container hero-grid"><div class="hero-copy"><h1>${b.heading}</h1>${b.subheading ? html`<p class="lead">${b.subheading}</p>` : ''}${b.ctaLabel ? html`<a class="btn btn-primary btn-lg" href="${safeUrl(b.ctaHref) || '#lp-form'}">${b.ctaLabel}</a>` : ''}</div>${b.image ? html`<div class="showcase"><div class="browser-frame"><div class="bf-bar"><i></i><i></i><i></i></div><div class="bf-body"><img src="${b.image.startsWith('/') || b.image.startsWith('http') ? safeUrl(b.image) : mediaUrl(b.image)}" alt="" loading="eager"></div></div></div>` : ''}</div></section>`;
      case 'offer':
        return html`<section class="section-sm"><div class="container"><div class="card offer-card"><h2>${b.title}</h2>${b.text ? html`<p>${b.text}</p>` : ''}${b.endsAt && Date.parse(b.endsAt) > d.now ? countdown(b.endsAt) : ''}${b.couponCode ? html`<button type="button" class="coupon-chip" data-copy="${b.couponCode}">কুপন: <strong>${b.couponCode}</strong></button>` : ''}</div></div></section>`;
      case 'features':
        return html`<section class="section-sm"><div class="container">${b.title ? html`<h2>${b.title}</h2>` : ''}<ul class="features cols">${(b.items || []).map((i) => html`<li>${i}</li>`)}</ul></div></section>`;
      case 'packages': {
        const list = b.packageSlugs?.length ? d.packages.filter((p) => b.packageSlugs!.includes(p.slug)) : b.categorySlug ? d.packages.filter((p) => p.categorySlug === b.categorySlug) : d.packages.slice(0, 6);
        return html`<section class="section-sm"><div class="container">${b.title ? html`<h2>${b.title}</h2>` : ''}<div class="pkg-grid">${list.map((p) => packageCard(p, d.coupons, d.now))}</div></div></section>`;
      }
      case 'testimonials':
        return d.reviews.length ? html`<section class="section-sm"><div class="container">${b.title ? html`<h2>${b.title}</h2>` : ''}<div class="review-grid">${d.reviews.slice(0, 6).map(reviewCard)}</div></div></section>` : raw('');
      case 'faq':
        return html`<section class="section-sm"><div class="container narrow">${b.title ? html`<h2>${b.title}</h2>` : ''}${faqList((b.items || []).map((i) => ({ question: i.q, answer: i.a })))}</div></section>`;
      case 'cta':
        return html`<section class="section-sm"><div class="container"><div class="cta-band mesh"><div><h2>${b.heading}</h2>${b.text ? html`<p>${b.text}</p>` : ''}</div>${b.ctaLabel ? html`<a class="btn btn-light btn-lg" href="${safeUrl(b.ctaHref) || '#lp-form'}">${b.ctaLabel}</a>` : ''}</div></div></section>`;
      case 'lead_form':
        return html`<section class="section-sm" id="lp-form"><div class="container narrow">${leadForm({ source: 'landing', title: b.title || 'আগ্রহী? আপনার তথ্য দিন', landingPageId: lp.id })}</div></section>`;
      case 'text':
        return html`<section class="section-sm"><div class="container narrow prose">${b.heading ? html`<h2>${b.heading}</h2>` : ''}${paragraphs(b.body)}</div></section>`;
      case 'video': {
        const src = b.src.startsWith('http') || b.src.startsWith('/') ? safeUrl(b.src) : mediaUrl(b.src);
        return html`<section class="section-sm"><div class="container narrow"><div class="browser-frame"><div class="bf-bar"><i></i><i></i><i></i></div><div class="bf-body"><video src="${src}" controls playsinline preload="metadata"></video></div></div>${b.caption ? html`<p class="center muted">${b.caption}</p>` : ''}</div></section>`;
      }
      default:
        return raw('');
    }
  });
  return html`${out}`;
}

/* ---------- Invoice ---------- */
export interface InvoiceData {
  settings: SiteSettings;
  order: OrderView & { customer_phone: string; customer_email: string; business_name: string; paid_at: string | null; paid_amount: number | null; gateway: string | null };
  items: { package_name: string; base_price: number; addons: { name?: string; quantity: number; unitPrice: number; amount: number }[]; subtotal: number; offer_discount: number; total: number }[];
  methodLabel: string;
  autoPrint: boolean;
}

export function invoiceHtml(d: InvoiceData): string {
  const o = d.order;
  return html`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>ইনভয়েস ${o.invoice_number || o.order_number}</title>
<link rel="stylesheet" href="/assets/css/invoice.css">${d.autoPrint ? raw('<script src="/assets/js/print.js" defer></script>') : ''}</head>
<body><div class="inv">
<header><div><h1>${d.settings.brand_name}</h1><p>${d.settings.contact_address}<br>${d.settings.contact_phone} ${d.settings.contact_email}</p></div>
<div class="right"><h2>ইনভয়েস</h2><p><strong>${o.invoice_number || 'অপরিশোধিত — ইনভয়েস নম্বর পেমেন্টের পর দেওয়া হবে'}</strong><br>অর্ডার: ${o.order_number}<br>তারিখ: ${bnDate(o.paid_at || o.created_at)}</p></div></header>
<section class="bill"><h3>বিল প্রাপক</h3><p>${o.customer_name}${o.business_name ? html`<br>${o.business_name}` : ''}<br>${o.customer_phone}${o.customer_email ? html`<br>${o.customer_email}` : ''}</p></section>
<table><thead><tr><th>বিবরণ</th><th>পরিমাণ</th><th class="num">মূল্য</th></tr></thead><tbody>
${d.items.map((it) => html`<tr><td><strong>${it.package_name}</strong> (মূল প্যাকেজ)</td><td>${bnDigits(1)}</td><td class="num">${taka(it.base_price)}</td></tr>
${it.addons.map((a) => html`<tr><td class="sub">+ ${a.name || 'অ্যাড-অন'}</td><td>${bnDigits(a.quantity)} × ${taka(a.unitPrice)}</td><td class="num">${taka(a.amount)}</td></tr>`)}
${it.offer_discount ? html`<tr><td class="sub">অফার ছাড়</td><td></td><td class="num">−${taka(it.offer_discount)}</td></tr>` : ''}`)}
</tbody><tfoot>
<tr><td colspan="2">সাবটোটাল</td><td class="num">${taka(o.subtotal)}</td></tr>
${o.offer_discount ? html`<tr><td colspan="2">মোট অফার ছাড়</td><td class="num">−${taka(o.offer_discount)}</td></tr>` : ''}
${o.coupon_discount ? html`<tr><td colspan="2">কুপন (${o.coupon_code})</td><td class="num">−${taka(o.coupon_discount)}</td></tr>` : ''}
<tr class="grand"><td colspan="2">সর্বমোট</td><td class="num">${taka(o.total)}</td></tr>
${o.payment_status === 'paid' ? html`<tr><td colspan="2">পরিশোধিত (${d.methodLabel})</td><td class="num">${taka(o.paid_amount ?? o.total)}</td></tr>` : ''}
</tfoot></table>
<p class="status ${o.payment_status === 'paid' ? 'paid' : ''}">${o.payment_status === 'paid' ? 'পরিশোধিত' : 'অপরিশোধিত'}</p>
<footer>এটি একটি কম্পিউটারে তৈরি ইনভয়েস, স্বাক্ষরের প্রয়োজন নেই। ধন্যবাদ!</footer>
${d.autoPrint ? html`<p class="noprint"><button data-print>পিডিএফ হিসেবে সংরক্ষণ / প্রিন্ট করুন</button></p>` : ''}
</div></body></html>`.value;
}
