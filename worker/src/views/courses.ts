import { html, raw, paragraphs, type Raw } from '../lib/html';
import { taka, bnDigits } from '../lib/util';
import { mediaUrl } from '../lib/catalog';
import { videoPlayer, faqList, leadForm } from './components';
import type { PublicCourse, PublicSection, LessonContent, CourseCategoryRow } from '../lib/courses';

/* ---------------- Small pieces ---------------- */
const KIND_ICON: Record<string, string> = { video: '▶', link: '🔗', file: '📄', text: '📝' };
const KIND_BN: Record<string, string> = { video: 'ভিডিও', link: 'লিংক', file: 'ফাইল', text: 'নোট' };

function catIcon(c: { icon: string; image_key?: string | null }): Raw {
  return c.image_key ? html`<img src="${mediaUrl(c.image_key)}" alt="" loading="lazy">` : html`<span aria-hidden="true">${c.icon || '🎓'}</span>`;
}

/** Price with the regular price struck through (only when it is really higher). */
export function coursePrice(c: Pick<PublicCourse, 'price' | 'regularPrice' | 'comingSoon'>): Raw {
  if (c.comingSoon) return html`<span class="c-price c-soon">শীঘ্রই আসছে</span>`;
  if (!c.price) return html`<span class="c-price">ফ্রি</span>`;
  const off = c.regularPrice > c.price ? Math.round(((c.regularPrice - c.price) / c.regularPrice) * 100) : 0;
  return html`<span class="c-price">${taka(c.price)}</span>${off ? html` <s class="c-was">${taka(c.regularPrice)}</s> <span class="badge badge-off">${bnDigits(off)}% ছাড়</span>` : ''}`;
}

export function courseCard(c: PublicCourse): Raw {
  return html`<article class="card course-card ${c.comingSoon ? 'is-soon' : ''}" data-edit="course:${c.id}">
  <a class="course-media" href="/course/${c.slug}" aria-label="${c.title} — বিস্তারিত দেখুন">
    ${c.cover ? html`<img src="${c.cover}" alt="" loading="lazy">` : html`<span class="course-ph" aria-hidden="true"><span>${c.categoryIcon || '🎓'}</span></span>`}
    ${c.promoVideo ? html`<span class="pkg-video-badge">▶ ভিডিও</span>` : ''}
  </a>
  <div class="course-body">
    <div class="pkg-tags"><span class="badge">${c.categoryName}</span><span class="badge badge-level">${c.levelLabel}</span>${c.comingSoon ? html`<span class="badge badge-soon">শীঘ্রই আসছে</span>` : ''}</div>
    <h3><a href="/course/${c.slug}">${c.title}</a></h3>
    ${c.subtitle ? html`<p class="muted">${c.subtitle}</p>` : ''}
    <ul class="course-meta"><li>📚 ${bnDigits(c.lessonCount)}টি লেসন</li>${c.durationText ? html`<li>⏱ ${c.durationText}</li>` : ''}<li>🗣 ${c.language}</li></ul>
    <div class="course-foot">${coursePrice(c)}<a class="btn btn-primary btn-sm" href="/course/${c.slug}">${c.comingSoon ? 'বিস্তারিত' : 'বিস্তারিত ও ভর্তি'} <span aria-hidden="true">→</span></a></div>
  </div>
</article>`;
}

/**
 * Courses grouped by category with the category list in a sidebar (same layout as the website catalogue).
 * `only`: a category page — the sidebar links to the other category pages.
 */
