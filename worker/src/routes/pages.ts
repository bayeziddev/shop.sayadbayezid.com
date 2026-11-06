import { Hono, type Context } from 'hono';
import type { AppBindings } from '../env';
import { getSettings } from '../lib/settings';
import { loadPublicPackages, visibleCoupons, mediaUrl, type CategoryRow } from '../lib/catalog';
import { layout, type BannerRow, type PageCtx } from '../views/layout';
import * as V from '../views/pages';
import { liveOffer } from '../views/components';
import { isOfferLive } from '../../../shared/pricing';
import { offerFromRow, type OfferRow } from '../lib/catalog';
import { randomToken, parseJson } from '../lib/util';
import { getOrderByNumber, getOrderItems } from '../lib/orders';
import { verifyPortalToken } from '../lib/portal-token';
import { PAYMENT_METHOD_BN, PAYMENT_STATUS_BN, PROJECT_STATUS_BN, type PaymentMethod, type ProjectStatus, type PaymentStatus } from '../../../shared/status';
import { manualInstructions, availableMethods } from './orders';
import { raw } from '../lib/html';
import type { ReviewView, DesignView, PortfolioView } from '../views/components';
import { titledLines } from '../../../shared/media';
import { whatsappLink } from '../lib/contact-links';
import type { SiteSettings } from '../lib/settings';
import type { Env } from '../env';

export const pages = new Hono<AppBindings>();

async function banners(c: Context<AppBindings>, target: string): Promise<BannerRow[]> {
  const now = new Date().toISOString();
  return (
    await c.env.DB.prepare(
      `SELECT * FROM banners WHERE is_active = 1 AND (target = 'all' OR target = ?) AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?) ORDER BY sort_order, id`,
    ).bind(target, now, now).all<BannerRow>()
  ).results;
}

async function ctx(c: Context<AppBindings>, p: Omit<PageCtx, 'env' | 'settings' | 'path'> & { bannerTarget?: string }): Promise<PageCtx> {
  const [settings, b] = await Promise.all([getSettings(c.env), p.bannerTarget ? banners(c, p.bannerTarget) : Promise.resolve([])]);
  return { ...p, env: c.env, settings, path: new URL(c.req.url).pathname, banners: b };
}

async function approvedReviews(c: Context<AppBindings>, packageId?: number, limit = 6): Promise<ReviewView[]> {
  const q = packageId
    ? c.env.DB.prepare(`SELECT r.*, p.name AS package_name FROM reviews r LEFT JOIN packages p ON p.id = r.package_id WHERE r.status = 'approved' AND r.package_id = ? ORDER BY r.created_at DESC LIMIT ?`).bind(packageId, limit)
    : c.env.DB.prepare(`SELECT r.*, p.name AS package_name FROM reviews r LEFT JOIN packages p ON p.id = r.package_id WHERE r.status = 'approved' ORDER BY r.is_verified DESC, r.created_at DESC LIMIT ?`).bind(limit);
  return (await q.all<ReviewView>()).results;
}

async function designs(env: Env, opts: { packageId?: number; limit?: number } = {}): Promise<DesignView[]> {
  const where = ['d.is_active = 1'];
  const binds: unknown[] = [];
  if (opts.packageId) { where.push('d.package_id = ?'); binds.push(opts.packageId); }
  binds.push(opts.limit || 400);
  return (
    await env.DB.prepare(
      `SELECT d.id, d.kind, d.title, d.image, d.demo_url, d.note, d.package_id, p.slug AS package_slug, p.name AS package_name
       FROM design_samples d LEFT JOIN packages p ON p.id = d.package_id AND p.status IN ('active','coming_soon')
       WHERE ${where.join(' AND ')} ORDER BY d.sort_order, d.id LIMIT ?`,
    ).bind(...binds).all<DesignView>()
  ).results;
}

async function portfolio(env: Env, featuredOnly = false): Promise<PortfolioView[]> {
  return (
    await env.DB.prepare(
      `SELECT w.*, c.name AS category_name, c.slug AS category_slug, p.slug AS package_slug
       FROM portfolio w LEFT JOIN categories c ON c.id = w.category_id LEFT JOIN packages p ON p.id = w.package_id AND p.status = 'active'
       WHERE w.is_active = 1 ${featuredOnly ? 'AND w.is_featured = 1' : ''} ORDER BY w.sort_order, COALESCE(w.delivered_at, w.created_at) DESC`,
    ).all<PortfolioView>()
  ).results;
}

