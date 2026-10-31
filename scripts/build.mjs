// Build static assets into dist/ (served by the Worker's assets binding).
// - copies public/ → dist/, admin/ → dist/admin/
// - bundles shared/pricing.ts → dist/assets/js/pricing.js (same engine the Worker uses)
// - vendors fonts and Chart.js from node_modules (no third-party CDNs)
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const out = 'dist';
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/assets/fonts`, { recursive: true });
await cp('public', out, { recursive: true });
await cp('admin', `${out}/admin`, { recursive: true });

await build({ entryPoints: ['shared/pricing.ts'], outfile: `${out}/assets/js/pricing.js`, bundle: true, format: 'esm', minify: true, target: 'es2020' });

const fonts = [
  'node_modules/@fontsource-variable/anek-bangla/files/anek-bangla-bengali-wght-normal.woff2',
  'node_modules/@fontsource/hind-siliguri/files/hind-siliguri-bengali-400-normal.woff2',
  'node_modules/@fontsource/hind-siliguri/files/hind-siliguri-bengali-600-normal.woff2',
  'node_modules/@fontsource/hind-siliguri/files/hind-siliguri-latin-400-normal.woff2',
];
for (const f of fonts) {
  if (!existsSync(f)) throw new Error(`missing font ${f}`);
  await copyFile(f, `${out}/assets/fonts/${f.split('/').pop()}`);
}
await mkdir(`${out}/admin/assets/vendor`, { recursive: true });
await copyFile('node_modules/chart.js/dist/chart.umd.min.js', `${out}/admin/assets/vendor/chart.umd.js`);

// Security headers for static assets (the Worker adds them to dynamic responses).
const common = `  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin`;
await writeFile(`${out}/_headers`, `/*
${common}

/admin/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Frame-Options: DENY
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/sw.js
  Cache-Control: no-cache
`);
console.log('built →', out);
