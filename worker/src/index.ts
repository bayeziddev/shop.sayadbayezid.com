import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings, Env } from './env';
import { pages, notFound } from './routes/pages';
import { orders } from './routes/orders';
import { publicApi } from './routes/public-api';
import { portal } from './routes/portal';
import { admin } from './routes/admin';
import { runScheduled } from './lib/cron';
import { randomToken, publicOrigin, isSplit } from './lib/util';
import { cors } from 'hono/cors';

const app = new Hono<AppBindings>();

const CSP_SITE = [
  "default-src 'self'",
  // Inline scripts are needed by Google Tag Manager custom tags; every value we render is escaped server-side.
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://www.facebook.com https://connect.facebook.net https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms",
  "frame-src https://www.googletagmanager.com https://www.facebook.com",
  "form-action 'self' https://*.sslcommerz.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  'upgrade-insecure-requests',
].join('; ');

app.use('*', async (c, next) => {
  c.set('requestId', randomToken(8));
  const url = new URL(c.req.url);
  // Canonical host + HTTPS
  if (c.env.APP_ENV === 'production' && url.protocol === 'http:') return c.redirect(url.toString().replace('http:', 'https:'), 301);
  // www.<domain> → <domain> (one canonical host for SEO and cookies) when SITE_URL is the bare domain.
  const site = new URL(c.env.SITE_URL);
  if (url.hostname === `www.${site.hostname}`) return c.redirect(`${site.origin}${url.pathname}${url.search}`, 301);
  await next();
  const h = c.res.headers;
  h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  h.set('cross-origin-opener-policy', 'same-origin-allow-popups');
  if (!h.has('content-security-policy') && (h.get('content-type') || '').includes('text/html')) h.set('content-security-policy', CSP_SITE);
  // When GitHub Pages serves the public copy, keep search engines on that domain only.
  if (isSplit(c.env) && (h.get('content-type') || '').includes('text/html')) h.set('x-robots-tag', 'noindex');
  if (url.pathname.startsWith('/api/')) h.set('cache-control', h.get('cache-control') || 'no-store');
  return undefined;
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Unhandled', c.get('requestId'), err);
  return c.json({ ok: false, error: 'সার্ভারে একটি সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', requestId: c.get('requestId') }, 500);
});

app.get('/healthz', (c) => c.json({ ok: true }));

/**
 * CORS: when the storefront is a static copy on GitHub Pages (PUBLIC_SITE_URL), its browser JS calls
 * this Worker's public API. Only that origin is allowed, never for /api/admin (admin stays same-origin).
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/admin') || !isSplit(c.env)) return next();
  return cors({
    origin: (o) => (o === publicOrigin(c.env) ? o : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-portal-token'],
    maxAge: 86400,
  })(c, next);
});

app.route('/api/admin', admin);
app.route('/', publicApi);
app.route('/', orders);
app.route('/', portal);
app.route('/', pages);

/** Public media from R2 (screenshots, demo clips). Private client files are never served here. */
app.get('/media/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.slice('/media/'.length));
  if (!key.startsWith('public/') || key.includes('..')) return c.notFound();
  const range = c.req.header('range');
  if (!c.env.MEDIA) return c.notFound();
  const obj = await c.env.MEDIA.get(key, range ? { range: c.req.raw.headers } : undefined);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('accept-ranges', 'bytes');
  if (range && 'range' in obj && obj.range) {
    const r = obj.range as { offset: number; length: number };
    headers.set('content-range', `bytes ${r.offset}-${r.offset + r.length - 1}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { headers });
});

app.get('/robots.txt', (c) => c.text(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /portal/\nDisallow: /order/\nDisallow: /invoice/\nSitemap: ${publicOrigin(c.env)}/sitemap.xml\n`));

app.get('/sitemap.xml', async (c) => {
  const [cats, pkgs, lps] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT slug, updated_at FROM categories WHERE is_active = 1'),
    c.env.DB.prepare("SELECT slug, updated_at FROM packages WHERE status IN ('active','coming_soon')"),
    c.env.DB.prepare("SELECT slug, updated_at FROM landing_pages WHERE status = 'published'"),
  ]);
  const u = (p: string, d?: string) => `<url><loc>${publicOrigin(c.env)}${p}</loc>${d ? `<lastmod>${d.slice(0, 10)}</lastmod>` : ''}</url>`;
  const list = [
    u('/'), u('/faq'), u('/about'), u('/contact'), u('/quiz'), u('/quote'), u('/refund-policy'), u('/terms'), u('/privacy'),
    ...(cats.results as { slug: string; updated_at: string }[]).map((r) => u(`/category/${r.slug}`, r.updated_at)),
    ...(pkgs.results as { slug: string; updated_at: string }[]).map((r) => u(`/package/${r.slug}`, r.updated_at)),
    ...(lps.results as { slug: string; updated_at: string }[]).map((r) => u(`/lp/${r.slug}`, r.updated_at)),
  ];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${list.join('')}</urlset>`, 200, { 'content-type': 'application/xml' });
});

app.notFound(async (c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) return c.json({ ok: false, error: 'পাওয়া যায়নি' }, 404);
  // Static assets (public/, admin/) are served by the assets binding before the Worker runs; anything else is a 404 page.
  return notFound(c);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env));
  },
} satisfies ExportedHandler<Env>;

export { app };
