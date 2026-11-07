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

  it('copies course pages with their enrol and ad pages, but never the student area', () => {
    const xml = ['/courses', '/course-category/python', '/course/fb-ads', '/student', '/learn/fb-ads']
      .map((p) => `<url><loc>https://shop.sayadbayezid.com${p}</loc></url>`).join('');
    const paths = pathsFromSitemap(`<urlset>${xml}</urlset>`);
    expect(paths).toEqual(expect.arrayContaining(['/courses', '/course-category/python', '/course/fb-ads', '/enroll/fb-ads', '/lp/course/fb-ads']));
    expect(paths.some((p) => /^\/(student|learn)/.test(p))).toBe(false);
    // No page may become a folder that shadows another page's .html file on GitHub Pages.
    const files = paths.map(fileFor);
    for (const f of files) expect(files.some((g) => g.startsWith(f.replace(/\.html$/, '/')))).toBe(false);
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

describe('service worker', () => {
  it('asks the server first for styles and scripts, and replaces the old forever-cache', async () => {
    const { readFile } = await import('node:fs/promises');
    const sw = await readFile('public/sw.js', 'utf8');
    expect(sw).not.toContain("'sb-v1'"); // a new cache name deletes the copy the first version kept forever
    expect(sw).toMatch(/\(css\|js\)[\s\S]{0,200}fetch\(e\.request, \{ cache: 'no-cache' \}\)/);
    expect(sw).not.toContain("'/assets/css/site.css'"); // no longer pre-cached
  });
});
