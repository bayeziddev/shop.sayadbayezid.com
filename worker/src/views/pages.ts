import { html, raw, paragraphs, safeUrl, jsonScript, type Raw } from '../lib/html';
import type { PublicPackage, CouponRow, CategoryRow } from '../lib/catalog';
import { mediaUrl } from '../lib/catalog';
import { taka, bnDigits, bnDate } from '../lib/util';
import {
  browserFrame, phoneFrame, packageCard, priceBlock, liveOffer, currentPrice, offerSlot, countdown, offerBadge, couponChip, couponsFor, reviewCard, faqList, leadForm, stars,
  demoLink, videoPlayer, pointCards, designCard, portfolioCard, shotCaption, isTallShot, tierLabel, DESIGN_KINDS, problemGrid, roiCalculator, catalogBrowser,
  type ReviewView, type DesignView, type PortfolioView,
} from './components';
import type { SiteSettings } from '../lib/settings';
import type { PublicCourse, CourseCategoryRow } from '../lib/courses';
import { courseBrowser } from './courses';

export interface HomeData {
  settings: SiteSettings;
  categories: (CategoryRow & { package_count: number; min_price: number | null })[];
  featured: PublicPackage[];
  /** Every visible package, grouped by category on the home page. */
  packages: PublicPackage[];
  coupons: CouponRow[];
  reviews: ReviewView[];
  faqs: { question: string; answer: string }[];
  stats: { clients: number; completed: number; reviewCount: number; reviewAvg: number };
  designs: DesignView[];
  portfolio: PortfolioView[];
  whyUs: { title: string; text: string }[];
  /** "সমস্যা | সমাধান" pairs from settings.home_problems. */
  problems: { title: string; text: string }[];
  minPrice: number | null;
  now: number;
  /** Online courses: their own lane on the home page. */
  courseCategories: CourseCategoryRow[];
  courses: PublicCourse[];
  /** Real count of students with an open course (shown only when above zero). */
  students: number;
  studentUrl: string;
}

