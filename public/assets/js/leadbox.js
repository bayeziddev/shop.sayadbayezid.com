/*
 * Multi-step conversational lead box ("লিড বক্স").
 *
 * Micro-commitment funnel: easy one-tap questions first, contact details last.
 *   1 site type → 2 business/product → 3 business stage → 4 timeline → 5 favourite demo (optional) → 6 name + WhatsApp (progress 75%) → done
 * - Opens by itself once, on a first visit, after the visitor has spent `delay` seconds (visible tab) on a browsing page.
 *   Dismissed → stays closed for 3 days. Submitted → never opens by itself again. Any [data-leadbox-open] button opens it.
 * - Every answer fires a non-conversion "LeadBoxStep" event (Pixel + CAPI with the same id, GA4, GTM).
 *   The submit fires the real "Lead" (server CAPI first, then the browser pixel with the same event id).
 * - After submit: WhatsApp opens with the visitor's answers pre-filled (phones, if enabled) and an optional booking link.
 */
import { $, $$, api, esc, bn, taka, attribution } from './lib.js';

const cfgEl = document.getElementById('leadbox-config');
const CFG = (() => { try { return JSON.parse(cfgEl?.textContent || 'null'); } catch { return null; } })();
const KEY = 'sb_leadbox_v1';
const DAY = 86400000;

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...v })); } catch {} },
};
const track = (step, answer) => { try { window.SBTrack?.step?.(step, answer); } catch {} };

const SITE_TYPES = [
  { v: 'সিঙ্গেল প্রোডাক্ট ল্যান্ডিং পেজ', ico: '🎯', d: 'একটি পণ্য — বিজ্ঞাপন থেকে সরাসরি অর্ডার' },
  { v: 'ই-কমার্স ওয়েবসাইট', ico: '🛒', d: 'অনেক পণ্য, কার্ট, পেমেন্ট ও অ্যাডমিন' },
  { v: 'বিজনেস / সার্ভিস ওয়েবসাইট', ico: '💼', d: 'কোম্পানি, সার্ভিস, পোর্টফোলিও' },
  { v: 'মার্কেটপ্লেস / বিশেষ সিস্টেম', ico: '⚙️', d: 'মাল্টি-ভেন্ডর, বুকিং, ড্যাশবোর্ড' },
];
const STAGES = [
  { v: 'নতুন ব্যবসা শুরু করছি', ico: '🌱' },
  { v: 'চালু আছে — ফেসবুক পেজে বিক্রি করি', ico: '📘' },
  { v: 'চালু আছে — ওয়েবসাইট আছে, নতুন চাই', ico: '🔁' },
];
const TIMELINES = [
  { v: 'এই সপ্তাহেই', ico: '⚡' },
  { v: 'এই মাসের মধ্যে', ico: '📅' },
  { v: 'শুধু খোঁজ নিচ্ছি', ico: '👀' },
];
const PROGRESS = { type: 15, category: 30, stage: 45, timeline: 55, demo: 65, contact: 75, done: 100 };
const ORDER = ['type', 'category', 'stage', 'timeline', 'demo', 'contact'];

let dlg, body, bar, label, answers = {}, history = [], cats = null, pkgs = null, opened = false, from = 'auto';

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function build() {
  dlg = el(`<dialog class="leadbox" aria-labelledby="lb-title">
    <div class="lb-head">
      <div class="lb-agent"><span class="lb-avatar" aria-hidden="true">&lt;/&gt;</span><div><strong id="lb-title">${esc(CFG.brand)}</strong><small><i class="lb-dot"></i> সাধারণত কয়েক মিনিটে উত্তর দিই</small></div></div>
      <button type="button" class="lb-x" data-lb-close aria-label="বন্ধ করুন">×</button>
    </div>
    <div class="lb-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
    <div class="lb-meta"><span data-lb-label></span><button type="button" class="lb-back" data-lb-back hidden>← আগের প্রশ্ন</button></div>
    <div class="lb-body" aria-live="polite"></div>
    <p class="lb-foot">🔒 আপনার তথ্য শুধু আপনার সাথে যোগাযোগের জন্য — কোনো স্প্যাম নয়</p>
  </dialog>`);
  document.body.append(dlg);
  body = $('.lb-body', dlg);
  bar = $('.lb-progress', dlg);
  label = $('[data-lb-label]', dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-lb-close]')) close();
    if (e.target.closest('[data-lb-back]')) back();
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
}

