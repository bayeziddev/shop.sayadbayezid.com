import { describe, expect, it } from 'vitest';
import { priceCart, priceLine, isOfferLive, PricingError, type PricingPackage, type CouponInput } from '../../shared/pricing';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const pkg: PricingPackage = {
  id: 1, categoryId: 10, name: 'ফ্যাশন প্রিমিয়াম', basePrice: 25000,
  addons: [{ id: 100, priceDelta: 1000, maxQuantity: 10 }, { id: 101, priceDelta: 5000, maxQuantity: 1 }],
  offers: [],
};
const coupon = (o: Partial<CouponInput> = {}): CouponInput => ({ id: 9, code: 'EID500', discountType: 'flat', discountValue: 500, scope: 'sitewide', scopeId: null, startsAt: null, expiresAt: null, usageLimit: null, usedCount: 0, minSubtotal: 0, isActive: true, ...o });

describe('pricing engine', () => {
  it('sums base + add-ons × quantity', () => {
    const l = priceLine(pkg, { packageId: 1, addons: [{ addonId: 100, quantity: 2 }, { addonId: 101, quantity: 1 }] }, NOW);
    expect(l.subtotal).toBe(32000);
    expect(l.total).toBe(32000);
  });

  it('rejects unknown add-ons and quantities above the maximum', () => {
    expect(() => priceLine(pkg, { packageId: 1, addons: [{ addonId: 999, quantity: 1 }] }, NOW)).toThrow(PricingError);
    expect(() => priceLine(pkg, { packageId: 1, addons: [{ addonId: 101, quantity: 2 }] }, NOW)).toThrow(PricingError);
    expect(() => priceLine(pkg, { packageId: 1, addons: [{ addonId: 100, quantity: -1 }] }, NOW)).toThrow(PricingError);
  });

  it('applies a live offer and stops it exactly at ends_at', () => {
    const offer = { id: 1, scope: 'category' as const, discountType: 'percent' as const, discountValue: 10, startsAt: null, endsAt: '2026-10-31T13:00:00Z', isActive: true };
    const p = { ...pkg, offers: [offer] };
    expect(priceLine(p, { packageId: 1, addons: [] }, NOW).total).toBe(22500);
    expect(priceLine(p, { packageId: 1, addons: [] }, Date.parse('2026-10-31T13:00:00Z')).total).toBe(25000);
    expect(isOfferLive({ ...offer, startsAt: '2026-11-01T00:00:00Z' }, NOW)).toBe(false);
  });

  it('picks the best of several live offers', () => {
    const p = { ...pkg, offers: [
      { id: 1, scope: 'category' as const, discountType: 'percent' as const, discountValue: 10, startsAt: null, endsAt: null, isActive: true },
      { id: 2, scope: 'package' as const, discountType: 'flat' as const, discountValue: 4000, startsAt: null, endsAt: null, isActive: true },
    ] };
    expect(priceLine(p, { packageId: 1, addons: [] }, NOW).offerId).toBe(2);
  });

  it('validates coupons: expiry, usage limit, scope, minimum', () => {
    const pkgs = new Map([[1, pkg]]);
    const sel = [{ packageId: 1, addons: [] }];
    expect(priceCart(pkgs, sel, 'eid500', coupon(), NOW).total).toBe(24500);
    expect(priceCart(pkgs, sel, 'EID500', coupon({ expiresAt: '2026-10-30T00:00:00Z' }), NOW).couponError).toBe('expired');
    expect(priceCart(pkgs, sel, 'EID500', coupon({ usageLimit: 3, usedCount: 3 }), NOW).couponError).toBe('usage_limit');
    expect(priceCart(pkgs, sel, 'EID500', coupon({ scope: 'category', scopeId: 99 }), NOW).couponError).toBe('out_of_scope');
    expect(priceCart(pkgs, sel, 'EID500', coupon({ minSubtotal: 30000 }), NOW).couponError).toBe('min_subtotal');
    expect(priceCart(pkgs, sel, 'NOPE', null, NOW).couponError).toBe('not_found');
  });

  it('never produces a negative total', () => {
    const pkgs = new Map([[1, pkg]]);
    expect(priceCart(pkgs, [{ packageId: 1, addons: [] }], 'BIG', coupon({ discountValue: 999999 }), NOW).total).toBe(0);
  });
});
