import type { Env } from '../env';
import type { CouponInput, OfferInput, PricingPackage } from '../../../shared/pricing';
import { parseJson } from './util';

export interface CategoryRow {
  id: number; slug: string; name: string; description: string; icon: string; image_key: string | null;
  is_active: number; sort_order: number;
}
export interface PackageRow {
  id: number; category_id: number; slug: string; name: string; tier: string; short_description: string;
  description: string; base_price: number; delivery_days: number; demo_url: string; demo_video_key: string | null;
  images: string; features: string; status: 'active' | 'inactive' | 'coming_soon'; is_featured: number; sort_order: number;
  ai_draft: string | null; category_slug?: string; category_name?: string;
}
export interface AddonRow { id: number; package_id: number; name: string; description: string; price_delta: number; max_quantity: number; is_active: number; sort_order: number }
export interface OfferRow { id: number; scope: 'category' | 'package'; scope_id: number; title: string; discount_type: 'percent' | 'flat'; discount_value: number; starts_at: string | null; ends_at: string | null; show_timer: number; is_active: number }
export interface CouponRow { id: number; code: string; description: string; discount_type: 'percent' | 'flat'; discount_value: number; scope: 'sitewide' | 'category' | 'package'; scope_id: number | null; starts_at: string | null; expires_at: string | null; usage_limit: number | null; used_count: number; min_subtotal: number; show_on_card: number; is_active: number; referrer_order_id: number | null }

export const offerFromRow = (o: OfferRow): OfferInput => ({
  id: o.id, scope: o.scope, title: o.title, discountType: o.discount_type, discountValue: o.discount_value,
  startsAt: o.starts_at, endsAt: o.ends_at, isActive: !!o.is_active,
});

export const couponFromRow = (c: CouponRow): CouponInput => ({
  id: c.id, code: c.code, discountType: c.discount_type, discountValue: c.discount_value, scope: c.scope, scopeId: c.scope_id,
  startsAt: c.starts_at, expiresAt: c.expires_at, usageLimit: c.usage_limit, usedCount: c.used_count,
  minSubtotal: c.min_subtotal, isActive: !!c.is_active,
});

/** Load authoritative pricing data for the given package ids (only purchasable = active packages). */
export async function loadPricingPackages(env: Env, ids: number[]): Promise<Map<number, PricingPackage>> {
  const uniq = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 20);
  const map = new Map<number, PricingPackage>();
  if (!uniq.length) return map;
  const ph = uniq.map(() => '?').join(',');
  const [pk, ad] = await env.DB.batch([
    env.DB.prepare(`SELECT p.* FROM packages p JOIN categories c ON c.id = p.category_id WHERE p.id IN (${ph}) AND p.status = 'active' AND c.is_active = 1`).bind(...uniq),
    env.DB.prepare(`SELECT * FROM package_addons WHERE package_id IN (${ph}) AND is_active = 1 ORDER BY sort_order`).bind(...uniq),
  ]);
  const pkgs = pk.results as unknown as PackageRow[];
  if (!pkgs.length) return map;
  const catIds = [...new Set(pkgs.map((p) => p.category_id))];
  const offers = (
    await env.DB.prepare(
      `SELECT * FROM offers WHERE is_active = 1 AND ((scope = 'package' AND scope_id IN (${pkgs.map(() => '?').join(',')})) OR (scope = 'category' AND scope_id IN (${catIds.map(() => '?').join(',')})))`,
    ).bind(...pkgs.map((p) => p.id), ...catIds).all<OfferRow>()
  ).results;
  for (const p of pkgs) {
    map.set(p.id, {
      id: p.id,
      categoryId: p.category_id,
      name: p.name,
      basePrice: p.base_price,
      addons: (ad.results as unknown as AddonRow[]).filter((a) => a.package_id === p.id).map((a) => ({ id: a.id, name: a.name, priceDelta: a.price_delta, maxQuantity: a.max_quantity, isActive: !!a.is_active })),
      offers: offers.filter((o) => (o.scope === 'package' && o.scope_id === p.id) || (o.scope === 'category' && o.scope_id === p.category_id)).map(offerFromRow),
    });
  }
  return map;
}

