// Static copy (GitHub Pages) only: prices and offers can change in the admin after the copy was built, so every
// price on the page is refreshed from the live API. The server re-checks the price at checkout either way.
import { $$, api, taka, bn } from './lib.js';
import { priceLine } from './pricing.js';

const nodes = $$('[data-live-price],[data-live-offer],[data-live-total]');
const ids = [...new Set(nodes.map((el) => el.dataset.livePrice || el.dataset.liveOffer || el.dataset.liveTotal))].filter(Boolean);

function bestOffer(p, now) {
  const line = priceLine({ id: p.id, categoryId: p.categoryId, basePrice: p.basePrice, addons: [], offers: p.offers }, { packageId: p.id, addons: [] }, now);
  return { line, offer: (p.offers || []).find((o) => o.id === line.offerId) || null };
}

if (ids.length) {
  try {
    const list = await api(`/api/packages?ids=${ids.join(',')}`);
    const now = Date.now();
    for (const p of list) {
      const { line, offer } = bestOffer(p, now);
      const priceHtml = line.offerDiscount > 0
        ? `<strong>${taka(line.total)}</strong> <s>${taka(line.subtotal)}</s>`
        : `<strong>${taka(p.basePrice)}</strong> <span class="price-from">এককালীন</span>`;
      const badge = offer ? `<span class="badge badge-offer">${offer.discountType === 'percent' ? `${bn(offer.discountValue)}% ছাড়` : `${taka(offer.discountValue)} ছাড়`}</span>` : '';
      $$(`[data-live-price="${p.id}"]`).forEach((el) => { if (el.innerHTML !== priceHtml) el.innerHTML = priceHtml; });
      $$(`[data-live-offer="${p.id}"]`).forEach((el) => { if (el.innerHTML !== badge) el.innerHTML = badge; });
      $$(`[data-live-total="${p.id}"]`).forEach((el) => { el.textContent = taka(line.total); });
    }
    window.__sbLivePackages = list;
    window.dispatchEvent(new CustomEvent('sb:live-packages', { detail: list }));
  } catch {
    // Offline or API unreachable: keep the prices the page was built with.
  }
}