export function homePage(d: HomeData): Raw {
  const showcase = d.featured.filter((p) => p.cover).slice(0, 6);
  const proof = [
    d.stats.clients > 0 ? html`<div class="stat"><strong>${bnDigits(d.stats.clients)}</strong><span>ক্লায়েন্ট আমাদের সাথে কাজ করেছেন</span></div>` : '',
    d.stats.completed > 0 ? html`<div class="stat"><strong>${bnDigits(d.stats.completed)}</strong><span>প্রজেক্ট সফলভাবে সম্পন্ন</span></div>` : '',
    d.stats.reviewCount > 0 ? html`<div class="stat"><strong>${bnDigits(d.stats.reviewAvg.toFixed(1))}/৫</strong><span>${bnDigits(d.stats.reviewCount)}টি ক্লায়েন্ট রিভিউর গড়</span></div>` : '',
  ].filter(Boolean);
  const kinds = DESIGN_KINDS.filter(([k]) => d.designs.some((x) => x.kind === k));
  const courseCount = d.courses.length;
  const liveCourses = d.courses.filter((c) => !c.comingSoon);
  const courseMin = liveCourses.length ? Math.min(...liveCourses.map((c) => c.price)) : null;
  return html`
<section class="hero hero-paths mesh">
  <div class="container">
    <div class="paths-head reveal" data-edit="settings">
      <span class="eyebrow">${d.settings.brand_name} · ওয়েবসাইট ও অনলাইন কোর্স</span>
      <h1>ব্যবসা অনলাইনে নিন — <span class="grad-text">রেডি ওয়েবসাইট</span> দিয়ে বিক্রি শুরু করুন, <span class="grad-text-c">কোর্সে শিখে</span> নিজেই বড় করুন</h1>
      <p class="lead">${d.settings.brand_tagline}</p>
    </div>
    <div class="paths">
      <a class="path path-web reveal" href="#websites">
        <span class="path-n" aria-hidden="true">০১</span>
        <span class="path-ico" aria-hidden="true">🛒</span>
        <h2>রেডি ওয়েবসাইট</h2>
        <p>ইনবক্স নয়, নিজের অনলাইন দোকানে অর্ডার নিন — ২৪ ঘণ্টা, গুছিয়ে।</p>
        <ul><li>কেনার আগে লাইভ ডেমো চালিয়ে দেখুন</li><li>এক দাম — বিক্রি থেকে কোনো কমিশন নেই</li><li>আপনার অনুমোদনের পরেই লাইভ</li></ul>
        <span class="path-foot"><span>${bnDigits(d.categories.filter((c) => c.package_count > 0).length)}টি ব্যবসার ধরন${d.minPrice ? html` · ${taka(d.minPrice)} থেকে` : ''}</span><span class="path-go">ওয়েবসাইট দেখুন <span aria-hidden="true">↓</span></span></span>
      </a>
      <a class="path path-course reveal" href="#courses">
        <span class="path-n" aria-hidden="true">০২</span>
        <span class="path-ico" aria-hidden="true">🎓</span>
        <h2>অনলাইন কোর্স</h2>
        <p>ডিজিটাল মার্কেটিং, ডেভেলপমেন্ট, পাইথন — লেসন ধরে ধরে, হাতে-কলমে শিখুন।</p>
        <ul><li>ফ্রি প্রিভিউ লেসন দেখে তারপর ভর্তি</li><li>পেমেন্ট নিশ্চিত হলেই কোর্স প্রোফাইলে চালু</li><li>নিজের সময়ে, মোবাইলেই শিখুন</li></ul>
        <span class="path-foot"><span>${courseCount ? html`${bnDigits(courseCount)}টি কোর্স${courseMin !== null ? html` · ${courseMin ? html`${taka(courseMin)} থেকে` : 'ফ্রি কোর্সও আছে'}` : ''}` : 'নতুন কোর্স শীঘ্রই'}${d.students > 0 ? html` · ${bnDigits(d.students)} জন শিক্ষার্থী` : ''}</span><span class="path-go">কোর্স দেখুন <span aria-hidden="true">↓</span></span></span>
      </a>
    </div>
    ${d.settings.lead_box_enabled ? html`<p class="paths-more"><button type="button" class="link-cta hero-advice" data-leadbox-open data-leadbox-from="hero">কোন ওয়েবসাইট নেবেন বুঝতে পারছেন না? ২ মিনিটে ফ্রি পরামর্শ নিন →</button></p>` : ''}
  </div>
</section>

<section class="lane lane-web" id="websites" aria-labelledby="lane-web-h">
  <div class="container">
    <header class="lane-head">
      <span class="lane-n" aria-hidden="true">০১</span>
      <div class="lane-title"><span class="lane-kicker">ওয়েবসাইট</span><h2 id="lane-web-h">আপনার ব্যবসার জন্য রেডি ওয়েবসাইট</h2><p>পাশের তালিকা থেকে ব্যবসার ধরন বেছে নিন — প্রতিটি সাইটের লাইভ ডেমো আছে, এক দাম ${d.minPrice ? taka(d.minPrice) : ''}</p></div>
      <a class="btn btn-ghost" href="/packages">সব প্যাকেজ এক পেজে <span aria-hidden="true">→</span></a>
    </header>
    <div class="lane-intro">
      <div class="hero-copy reveal" data-edit="settings">
        <h3 class="lane-sub">ইনবক্স নয়, <span class="grad-text">নিজের অনলাইন দোকানে</span> অর্ডার নিন — ২৪ ঘণ্টা, গুছিয়ে</h3>
        <ul class="hero-points"><li>✓ কেনার আগে লাইভ ডেমোতে নিজে চালিয়ে দেখুন</li><li>✓ এক দাম — বিক্রি থেকে কোনো কমিশন নেই</li><li>✓ আপনার অনুমোদনের পরেই লাইভ</li></ul>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="#categories">ব্যবসার ধরন বেছে নিন <span aria-hidden="true">↓</span></a>
          <a class="btn btn-ghost btn-lg" href="/designs">ডিজাইন গ্যালারি</a>
        </div>
      </div>
      ${showcase.length ? html`<div class="showcase reveal" data-rotator aria-roledescription="স্লাইডশো" aria-label="আমাদের রেডি ওয়েবসাইটের ডেমো">
        ${showcase.map((p, i) => html`<figure class="slide ${i === 0 ? 'is-active' : ''}" data-slide>
          <a href="/package/${p.slug}" aria-label="${p.name} — বিস্তারিত দেখুন">${browserFrame(p, { eager: i === 0, video: true })}</a>
          <figcaption><span><strong>${p.name}</strong></span>${demoLink(p, p.demoUrl, 'লাইভ ডেমো খুলুন', 'link-cta')}</figcaption>
        </figure>`)}
        <div class="dots">${showcase.map((_, i) => html`<button data-dot="${i}" aria-label="স্লাইড ${bnDigits(i + 1)}" ${i === 0 ? raw('aria-current="true"') : ''}></button>`)}</div>
      </div>` : ''}
    </div>
    <div id="categories" class="lane-anchor">${catalogBrowser(d.categories, d.packages, d.coupons, d.now, mediaUrl)}</div>
  </div>
</section>

<section class="lane lane-course" id="courses" aria-labelledby="lane-course-h">
  <div class="container">
    <header class="lane-head">
      <span class="lane-n" aria-hidden="true">০২</span>
      <div class="lane-title"><span class="lane-kicker">অনলাইন কোর্স</span><h2 id="lane-course-h">শিখুন, তারপর নিজের ব্যবসা নিজেই বড় করুন</h2><p>ক্যাটাগরি বেছে নিন — প্রতিটি কোর্সে লেসনের পুরো তালিকা আর ফ্রি প্রিভিউ আছে। পেমেন্ট নিশ্চিত হলেই কোর্সটি আপনার প্রোফাইলে খুলে যায়।</p></div>
      <a class="btn btn-ghost" href="/courses">সব কোর্স <span aria-hidden="true">→</span></a>
    </header>
    ${courseBrowser(d.courseCategories, d.courses)}
    <ol class="flow flow-3 course-steps">
      <li class="flow-step"><span class="flow-n" aria-hidden="true">১</span><div><h3>কোর্স বেছে ভর্তি হোন</h3><p class="muted">লেসনের তালিকা আর ফ্রি প্রিভিউ দেখে নাম, মোবাইল ও পাসওয়ার্ড দিয়ে ভর্তি ফর্ম পূরণ করুন।</p></div></li>
      <li class="flow-step"><span class="flow-n" aria-hidden="true">২</span><div><h3>পেমেন্ট নিশ্চিত হলেই চালু</h3><p class="muted">বিকাশ, নগদ, রকেট, কার্ড বা ব্যাংকে পেমেন্ট — নিশ্চিত হলেই কোর্স আপনার প্রোফাইলে খোলে।</p></div></li>
      <li class="flow-step"><span class="flow-n" aria-hidden="true">৩</span><div><h3>লেসন ধরে ধরে শিখুন</h3><p class="muted">মোবাইল নম্বর ও পাসওয়ার্ডে লগইন — কোন লেসন শেষ হলো, কোথায় থামলেন সব মনে থাকে।</p></div></li>
    </ol>
    <p class="center lane-foot"><a class="btn btn-primary btn-lg course-cta" href="/courses">সব কোর্স দেখুন <span aria-hidden="true">→</span></a> <a class="btn btn-ghost btn-lg" href="${d.studentUrl}">আমার কোর্স — লগইন</a></p>
  </div>
</section>

${d.problems.length ? html`<section class="section pains" id="problems">
  <div class="container">
    <header class="section-head" data-edit="settings"><span class="lane-kicker">ওয়েবসাইট</span><h2>অনলাইনে বিক্রি করতে গিয়ে এই ঝামেলাগুলো কি হচ্ছে?</h2><p class="muted">প্রতিটি ঝামেলার পাশে লেখা — নিজের ওয়েবসাইট কীভাবে সেটা মেটায়</p></header>
    ${problemGrid(d.problems)}
    <p class="center pains-cta"><span class="muted">কোন প্যাকেজে কোন সুবিধা আছে, প্রতিটি প্যাকেজ পেজে বিস্তারিত লেখা।</span><br><a class="btn btn-primary btn-lg" href="#categories">আপনার ব্যবসার ধরন বেছে নিন <span aria-hidden="true">↓</span></a></p>
  </div>
</section>` : ''}

${d.designs.length ? html`<section class="section designs-teaser">
  <div class="container">
    <header class="section-head"><h2>ডিজাইন গ্যালারি</h2><p class="muted">চেকআউট, সাইডবার, ফুটার, হেডার — আমাদের তৈরি সব ডিজাইন পাশাপাশি তুলনা করুন</p></header>
    <div class="chip-row" role="tablist" aria-label="ডিজাইনের ধরন">${kinds.slice(0, 6).map(([k, l], i) => html`<a class="chip ${i === 0 ? 'is-on' : ''}" href="/designs?kind=${k}">${l}</a>`)}</div>
    <div class="design-grid">${d.designs.slice(0, 6).map(designCard)}</div>
    <p class="center"><a class="btn btn-primary btn-lg" href="/designs">সব ডিজাইন দেখুন <span aria-hidden="true">→</span></a></p>
  </div>
</section>` : ''}

<section class="section how">
  <div class="container">
    <header class="section-head"><span class="lane-kicker">ওয়েবসাইট</span><h2>ওয়েবসাইট অর্ডার — কীভাবে কাজ করে</h2></header>
    <ol class="steps">
      <li class="card"><span class="step-n">১</span><h3>ডেমো দেখে প্যাকেজ বাছাই করুন</h3><p class="muted">লাইভ ডেমো নিজে চালিয়ে দেখুন আপনার ক্রেতা কী দেখবেন আর আপনি অ্যাডমিনে কী পাবেন — দাম আগেই লেখা।</p></li>
      <li class="card"><span class="step-n">২</span><h3>পেমেন্ট করুন, আমরা বানাই</h3><p class="muted">পেমেন্টের পর আপনার ব্যবসার তথ্য দিন। প্রতিটি ধাপের আপডেট আপনার অর্ডার পেজে পাবেন।</p></li>
      <li class="card"><span class="step-n">৩</span><h3>অনুমোদন দিন, লাইভ হোক</h3><p class="muted">প্রিভিউ দেখে মতামত দিন, সংশোধন শেষে অনুমোদন দিলেই আপনার সাইট লাইভ।</p></li>
    </ol>
  </div>
</section>

${d.portfolio.length ? html`<section class="section">
  <div class="container">
    <header class="section-head"><h2>সফল ডেলিভারি</h2><p class="muted">আমাদের ক্লায়েন্টদের জন্য তৈরি ও ডেলিভারি করা আসল সাইট</p></header>
    <div class="work-grid">${d.portfolio.slice(0, 3).map(portfolioCard)}</div>
    <p class="center"><a class="btn btn-ghost btn-lg" href="/portfolio">সব ডেলিভারি দেখুন <span aria-hidden="true">→</span></a></p>
  </div>
</section>` : ''}

${d.whyUs.length ? html`<section class="section">
  <div class="container">
    <header class="section-head" data-edit="settings"><h2>কেন ${d.settings.brand_name}?</h2></header>
    ${pointCards(d.whyUs, '★')}
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
    ${faqList(d.faqs.slice(0, 5))}
    <p class="center"><a class="btn btn-ghost" href="/faq">সব প্রশ্নোত্তর দেখুন <span aria-hidden="true">→</span></a></p>
  </div>
</section>` : ''}

<section class="section">
  <div class="container">
    <div class="cta-band mesh">
      <div><h2>কোন সাইট নেবেন বুঝতে পারছেন না?</h2><p>৪টি ছোট প্রশ্নের উত্তর দিন — আমরা আপনার ব্যবসার জন্য উপযুক্ত প্যাকেজ সাজেস্ট করব।</p></div>
      <div class="cta-actions"><a class="btn btn-light btn-lg" href="/quiz">১ মিনিটের কুইজ শুরু করুন</a><a class="btn btn-outline-light btn-lg" href="/quote">ফ্রি কোটেশন নিন</a></div>
    </div>
    <div class="cta-band cta-band-course">
      <div><h2>নিজে শিখে ব্যবসা বড় করতে চান?</h2><p>ফেসবুক বিজ্ঞাপন, ডিজিটাল মার্কেটিং, ওয়েব ডেভেলপমেন্ট — লেসন ধরে ধরে বাংলায় শিখুন।</p></div>
      <div class="cta-actions"><a class="btn btn-light btn-lg" href="/courses">কোর্সগুলো দেখুন</a></div>
    </div>
  </div>
</section>`;
}

