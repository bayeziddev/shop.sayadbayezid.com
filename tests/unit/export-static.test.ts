import { describe, expect, it } from 'vitest';
import { fileFor, keepAsset, pathsFromSitemap, rewriteHtml } from '../../scripts/export-static.mjs';

describe('static export for GitHub Pages', () => {
  it('maps paths to files GitHub Pages serves without redirects', () => {
    expect(fileFor('/')).toBe('index.html');
    expect(fileFor('/package/fashion-premium')).toBe('package/fashion-premium.html');
    expect(fileFor('/lp/eid-2026/')).toBe('lp/eid-2026.html');
  });

  it('copies public pages only — never admin, order, portal, invoice, payments or API', () => {
    const xml = ['/', '/faq', '/category/fashion', '/package/blog-basic', '/lp/eid', '/admin/', '/order/ORD-1', '/portal/ORD-1']
      .map((p) => `<url><loc>https://shop.sayadbayezid.com${p}</loc></url>`).join('');
    const paths = pathsFromSitemap(`<urlset>${xml}</urlset>`);
    expect(paths).toEqual(expect.arrayContaining(['/', '/faq', '/category/fashion', '/package/blog-basic', '/lp/eid', '/checkout', '/account']));
    expect(paths.some((p) => /^\/(admin|order|portal)/.test(p))).toBe(false);
  });

  it('never publishes the admin app or the Worker headers file', () => {
    for (const p of ['dist/admin', 'dist/admin/index.html', 'dist/_headers', '/home/x/dist/admin/assets/js/main.js']) expect(keepAsset(p)).toBe(false);
    for (const p of ['dist', 'dist/assets/css/site.css', 'dist/sw.js', 'dist/assets/js/app.js']) expect(keepAsset(p)).toBe(true);
  });

  it('loads uploaded images from the Worker', () => {
    const html = `<img src="/media/public/a.webp"><video poster='/media/public/b.jpg'></video><script type="application/json">{"images":["/media/public/c.png"]}</script><a href="/package/x">`;
    const out = rewriteHtml(html, 'https://cwb-agency.x.workers.dev/');
    expect(out).toContain('src="https://cwb-agency.x.workers.dev/media/public/a.webp"');
    expect(out).toContain("poster='https://cwb-agency.x.workers.dev/media/public/b.jpg'");
    expect(out).toContain('"https://cwb-agency.x.workers.dev/media/public/c.png"');
    expect(out).toContain('href="/package/x"'); // page links stay on the GitHub Pages domain
  });
});