export function courseBrowser(cats: CourseCategoryRow[], courses: PublicCourse[], opts: { only?: string } = {}): Raw {
  const groups = cats.map((c) => ({ c, items: courses.filter((x) => x.categoryId === c.id) })).filter((g) => g.items.length);
  if (!groups.length) return html`<div class="card empty"><p>নতুন কোর্স শীঘ্রই আসছে।</p></div>`;
  const shown = opts.only ? groups.filter((g) => g.c.slug === opts.only) : groups;
  return html`<div class="shop-layout course-layout" data-shop>
  <aside class="shop-side" aria-label="কোর্স ক্যাটাগরি">
    <p class="side-title">কোর্স ক্যাটাগরি</p>
    <nav class="side-nav">${groups.map(({ c, items }, i) => {
      const on = opts.only ? c.slug === opts.only : i === 0;
      const attrs = opts.only ? raw(on ? 'aria-current="page"' : '') : raw(`data-side-link="course-cat-${c.slug}"`);
      return html`<a href="${opts.only ? `/course-category/${c.slug}` : `#course-cat-${c.slug}`}" class="side-link ${on ? 'is-on' : ''}" ${attrs}><span class="side-ico">${catIcon(c)}</span><span class="side-name">${c.name}</span><span class="side-count">${bnDigits(items.length)}</span></a>`;
    })}</nav>
  </aside>
  <div class="shop-main">${shown.length ? '' : html`<div class="card empty"><p>এই ক্যাটাগরিতে নতুন কোর্স শীঘ্রই আসছে।</p><a class="btn btn-primary" href="/courses">অন্য কোর্স দেখুন →</a></div>`}${shown.map(({ c, items }) => html`<section class="shop-group" id="course-cat-${c.slug}" aria-labelledby="course-cat-${c.slug}-h">
    <header class="group-head" data-edit="course-category:${c.id}">
      <span class="group-ico">${catIcon(c)}</span>
      <div class="group-text"><h3 id="course-cat-${c.slug}-h">${c.name} <span class="group-count">${bnDigits(items.length)}টি কোর্স</span></h3>${c.description ? html`<p class="muted">${c.description}</p>` : ''}</div>
      ${opts.only ? '' : html`<a class="link-cta group-all" href="/course-category/${c.slug}">সব দেখুন <span aria-hidden="true">→</span></a>`}
    </header>
    <div class="course-grid">${items.map(courseCard)}</div>
  </section>`)}</div>
</div>`;
}

/* ---------------- Pages ---------------- */
export function coursesPage(cats: CourseCategoryRow[], courses: PublicCourse[], studentUrl: string): Raw {
  return html`
<section class="page-hero mesh course-hero-band">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <span>অনলাইন কোর্স</span></nav>
    <h1>অনলাইন কোর্স — লেসন ধরে ধরে শিখুন</h1>
    <p class="lead">ডিজিটাল মার্কেটিং, ওয়েব ডেভেলপমেন্ট, পাইথন — হাতে-কলমে শেখা। ভর্তির পর পেমেন্ট নিশ্চিত হলেই কোর্সটি আপনার প্রোফাইলে চালু হয়।</p>
    <p><a class="link-cta" href="${studentUrl}">আগেই ভর্তি হয়েছেন? আমার কোর্সে যান →</a></p>
  </div>
</section>
<section class="section"><div class="container">${courseBrowser(cats, courses)}</div></section>`;
}

export function courseCategoryPage(cat: CourseCategoryRow, cats: CourseCategoryRow[], courses: PublicCourse[]): Raw {
  return html`
<section class="page-hero mesh course-hero-band">
  <div class="container">
    <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <a href="/courses">অনলাইন কোর্স</a> › <span>${cat.name}</span></nav>
    <h1>${cat.icon} ${cat.name} কোর্স</h1>
    ${cat.description ? html`<p class="lead">${cat.description}</p>` : ''}
  </div>
</section>
<section class="section"><div class="container">${courseBrowser(cats, courses, { only: cat.slug })}</div></section>`;
}