function setProgress(step) {
  const p = PROGRESS[step] ?? 0;
  $('span', bar).style.width = p + '%';
  bar.setAttribute('aria-valuenow', String(p));
  const i = ORDER.indexOf(step);
  label.textContent = step === 'done' ? 'সম্পন্ন ✓' : `ধাপ ${bn(i + 1)}/${bn(ORDER.length)} · ${bn(p)}% সম্পন্ন`;
  $('[data-lb-back]', dlg).hidden = i <= 0 || step === 'done';
}

/** One "bot" chat bubble (with a short typing pause) followed by the step's controls. */
function ask(question, hint = '') {
  body.innerHTML = '';
  // Earlier answers stay visible as the visitor's own chat bubbles — it reads like a conversation.
  for (const h of history) {
    body.append(el(`<div class="lb-msg bot small-q">${esc(h.q)}</div>`));
    body.append(el(`<div class="lb-msg me">${esc(h.a)}</div>`));
  }
  const typing = el('<div class="lb-msg bot typing" aria-hidden="true"><i></i><i></i><i></i></div>');
  body.append(typing);
  return new Promise((resolve) => setTimeout(() => {
    typing.replaceWith(el(`<div class="lb-msg bot">${esc(question)}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`));
    const wrap = el('<div class="lb-controls"></div>');
    body.append(wrap);
    body.scrollTop = body.scrollHeight;
    resolve(wrap);
  }, history.length ? 380 : 250));
}

function options(wrap, list, onPick) {
  const grid = el(`<div class="lb-options ${list.length > 4 ? 'is-chips' : ''}"></div>`);
  for (const o of list) {
    const b = el(`<button type="button" class="lb-opt"><span class="lb-ico" aria-hidden="true">${esc(o.ico || '')}</span><span><strong>${esc(o.label || o.v)}</strong>${o.d ? `<small>${esc(o.d)}</small>` : ''}</span></button>`);
    b.addEventListener('click', () => onPick(o));
    grid.append(b);
  }
  wrap.append(grid);
  grid.querySelector('button')?.focus({ preventScroll: true });
}

function answer(step, q, value, shown = value) {
  answers[step === 'type' ? 'site_type' : step] = value;
  history.push({ step, q, a: shown });
  track(step, value);
}