/** Category filter chips + grid. Filtering is client-side (works on the static GitHub Pages copy too). */
function filterChips(cats: { slug: string; name: string }[], allLabel: string): Raw {
  return html`<div class="chip-row" data-filter-chips role="toolbar" aria-label="ক্যাটাগরি অনুযায়ী দেখুন"><button type="button" class="chip is-on" data-filter="">${allLabel}</button>${cats.map((c) => html`<button type="button" class="chip" data-filter="${c.slug}">${c.name}</button>`)}</div>`;
}

export function packagesPage(categories: CategoryRow[], pkgs: PublicPackage[], coupons: CouponRow[], now: number): Raw {
  return html`
<section class="page-hero mesh">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <span>সব প্যাকেজ</span></nav>
    <h1>সব রেডি ওয়েবসাইট</h1>
    <p class="lead">প্রতিটির আসল লাইভ ডেমো আছে — ক্লিক করে ঘুরে দেখুন, পছন্দ হলে আপনার ব্র্যান্ডে বানিয়ে নিন।</p>
  </div>
</section>
<section class="section">
  <div class="container">
    ${catalogBrowser(categories, pkgs, coupons, now, mediaUrl)}
    <div class="card quote-nudge"><div><h3>যেমন চান ঠিক তেমন নেই?</h3><p class="muted">আপনার চাহিদা জানান — কাস্টম সাইটের দাম জানিয়ে দেব।</p></div><a class="btn btn-primary" href="/quote">ফ্রি কোটেশন নিন →</a></div>
  </div>
</section>`;
}

