import { $, $$, api, backend, taka, bn, esc, getCart, setCart, attribution, formJson, showFieldError, setMsg, toast } from './lib.js';

const root = $('[data-checkout]');
const linesEl = $('[data-cart-lines]', root);
const summaryEl = $('[data-summary]', root);
const couponForm = $('[data-coupon-form]', root);
const couponMsg = $('[data-coupon-msg]', root);
const form = $('[data-checkout-form]', root);
const placeBtn = $('[data-place-order]', root);
const orderMsg = $('[data-order-msg]', root);

let coupon = sessionStorage.getItem('sb_coupon') || '';
let quote = null;

const selections = () => getCart().map((l) => ({ packageId: l.packageId, addons: l.addons }));

function renderSummary(q) {
  summaryEl.innerHTML = `
    <div class="row"><span>সাবটোটাল</span><span>${taka(q.subtotal)}</span></div>
    ${q.offerDiscount ? `<div class="row discount"><span>অফার ছাড়</span><span>−${taka(q.offerDiscount)}</span></div>` : ''}
    ${q.couponDiscount ? `<div class="row discount"><span>কুপন (${esc(q.couponCode)})</span><span>−${taka(q.couponDiscount)}</span></div>` : ''}
    <div class="row total"><span>সর্বমোট</span><strong>${taka(q.total)}</strong></div>`;
}

function renderLines(q) {
  linesEl.innerHTML = q.lines.map((l) => `
    <div class="cart-line">
      <div><strong>${esc(l.packageName)}</strong>
        <ul><li>মূল প্যাকেজ — ${taka(l.basePrice)}</li>${l.addons.map((a) => `<li>${esc(a.name)}${a.quantity > 1 ? ` × ${bn(a.quantity)}` : ''} — ${taka(a.amount)}</li>`).join('')}
        ${l.offerDiscount ? `<li>অফার ছাড় — −${taka(l.offerDiscount)}</li>` : ''}</ul>
        <button class="remove" data-remove="${l.packageId}">সরিয়ে দিন</button> · <a class="small" href="/package/${esc((getCart().find((c) => c.packageId === l.packageId) || {}).slug || '')}">পরিবর্তন করুন</a>
      </div>
      <strong>${taka(l.total)}</strong>
    </div>`).join('');
}

async function refresh() {
  const sel = selections();
  if (!sel.length) {
    linesEl.innerHTML = '<p class="muted">আপনার কার্ট খালি। <a href="/#categories">প্যাকেজ দেখুন</a></p>';
    summaryEl.innerHTML = '';
    placeBtn.disabled = true;
    return;
  }
  try {
    // Server-verified prices (current offers, coupon validity) — never the browser's own numbers.
    quote = await api('/api/pricing/quote', { method: 'POST', body: { items: sel, couponCode: coupon || undefined } });
    renderLines(quote);
    renderSummary(quote);
    if (coupon) {
      if (quote.couponMessage) { setMsg(couponMsg, quote.couponMessage); coupon = ''; sessionStorage.removeItem('sb_coupon'); }
      else setMsg(couponMsg, `কুপন প্রয়োগ হয়েছে — ${taka(quote.couponDiscount)} ছাড়`, true);
    }
    placeBtn.disabled = !$('[name="payment_method"]', form);
  } catch (err) {
    if (err.code === 'unknown_package' || err.code === 'unknown_addon') {
      // Drop items that are no longer sold and retry once.
      const ids = new Set((await api('/api/packages').catch(() => [])).map((p) => p.id));
      setCart(getCart().filter((l) => ids.has(l.packageId)));
      toast(err.message, true);
      if (selections().length !== sel.length) return refresh();
    }
    linesEl.innerHTML = `<p class="form-msg is-error">${esc(err.message)}</p>`;
  }
}

linesEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (!b) return;
  setCart(getCart().filter((l) => l.packageId !== Number(b.dataset.remove)));
  refresh();
});

couponForm.addEventListener('submit', (e) => {
  e.preventDefault();
  coupon = couponForm.coupon.value.trim().toUpperCase();
  sessionStorage.setItem('sb_coupon', coupon);
  refresh();
});
if (coupon) couponForm.coupon.value = coupon;

placeBtn.addEventListener('click', async () => {
  showFieldError(form);
  setMsg(orderMsg, '');
  if (!form.reportValidity()) return;
  const data = formJson(form);
  placeBtn.disabled = true;
  placeBtn.textContent = 'প্রক্রিয়া চলছে…';
  try {
    const r = await api('/api/orders', {
      method: 'POST',
      body: { ...data, agree: form.agree.checked, items: selections(), couponCode: coupon || undefined, expectedTotal: quote?.total, attribution: attribution() },
    });
    window.SBTrack?.fire('InitiateCheckout', { value: r.total, currency: 'BDT', num_items: selections().length }, r.initiateEventId);
    setCart([]);
    sessionStorage.removeItem('sb_coupon');
    localStorage.setItem('sb_last_order', JSON.stringify({ no: r.orderNumber, url: backend(r.orderUrl) }));
    location.href = r.redirectUrl || backend(r.orderUrl);
  } catch (err) {
    if (err.code === 'price_changed' && err.data) { quote = err.data; renderLines(quote); renderSummary(quote); }
    showFieldError(form, err.code, err.message);
    setMsg(orderMsg, err.message);
    placeBtn.disabled = false;
    placeBtn.textContent = 'অর্ডার নিশ্চিত করে পেমেন্ট করুন';
  }
});

refresh();
