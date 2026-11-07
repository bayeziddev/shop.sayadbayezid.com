import type { Env } from '../env';
import type { CouponInput, OfferInput, PricingPackage } from '../../../shared/pricing';
import { parseJson } from './util';
import { mediaSrc, parseVideo, titledLines, isHttpUrl } from '../../../shared/media';

export interface CategoryRow {
  id: number; slug: string; name: string; description: string; icon: string; image_key: string | null;
  is_active: number; sort_order: number;
}
export interface PackageRow {
  id: number; category_id: number; slug: string; name: string; tier: string; short_description: string;
  description: string; base_price: number; delivery_days: number; demo_url: string; demo_video_key: string | null;
  images: string; features: string; status: 'active' | 'inactive' | 'coming_soon'; is_featured: number; sort_order: number;
  ai_draft: string | null; category_slug?: string; category_name?: string;
  cover_image?: string; video_url?: string; solution?: string; benefits?: string; why_us?: string; demo_links?: string; demo_login?: string;
  feature_groups?: string; screen_tour?: string;
  problems?: string; how_it_works?: string; profit_points?: string; roi_profit?: number; roi_orders?: number;
}

/** "A থেকে Z সব ফিচার": [{title, items[]}] (empty groups/items dropped). */
export function featureGroups(json: string | undefined): { title: string; items: string[] }[] {
  return parseJson<{ title?: unknown; items?: unknown }[]>(json, [])
    .filter((g) => g && typeof g.title === 'string' && Array.isArray(g.items))
    .map((g) => ({ title: String(g.title).slice(0, 120), items: (g.items as unknown[]).map((i) => String(i).slice(0, 300)).filter(Boolean).slice(0, 40) }))
    .filter((g) => g.title && g.items.length)
    .slice(0, 12);
}

/** Screenshot feature tour: [{image, title, text}] — only entries whose image is an upload, site path or https link. */
export function screenTour(json: string | undefined): { image: string; title: string; text: string }[] {
  return parseJson<{ image?: unknown; title?: unknown; text?: unknown }[]>(json, [])
    .map((t) => ({ image: mediaSrc(String(t?.image || '')), title: String(t?.title || '').slice(0, 120), text: String(t?.text || '').slice(0, 1000) }))
    .filter((t) => t.image && t.title)
    .slice(0, 24);
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
  return mediaSrc(key);
}

/** Extra demo buttons (admin panel, seller panel…). Only http(s) links survive. */
export function demoLinks(json: string | undefined): { label: string; url: string }[] {
  return parseJson<{ label?: string; url?: string }[]>(json, [])
    .filter((l) => l && typeof l.url === 'string' && isHttpUrl(l.url))
    .map((l) => ({ label: String(l.label || 'ডেমো').slice(0, 60), url: String(l.url) }))
    .slice(0, 6);
}

/** Public JSON shape for a package (never exposes ai_draft or internal fields). */
export function publicPackage(p: PackageRow, addons: AddonRow[], offers: OfferRow[]) {
  const images = parseJson<string[]>(p.images, []).map(mediaSrc).filter(Boolean);
  const video = parseVideo(p.video_url || p.demo_video_key);
  const cover = mediaSrc(p.cover_image) || images[0] || (video?.kind === 'youtube' ? video.thumb : '');
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
    demoLinks: demoLinks(p.demo_links),
    demoLogin: p.demo_login || '',
    cover,
    /** Inline autoplay loop only for uploaded/direct video files (YouTube etc. open in a player on click). */
    demoVideo: video?.kind === 'file' ? video.src : '',
    video,
    images,
    features: parseJson<string[]>(p.features, []),
    solution: p.solution || '',
    benefits: titledLines(parseJson<string[]>(p.benefits, [])),
    /** "সমস্যা | সমাধান" pairs — the client's problem and how this site removes it. */
    problems: titledLines(parseJson<string[]>(p.problems, [])).slice(0, 12),
    /** "ধাপ | কী হয়" — how a normal order flows with this site. */
    how: titledLines(parseJson<string[]>(p.how_it_works, [])).slice(0, 10),
    /** "লাভের উৎস | ব্যাখ্যা" — where the money comes from. */
    profit: titledLines(parseJson<string[]>(p.profit_points, [])).slice(0, 10),
    /** Starting values for the cost-recovery calculator (0 = no calculator). */
    roi: { profit: Math.max(0, Math.round(p.roi_profit || 0)), orders: Math.max(0, Math.round(p.roi_orders || 0)) },
    whyUs: titledLines(parseJson<string[]>(p.why_us, [])),
    featureGroups: featureGroups(p.feature_groups),
    tour: screenTour(p.screen_tour),
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