export function categoryPage(cat: CategoryRow, pkgs: PublicPackage[], coupons: CouponRow[], now: number, catOffer: ReturnType<typeof liveOffer>, allCats: CategoryRow[] = [], allPkgs: PublicPackage[] = []): Raw {
  return html`
<section class="page-hero mesh">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <a href="/packages">সব প্যাকেজ</a> › <span>${cat.name}</span></nav>
    <h1>${cat.icon} ${cat.name} ওয়েবসাইট</h1>
    <p class="lead">${cat.description}</p>
    ${catOffer ? html`<div class="offer-strip">${offerBadge(catOffer)} <span>${catOffer.title || 'এই ক্যাটাগরির সব প্যাকেজে অফার চলছে'}</span> ${countdown(catOffer.endsAt)}</div>` : ''}
  </div>
</section>
<section class="section">
  <div class="container">
    ${pkgs.length ? (allCats.length ? catalogBrowser(allCats, allPkgs.length ? allPkgs : pkgs, coupons, now, mediaUrl, { only: cat.slug }) : html`<div class="pkg-grid">${pkgs.map((p) => packageCard(p, coupons, now))}</div>`) : html`<div class="empty card"><p>এই ক্যাটাগরিতে এখনো কোনো প্যাকেজ যোগ করা হয়নি।</p><a class="btn btn-primary" href="/quote">ফ্রি কোটেশন নিন →</a></div>`}
    <div class="card quote-nudge"><div><h3>আপনার চাহিদা একটু আলাদা?</h3><p class="muted">প্যাকেজের বাইরে কিছু লাগলে জানান — আলাদা মূল্য জানিয়ে দেব।</p></div><a class="btn btn-ghost" href="/quote">কোটেশন চাই →</a></div>
  </div>
</section>`;
}

export interface PackagePageData {
  coupons: CouponRow[];
  faqs: { question: string; answer: string }[];
  reviews: ReviewView[];
  whyUs: { title: string; text: string }[];
  designs: DesignView[];
  related: PublicPackage[];
  whatsapp: string | null;
  /** "প্রতিটি সাইটে যা থাকছে" (settings.common_features). */
  common: string[];
  now: number;
}

