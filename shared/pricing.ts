/**
 * Shared pricing engine.
 *
 * This exact module is bundled twice:
 *  - into the Worker (authoritative, used for the actual charge), and
 *  - into the browser as /assets/js/pricing.js (live configurator preview).
 *
 * The browser total is only ever a preview. The Worker always recomputes the
 * total from database prices before creating an order or a payment session.
 * All amounts are whole Bangladeshi Taka (integers).
 */

export type DiscountType = 'percent' | 'flat';

export interface OfferInput {
  id: number;
  scope: 'category' | 'package';
  title?: string;
  discountType: DiscountType;
  discountValue: number;
  startsAt: string | null; // ISO-8601
  endsAt: string | null; // ISO-8601
  isActive: boolean;
}

export interface AddonInput {
  id: number;
  name?: string;
  priceDelta: number;
  maxQuantity: number; // 1 = simple on/off toggle
  isActive?: boolean;
}

export interface PricingPackage {
  id: number;
  categoryId: number;
  name?: string;
  basePrice: number;
  addons: AddonInput[];
  offers: OfferInput[]; // package-level AND category-level offers
}

export interface CouponInput {
  id: number;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  scope: 'sitewide' | 'category' | 'package';
  scopeId: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  minSubtotal: number;
  isActive: boolean;
}

export interface AddonSelection {
  addonId: number;
  quantity: number;
}

export interface LineSelection {
  packageId: number;
  addons: AddonSelection[];
}

export interface PricedAddon {
  addonId: number;
  name?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PricedLine {
  packageId: number;
  packageName?: string;
  basePrice: number;
  addons: PricedAddon[];
  addonsTotal: number;
  subtotal: number;
  offerId: number | null;
  offerTitle?: string;
  offerEndsAt: string | null;
  offerDiscount: number;
  total: number;
}

export type CouponError =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'usage_limit'
  | 'min_subtotal'
  | 'out_of_scope';

export interface CartPrice {
  lines: PricedLine[];
  subtotal: number;
  offerDiscount: number;
  couponCode: string | null;
  couponId: number | null;
  couponDiscount: number;
  couponError: CouponError | null;
  total: number;
}

export class PricingError extends Error {
  constructor(public code: 'unknown_package' | 'unknown_addon' | 'bad_quantity' | 'empty_cart') {
    super(code);
  }
}

const toMs = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** An offer is live only between its start and end time. The timer is not cosmetic. */
export function isOfferLive(offer: OfferInput, now: number): boolean {
  if (!offer.isActive) return false;
  const s = toMs(offer.startsAt);
  const e = toMs(offer.endsAt);
  if (s !== null && now < s) return false;
  if (e !== null && now >= e) return false;
  return true;
}

export function discountAmount(type: DiscountType, value: number, base: number): number {
  if (base <= 0 || value <= 0) return 0;
  const raw = type === 'percent' ? (base * Math.min(value, 100)) / 100 : value;
  return Math.min(Math.round(raw), base);
}

/** Price one configured package. Throws PricingError for invalid selections. */
export function priceLine(pkg: PricingPackage, selection: LineSelection, now: number): PricedLine {
  const seen = new Set<number>();
  const addons: PricedAddon[] = [];
  for (const sel of selection.addons || []) {
    const qty = Math.floor(Number(sel.quantity));
    if (!Number.isFinite(qty) || qty < 0) throw new PricingError('bad_quantity');
    if (qty === 0) continue;
    const addon = pkg.addons.find((a) => a.id === Number(sel.addonId) && a.isActive !== false);
    if (!addon) throw new PricingError('unknown_addon');
    if (seen.has(addon.id)) throw new PricingError('bad_quantity');
    if (qty > Math.max(1, addon.maxQuantity)) throw new PricingError('bad_quantity');
    seen.add(addon.id);
    addons.push({ addonId: addon.id, name: addon.name, quantity: qty, unitPrice: addon.priceDelta, amount: addon.priceDelta * qty });
  }
  const addonsTotal = addons.reduce((s, a) => s + a.amount, 0);
  const subtotal = pkg.basePrice + addonsTotal;

  // Best live offer wins (package-level or category-level).
  let best: { offer: OfferInput; amount: number } | null = null;
  for (const offer of pkg.offers || []) {
    if (!isOfferLive(offer, now)) continue;
    const amount = discountAmount(offer.discountType, offer.discountValue, subtotal);
    if (!best || amount > best.amount) best = { offer, amount };
  }
  const offerDiscount = best ? best.amount : 0;
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    basePrice: pkg.basePrice,
    addons,
    addonsTotal,
    subtotal,
    offerId: best ? best.offer.id : null,
    offerTitle: best?.offer.title,
    offerEndsAt: best ? best.offer.endsAt : null,
    offerDiscount,
    total: subtotal - offerDiscount,
  };
}