/** The course sales (landing) page. `bare` hides the site menu and footer links (for ads). */
export function coursePage(c: PublicCourse, curriculum: PublicSection[], d: { enrollUrl: string; whatsapp: string | null; studentUrl: string; notEnrolled?: boolean }): Raw {
  const lessonCount = curriculum.reduce((n, s) => n + s.lessons.length, 0);
  const previews = curriculum.flatMap((s) => s.lessons).filter((l) => l.isPreview).length;
  const cta = c.comingSoon
    ? html`<a class="btn btn-primary btn-lg" href="#notify">চালু হলে জানতে চাই</a>`
    : html`<a class="btn btn-primary btn-lg" href="${d.enrollUrl}" data-enroll-main data-course-id="${c.id}">এখনই ভর্তি হোন — ${c.price ? taka(c.price) : 'ফ্রি'} <span aria-hidden="true">→</span></a>`;
  return html`
${d.notEnrolled ? html`<div class="container"><p class="notice course-locked" role="status">🔒 এই কোর্সের লেসন দেখতে ভর্তি ও পেমেন্ট নিশ্চিত হওয়া দরকার। পেমেন্ট করে থাকলে যাচাই শেষ হলেই কোর্সটি <a href="${d.studentUrl}">আপনার প্রোফাইলে</a> চালু হবে।</p></div>` : ''}
<section class="course-hero" data-edit="course:${c.id}">
  <div class="container course-hero-grid">
    <div class="course-hero-copy">
      <nav class="crumbs" aria-label="অবস্থান"><a href="/">হোম</a> › <a href="/courses">কোর্স</a> › <a href="/course-category/${c.categorySlug}">${c.categoryName}</a></nav>
      <span class="eyebrow">${c.categoryIcon} ${c.categoryName} · ${c.levelLabel}</span>
      <h1>${c.title}</h1>
      ${c.subtitle ? html`<p class="lead">${c.subtitle}</p>` : ''}
      <ul class="course-meta course-meta-lg">
        <li>📚 ${bnDigits(lessonCount)}টি লেসন</li>${c.durationText ? html`<li>⏱ ${c.durationText}</li>` : ''}<li>🗣 ${c.language}</li>${previews ? html`<li>🎁 ${bnDigits(previews)}টি লেসন ফ্রি দেখুন</li>` : ''}
      </ul>
      <div class="course-buy">
        <div class="course-buy-price">${coursePrice(c)}</div>
        <div class="hero-cta">${cta}<a class="btn btn-ghost btn-lg" href="#curriculum">লেসনগুলো দেখুন</a></div>
        ${c.comingSoon ? '' : html`<p class="small muted">ভর্তির পর পেমেন্ট নিশ্চিত হলেই কোর্সটি আপনার প্রোফাইলে চালু হয় · <a href="${d.studentUrl}">আগেই ভর্তি হয়েছেন? লগইন</a></p>`}
      </div>
    </div>
    <div class="course-hero-media">
      ${c.promoVideo ? videoPlayer(c.promoVideo, `${c.title} — পরিচিতি`, c.cover) : c.cover ? html`<img class="course-cover" src="${c.cover}" alt="${c.title}">` : html`<div class="course-ph course-ph-lg" aria-hidden="true"><span>${c.categoryIcon || '🎓'}</span></div>`}
    </div>
  </div>
</section>

<nav class="section-tabs" aria-label="এই পেজে"><div class="container">
  ${c.outcomes.length ? html`<a href="#learn">যা শিখবেন</a>` : ''}<a href="#curriculum">লেসন</a>${c.description ? html`<a href="#about">বিস্তারিত</a>` : ''}${c.audience.length ? html`<a href="#for">কার জন্য</a>` : ''}${c.instructor.name ? html`<a href="#instructor">ইনস্ট্রাক্টর</a>` : ''}${c.faqs.length ? html`<a href="#faq">প্রশ্নোত্তর</a>` : ''}
</div></nav>

${c.outcomes.length ? html`<section class="section-sm" id="learn"><div class="container">
  <h2>এই কোর্সে যা শিখবেন</h2>
  <ul class="outcome-grid">${c.outcomes.map((o) => html`<li class="card"><span class="fix-ico" aria-hidden="true">✓</span><span>${o}</span></li>`)}</ul>
</div></section>` : ''}

<section class="section-sm" id="curriculum"><div class="container narrow-wide">
  <h2>কোর্সের লেসন — ধাপে ধাপে</h2>
  <p class="muted">${bnDigits(curriculum.length)}টি অধ্যায় · ${bnDigits(lessonCount)}টি লেসন${previews ? ' · “ফ্রি দেখুন” লেখা লেসন ভর্তির আগেই দেখতে পারবেন' : ''}</p>
  ${lessonCount ? html`<div class="curriculum">${curriculum.map((s, i) => html`<details class="cur-section" ${i === 0 ? raw('open') : ''}>
    <summary><span class="cur-n">${bnDigits(i + 1)}</span><span class="cur-title">${s.title}</span><span class="cur-count">${bnDigits(s.lessons.length)}টি লেসন</span></summary>
    <ol class="cur-lessons">${s.lessons.map((l) => html`<li class="cur-lesson ${l.isPreview ? 'is-preview' : ''}">
      <span class="cur-kind" title="${KIND_BN[l.kind]}" aria-hidden="true">${KIND_ICON[l.kind]}</span>
      <span class="cur-ltitle">${l.title}</span>
      ${l.durationText ? html`<span class="cur-dur">${l.durationText}</span>` : ''}
      ${l.isPreview ? (l.preview ? html`<details class="cur-preview"><summary>ফ্রি দেখুন</summary>${videoPlayer(l.preview, l.title, c.cover)}</details>` : html`<span class="badge">ফ্রি প্রিভিউ</span>`) : html`<span class="cur-lock" aria-label="ভর্তির পর খুলবে">🔒</span>`}
    </li>`)}</ol>
  </details>`)}</div>` : html`<p class="card muted">লেসনের তালিকা শীঘ্রই যোগ হবে।</p>`}
</div></section>

${c.description ? html`<section class="section-sm" id="about"><div class="container narrow-wide"><div class="card prose"><h2>কোর্সের বিস্তারিত</h2>${paragraphs(c.description)}</div></div></section>` : ''}

${c.audience.length || c.requirements.length || c.includes.length ? html`<section class="section-sm" id="for"><div class="container">
  <div class="course-3col">
    ${c.audience.length ? html`<div class="card"><h3>এই কোর্স কার জন্য</h3><ul class="features">${c.audience.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    ${c.includes.length ? html`<div class="card"><h3>যা যা পাচ্ছেন</h3><ul class="features">${c.includes.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    ${c.requirements.length ? html`<div class="card"><h3>শুরু করতে যা লাগবে</h3><ul class="features">${c.requirements.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
  </div>
</div></section>` : ''}

${c.instructor.name ? html`<section class="section-sm" id="instructor"><div class="container narrow-wide"><div class="card instructor">
  ${c.instructor.photo ? html`<img src="${c.instructor.photo}" alt="${c.instructor.name}" loading="lazy">` : html`<span class="instructor-ph" aria-hidden="true">👤</span>`}
  <div><span class="eyebrow">ইনস্ট্রাক্টর</span><h3>${c.instructor.name}</h3>${c.instructor.bio ? paragraphs(c.instructor.bio) : ''}</div>
</div></div></section>` : ''}

<section class="section-sm"><div class="container">
  <h2>কীভাবে ভর্তি হবেন</h2>
  <ol class="flow flow-3">
    <li class="flow-step"><span class="flow-n" aria-hidden="true">১</span><div><h3>ভর্তি ফর্ম ও পেমেন্ট</h3><p class="muted">নাম, মোবাইল নম্বর আর একটি পাসওয়ার্ড দিন; বিকাশ, নগদ, রকেট, কার্ড বা ব্যাংকে পেমেন্ট করুন।</p></div></li>
    <li class="flow-step"><span class="flow-n" aria-hidden="true">২</span><div><h3>পেমেন্ট নিশ্চিত হলেই চালু</h3><p class="muted">গেটওয়ের পেমেন্ট সাথে সাথে, সেন্ড মানি হলে আমরা যাচাই করে দিই — তারপর কোর্সটি আপনার প্রোফাইলে খুলে যায়।</p></div></li>
    <li class="flow-step"><span class="flow-n" aria-hidden="true">৩</span><div><h3>লগইন করে শিখুন</h3><p class="muted">মোবাইল নম্বর আর পাসওয়ার্ড দিয়ে লগইন করে লেসন ধরে ধরে দেখুন; কোথায় থেমেছিলেন মনে থাকে।</p></div></li>
  </ol>
</div></section>

${c.faqs.length ? html`<section class="section-sm" id="faq" data-edit="course:${c.id}"><div class="container narrow">
  <h2>প্রশ্নোত্তর</h2>${faqList(c.faqs)}
</div></section>` : ''}

<section class="section-sm" id="notify"><div class="container">
  ${c.comingSoon
    ? html`<div class="cta-band mesh"><div><h2>কোর্সটি শীঘ্রই আসছে</h2><p>নাম আর মোবাইল নম্বর দিন — চালু হলেই আপনাকে জানাব।</p></div>
        <div class="course-notify">${leadForm({ source: 'contact', title: '', compact: true, message: `কোর্সে আগ্রহী: ${c.title}` })}${d.whatsapp ? html`<a class="btn btn-outline-light" href="${d.whatsapp}" target="_blank" rel="noopener">হোয়াটসঅ্যাপে জানতে চাই</a>` : ''}</div></div>`
    : html`<div class="cta-band mesh"><div><h2>আজই শুরু করুন</h2><p>${c.title} — ${c.price ? taka(c.price) : 'ফ্রি'}। পেমেন্ট নিশ্চিত হলেই প্রোফাইলে চালু।</p></div>
        <div class="cta-actions"><a class="btn btn-light btn-lg" href="${d.enrollUrl}">এখনই ভর্তি হোন →</a>${d.whatsapp ? html`<a class="btn btn-outline-light btn-lg" href="${d.whatsapp}" target="_blank" rel="noopener">হোয়াটসঅ্যাপে প্রশ্ন করুন</a>` : ''}</div></div>`}
</div></section>
${c.comingSoon ? '' : html`<div class="sticky-cta" data-sticky-cta hidden><div><strong>${c.price ? taka(c.price) : 'ফ্রি'}</strong><span class="small muted">${c.title}</span></div><a class="btn btn-primary" href="${d.enrollUrl}">ভর্তি হোন</a></div>`}`;
}

export interface EnrollMethod { id: string; label: string; hint: string }

export function enrollPage(c: PublicCourse, methods: EnrollMethod[], studentUrl: string): Raw {
  return html`
<section class="section">
  <div class="container enroll-grid">
    <form class="card form enroll-form" data-enroll-form data-course="${c.slug}" data-course-id="${c.id}" data-title="${c.title}" data-category="কোর্স: ${c.categoryName}" data-price="${c.price}" novalidate>
      <nav class="crumbs" aria-label="অবস্থান"><a href="/course/${c.slug}">← কোর্সে ফিরুন</a></nav>
      <h1>ভর্তি ফর্ম</h1>
      <p class="muted">এই মোবাইল নম্বর আর পাসওয়ার্ড দিয়েই পরে লগইন করে কোর্স দেখবেন।</p>
      <label>আপনার নাম<input name="name" required maxlength="100" autocomplete="name"></label>
      <div class="grid-2">
        <label>মোবাইল নম্বর (হোয়াটসঅ্যাপ)<input name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="০১XXXXXXXXX"></label>
        <label>ইমেইল (ঐচ্ছিক)<input name="email" type="email" maxlength="200" autocomplete="email"></label>
      </div>
      <label>পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)<input name="password" type="password" required minlength="6" maxlength="100" autocomplete="new-password"></label>
      <p class="small muted">এই নম্বরে আগে থেকেই অ্যাকাউন্ট থাকলে কোর্সটি সেই অ্যাকাউন্টেই যোগ হবে — আগের পাসওয়ার্ডেই লগইন করবেন।</p>
      ${c.price ? html`<fieldset class="pay-methods"><legend>পেমেন্ট মাধ্যম</legend>
        ${methods.length ? methods.map((m, i) => html`<label class="pay-method"><input type="radio" name="payment_method" value="${m.id}" ${i === 0 ? raw('checked') : ''} required><span><strong>${m.label}</strong><small>${m.hint}</small></span></label>`) : html`<p class="err">এখন অনলাইন পেমেন্ট চালু নেই — হোয়াটসঅ্যাপে যোগাযোগ করুন।</p>`}
      </fieldset>` : ''}
      <label class="check"><input type="checkbox" name="agree" required> <span><a href="/terms" target="_blank">শর্তাবলি</a> ও <a href="/refund-policy" target="_blank">রিফান্ড নীতি</a> পড়ে সম্মতি দিচ্ছি</span></label>
      <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
      <button class="btn btn-primary btn-lg btn-block" data-enroll-submit>${c.price ? html`ভর্তি নিশ্চিত করুন — ${taka(c.price)}` : 'ফ্রি ভর্তি হোন'}</button>
      <p class="form-msg" data-form-msg role="status"></p>
      <p class="small muted">আগেই ভর্তি হয়েছেন? <a href="${studentUrl}">লগইন করুন</a></p>
    </form>
    <aside class="card enroll-summary">
      ${c.cover ? html`<img src="${c.cover}" alt="" loading="lazy">` : html`<div class="course-ph" aria-hidden="true"><span>${c.categoryIcon || '🎓'}</span></div>`}
      <h2>${c.title}</h2>
      <ul class="course-meta"><li>📚 ${bnDigits(c.lessonCount)}টি লেসন</li><li>${c.levelLabel}</li><li>🗣 ${c.language}</li></ul>
      <div class="enroll-total"><span>মোট</span><span>${coursePrice(c)}</span></div>
      <ol class="small muted enroll-steps"><li>ফর্ম জমা দিয়ে পেমেন্ট করুন</li><li>পেমেন্ট নিশ্চিত হলেই কোর্স প্রোফাইলে চালু</li><li>মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে লগইন করে শিখুন</li></ol>
    </aside>
  </div>
</section>`;
}

/* ---------------- Student area ---------------- */
export function studentLoginPage(next: string, msg = ''): Raw {
  return html`
<section class="section"><div class="container narrow">
  <form class="card form student-login" data-student-login data-next="${next}">
    <h1>আমার কোর্স — লগইন</h1>
    <p class="muted">ভর্তির সময় যে মোবাইল নম্বর আর পাসওয়ার্ড দিয়েছিলেন তা দিন।</p>
    ${msg ? html`<p class="notice">${msg}</p>` : ''}
    <label>মোবাইল নম্বর<input name="phone" required inputmode="tel" autocomplete="username" maxlength="20" placeholder="০১XXXXXXXXX"></label>
    <label>পাসওয়ার্ড<input name="password" type="password" required autocomplete="current-password" maxlength="100"></label>
    <button class="btn btn-primary btn-lg btn-block">লগইন</button>
    <p class="form-msg" data-form-msg role="status"></p>
    <p class="small muted">পাসওয়ার্ড ভুলে গেছেন? হোয়াটসঅ্যাপে আপনার নম্বর জানান — যাচাই করে নতুন পাসওয়ার্ড দিয়ে দেব।</p>
  </form>
</div></section>`;
}

export interface MyCourse { course: PublicCourse; done: number; total: number; nextLessonId: number | null }
export interface MyOrder { orderNumber: string; title: string; total: number; paymentLabel: string; url: string }

export function studentDashboard(d: { name: string; phone: string; courses: MyCourse[]; pending: MyOrder[]; coursesUrl: string }): Raw {
  return html`
<section class="section"><div class="container">
  <div class="student-head">
    <div><span class="eyebrow">আমার প্রোফাইল</span><h1>স্বাগতম, ${d.name}</h1><p class="muted">${d.phone}</p></div>
    <form data-student-logout><button class="btn btn-ghost">লগআউট</button></form>
  </div>
  <h2>আমার কোর্স</h2>
  ${d.courses.length ? html`<div class="my-courses">${d.courses.map(({ course: c, done, total, nextLessonId }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return html`<article class="card my-course">
      <a href="/learn/${c.slug}" class="my-course-media">${c.cover ? html`<img src="${c.cover}" alt="" loading="lazy">` : html`<span class="course-ph"><span>${c.categoryIcon || '🎓'}</span></span>`}</a>
      <div class="my-course-body">
        <span class="badge">${c.categoryName}</span>
        <h3><a href="/learn/${c.slug}">${c.title}</a></h3>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="অগ্রগতি"><span style="width:${pct}%"></span></div>
        <p class="small muted">${bnDigits(done)}/${bnDigits(total)} লেসন সম্পন্ন · ${bnDigits(pct)}%</p>
        <a class="btn btn-primary" href="/learn/${c.slug}${nextLessonId ? `/${nextLessonId}` : ''}">${done ? 'যেখানে থেমেছিলেন সেখান থেকে' : 'শুরু করুন'} →</a>
      </div>
    </article>`;
  })}</div>` : html`<div class="card empty"><p>এখনো কোনো কোর্স চালু হয়নি।</p>${d.pending.length ? html`<p class="muted">পেমেন্ট নিশ্চিত হলেই নিচের কোর্সগুলো এখানে চালু হবে।</p>` : html`<a class="btn btn-primary" href="${d.coursesUrl}">কোর্স দেখুন →</a>`}</div>`}
  ${d.pending.length ? html`<h2>পেমেন্টের অপেক্ষায়</h2><div class="card"><ul class="pending-list">${d.pending.map((o) => html`<li><div><strong>${o.title}</strong><span class="small muted">${o.orderNumber} · ${taka(o.total)} · ${o.paymentLabel}</span></div><a class="btn btn-ghost btn-sm" href="${o.url}">বিস্তারিত / পেমেন্ট</a></li>`)}</ul></div>` : ''}
  <details class="card change-pw"><summary>পাসওয়ার্ড বদলান</summary>
    <form class="form" data-student-password>
      <div class="grid-2"><label>বর্তমান পাসওয়ার্ড<input name="current" type="password" required autocomplete="current-password"></label><label>নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)<input name="next" type="password" required minlength="6" autocomplete="new-password"></label></div>
      <button class="btn btn-primary">বদলান</button><p class="form-msg" data-form-msg role="status"></p>
    </form>
  </details>
</div></section>`;
}

export interface LearnLesson { id: number; title: string; kind: string; durationText: string; done: boolean }
export interface LearnData {
  course: PublicCourse;
  sections: { title: string; lessons: LearnLesson[] }[];
  current: LessonContent;
  currentDone: boolean;
  prevId: number | null;
  nextId: number | null;
  done: number;
  total: number;
}

export function learnPage(d: LearnData): Raw {
  const c = d.course;
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
  const l = d.current;
  return html`
<section class="learn">
  <div class="learn-top"><div class="container learn-top-in">
    <a href="/student" class="link-cta">← আমার কোর্স</a>
    <strong class="learn-course">${c.title}</strong>
    <div class="learn-progress"><div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="অগ্রগতি"><span style="width:${pct}%"></span></div><span class="small">${bnDigits(pct)}%</span></div>
  </div></div>
  <div class="container learn-grid">
    <article class="learn-main" data-lesson="${l.id}" data-course="${c.slug}">
      <span class="eyebrow">${KIND_ICON[l.kind]} ${KIND_BN[l.kind]}${l.durationText ? ` · ${l.durationText}` : ''}</span>
      <h1>${l.title}</h1>
      ${l.video ? videoPlayer(l.video, l.title, c.cover) : l.kind === 'video' ? html`<div class="card notice">এই লেসনের ভিডিও শীঘ্রই যোগ হবে।</div>` : ''}
      ${l.link ? html`<p><a class="btn btn-primary btn-lg" href="${l.link}" target="_blank" rel="noopener">${l.kind === 'link' ? 'লেসনটি খুলুন ↗' : 'রিসোর্স লিংক ↗'}</a></p>` : ''}
      ${l.hasFile ? html`<p><a class="btn btn-ghost btn-lg" href="/learn/file/${l.id}">📄 ফাইল ডাউনলোড</a></p>` : ''}
      ${l.body ? html`<div class="card prose lesson-notes">${paragraphs(l.body)}</div>` : ''}
      <div class="learn-nav">
        ${d.prevId ? html`<a class="btn btn-ghost" href="/learn/${c.slug}/${d.prevId}">← আগের লেসন</a>` : html`<span></span>`}
        <button type="button" class="btn ${d.currentDone ? 'btn-ghost' : 'btn-primary'}" data-lesson-done data-next="${d.nextId ? `/learn/${c.slug}/${d.nextId}` : ''}" ${d.currentDone ? raw('data-done="1"') : ''}>${d.currentDone ? '✓ সম্পন্ন' : d.nextId ? 'সম্পন্ন — পরের লেসন →' : 'সম্পন্ন'}</button>
      </div>
    </article>
    <aside class="learn-side" aria-label="লেসনের তালিকা">
      ${d.sections.map((s, i) => html`<details class="cur-section" open>
        <summary><span class="cur-n">${bnDigits(i + 1)}</span><span class="cur-title">${s.title}</span></summary>
        <ol class="cur-lessons">${s.lessons.map((x) => html`<li class="cur-lesson ${x.id === l.id ? 'is-current' : ''} ${x.done ? 'is-done' : ''}"><a href="/learn/${c.slug}/${x.id}" ${x.id === l.id ? raw('aria-current="page"') : ''}><span class="cur-kind" aria-hidden="true">${x.done ? '✓' : KIND_ICON[x.kind]}</span><span class="cur-ltitle">${x.title}</span>${x.durationText ? html`<span class="cur-dur">${x.durationText}</span>` : ''}</a></li>`)}</ol>
      </details>`)}
    </aside>
  </div>
</section>`;
}