async function goto(step) {
  setProgress(step);
  if (step === 'type') {
    const w = await ask(CFG.title || 'আপনি কোন ধরনের ওয়েবসাইট চান?', 'যেকোনো একটিতে চাপ দিন');
    options(w, SITE_TYPES, (o) => { answer('type', 'কোন ধরনের ওয়েবসাইট?', o.v); goto('category'); });
  }
  if (step === 'category') {
    const landing = /ল্যান্ডিং/.test(answers.site_type || '');
    const q = landing ? 'কোন পণ্য বিক্রি করবেন?' : 'আপনার ব্যবসা কী নিয়ে?';
    const w = await ask(q, landing ? 'পণ্যের নাম লিখুন অথবা ধরন বেছে নিন' : 'ক্যাটাগরি বেছে নিন');
    if (cats === null) cats = await api('/api/categories').catch(() => []);
    const list = [...cats.map((c) => ({ v: c.name, slug: c.slug, ico: c.icon })), { v: 'অন্য কিছু', ico: '✍️', other: true }];
    const pick = (o, product = '') => {
      answers.category_slug = o.slug || '';
      if (product) answers.product = product;
      answer('category', q, o.v, product ? `${o.v} — ${product}` : o.v);
      goto('stage');
    };
    const form = el(`<form class="lb-inline" ${landing ? '' : 'hidden'}><input name="product" maxlength="80" placeholder="${landing ? 'যেমন: হারবাল তেল, স্মার্টওয়াচ' : 'আপনার পণ্য বা সেবার নাম'}" aria-label="পণ্য বা সেবার নাম"><button class="btn btn-primary btn-sm">পরের ধাপ →</button></form>`);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = form.product.value.trim();
      if (!v) return form.product.focus();
      pick({ v: answers.category_pending || 'অন্য কিছু', slug: answers.category_slug_pending || '' }, v);
    });
    options(w, list, (o) => {
      if (o.other) { form.hidden = false; answers.category_pending = 'অন্য কিছু'; form.product.focus(); return; }
      if (landing && form.product.value.trim()) return pick(o, form.product.value.trim());
      pick(o);
    });
    w.append(form);
  }
  if (step === 'stage') {
    const w = await ask('আপনার ব্যবসা কি নতুন, নাকি চালু আছে?');
    options(w, STAGES, (o) => { answer('stage', 'ব্যবসা নতুন নাকি চালু?', o.v); goto('timeline'); });
  }
  if (step === 'timeline') {
    const w = await ask('কবের মধ্যে সাইটটি চালু করতে চান?');
    options(w, TIMELINES, (o) => { answer('timeline', 'কবে চালু করতে চান?', o.v); goto('demo'); });
  }
  if (step === 'demo') {
    if (pkgs === null) pkgs = await api('/api/packages').catch(() => []);
    const active = pkgs.filter((p) => p.status === 'active');
    const match = active.filter((p) => p.categorySlug && p.categorySlug === answers.category_slug);
    const list = (match.length ? match : active).slice(0, 4);
    if (!list.length) return goto('contact');
    const w = await ask('আমাদের কোনো ডেমো কি পছন্দ হয়েছে?', 'একটি বেছে নিন — অথবা পরে ঠিক করুন');
    const grid = el('<div class="lb-demos"></div>');
    for (const p of list) {
      const card = el(`<div class="lb-demo">
        <button type="button" class="lb-demo-pick" aria-label="${esc(p.name)} বেছে নিন">${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : ''}<strong>${esc(p.name)}</strong><small>${esc(taka(p.basePrice))}</small></button>
        ${p.demoUrl ? `<a href="${esc(p.demoUrl)}" target="_blank" rel="noopener" data-demo-click data-package-id="${p.id}" data-package-name="${esc(p.name)}" data-demo-label="লিড বক্স">ডেমো দেখুন ↗</a>` : ''}
      </div>`);
      $('.lb-demo-pick', card).addEventListener('click', () => { answer('demo', 'পছন্দের ডেমো?', p.slug, p.name); goto('contact'); });
      grid.append(card);
    }
    w.append(grid);
    const skip = el('<button type="button" class="lb-skip">এখনো ঠিক করিনি — পরের ধাপ →</button>');
    skip.addEventListener('click', () => { history.push({ step: 'demo', q: 'পছন্দের ডেমো?', a: 'পরে ঠিক করব' }); track('demo', 'skip'); goto('contact'); });
    w.append(skip);
  }
  if (step === 'contact') {
    const w = await ask('দারুণ! শেষ ধাপ — কোথায় আপনাকে প্রস্তাব পাঠাব?', 'আপনার চাহিদা অনুযায়ী দাম ও ডেমো হোয়াটসঅ্যাপে পাঠাব');
    const form = el(`<form class="lb-form" novalidate>
      <label>পূর্ণ নাম<input name="name" required maxlength="100" autocomplete="name" placeholder="আপনার নাম"></label>
      <label>হোয়াটসঅ্যাপ নম্বর<input name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="০১XXXXXXXXX"></label>
      <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
      <button class="btn btn-primary btn-lg btn-block">ফ্রি প্রস্তাব নিন →</button>
      <p class="form-msg" data-lb-msg role="status"></p>
    </form>`);
    w.append(form);
    form.name.focus({ preventScroll: true });
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
  }
}

function back() {
  const last = history.pop();
  if (!last) return;
  if (last.step === 'type') delete answers.site_type; else delete answers[last.step];
  if (last.step === 'category') { delete answers.product; delete answers.category_slug; delete answers.category_pending; }
  goto(last.step);
}

