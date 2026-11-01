import { $, $$, bn, toast, api, captureAttribution, attribution, updateCartCount, formJson, showFieldError, setMsg } from './lib.js';

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
  setTimeout(() => { try { popup.showModal(); } catch {} }, 6000);
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
