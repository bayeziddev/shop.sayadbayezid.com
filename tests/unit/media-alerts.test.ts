import { describe, expect, it } from 'vitest';
import { mediaSrc, parseVideo, titledLines } from '../../shared/media';
import { leadAlertText } from '../../worker/src/lib/notify';
import { BOT_UA } from '../../worker/src/lib/meta-capi';
import { adminRedirectHtml } from '../../scripts/export-static.mjs';

describe('media fields accept uploads and any link', () => {
  it('maps uploads to /media, keeps links and site paths, refuses anything else', () => {
    expect(mediaSrc('public/2026-11/a.webp')).toBe('/media/public/2026-11/a.webp');
    expect(mediaSrc('public/a b.webp')).toBe(''); // upload keys never contain spaces
    expect(mediaSrc('https://cdn.example.com/x.jpg')).toBe('https://cdn.example.com/x.jpg');
    expect(mediaSrc('/assets/demos/gadget-market/cover.webp')).toBe('/assets/demos/gadget-market/cover.webp');
    for (const bad of ['javascript:alert(1)', '//evil.example/x', '../secret', '/a/../b', '"><script>']) expect(mediaSrc(bad), bad).toBe('');
  });

  it('recognises YouTube, Vimeo, Facebook, Google Drive, files and plain links', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=3', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x']) {
      const v = parseVideo(u);
      expect(v?.kind, u).toBe('youtube');
      expect(v && 'embed' in v && v.embed).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    }
    expect(parseVideo('https://vimeo.com/76979871')?.kind).toBe('vimeo');
    expect(parseVideo('https://www.facebook.com/page/videos/123456789/')?.kind).toBe('facebook');
    expect(parseVideo('https://drive.google.com/file/d/1AbC-dEf/view?usp=sharing')).toEqual({ kind: 'drive', embed: 'https://drive.google.com/file/d/1AbC-dEf/preview' });
    expect(parseVideo('public/2026-11/demo.mp4')).toEqual({ kind: 'file', src: '/media/public/2026-11/demo.mp4' });
    expect(parseVideo('https://example.com/watch/42')?.kind).toBe('link');
    expect(parseVideo('')).toBeNull();
  });

  it('reads "title | text" lines', () => {
    expect(titledLines(['দ্রুত | ২ সেকেন্ডে লোড', 'শুধু শিরোনাম'])).toEqual([{ title: 'দ্রুত', text: '২ সেকেন্ডে লোড' }, { title: 'শুধু শিরোনাম', text: '' }]);
  });
});

describe('instant lead alerts', () => {
  it('gives the team everything plus a one-tap WhatsApp reply link', () => {
    const t = leadAlertText({ id: 7, name: 'করিম', phone: '8801712345678', source: 'leadbox', sourceLabel: 'লিড বক্স', answers: [['ওয়েবসাইটের ধরন', 'ই-কমার্স']], message: '', campaign: 'facebook / nov', pageUrl: 'https://shop.example.com/', internal: false }, 'https://w.example/admin/#/leads/7');
    expect(t).toContain('🔔 নতুন লিড — লিড বক্স');
    expect(t).toContain('ওয়েবসাইটের ধরন: ই-কমার্স');
    expect(t).toContain('https://wa.me/8801712345678');
    expect(t).toContain('https://w.example/admin/#/leads/7');
  });

  it('marks the owner\'s own test leads', () => {
    expect(leadAlertText({ id: 1, name: 'x', phone: '01712345678', source: 'contact', sourceLabel: 'যোগাযোগ ফর্ম', answers: [], message: 'hi', campaign: '', pageUrl: '', internal: true }, 'u')).toContain('🧪 টেস্ট লিড');
  });
});

describe('bot filter for server events', () => {
  it('skips crawlers and headless browsers but keeps real phones (even a "Cubot")', () => {
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'facebookexternalhit/1.1', 'Mozilla/5.0 (X11) HeadlessChrome/120', 'curl/8.0']) expect(BOT_UA.test(ua), ua).toBe(true);
    for (const ua of ['Mozilla/5.0 (Linux; Android 11; CUBOT P50) Chrome/120 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) [FBAN/FBIOS;FBAV/450.0]']) expect(BOT_UA.test(ua), ua).toBe(false);
  });
});

describe('admin address on the GitHub Pages domain', () => {
  it('forwards /admin/ to the Worker admin', () => {
    const h = adminRedirectHtml('https://cwb-agency.x.workers.dev/');
    expect(h).toContain('url=https://cwb-agency.x.workers.dev/admin/');
    expect(h).toContain('noindex');
  });
});