/** Site-wide "why us" list from settings (one point per line: শিরোনাম | বিবরণ). */
const whyUs = (s: SiteSettings) => titledLines(s.why_us || '');

async function whatsapp(env: Env): Promise<string | null> {
  const cs = await env.DB.prepare('SELECT whatsapp_enabled, whatsapp_number, whatsapp_message FROM chat_settings WHERE id = 1').first<{ whatsapp_enabled: number; whatsapp_number: string; whatsapp_message: string }>();
  return cs?.whatsapp_enabled ? whatsappLink(cs.whatsapp_number, cs.whatsapp_message) || null : null;
}

const notFound = async (c: Context<AppBindings>) => {
  const res = layout(await ctx(c, { title: 'পাওয়া যায়নি', pageType: 'notfound', noindex: true }), V.notFoundPage());
  return new Response(res.body, { status: 404, headers: res.headers });
};

pages.get('/', async (c) => {
  const now = Date.now();
  const env = c.env;
  const [cats, featured, coupons, reviews, faqs, stats] = await Promise.all([
    env.DB.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM packages p WHERE p.category_id = c.id AND p.status IN ('active','coming_soon')) AS package_count,
              (SELECT MIN(base_price) FROM packages p WHERE p.category_id = c.id AND p.status = 'active') AS min_price
       FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.id`,
    ).all<CategoryRow & { package_count: number; min_price: number | null }>(),
    loadPublicPackages(env, { featuredOnly: true }),
    visibleCoupons(env),
    approvedReviews(c),
    env.DB.prepare(`SELECT question, answer FROM faqs WHERE is_active = 1 AND scope = 'sitewide' ORDER BY sort_order, id`).all<{ question: string; answer: string }>(),
    // Real numbers only (§21 honesty guardrail).
    env.DB.prepare(
      `SELECT (SELECT COUNT(DISTINCT customer_phone) FROM orders WHERE payment_status = 'paid') AS clients,
              (SELECT COUNT(*) FROM orders WHERE project_status = 'completed') AS completed,
              (SELECT COUNT(*) FROM reviews WHERE status = 'approved') AS reviewCount,
              (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE status = 'approved') AS reviewAvg`,
    ).first<{ clients: number; completed: number; reviewCount: number; reviewAvg: number }>(),
  ]);
  const [settings, ds, works] = await Promise.all([getSettings(env), designs(env, { limit: 60 }), portfolio(env, true)]);
  const prices = cats.results.map((x) => x.min_price).filter((x): x is number => x !== null);
  // A varied teaser: one screen of each kind first (checkout, sidebar, footer…), then the rest.
  const seen = new Set<string>();
  const teaser = [...ds.filter((x) => (seen.has(x.kind) ? false : (seen.add(x.kind), true))), ...ds].filter((x, i, a) => a.indexOf(x) === i);
  return layout(
    await ctx(c, { title: '', pageType: 'home', bannerTarget: 'home', ogImage: featured[0]?.cover }),
    V.homePage({
      settings, categories: cats.results, featured, coupons, reviews, faqs: faqs.results, stats: stats || { clients: 0, completed: 0, reviewCount: 0, reviewAvg: 0 },
      designs: teaser, portfolio: works, whyUs: whyUs(settings), minPrice: prices.length ? Math.min(...prices) : null, now,
    }),
  );
});

pages.get('/category/:slug', async (c) => {
  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1').bind(c.req.param('slug')).first<CategoryRow>();
  if (!cat) return notFound(c);
  const now = Date.now();
  const [pkgs, coupons, offers] = await Promise.all([
    loadPublicPackages(c.env, { categoryId: cat.id }),
    visibleCoupons(c.env),
    c.env.DB.prepare(`SELECT * FROM offers WHERE scope = 'category' AND scope_id = ? AND is_active = 1`).bind(cat.id).all<OfferRow>(),
  ]);
  const catOffer = offers.results.map(offerFromRow).filter((o) => isOfferLive(o, now))[0];
  return layout(await ctx(c, { title: `${cat.name} ওয়েবসাইট`, description: cat.description, pageType: 'category', bannerTarget: 'category' }), V.categoryPage(cat, pkgs, coupons, now, catOffer));
});

pages.get('/package/:slug', async (c) => {
  const [p] = await loadPublicPackages(c.env, { slug: c.req.param('slug') });
  if (!p) return notFound(c);
  const now = Date.now();
  const [coupons, faqs, reviews, settings, ds, wa, sameCat] = await Promise.all([
    visibleCoupons(c.env),
    c.env.DB.prepare(
      `SELECT question, answer FROM faqs WHERE is_active = 1 AND (scope = 'package' AND package_id = ?) ORDER BY sort_order, id`,
    ).bind(p.id).all<{ question: string; answer: string }>(),
    approvedReviews(c, p.id, 12),
    getSettings(c.env),
    designs(c.env, { packageId: p.id, limit: 1 }),
    whatsapp(c.env),
    loadPublicPackages(c.env, { categoryId: p.categoryId }),
  ]);
  // Package FAQs first, then the site-wide ones (so every package page answers the common questions).
  const sitewide = (await c.env.DB.prepare(`SELECT question, answer FROM faqs WHERE is_active = 1 AND scope = 'sitewide' ORDER BY sort_order, id LIMIT 8`).all<{ question: string; answer: string }>()).results;
  const related = sameCat.filter((x) => x.id !== p.id && x.status === 'active').slice(0, 3);
  const eventId = `vc_${randomToken(12)}`;
  return layout(
    await ctx(c, {
      title: p.name,
      description: p.shortDescription,
      pageType: 'package',
      bannerTarget: 'package',
      ogImage: p.cover,
      pageEvent: {
        name: 'ViewContent', eventId,
        customData: { content_ids: [String(p.id)], content_type: 'product', content_name: p.name, content_category: p.categoryName, value: p.basePrice, currency: 'BDT' },
      },
    }),
    V.packagePage(p, { coupons, faqs: [...faqs.results, ...sitewide], reviews, now, whyUs: whyUs(settings), designs: ds, related, whatsapp: wa }),
  );
});

pages.get('/packages', async (c) => {
  const now = Date.now();
  const [pkgs, coupons] = await Promise.all([loadPublicPackages(c.env), visibleCoupons(c.env)]);
  return layout(
    await ctx(c, { title: 'সব রেডি ওয়েবসাইট', description: 'লাইভ ডেমোসহ সব রেডি ওয়েবসাইট প্যাকেজ — দাম, ফিচার ও ডেলিভারির সময় এক জায়গায়।', pageType: 'category', bannerTarget: 'category', ogImage: pkgs[0]?.cover }),
    V.packagesPage(pkgs, coupons, now),
  );
});

pages.get('/portfolio', async (c) => {
  const works = await portfolio(c.env);
  return layout(
    await ctx(c, { title: 'সফল ডেলিভারি', description: 'আমাদের ক্লায়েন্টদের জন্য তৈরি ও ডেলিভারি করা সব ওয়েবসাইট।', pageType: 'static', bannerTarget: 'all', ogImage: works[0]?.cover_image ? mediaUrl(works[0].cover_image) : undefined }),
    V.portfolioPage(works),
  );
});

pages.get('/designs', async (c) => {
  const ds = await designs(c.env);
  const kind = (c.req.query('kind') || '').replace(/[^a-z]/g, '');
  return layout(
    await ctx(c, { title: 'ডিজাইন গ্যালারি', description: 'চেকআউট, সাইডবার, ফুটার, হেডার ও পণ্যের পেজের ডিজাইন — আমাদের তৈরি আসল সাইট থেকে।', pageType: 'static', bannerTarget: 'all', ogImage: ds[0] ? mediaUrl(ds[0].image) : undefined }),
    V.designsPage(ds, kind),
  );
});

pages.get('/checkout', async (c) => {
  const s = await getSettings(c.env);
  return layout(await ctx(c, { title: 'চেকআউট', pageType: 'checkout', noindex: true }), V.checkoutPage(s, availableMethods(c.env, s)));
});
pages.get('/cart', (c) => c.redirect('/checkout', 301));

pages.get('/order/:no', async (c) => {
  const no = c.req.param('no');
  const token = c.req.query('t') || '';
  const order = await getOrderByNumber(c.env, no);
  if (!order || !(await verifyPortalToken(c.env, no, token))) return notFound(c);
  const s = await getSettings(c.env);
  const items = await getOrderItems(c.env, order.id);
  const paid = order.payment_status === 'paid';
  const manual = !paid ? manualInstructions(c.env, order.payment_method as PaymentMethod, s, order.total, order.order_number) : null;
  return layout(
    await ctx(c, {
      title: `অর্ডার ${order.order_number}`,
      pageType: 'order',
      noindex: true,
      // Browser Purchase pixel only for real confirmed payments; same event_id as the server-side CAPI Purchase.
      purchaseEvent: paid ? { eventId: order.purchase_event_id, value: order.paid_amount ?? order.total, contentIds: items.map((i) => String(i.package_id)), orderNumber: order.order_number } : undefined,
    }),
    V.orderPage(order, token, {
      statusLabel: PROJECT_STATUS_BN[order.project_status as ProjectStatus] || order.project_status,
      paymentLabel: PAYMENT_STATUS_BN[order.payment_status as PaymentStatus] || order.payment_status,
      methodLabel: PAYMENT_METHOD_BN[order.payment_method as PaymentMethod] || order.payment_method,
      manual,
      cancelled: c.req.query('r') === 'fail' || c.req.query('r') === 'cancel' || c.req.query('cancelled') === '1',
    }),
  );
});

pages.get('/portal/:no', async (c) => {
  const no = c.req.param('no');
  if (!(await verifyPortalToken(c.env, no, c.req.query('t')))) return notFound(c);
  return layout(await ctx(c, { title: 'প্রজেক্ট পোর্টাল', pageType: 'portal', noindex: true }), V.portalPage());
});

pages.get('/account', async (c) => layout(await ctx(c, { title: 'আমার অর্ডার', pageType: 'static', noindex: true }), V.accountPage()));

const staticPages: Record<string, { key: 'page_about' | 'page_refund' | 'page_terms' | 'page_privacy'; title: string }> = {
  '/about': { key: 'page_about', title: 'আমাদের সম্পর্কে' },
  '/refund-policy': { key: 'page_refund', title: 'রিফান্ড নীতি' },
  '/terms': { key: 'page_terms', title: 'শর্তাবলি' },
  '/privacy': { key: 'page_privacy', title: 'গোপনীয়তা নীতি' },
};
for (const [path, def] of Object.entries(staticPages)) {
  pages.get(path, async (c) => {
    const s = await getSettings(c.env);
    return layout(await ctx(c, { title: def.title, pageType: 'static', bannerTarget: 'all' }), V.staticPage(def.title, s[def.key]));
  });
}

pages.get('/faq', async (c) => {
  const faqs = await c.env.DB.prepare(`SELECT question, answer FROM faqs WHERE is_active = 1 AND scope = 'sitewide' ORDER BY sort_order, id`).all<{ question: string; answer: string }>();
  return layout(await ctx(c, { title: 'প্রশ্নোত্তর', pageType: 'static', bannerTarget: 'all' }), V.faqPage(faqs.results));
});

pages.get('/contact', async (c) => layout(await ctx(c, { title: 'যোগাযোগ', pageType: 'static', bannerTarget: 'all' }), V.contactPage(await getSettings(c.env))));

pages.get('/quote', async (c) => {
  const slug = c.req.query('package');
  const p = slug ? await c.env.DB.prepare('SELECT id, name FROM packages WHERE slug = ?').bind(slug).first<{ id: number; name: string }>() : null;
  return layout(await ctx(c, { title: 'কাস্টম কোটেশন', pageType: 'static' }), V.quotePage(p?.name ?? null, p?.id));
});

pages.get('/quiz', async (c) => layout(await ctx(c, { title: 'প্যাকেজ বাছাই কুইজ', pageType: 'quiz' }), V.quizPage(await loadPublicPackages(c.env))));

pages.get('/lp/:slug', async (c) => {
  const lp = await c.env.DB.prepare(`SELECT * FROM landing_pages WHERE slug = ? AND status = 'published'`).bind(c.req.param('slug')).first<{ id: number; title: string; blocks: string; seo_title: string; seo_description: string }>();
  if (!lp) return notFound(c);
  const now = Date.now();
  const [packages, coupons, reviews] = await Promise.all([loadPublicPackages(c.env), visibleCoupons(c.env), approvedReviews(c, undefined, 6)]);
  return layout(
    await ctx(c, { title: lp.seo_title || lp.title, description: lp.seo_description, pageType: 'landing', bannerTarget: 'landing', landingPageId: lp.id, hideChrome: true }),
    V.landingPage(lp, parseJson<V.LPBlock[]>(lp.blocks, []), { packages, coupons, reviews, now }),
  );
});

pages.get('/offline', async (c) => layout(await ctx(c, { title: 'অফলাইন', pageType: 'static', noindex: true }), raw('<section class="section"><div class="container narrow center"><h1>আপনি অফলাইনে আছেন</h1><p class="muted">ইন্টারনেট সংযোগ ফিরে এলে পেজটি আবার লোড করুন।</p></div></section>')));

export { notFound };
