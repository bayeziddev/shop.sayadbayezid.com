import { priceLine } from './pricing.js';
import { $, $$, taka, bn, getCart, setCart } from './lib.js';

const toNum = (v) => Number(String(v).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '')) || 0;

const form = $('[data-configurator]');
const pkg = JSON.parse($('#pkg-data').textContent);
const pricingPkg = { id: pkg.id, categoryId: pkg.categoryId, name: pkg.name, basePrice: pkg.basePrice, addons: pkg.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta, maxQuantity: a.maxQuantity })), offers: pkg.offers };

function selection() {
  return {
    packageId: pkg.id,
    addons: $$('[data-addon]', form).map((el) => ({ addonId: Number(el.dataset.addon), quantity: el.type === 'checkbox' ? (el.checked ? 1 : 0) : Math.max(0, Math.min(Number(el.dataset.max), toNum(el.value))) })).filter((a) => a.quantity > 0),
  };
}

function set(sel, text) {
  const el = $(`[data-cfg="${sel}"]`, form);
  if (el && el.textContent !== text) { el.textContent = text; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}

function render() {
  // Live preview with the same engine the server uses; the server re-verifies at checkout.
  const line = priceLine(pricingPkg, selection(), Date.now());
  set('subtotal', taka(line.subtotal));
  const offerRow = $('[data-cfg-row="offer"]', form);
  offerRow.hidden = line.offerDiscount <= 0;
  set('offer', '−' + taka(line.offerDiscount));
  set('total', taka(line.total));
  set('total-inline', taka(line.total));
  $$('[data-addon]', form).forEach((el) => el.closest('.addon')?.classList.toggle('is-on', el.type === 'checkbox' ? el.checked : toNum(el.value) > 0));
  return line;
}

form.addEventListener('input', render);
form.addEventListener('change', () => { $$('[data-stepper] input', form).forEach((i) => { i.value = bn(Math.min(Number(i.dataset.max), toNum(i.value))); }); render(); });
$$('[data-stepper]', form).forEach((st) => {
  const input = $('input', st);
  $$('[data-step]', st).forEach((b) => b.addEventListener('click', () => {
    input.value = bn(Math.max(0, Math.min(Number(input.dataset.max), toNum(input.value) + Number(b.dataset.step))));
    render();
  }));
});

// Restore an existing configuration of this package from the cart.
const existing = getCart().find((l) => l.packageId === pkg.id);
if (existing) {
  existing.addons.forEach((a) => {
    const el = form.querySelector(`[data-addon="${a.addonId}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = a.quantity > 0; else el.value = bn(a.quantity);
  });
}
render();

// On the static copy, live-prices.js brings today's price and offers from the API: use them.
const useLive = (list) => {
  const live = (list || []).find((x) => x.id === pkg.id);
  if (!live) return;
  pricingPkg.basePrice = live.basePrice;
  pricingPkg.offers = live.offers;
  render();
};
useLive(window.__sbLivePackages);
window.addEventListener('sb:live-packages', (e) => useLive(e.detail));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const sel = selection();
  // Browser-only funnel step (no money changes hands here, so no server event and never a Purchase).
  const line = priceLine(pricingPkg, sel, Date.now());
  window.SBTrack?.standard?.('AddToCart', { content_ids: [String(pkg.id)], content_name: pkg.name, content_type: 'product', value: line.total, currency: 'BDT', item_category: pkg.categoryName });
  const cart = getCart().filter((l) => l.packageId !== pkg.id);
  cart.push({ ...sel, name: pkg.name, slug: pkg.slug, addedAt: Date.now() });
  setCart(cart);
  location.href = '/checkout';
});