export function packagePage(p: PublicPackage, d: PackagePageData): Raw {
  const offer = liveOffer(p, d.now);
  const cs = couponsFor(p, d.coupons);
  const soon = p.status === 'coming_soon';
  const avg = d.reviews.length ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length : 0;
  const shots = [...new Set([p.cover, ...p.images].filter(Boolean))];
  const wide = shots.filter((s) => !isTallShot(s));
  const mobile = shots.find((s) => /\/mobile\.\w+$/.test(s));
  const whyUs = p.whyUs.length ? p.whyUs : d.whyUs;
  const demos = [...(p.demoUrl ? [{ label: 'লাইভ ডেমো দেখুন', url: p.demoUrl }] : []), ...p.demoLinks.filter((l) => l.url !== p.demoUrl)];
  const nav: [string, string, boolean][] = [
    ['solution', 'সমস্যা ও সমাধান', !!p.solution || p.problems.length > 0], ['how', 'কীভাবে কাজ করে', p.how.length > 0],
    ['benefits', 'আপনার লাভ', p.benefits.length > 0], ['profit', 'লাভের হিসাব', p.profit.length > 0 || p.roi.profit > 0], ['tour', 'ফিচার ট্যুর', p.tour.length > 0],
    ['features', 'সব ফিচার', true], ['video', 'ভিডিও', !!p.video], ['screens', 'স্ক্রিনশট', !p.tour.length && shots.length > 1],
    ['why', 'কেন আমরা', whyUs.length > 0], ['reviews', 'রিভিউ', true], ['faq', 'প্রশ্নোত্তর', d.faqs.length > 0],
  ];
  const price = currentPrice(p, d.now); // with a live offer: the discounted price, everywhere on the page
  const orderLabel = html`এখনই অর্ডার করুন — <span data-cfg="total-inline">${taka(price)}</span>`;
  return html`
<section class="section pkg-detail" data-edit="package:${p.id}">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <a href="/category/${p.categorySlug}">${p.categoryName}</a> › <span>${p.name}</span></nav>
    <div class="pkg-layout">
      <div class="pkg-left">
        <div class="gallery" data-gallery>
          <div class="gallery-main">${wide.length
            ? wide.map((src, i) => html`<div class="g-item ${i === 0 ? 'is-active' : ''}" data-g-item><button type="button" class="g-zoom" data-lightbox="${src}" data-caption="${p.name} — ${shotCaption(src, i)}" aria-label="বড় করে দেখুন">${browserFrame(p, { eager: i === 0, src, alt: `${p.name} — ${shotCaption(src, i)}` })}</button></div>`)
            : browserFrame(p, { eager: true })}</div>
          ${wide.length > 1 ? html`<div class="gallery-thumbs" role="tablist" aria-label="স্ক্রিনশট">${wide.map((src, i) => html`<button data-g-thumb="${i}" aria-label="${shotCaption(src, i)}" ${i === 0 ? raw('aria-current="true"') : ''}><img src="${src}" alt="" loading="lazy"><span>${shotCaption(src, i)}</span></button>`)}</div>` : ''}
        </div>
        ${demos.length ? html`<div class="card demo-box">
          <div class="demo-box-head"><strong>নিজে ক্লিক করে দেখুন</strong><span class="muted small">আসল, কাজ করা ডেমো — নতুন ট্যাবে খুলবে</span></div>
          <div class="demo-btns">${demos.map((l, i) => demoLink(p, l.url, l.label, i === 0 ? 'btn btn-primary' : 'btn btn-ghost'))}</div>
          ${p.demoLogin ? html`<p class="small muted demo-login">🔑 ${p.demoLogin}</p>` : ''}
        </div>` : ''}
      </div>

      <aside class="pkg-right">
        <form class="card configurator" data-configurator>
          <div class="pkg-tags"><span class="badge">${p.categoryName || tierLabel(p.tier)}</span>${offerSlot(p, d.now)}${avg ? html`<span class="badge">${stars(avg)} ${bnDigits(d.reviews.length)}</span>` : ''}</div>
          <h1>${p.name}</h1>
          <p class="muted">${p.shortDescription}</p>
          ${offer?.endsAt ? countdown(offer.endsAt, offer.title || 'অফার শেষ হবে') : ''}
          <div class="cfg-base"><span>মূল প্যাকেজ</span><strong>${taka(p.basePrice)}</strong></div>
          <ul class="cfg-facts"><li>⏱ তথ্য পাওয়ার পর ${bnDigits(p.deliveryDays)} কর্মদিবসে ডেলিভারি</li><li>🛡 পেমেন্ট নিশ্চিত হলেই কাজ শুরু</li><li>✎ আপনার লোগো, রং ও লেখা বসিয়ে দেওয়া হবে</li></ul>
          ${p.addons.length ? html`<fieldset class="addons"><legend>অ্যাড-অন যোগ করুন (ঐচ্ছিক)</legend>
            ${p.addons.map((a) => a.maxQuantity > 1
              ? html`<div class="addon"><div class="addon-info"><strong>${a.name}</strong><small>${a.description}</small><span class="addon-price">প্রতিটি +${taka(a.priceDelta)}</span></div>
                  <div class="stepper" data-stepper><button type="button" data-step="-1" aria-label="কমান">−</button><input type="text" data-max="${a.maxQuantity}" value="০" name="addon-${a.id}" data-addon="${a.id}" aria-label="${a.name} সংখ্যা" inputmode="numeric" maxlength="2"><button type="button" data-step="1" aria-label="বাড়ান">+</button></div></div>`
              : html`<label class="addon"><div class="addon-info"><strong>${a.name}</strong><small>${a.description}</small><span class="addon-price">+${taka(a.priceDelta)}</span></div>
                  <span class="switch"><input type="checkbox" name="addon-${a.id}" data-addon="${a.id}"><span></span></span></label>`)}
          </fieldset>` : ''}
          <div class="cfg-summary ${p.addons.length ? '' : 'is-fixed'}" aria-live="polite">
            <div class="row" ${p.addons.length ? '' : raw('hidden')}><span>সাবটোটাল</span><span data-cfg="subtotal">${taka(p.basePrice)}</span></div>
            <div class="row discount" data-cfg-row="offer" hidden><span>অফার ছাড়</span><span data-cfg="offer">—</span></div>
            <div class="row total"><span>${p.addons.length ? 'মোট' : 'মোট দাম — এককালীন'}</span><strong data-cfg="total">${priceBlock(p, d.now)}</strong></div>
            ${p.addons.length ? '' : html`<p class="small muted fixed-note">✓ এই দামেই পুরো সাইট — কোনো লুকানো খরচ নেই</p>`}
          </div>
          ${cs.map(couponChip)}
          ${soon
            ? html`<p class="notice">এই প্যাকেজটি শীঘ্রই আসছে। আগ্রহী হলে কোটেশন ফর্মে জানান।</p><a class="btn btn-primary btn-lg btn-block" href="/quote?package=${p.slug}">আগ্রহ জানান →</a>`
            : html`<button class="btn btn-primary btn-lg btn-block" data-order-now>${orderLabel}</button>`}
          <div class="cfg-alt">
            ${d.whatsapp ? html`<a class="btn btn-whatsapp btn-block" href="${d.whatsapp}" target="_blank" rel="noopener" data-contact-click="whatsapp">💬 হোয়াটসঅ্যাপে প্রশ্ন করুন</a>` : html`<button type="button" class="btn btn-ghost btn-block" data-chat-open-alt>💬 প্রশ্ন আছে? চ্যাট করুন</button>`}
            <a class="btn btn-ghost btn-block" href="/quote?package=${p.slug}">কাস্টম চাহিদা? ফ্রি কোটেশন নিন</a>
          </div>
          <p class="small muted center">চূড়ান্ত দাম চেকআউটে সার্ভার থেকে যাচাই করা হয়</p>
        </form>
      </aside>
    </div>
  </div>
</section>

<nav class="section-tabs" aria-label="এই পেজে"><div class="container">${nav.filter(([, , on]) => on).map(([id, l]) => html`<a href="#${id}">${l}</a>`)}</div></nav>

${p.solution || p.problems.length ? html`<section class="section-sm" id="solution"><div class="container">
  ${p.solution ? html`<div class="card solution-card"><span class="eyebrow">সমস্যা ও সমাধান</span><h2>এই সাইট আপনার কোন ঝামেলা মেটাবে</h2>${paragraphs(p.solution)}</div>` : ''}
  ${p.problems.length ? html`<h3 class="pains-title">এখন যা হচ্ছে → এই সাইটে যা হবে</h3>${problemGrid(p.problems)}` : ''}
</div></section>` : ''}

${p.how.length ? html`<section class="section-sm" id="how"><div class="container">
  <h2>কীভাবে কাজ করবে — ক্রেতা আসা থেকে ডেলিভারি</h2><p class="muted">সাইট চালু হলে আপনার একটি সাধারণ দিন এভাবে চলবে</p>
  <ol class="flow">${p.how.map((s, i) => html`<li class="flow-step"><span class="flow-n" aria-hidden="true">${bnDigits(i + 1)}</span><div><h3>${s.title}</h3>${s.text ? html`<p class="muted">${s.text}</p>` : ''}</div></li>`)}</ol>
</div></section>` : ''}

${p.benefits.length ? html`<section class="section-sm" id="benefits"><div class="container"><h2>আপনার ব্যবসার লাভ</h2>${pointCards(p.benefits, '#')}</div></section>` : ''}

${p.profit.length || p.roi.profit > 0 ? html`<section class="section-sm" id="profit"><div class="container">
  <h2>লাভের হিসাব — টাকা কোথা থেকে আসে, কোথায় বাঁচে</h2>
  <div class="profit-split">
    ${p.profit.length ? html`<div class="profit-list">${pointCards(p.profit, '৳')}</div>` : ''}
    ${p.roi.profit > 0 ? roiCalculator(p.basePrice, p.roi) : ''}
  </div>
</div></section>` : ''}

${p.tour.length ? html`<section class="section-sm" id="tour"><div class="container">
  <h2>ফিচার ট্যুর — স্ক্রিনশটে দেখুন</h2><p class="muted">প্রতিটি স্ক্রিনে কী আছে, ছবির পাশে লেখা — ছবিতে চাপ দিলে বড় হবে</p>
  <div class="tour">${p.tour.map((t, i) => html`<article class="tour-row ${i % 2 ? 'is-flip' : ''}">
    <button type="button" class="tour-shot ${isTallShot(t.image) ? 'is-tall' : ''}" data-lightbox="${t.image}" data-caption="${p.name} — ${t.title}">${isTallShot(t.image) ? phoneFrame(t.image, `${p.name} — ${t.title}`) : browserFrame(p, { src: t.image, alt: `${p.name} — ${t.title}` })}</button>
    <div class="tour-text"><span class="tour-n">${bnDigits(i + 1)}</span><h3>${t.title}</h3><p>${t.text}</p></div>
  </article>`)}</div>
</div></section>` : ''}

<section class="section-sm" id="features"><div class="container">
  <div class="feature-split">
    <div class="card"><h2>এই প্যাকেজে যা থাকছে</h2><ul class="features">${p.features.map((f) => html`<li>${f}</li>`)}</ul>
      <p class="muted">আনুমানিক ডেলিভারি: তথ্য পাওয়ার পর ${bnDigits(p.deliveryDays)} কর্মদিবস</p></div>
    <div class="card prose"><h2>বিস্তারিত</h2>${paragraphs(p.description)}</div>
  </div>
  ${p.featureGroups.length || d.common.length ? html`<h2 class="az-title">A থেকে Z — সব ফিচার এক জায়গায়</h2>
  <div class="az-grid">
    ${p.featureGroups.map((g) => html`<div class="card az-card"><h3>${g.title}</h3><ul class="features">${g.items.map((i) => html`<li>${i}</li>`)}</ul></div>`)}
    ${d.common.length ? html`<div class="card az-card az-common" data-edit="settings"><h3>প্রতিটি সাইটে যা থাকছে</h3><ul class="features">${d.common.map((i) => html`<li>${i}</li>`)}</ul></div>` : ''}
  </div>` : ''}
</div></section>

${p.video ? html`<section class="section-sm" id="video"><div class="container narrow"><h2>ভিডিওতে দেখুন</h2>${videoPlayer(p.video, `${p.name} — ডেমো ভিডিও`, p.cover, p)}</div></section>` : ''}

${!p.tour.length && shots.length > 1 ? html`<section class="section-sm" id="screens"><div class="container">
  <h2>সব স্ক্রিনশট</h2><p class="muted">ছবিতে ক্লিক করে বড় করে দেখুন</p>
  <div class="shots-layout ${mobile ? 'has-phone' : ''}">
    <div class="shot-grid">${wide.map((src, i) => html`<button type="button" class="shot" data-lightbox="${src}" data-caption="${p.name} — ${shotCaption(src, i)}"><img src="${src}" alt="${p.name} — ${shotCaption(src, i)}" loading="lazy" decoding="async"><span>${shotCaption(src, i)}</span></button>`)}</div>
    ${mobile ? html`<div class="shot-phone">${phoneFrame(mobile, `${p.name} — মোবাইল ভিউ`)}<span class="muted small center">মোবাইল ভিউ</span></div>` : ''}
  </div>
  ${d.designs.length ? html`<p class="center"><a class="btn btn-ghost" href="/designs">অন্য ডিজাইনের সাথে তুলনা করুন →</a></p>` : ''}
</div></section>` : ''}

${whyUs.length ? html`<section class="section-sm" id="why"><div class="container"><h2>কেন আমাদের কাছ থেকে নেবেন</h2>${pointCards(whyUs, '★')}</div></section>` : ''}

<section class="section-sm" id="reviews"><div class="container"><h2>ক্লায়েন্ট রিভিউ</h2>${d.reviews.length ? html`<div class="review-grid">${d.reviews.map(reviewCard)}</div>` : html`<p class="muted">এই প্যাকেজের এখনো কোনো রিভিউ নেই — অর্ডার সম্পন্ন হওয়া ক্লায়েন্টদের রিভিউ এখানে দেখাবে।</p>`}</div></section>

${d.faqs.length ? html`<section class="section-sm" id="faq" data-edit="faqs:${p.id}"><div class="container narrow"><h2>${p.name.split(' — ').pop()} — প্রশ্নোত্তর</h2>${faqList(d.faqs)}</div></section>` : ''}

<section class="section-sm"><div class="container">
  <div class="cta-band mesh">
    <div><h2>আপনার ব্যবসার জন্য এই সাইটটি চান?</h2><p>আজ অর্ডার করুন — পেমেন্টের পর তথ্য দিলেই কাজ শুরু।</p></div>
    <div class="cta-actions">${soon ? html`<a class="btn btn-light btn-lg" href="/quote?package=${p.slug}">আগ্রহ জানান</a>` : html`<button type="button" class="btn btn-light btn-lg" data-order-now-proxy>এখনই অর্ডার করুন — <span data-live-total="${p.id}">${taka(price)}</span></button>`}${demoLink(p, p.demoUrl, 'আগে ডেমো দেখুন', 'btn btn-outline-light btn-lg')}</div>
  </div>
</div></section>

${d.related.length ? html`<section class="section-sm"><div class="container"><h2>এই ধরনের আরও সাইট</h2><div class="pkg-grid">${d.related.map((r) => packageCard(r, d.coupons, d.now))}</div></div></section>` : ''}

${soon ? '' : html`<div class="sticky-cta" data-sticky-cta hidden><div><strong data-live-total="${p.id}">${taka(price)}</strong><span class="small muted">${p.name}</span></div><button type="button" class="btn btn-primary" data-order-now-proxy>অর্ডার করুন</button></div>`}
${jsonScript('pkg-data', p)}`;
}

