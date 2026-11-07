import { $, $$, bn, taka, toast, api, captureAttribution, attribution, updateCartCount, formJson, showFieldError, setMsg } from './lib.js';
import './leadbox.js';
if (document.querySelector('[data-enroll-form],[data-student-login],[data-student-logout],[data-student-password],[data-lesson-done]')) import('./course.js');

captureAttribution();
updateCartCount();

/* Theme toggle */
$$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch {}
}));

/* Mobile menu */
const menuBtn = $('[data-menu-toggle]');
menuBtn?.addEventListener('click', () => {
  const nav = $('#nav-links');
  const open = nav.classList.toggle('is-open');
  menuBtn.setAttribute('aria-expanded', String(open));
});

/* Reveal on scroll */
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.1 });
  $$('.reveal').forEach((el) => io.observe(el));
} else $$('.reveal').forEach((el) => el.classList.add('is-in'));

/* Countdown timers — when one reaches zero the page reloads so the server re-prices (discount really stops). */
function tick() {
  const now = Date.now();
  $$('[data-countdown]').forEach((el) => {
    const end = Date.parse(el.dataset.countdown);
    const v = el.querySelector('.cd-val');
    let ms = end - now;
    if (ms <= 0) {
      if (!el.classList.contains('is-over')) {
        el.classList.add('is-over');
        v.textContent = 'অফার শেষ';
        if (!el.dataset.reloaded) { el.dataset.reloaded = '1'; setTimeout(() => location.reload(), 1500); }
      }
      return;
    }
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    const pad = (n) => bn(String(n).padStart(2, '0'));
    v.textContent = (d ? `${bn(d)} দিন ` : '') + `${pad(h)}:${pad(m)}:${pad(s)}`;
  });
}
if ($('[data-countdown]')) { tick(); setInterval(tick, 1000); }

/* Coupon copy */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast(`কুপন কোড ${b.dataset.copy} কপি হয়েছে — চেকআউটে ব্যবহার করুন`); } catch { toast(b.dataset.copy); }
});

/* Hero showcase rotator */
const rot = $('[data-rotator]');
if (rot) {
  const slides = $$('[data-slide]', rot);
  const dots = $$('[data-dot]', rot);
  let i = 0, timer;
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    slides.forEach((s, k) => { const v = s.querySelector('video'); if (v) k === i ? v.play().catch(() => {}) : v.pause(); });
  };
  const start = () => { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => show(i + 1), 5000); };
  dots.forEach((d) => d.addEventListener('click', () => { show(Number(d.dataset.dot)); start(); }));
  rot.addEventListener('mouseenter', () => clearInterval(timer));
  rot.addEventListener('mouseleave', start);
  show(0); start();
}

/* Package gallery */
const gal = $('[data-gallery]');
if (gal) {
  const items = $$('[data-g-item]', gal);
  $$('[data-g-thumb]', gal).forEach((t) => t.addEventListener('click', () => {
    const n = Number(t.dataset.gThumb);
    items.forEach((it, k) => it.classList.toggle('is-active', k === n));
    $$('[data-g-thumb]', gal).forEach((x) => x.setAttribute('aria-current', String(x === t)));
  }));
}

/* Banners */
$$('[data-close-banner]').forEach((b) => {
  const id = b.dataset.closeBanner;
  if (sessionStorage.getItem('banner_' + id)) b.closest('.promo-bar').remove();
  b.addEventListener('click', () => { sessionStorage.setItem('banner_' + id, '1'); b.closest('.promo-bar').remove(); });
});
const popup = $('dialog[data-popup]');
if (popup && !sessionStorage.getItem('popup_' + popup.dataset.popup)) {
  // Never on top of the lead box (or any other open dialog).
  setTimeout(() => { if (document.querySelector('dialog[open]')) return; try { popup.showModal(); } catch {} }, 6000);
  popup.addEventListener('close', () => sessionStorage.setItem('popup_' + popup.dataset.popup, '1'));
  $('[data-close-popup]', popup)?.addEventListener('click', () => popup.close());
}