export function checkCoupon(
  coupon: CouponInput,
  lines: PricedLine[],
  packages: Map<number, PricingPackage>,
  now: number,
): { error: CouponError | null; discount: number } {
  if (!coupon.isActive) return { error: 'inactive', discount: 0 };
  const s = toMs(coupon.startsAt);
  const e = toMs(coupon.expiresAt);
  if (s !== null && now < s) return { error: 'not_started', discount: 0 };
  if (e !== null && now >= e) return { error: 'expired', discount: 0 };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return { error: 'usage_limit', discount: 0 };

  const eligible = lines.filter((l) => {
    if (coupon.scope === 'sitewide') return true;
    if (coupon.scope === 'package') return l.packageId === coupon.scopeId;
    return packages.get(l.packageId)?.categoryId === coupon.scopeId;
  });
  if (eligible.length === 0) return { error: 'out_of_scope', discount: 0 };
  const eligibleTotal = eligible.reduce((sum, l) => sum + l.total, 0);
  const cartTotal = lines.reduce((sum, l) => sum + l.total, 0);
  if (cartTotal < (coupon.minSubtotal || 0)) return { error: 'min_subtotal', discount: 0 };
  return { error: null, discount: discountAmount(coupon.discountType, coupon.discountValue, eligibleTotal) };
}

/** Full cart price. `coupon` is null when no code was entered OR the code was not found. */
export function priceCart(
  packages: Map<number, PricingPackage>,
  selections: LineSelection[],
  couponCode: string | null,
  coupon: CouponInput | null,
  now: number,
): CartPrice {
  if (!selections || selections.length === 0) throw new PricingError('empty_cart');
  const lines = selections.map((sel) => {
    const pkg = packages.get(Number(sel.packageId));
    if (!pkg) throw new PricingError('unknown_package');
    return priceLine(pkg, sel, now);
  });
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const offerDiscount = lines.reduce((s, l) => s + l.offerDiscount, 0);
  const afterOffers = subtotal - offerDiscount;

  const code = couponCode ? couponCode.trim().toUpperCase() : null;
  let couponDiscount = 0;
  let couponError: CouponError | null = null;
  let couponId: number | null = null;
  if (code) {
    if (!coupon) couponError = 'not_found';
    else {
      const r = checkCoupon(coupon, lines, packages, now);
      couponError = r.error;
      if (!r.error) {
        couponDiscount = Math.min(r.discount, afterOffers);
        couponId = coupon.id;
      }
    }
  }
  return {
    lines,
    subtotal,
    offerDiscount,
    couponCode: couponId ? code : null,
    couponId,
    couponDiscount,
    couponError,
    total: Math.max(0, afterOffers - couponDiscount),
  };
}

export const COUPON_ERROR_BN: Record<CouponError, string> = {
  not_found: 'এই কুপন কোডটি পাওয়া যায়নি',
  inactive: 'এই কুপনটি এখন সক্রিয় নয়',
  not_started: 'এই কুপনটি এখনো চালু হয়নি',
  expired: 'এই কুপনের মেয়াদ শেষ হয়ে গেছে',
  usage_limit: 'এই কুপনের ব্যবহার সীমা শেষ',
  min_subtotal: 'এই কুপনের জন্য ন্যূনতম অর্ডার মূল্য পূরণ হয়নি',
  out_of_scope: 'এই কুপনটি আপনার নির্বাচিত প্যাকেজে প্রযোজ্য নয়',
};