export function portfolioPage(items: PortfolioView[]): Raw {
  const cats = [...new Map(items.filter((w) => w.category_slug).map((w) => [w.category_slug!, { slug: w.category_slug!, name: w.category_name || '' }])).values()];
  return html`
<section class="page-hero mesh"><div class="container">
  <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <span>সফল ডেলিভারি</span></nav>
  <h1>সফল ডেলিভারি</h1>
  <p class="lead">আমাদের ক্লায়েন্টদের জন্য তৈরি ও ডেলিভারি করা সব সাইট — ক্লিক করে আসল সাইটটি ঘুরে দেখুন।</p>
</div></section>
<section class="section"><div class="container" data-filter-scope>
  ${items.length ? html`${cats.length > 1 ? filterChips(cats, 'সব') : ''}<div class="work-grid">${items.map(portfolioCard)}</div>`
    : html`<div class="card empty"><h2>শীঘ্রই এখানে আমাদের ডেলিভারি করা সাইট দেখাবো</h2><p class="muted">ততক্ষণে আমাদের রেডি ওয়েবসাইটগুলোর লাইভ ডেমো ঘুরে দেখুন।</p><a class="btn btn-primary" href="/packages">রেডি ওয়েবসাইট দেখুন →</a></div>`}
  <div class="cta-band mesh" style="margin-top:2rem"><div><h2>আপনার সাইটও এখানে দেখতে চান?</h2><p>লাইভ ডেমো দেখে প্যাকেজ বাছুন — আমরা আপনার ব্যবসার জন্য বানিয়ে দেব।</p></div><div class="cta-actions"><a class="btn btn-light btn-lg" href="/packages">প্যাকেজ বাছাই করুন</a><a class="btn btn-outline-light btn-lg" href="/quote">ফ্রি কোটেশন নিন</a></div></div>
</div></section>`;
}