/* Quote page opened as /quote?package=<slug> (works on the static GitHub Pages copy too) */
const quoteSlug = new URLSearchParams(location.search).get('package');
const quoteForm = document.querySelector('[data-lead-form][data-source="quote"]');
if (quoteSlug && quoteForm && !quoteForm.dataset.packageId) {
  api('/api/packages/' + encodeURIComponent(quoteSlug)).then((p) => {
    quoteForm.dataset.packageId = String(p.id);
    const lead = document.querySelector('.page-hero .lead');
    if (lead) lead.textContent = `${p.name} — আপনার বাড়তি চাহিদা জানান`;
  }).catch(() => {});
}

/* Lead forms (quote / contact / landing) */
$$('[data-lead-form]').forEach((form) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('[data-form-msg]', form);
  const btn = form.querySelector('button');
  const body = { ...formJson(form), source: form.dataset.source, packageId: form.dataset.packageId ? Number(form.dataset.packageId) : undefined, landing_page_id: form.dataset.landingId ? Number(form.dataset.landingId) : undefined, attribution: attribution() };
  btn.disabled = true; showFieldError(form); setMsg(msg, '');
  try {
    const r = await api('/api/leads', { method: 'POST', body });
    window.SBTrack?.fire('Lead', { content_name: form.dataset.source }, r.eventId);
    form.reset();
    setMsg(msg, 'ধন্যবাদ! আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।', true);
  } catch (err) {
    showFieldError(form, err.code, err.message);
    setMsg(msg, err.message);
  } finally { btn.disabled = false; }
}));

/* Manual payment (bank transfer / send money) */
$$('[data-manual-form]').forEach((form) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('[data-form-msg]', form);
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    await api(`/api/orders/${encodeURIComponent(form.dataset.order)}/manual-payment`, { method: 'POST', body: { ...formJson(form), token: form.dataset.token } });
    location.reload();
  } catch (err) { setMsg(msg, err.message); btn.disabled = false; }
}));

/* Retry payment */
$$('[data-retry-pay]').forEach((b) => b.addEventListener('click', async () => {
  b.disabled = true;
  try {
    const r = await api(`/api/orders/${encodeURIComponent(b.dataset.order)}/pay`, { method: 'POST', body: { token: b.dataset.token } });
    if (r.redirectUrl) location.href = r.redirectUrl; else location.reload();
  } catch (err) { setMsg(b.nextElementSibling, err.message); b.disabled = false; }
}));

/* Order lookup */
const lookup = $('[data-lookup-form]');
lookup?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('[data-form-msg]', lookup);
  try {
    const r = await api('/api/orders/lookup', { method: 'POST', body: formJson(lookup) });
    const labels = { pending_payment: 'পেমেন্টের অপেক্ষায়', confirmed: 'নিশ্চিত হয়েছে', requirements_collected: 'তথ্য সংগ্রহ সম্পন্ন', in_development: 'ডেভেলপমেন্ট চলছে', client_review: 'আপনার রিভিউয়ের অপেক্ষায়', revisions: 'সংশোধন চলছে', delivered: 'ডেলিভারি সম্পন্ন', completed: 'প্রজেক্ট সম্পূর্ণ', cancelled: 'বাতিল' };
    setMsg(msg, `অর্ডার ${r.orderNumber}: ${labels[r.projectStatus] || r.projectStatus} · মোট ${r.totalLabel}। অর্ডারের ব্যক্তিগত লিংক ${r.maskedPhone} নম্বর/ইমেইলে আবার পাঠানো হয়েছে।`, true);
  } catch (err) { setMsg(msg, err.message); }
});

/* Lazy page modules */
if ($('[data-configurator]')) import('./configurator.js');
if ($('[data-checkout]')) import('./checkout.js');
if ($('[data-portal]')) import('./portal.js');
if ($('[data-quiz]')) import('./quiz.js');

/* Chat launcher — module loads on first open */
const chat = $('[data-chat]');
if (chat) {
  let mod;
  $('[data-chat-open]', chat).addEventListener('click', async () => {
    mod = mod || (await import('./chat.js'));
    mod.toggle(chat);
  });
}

/* PWA */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

/* ---------------- Showcase v2 ---------------- */
const track = (kind, name, data) => { try { window.SBTrack?.[kind]?.(name, data); } catch {} };