async function submit(form) {
  const msg = $('[data-lb-msg]', form);
  const btn = $('button', form);
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  msg.textContent = '';
  if (name.length < 2) { msg.textContent = 'আপনার নাম লিখুন'; msg.classList.add('is-error'); return form.name.focus(); }
  if (!/^(\+?88)?0?1[3-9]\d{8}$/.test(phone.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/[\s-]/g, ''))) {
    msg.textContent = 'সঠিক হোয়াটসঅ্যাপ নম্বর দিন (০১XXXXXXXXX)'; msg.classList.add('is-error'); return form.phone.focus();
  }
  btn.disabled = true; btn.textContent = 'পাঠানো হচ্ছে…';
  const { category_slug, category_pending, category_slug_pending, ...clean } = answers;
  try {
    const r = await api('/api/leads', {
      method: 'POST',
      body: { source: 'leadbox', name, phone, website: form.website.value, answers: clean, page_url: location.href.slice(0, 1000), attribution: attribution() },
    });
    // The server already sent this Lead to Meta's Conversions API with r.eventId; the browser pixel uses the same id.
    window.SBTrack?.fire('Lead', { content_name: 'লিড বক্স', content_category: clean.category || '', lead_source: 'leadbox' }, r.eventId);
    store.set({ done: Date.now() });
    done(name, r);
  } catch (err) {
    msg.textContent = err.message; msg.classList.add('is-error');
    btn.disabled = false; btn.textContent = 'ফ্রি প্রস্তাব নিন →';
  }
}

function done(name, r) {
  setProgress('done');
  history = [];
  const isPhone = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  body.innerHTML = `<div class="lb-done">
    <div class="lb-check" aria-hidden="true">✓</div>
    <h3>ধন্যবাদ, ${esc(name)}!</h3>
    <p>আপনার তথ্য আমরা পেয়েছি। খুব দ্রুত হোয়াটসঅ্যাপে আপনার সাথে যোগাযোগ করব${CFG.hours ? ` (${esc(CFG.hours)})` : ''}।</p>
    ${r.whatsappUrl ? `<a class="btn btn-whatsapp btn-lg btn-block" href="${esc(r.whatsappUrl)}" target="_blank" rel="noopener" data-contact-click="whatsapp" data-lb-wa>💬 এখনই হোয়াটসঅ্যাপে কথা বলুন</a>` : ''}
    ${r.bookingUrl ? `<a class="btn btn-ghost btn-block" href="${esc(r.bookingUrl)}" target="_blank" rel="noopener">📅 ফোন কলের সময় বুক করুন</a>` : ''}
    <a class="btn btn-ghost btn-block" href="/packages">ততক্ষণে সব ডেমো দেখুন →</a>
    <p class="small muted" data-lb-redirect hidden></p>
  </div>`;
  // Phones: hand over to WhatsApp automatically (cancellable) so the chat starts while interest is hot.
  if (CFG.autoWhatsapp && isPhone && r.whatsappUrl) {
    const note = $('[data-lb-redirect]', body);
    let n = 3;
    note.hidden = false;
    const tick = () => { note.innerHTML = `${bn(n)} সেকেন্ডে হোয়াটসঅ্যাপ খুলছে… <button type="button" class="link-btn" data-lb-cancel>থামান</button>`; };
    tick();
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); location.href = r.whatsappUrl; return; }
      tick();
    }, 1000);
    body.addEventListener('click', (e) => { if (e.target.closest('[data-lb-cancel]') || e.target.closest('[data-lb-wa]')) { clearInterval(t); note.hidden = true; } });
  }
}

function open(source = 'button') {
  if (!CFG) return;
  if (!dlg) build();
  if (dlg.open) return;
  from = source;
  if (!opened || $('.lb-done', body)) { answers = {}; history = []; }
  opened = true;
  try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  document.documentElement.classList.add('lb-open');
  track('open', from);
  if (!history.length) goto('type');
}

function close() {
  if (!dlg?.open) return;
  dlg.close();
  document.documentElement.classList.remove('lb-open');
  if (!store.get().done) { store.set({ dismissed: Date.now() }); track('close', ORDER.find((s) => !history.some((h) => h.step === s)) || 'contact'); }
}

/** Auto-open once: first visit, after `delay` seconds of visible time, when nothing else is in the way. */
function scheduleAuto() {
  const st = store.get();
  if (!CFG.auto || st.done || (st.dismissed && Date.now() - st.dismissed < 3 * DAY)) return;
  let left = CFG.delay * 1000;
  let last = Date.now();
  const busy = () => document.querySelector('dialog[open]') || $('.chat-panel:not([hidden])') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  const timer = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible') left -= now - last;
    last = now;
    if (left > 0) return;
    if (busy()) { left = 4000; return; } // try again a little later
    clearInterval(timer);
    open('auto');
  }, 500);
}

if (CFG) {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-leadbox-open]');
    if (!b) return;
    e.preventDefault();
    open(b.dataset.leadboxFrom || 'button');
  });
  scheduleAuto();
}
