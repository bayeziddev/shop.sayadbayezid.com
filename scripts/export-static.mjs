#!/usr/bin/env node
/**
 * Static storefront export for GitHub Pages.
 *
 * The Cloudflare Worker stays the backend (Hono API, payments, admin, client portal, invoices, images).
 * This script saves a static copy of the PUBLIC pages from the live Worker into ./site so GitHub Pages
 * can serve them on a domain whose DNS lives elsewhere (e.g. shop.sayadbayezid.com at Hostinger:
 * one CNAME record `shop → <user>.github.io`).
 *
 * In the copied pages, the browser JS sends every /api/* call to the Worker (meta sb-api-base) and
 * images are loaded from the Worker; the Worker allows that origin via CORS (PUBLIC_SITE_URL).
 *
 * Env: WORKER_URL (required)  e.g. https://cwb-agency.<subdomain>.workers.dev
 *      PAGES_DOMAIN (required) e.g. shop.sayadbayezid.com
 *      OUT_DIR (optional, default "site")
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pages that only make sense on the Worker (private links, server work) are never copied. */
const BACKEND_ONLY = /^\/(admin|api|order|portal|invoice|payments|media)(\/|$)/;

/** The admin app and the Worker's _headers file stay on the Worker only. */
export const keepAsset = (src) => !/(^|[\\/])dist[\\/](admin|_headers)([\\/]|$)/.test(src);

/** Point Worker-only resources (uploaded images/videos) at the Worker. */
export function rewriteHtml(html, workerUrl) {
  const base = workerUrl.replace(/\/$/, '');
  return html.replace(/(["'(])\/media\//g, `$1${base}/media/`);
}

/** "/" → index.html, "/package/x" → package/x.html (GitHub Pages serves it at /package/x). */
export function fileFor(path) {
  const clean = path.split('?')[0].replace(/\/+$/, '');
  return clean === '' ? 'index.html' : `${clean.replace(/^\//, '')}.html`;
}

/** Paths to copy: everything in the Worker's sitemap plus the pages that work fully through the API. */
export function pathsFromSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const all = new Set(['/', ...locs, '/checkout', '/account']);
  return [...all].filter((p) => !BACKEND_ONLY.test(p));
}

export async function exportSite({ workerUrl, pagesDomain, outDir = 'site', fetchImpl = fetch, log = console.log }) {
  if (!workerUrl) throw new Error('WORKER_URL is not set');
  if (!pagesDomain) throw new Error('PAGES_DOMAIN is not set');
  const base = workerUrl.replace(/\/$/, '');
  const get = async (path) => {
    const res = await fetchImpl(base + path, { headers: { 'user-agent': 'cwb-static-export' }, redirect: 'manual' });
    return { status: res.status, text: await res.text() };
  };

  // The Worker must already know about the GitHub Pages domain, otherwise the copied pages cannot call its API.
  const home = await get('/');
  if (home.status !== 200) throw new Error(`${base}/ returned HTTP ${home.status} — deploy the Worker first.`);
  if (!home.text.includes('name="sb-api-base"')) {
    throw new Error(
      `The Worker at ${base} is not configured for GitHub Pages yet (no PUBLIC_SITE_URL). ` +
        'Set the GitHub variable PAGES_DOMAIN and re-run the "Deploy to Cloudflare Workers" workflow first.',
    );
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  // Static assets (CSS, JS, fonts, icons, service worker, manifest) — not the admin app or Worker headers file.
  await cp('dist', outDir, { recursive: true, filter: keepAsset });

  const sitemap = await get('/sitemap.xml');
  const paths = pathsFromSitemap(sitemap.status === 200 ? sitemap.text : '');
  let ok = 0;
  const failed = [];
  for (const path of paths) {
    const page = path === '/' ? home : await get(path);
    if (page.status !== 200) {
      failed.push(`${path} (HTTP ${page.status})`);
      continue;
    }
    const file = join(outDir, fileFor(path));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, rewriteHtml(page.text, base));
    ok++;
  }
  const notFound = await get('/__page_not_found__');
  await writeFile(join(outDir, '404.html'), rewriteHtml(notFound.text, base));
  if (sitemap.status === 200) await writeFile(join(outDir, 'sitemap.xml'), sitemap.text);
  const robots = await get('/robots.txt');
  if (robots.status === 200) await writeFile(join(outDir, 'robots.txt'), robots.text);
  await writeFile(join(outDir, 'CNAME'), `${pagesDomain}\n`);
  await writeFile(join(outDir, '.nojekyll'), '');

  log(`Exported ${ok} pages from ${base} for https://${pagesDomain}`);
  if (failed.length) log(`::warning::Skipped ${failed.length} page(s): ${failed.join(', ')}`);
  return { ok, failed, paths };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  exportSite({ workerUrl: process.env.WORKER_URL, pagesDomain: (process.env.PAGES_DOMAIN || '').trim(), outDir: process.env.OUT_DIR || 'site' }).catch((e) => {
    console.log(`::error title=Static export::${e.message}`);
    process.exit(1);
  });
}