/* Filter chips: packages by category, designs by kind, portfolio by category (client-side, works on the static copy) */
$$('[data-filter-scope]').forEach((scope) => {
  const attr = scope.dataset.filterAttr === 'kind' ? 'kind' : 'cat';
  const chips = $$('[data-filter-chips] .chip', scope);
  const apply = (v) => {
    chips.forEach((c) => c.classList.toggle('is-on', c.dataset.filter === v));
    $$(`[data-${attr}]`, scope).forEach((el) => el.toggleAttribute('data-filter-hidden', !!v && el.dataset[attr] !== v));
    $$('[data-kind-block]', scope).forEach((el) => { el.hidden = !!v && el.dataset.kindBlock !== v; });
  };
  chips.forEach((c) => c.addEventListener('click', () => {
    apply(c.dataset.filter);
    if (attr === 'kind') {
      const u = new URL(location.href);
      if (c.dataset.filter) u.searchParams.set('kind', c.dataset.filter); else u.searchParams.delete('kind');
      history.replaceState(null, '', u);
    }
  }));
  const initial = attr === 'kind' ? new URLSearchParams(location.search).get('kind') || '' : '';
  if (initial && chips.some((c) => c.dataset.filter === initial)) apply(initial);
});

/* Lightbox for screenshots and design samples (←/→ to browse the images on this page) */
const shotList = () => $$('[data-lightbox]').filter((el) => !el.closest('[data-filter-hidden]'));
let lb;
let lbIndex = 0;
function openLightbox(i) {
  const list = shotList();
  if (!list.length) return;
  lbIndex = (i + list.length) % list.length;
  if (!lb) {
    lb = document.createElement('dialog');
    lb.className = 'lightbox';
    lb.innerHTML = '<button class="lb-x" aria-label="বন্ধ করুন">×</button><button class="lb-nav lb-prev" aria-label="আগের ছবি">‹</button><img alt=""><p></p><button class="lb-nav lb-next" aria-label="পরের ছবি">›</button>';
    document.body.append(lb);
    lb.querySelector('.lb-x').addEventListener('click', () => lb.close());
    lb.querySelector('.lb-prev').addEventListener('click', () => openLightbox(lbIndex - 1));
    lb.querySelector('.lb-next').addEventListener('click', () => openLightbox(lbIndex + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') openLightbox(lbIndex - 1); if (e.key === 'ArrowRight') openLightbox(lbIndex + 1); });
  }
  const el = list[lbIndex];
  const img = lb.querySelector('img');
  img.src = el.dataset.lightbox;
  img.alt = el.dataset.caption || '';
  lb.querySelector('p').textContent = el.dataset.caption || '';
  if (!lb.open) { try { lb.showModal(); } catch { lb.setAttribute('open', ''); } }
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-lightbox]');
  if (!t) return;
  e.preventDefault();
  openLightbox(shotList().indexOf(t));
});

/* Click-to-play video (YouTube/Vimeo/Facebook/Drive iframes load only after the click) */
document.addEventListener('click', (e) => {
  const b = e.target.closest('.lite-video[data-embed]');
  if (!b) return;
  const f = document.createElement('iframe');
  f.src = b.dataset.embed;
  f.title = b.getAttribute('aria-label') || 'ভিডিও';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  b.replaceWith(f);
  track('custom', 'VideoPlay', { content_ids: [b.dataset.packageId], content_name: b.dataset.packageName });
});
$$('video[data-video-play]').forEach((v) => v.addEventListener('play', () => track('custom', 'VideoPlay', { content_ids: [v.dataset.packageId], content_name: v.dataset.packageName }), { once: true }));
$$('a[data-video-play]').forEach((a) => a.addEventListener('click', () => track('custom', 'VideoPlay', { content_ids: [a.dataset.packageId], content_name: a.dataset.packageName })));

/* Demo / portfolio / contact clicks → custom ad events (browser only, never a conversion) */
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-demo-click]');
  if (d) track('custom', 'DemoClick', { content_ids: [d.dataset.packageId], content_name: d.dataset.packageName, demo: d.dataset.demoLabel });
  const w = e.target.closest('[data-portfolio-click]');
  if (w) track('custom', 'PortfolioClick', { content_name: w.dataset.work });
  const c = e.target.closest('[data-contact-click], [data-channel="whatsapp"], [data-channel="messenger"], a[href^="tel:"]');
  if (c) track('standard', 'Contact', { channel: c.dataset.contactClick || c.dataset.channel || 'phone' });
}, true);