export async function findCoupon(env: Env, code: string | null | undefined): Promise<CouponInput | null> {
  if (!code) return null;
  const row = await env.DB.prepare('SELECT * FROM coupons WHERE code = ?').bind(code.trim().toUpperCase()).first<CouponRow>();
  return row ? couponFromRow(row) : null;
}

export function mediaUrl(key: string | null | undefined): string {
  return key ? `/media/${key.split('/').map(encodeURIComponent).join('/')}` : '';
}

/** Public JSON shape for a package (never exposes ai_draft or internal fields). */
export function publicPackage(p: PackageRow, addons: AddonRow[], offers: OfferRow[]) {
  return {
    id: p.id,
    categoryId: p.category_id,
    categorySlug: p.category_slug,
    categoryName: p.category_name,
    slug: p.slug,
    name: p.name,
    tier: p.tier,
    shortDescription: p.short_description,
    description: p.description,
    basePrice: p.base_price,
    deliveryDays: p.delivery_days,
    demoUrl: p.demo_url,
    demoVideo: mediaUrl(p.demo_video_key),
    images: parseJson<string[]>(p.images, []).map(mediaUrl),
    features: parseJson<string[]>(p.features, []),
    status: p.status,
    addons: addons.map((a) => ({ id: a.id, name: a.name, description: a.description, priceDelta: a.price_delta, maxQuantity: a.max_quantity })),
    offers: offers.map(offerFromRow),
  };
}

export type PublicPackage = ReturnType<typeof publicPackage>;

/** Load all visible packages (+addons, offers) optionally for one category. */
export async function loadPublicPackages(env: Env, opts: { categoryId?: number; slug?: string; featuredOnly?: boolean } = {}): Promise<PublicPackage[]> {
  const where: string[] = ["p.status IN ('active','coming_soon')", 'c.is_active = 1'];
  const binds: unknown[] = [];
  if (opts.categoryId) { where.push('p.category_id = ?'); binds.push(opts.categoryId); }
  if (opts.slug) { where.push('p.slug = ?'); binds.push(opts.slug); }
  if (opts.featuredOnly) where.push('p.is_featured = 1');
  const pkgs = (
    await env.DB.prepare(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name FROM packages p JOIN categories c ON c.id = p.category_id WHERE ${where.join(' AND ')} ORDER BY c.sort_order, p.sort_order, p.id`,
    ).bind(...binds).all<PackageRow>()
  ).results;
  if (!pkgs.length) return [];
  const ids = pkgs.map((p) => p.id);
  const catIds = [...new Set(pkgs.map((p) => p.category_id))];
  const ph = (n: number) => Array(n).fill('?').join(',');
  const [ad, of] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM package_addons WHERE is_active = 1 AND package_id IN (${ph(ids.length)}) ORDER BY sort_order, id`).bind(...ids),
    env.DB.prepare(`SELECT * FROM offers WHERE is_active = 1 AND ((scope='package' AND scope_id IN (${ph(ids.length)})) OR (scope='category' AND scope_id IN (${ph(catIds.length)})))`).bind(...ids, ...catIds),
  ]);
  const addons = ad.results as unknown as AddonRow[];
  const offers = of.results as unknown as OfferRow[];
  return pkgs.map((p) =>
    publicPackage(
      p,
      addons.filter((a) => a.package_id === p.id),
      offers.filter((o) => (o.scope === 'package' && o.scope_id === p.id) || (o.scope === 'category' && o.scope_id === p.category_id)),
    ),
  );
}

/** Coupons flagged to be shown on cards, that are live right now. */
export async function visibleCoupons(env: Env): Promise<CouponRow[]> {
  const now = new Date().toISOString();
  return (
    await env.DB.prepare(
      `SELECT * FROM coupons WHERE is_active = 1 AND show_on_card = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (expires_at IS NULL OR expires_at > ?) AND (usage_limit IS NULL OR used_count < usage_limit)`,
    ).bind(now, now).all<CouponRow>()
  ).results;
}