export function designsPage(items: DesignView[], kind: string): Raw {
  const kinds = DESIGN_KINDS.filter(([k]) => items.some((x) => x.kind === k));
  const counts = Object.fromEntries(kinds.map(([k]) => [k, items.filter((x) => x.kind === k).length]));
  return html`
<section class="page-hero mesh"><div class="container">
  <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <span>ডিজাইন গ্যালারি</span></nav>
  <h1>ডিজাইন গ্যালারি</h1>
  <p class="lead">চেকআউট, সাইডবার, ফুটার, হেডার, পণ্যের পেজ — আমাদের তৈরি আসল সাইটের ডিজাইনগুলো পাশাপাশি দেখুন। যেটা পছন্দ, সেটাই আপনার সাইটে।</p>
</div></section>
<section class="section"><div class="container" data-filter-scope data-filter-attr="kind">
  ${items.length ? html`
  <div class="chip-row" data-filter-chips role="toolbar" aria-label="ডিজাইনের ধরন"><button type="button" class="chip ${kind ? '' : 'is-on'}" data-filter="">সব (${bnDigits(items.length)})</button>${kinds.map(([k, l]) => html`<button type="button" class="chip ${kind === k ? 'is-on' : ''}" data-filter="${k}">${l} (${bnDigits(counts[k])})</button>`)}</div>
  <div class="design-grid" ${kind ? html`data-initial-filter="${kind}"` : ''}>${items.map(designCard)}</div>
  ${buttonShowcase()}`
    : html`<div class="card empty"><p>ডিজাইন শীঘ্রই যোগ হবে।</p><a class="btn btn-primary" href="/packages">রেডি ওয়েবসাইট দেখুন →</a></div>`}
  <div class="cta-band mesh" style="margin-top:2rem"><div><h2>একাধিক ডিজাইন মিলিয়ে নিজের সাইট চান?</h2><p>এক সাইটের চেকআউট, আরেকটার ফুটার — জানিয়ে দিন, আমরা মিলিয়ে বানিয়ে দেব।</p></div><div class="cta-actions"><a class="btn btn-light btn-lg" href="/quote">ফ্রি কোটেশন নিন</a><a class="btn btn-outline-light btn-lg" href="/packages">রেডি সাইট দেখুন</a></div></div>
</div></section>`;
}

/** Live button styles a client can point at ("এই বাটনটা চাই"). Rendered with real CSS, not screenshots. */
function buttonShowcase(): Raw {
  const styles: [string, string][] = [['bs-solid', 'সলিড'], ['bs-gradient', 'গ্রেডিয়েন্ট'], ['bs-outline', 'আউটলাইন'], ['bs-pill', 'পিল'], ['bs-soft', 'সফট'], ['bs-shadow', '৩ডি শ্যাডো'], ['bs-icon', 'আইকনসহ'], ['bs-glass', 'গ্লাস']];
  return html`<section class="card button-lab" data-kind-block="button">
  <h2>বাটন ডিজাইন</h2><p class="muted">আপনার সাইটের “অর্ডার করুন” বাটন কেমন হবে? যেটা পছন্দ, অর্ডারের সময় তার নাম লিখে দিন।</p>
  <div class="bs-grid">${styles.map(([c, l]) => html`<div class="bs-item"><button type="button" class="bs ${c}">${c === 'bs-icon' ? html`<span aria-hidden="true">🛒</span> ` : ''}অর্ডার করুন</button><span class="small muted">${l}</span></div>`)}</div>
</section>`;
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
  manual_trx_id: string | null; created_at: string; kind?: string;
}