/* Order buttons outside the configurator (bottom CTA band, sticky bar) submit the configurator itself */
const cfgForm = $('[data-configurator]');
$$('[data-order-now-proxy]').forEach((b) => b.addEventListener('click', () => {
  if (cfgForm?.requestSubmit) cfgForm.requestSubmit(); else cfgForm?.querySelector('[data-order-now]')?.click();
}));
$$('[data-chat-open-alt]').forEach((b) => b.addEventListener('click', () => $('[data-chat-open]')?.click()));

/* Sticky order bar on phones: visible once the configurator's own button has scrolled away */
const sticky = $('[data-sticky-cta]');
const mainOrder = $('[data-order-now]') || $('[data-enroll-main]');
if (sticky && mainOrder) {
  // A scroll check (not IntersectionObserver): a fast fling can jump the button from below the screen to above it
  // without ever "intersecting", and the bar must still appear.
  let queued = false;
  const update = () => {
    queued = false;
    const show = mainOrder.getBoundingClientRect().bottom < 0;
    if (sticky.hidden === show) { sticky.hidden = !show; document.body.classList.toggle('has-sticky-cta', show); }
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* Section tabs: highlight the section in view */
const tabs = $$('.section-tabs a');
if (tabs.length && 'IntersectionObserver' in window) {
  const io2 = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) tabs.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + en.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  tabs.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) io2.observe(s); });
}

/* Category sidebar: highlight the category in view, and keep its link visible inside the (scrollable) sidebar. */
$$('[data-shop]').forEach((shop) => {
  const links = $$('[data-side-link]', shop);
  const side = $('.shop-side', shop);
  const groups = links.map((a) => document.getElementById(a.dataset.sideLink)).filter(Boolean);
  let current = '';
  const setOn = (id) => {
    if (id === current) return;
    current = id;
    links.forEach((a) => {
      const on = a.dataset.sideLink === id;
      a.classList.toggle('is-on', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on && side && side.scrollHeight > side.clientHeight) {
        // Scroll the sidebar itself (never the page) so the active category stays visible in it.
        const top = a.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop;
        if (top < side.scrollTop || top + a.offsetHeight > side.scrollTop + side.clientHeight) side.scrollTo({ top: Math.max(0, top - side.clientHeight / 3), behavior: 'smooth' });
      }
    });
  };
  // The active group is the last one whose heading has passed just under the sticky header.
  const pick = () => {
    const line = (parseFloat(getComputedStyle(groups[0] || document.body).scrollMarginTop) || 80) + 40;
    let cur = groups[0];
    for (const g of groups) { if (g.getBoundingClientRect().top <= line) cur = g; else break; }
    if (cur) setOn(cur.id);
  };
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; pick(); }); } }, { passive: true });
  links.forEach((a) => a.addEventListener('click', () => setOn(a.dataset.sideLink)));
  if (groups.length) pick();
  else {
    // A category page: the sidebar links to the other categories — just bring the current one into view.
    const on = $('.side-link.is-on', shop);
    if (on && side && side.scrollHeight > side.clientHeight) side.scrollTop = Math.max(0, on.getBoundingClientRect().top - side.getBoundingClientRect().top - side.clientHeight / 3);
  }
});

/* Cost-recovery calculator on package pages: price ÷ profit per order = orders needed; ÷ orders per day = days. */
$$('[data-roi]').forEach((form) => {
  const price = Number(form.dataset.price) || 0;
  const out = $('[data-roi-out]', form);
  const num = (el) => {
    const n = Math.floor(Number(String(el.value).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d))));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const strong = (t) => { const s = document.createElement('strong'); s.textContent = t; return s; };
  const render = () => {
    const profit = num($('[data-roi-profit]', form));
    const perDay = num($('[data-roi-orders]', form));
    if (!price || !profit) { out.textContent = 'প্রতি অর্ডারে আপনার লাভ কত টাকা, সেটা বসান।'; return; }
    const orders = Math.ceil(price / profit);
    const days = perDay ? Math.ceil(orders / perDay) : 0;
    out.textContent = '';
    out.append(`${taka(price)} উঠে আসবে `, strong(`${bn(orders)}টি অর্ডারে`));
    if (days) out.append(` — দিনে ${bn(perDay)}টি হলে প্রায় `, strong(`${bn(days)} দিনে`));
    out.append('। এরপর প্রতিটি অর্ডারের লাভ পুরোটাই আপনার।');
  };
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => { e.preventDefault(); render(); });
});
