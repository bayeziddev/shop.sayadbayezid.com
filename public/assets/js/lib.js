// Shared browser helpers (ES module).
const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => String(v).replace(/\d/g, (d) => BN[d]);
const nf = new Intl.NumberFormat('bn-BD');
export const taka = (n) => '৳' + nf.format(Math.round(n || 0));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function toast(msg, isError = false) {
  const wrap = $('.toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' is-error' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/** Backend origin. Empty = same origin. Set by <meta name="sb-api-base"> when the pages are hosted on GitHub Pages. */
export const API_BASE = (document.querySelector('meta[name="sb-api-base"]')?.content || '').replace(/\/$/, '');
/** Absolute URL on the backend for API calls and backend-only pages (order, portal, invoice). */
export const backend = (path) => (API_BASE && path.startsWith('/') ? API_BASE + path : path);

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined && !(body instanceof FormData)) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  else if (body) opts.body = body;
  let res;
  try { res = await fetch(backend(path), opts); } catch { throw Object.assign(new Error('ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন'), { code: 'network' }); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw Object.assign(new Error(json.error || 'কিছু একটা সমস্যা হয়েছে'), { code: json.code, status: res.status, data: json.data });
  return json.data;
}

/* ---- Cart (localStorage) ---- */
const CART = 'sb_cart_v1';
export const getCart = () => { try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch { return []; } };
export const setCart = (items) => { localStorage.setItem(CART, JSON.stringify(items)); updateCartCount(); };
export function updateCartCount() {
  const n = getCart().length;
  $$('[data-cart-count]').forEach((el) => { el.textContent = bn(n); el.hidden = n === 0; });
}

/* ---- Attribution: UTM / fbclid / referral / landing page, last-touch with first-touch fallback ---- */
const ATTR = 'sb_attr_v1';
export function captureAttribution() {
  const p = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ref'];
  const found = {};
  keys.forEach((k) => { const v = p.get(k); if (v) found[k] = v.slice(0, 300); });
  const lp = window.SB_LANDING_ID;
  if (lp) found.landing_page_id = lp;
  if (Object.keys(found).length) {
    found.source_url = location.href.slice(0, 1000);
    found.at = Date.now();
    const prev = readAttr();
    localStorage.setItem(ATTR, JSON.stringify({ first: prev.first || found, last: found }));
  }
}
function readAttr() { try { return JSON.parse(localStorage.getItem(ATTR) || '{}'); } catch { return {}; } }
export function attribution() {
  const a = readAttr();
  const last = a.last || a.first || {};
  // Attribution older than 28 days is dropped (Meta's default click window is 7 days; we keep a little longer for reports).
  if (last.at && Date.now() - last.at > 28 * 86400000) return { source_url: location.href };
  const cookie = (n) => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1] || '';
  return { ...last, fbp: decodeURIComponent(cookie('_fbp')), fbc: decodeURIComponent(cookie('_fbc')), source_url: last.source_url || location.href };
}

/* ---- Forms ---- */
export function formJson(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}
export function showFieldError(form, field, msg) {
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.field-err', form).forEach((el) => el.remove());
  if (!field) return;
  const input = form.querySelector(`[name="${field}"]`);
  if (!input) return;
  input.setAttribute('aria-invalid', 'true');
  const s = document.createElement('span');
  s.className = 'field-err';
  s.textContent = msg;
  input.insertAdjacentElement('afterend', s);
  input.focus();
}
export function setMsg(el, msg, ok = false) {
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('is-error', !!msg && !ok);
  el.classList.toggle('is-ok', !!msg && ok);
}