export function orderPage(o: OrderView, token: string, d: { statusLabel: string; paymentLabel: string; methodLabel: string; manual: null | { title: string; lines: string[] }; cancelled: boolean }): Raw {
  const paid = o.payment_status === 'paid';
  const course = o.kind === 'course';
  return html`
<section class="section">
  <div class="container narrow">
    <div class="card result ${paid ? 'is-success' : ''}">
      ${paid
        ? course
          ? html`<div class="result-ico">✓</div><h1>পেমেন্ট সফল — কোর্স চালু হয়েছে!</h1><p>ধন্যবাদ ${o.customer_name}। কোর্সটি আপনার প্রোফাইলে যোগ হয়েছে। মোবাইল নম্বর আর পাসওয়ার্ড দিয়ে লগইন করে লেসন ধরে ধরে দেখুন।</p>
            <a class="btn btn-primary btn-lg" href="/student">আমার কোর্সে যান →</a>`
          : html`<div class="result-ico">✓</div><h1>পেমেন্ট সফল হয়েছে!</h1><p>ধন্যবাদ ${o.customer_name}। আপনার অর্ডার <strong>${o.order_number}</strong> নিশ্চিত হয়েছে। এখন প্রজেক্ট শুরু করতে আপনার ব্যবসার তথ্য জমা দিন।</p>
            <a class="btn btn-primary btn-lg" href="/portal/${o.order_number}?t=${token}">প্রজেক্টের তথ্য জমা দিন →</a>`
        : o.payment_status === 'pending_verification'
          ? html`<div class="result-ico">⏳</div><h1>পেমেন্ট যাচাই করা হচ্ছে</h1><p>আপনার ট্রানজেকশন আইডি <strong>${o.manual_trx_id}</strong> আমরা পেয়েছি। ${course ? 'যাচাই শেষেই কোর্সটি আপনার প্রোফাইলে চালু হবে — লগইন করে দেখতে পাবেন।' : 'যাচাই শেষে আপনাকে জানানো হবে এবং তথ্য জমার পেজ খুলে যাবে।'}</p>${course ? html`<a class="btn btn-ghost" href="/student">আমার প্রোফাইল</a>` : ''}`
          : d.cancelled
            ? html`<div class="result-ico">!</div><h1>পেমেন্ট সম্পন্ন হয়নি</h1><p>চিন্তার কিছু নেই — আপনার অর্ডার সংরক্ষিত আছে। নিচ থেকে আবার চেষ্টা করুন।</p>`
            : html`<div class="result-ico">৳</div><h1>পেমেন্ট বাকি আছে</h1><p>অর্ডার <strong>${o.order_number}</strong> তৈরি হয়েছে। ${course ? 'পেমেন্ট নিশ্চিত হলেই কোর্সটি আপনার প্রোফাইলে চালু হবে।' : 'পেমেন্ট সম্পন্ন হলেই কাজ শুরু হবে।'}</p>`}
      <dl class="kv">
        <dt>অর্ডার নম্বর</dt><dd>${o.order_number}</dd>
        ${o.invoice_number ? html`<dt>ইনভয়েস নম্বর</dt><dd>${o.invoice_number}</dd>` : ''}
        <dt>মোট</dt><dd>${taka(o.total)}</dd>
        <dt>পেমেন্ট মাধ্যম</dt><dd>${d.methodLabel}</dd>
        <dt>পেমেন্টের অবস্থা</dt><dd>${d.paymentLabel}</dd>
        ${course ? '' : html`<dt>প্রজেক্টের অবস্থা</dt><dd>${d.statusLabel}</dd>`}
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
  const wa = s.whatsapp_link || (s.whatsapp_number ? `https://wa.me/${s.whatsapp_number.replace(/\D/g, '')}` : '');
  const fb = s.facebook_page ? (s.facebook_page.startsWith('http') ? s.facebook_page : `https://facebook.com/${s.facebook_page}`) : '';
  return html`<section class="page-hero mesh"><div class="container"><h1>যোগাযোগ</h1><p class="lead">সবচেয়ে দ্রুত উত্তর পাবেন হোয়াটসঅ্যাপে</p></div></section>
<section class="section"><div class="container contact-grid">
  <div class="card">
    <h2>সরাসরি যোগাযোগ</h2>
    <div class="contact-cta">
      ${wa ? html`<a class="btn btn-whatsapp btn-lg btn-block" href="${safeUrl(wa)}" target="_blank" rel="noopener" data-contact-click="whatsapp">💬 হোয়াটসঅ্যাপে মেসেজ দিন</a>` : ''}
      <button type="button" class="btn btn-primary btn-block" data-leadbox-open data-leadbox-from="contact">২ মিনিটে ফ্রি পরামর্শ নিন →</button>
    </div>
    <dl class="kv">
      ${s.contact_phone ? html`<dt>ফোন / হোয়াটসঅ্যাপ</dt><dd><a href="tel:${s.contact_phone.replace(/[^\d+]/g, '')}">${s.contact_phone}</a></dd>` : ''}
      ${s.contact_email ? html`<dt>ইমেইল</dt><dd><a href="mailto:${s.contact_email}">${s.contact_email}</a></dd>` : ''}
      ${s.support_email ? html`<dt>সাপোর্ট</dt><dd><a href="mailto:${s.support_email}">${s.support_email}</a></dd>` : ''}
      ${fb ? html`<dt>ফেসবুক</dt><dd><a href="${safeUrl(fb)}" target="_blank" rel="noopener">${fb.replace(/^https?:\/\//, '')}</a></dd>` : ''}
      ${s.contact_address ? html`<dt>ঠিকানা</dt><dd>${s.contact_address}${s.map_url ? html` · <a href="${safeUrl(s.map_url)}" target="_blank" rel="noopener">ম্যাপে দেখুন ↗</a>` : ''}</dd>` : ''}
      ${s.business_hours ? html`<dt>সময়</dt><dd>${s.business_hours}</dd>` : ''}
    </dl>
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
