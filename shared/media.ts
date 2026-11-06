/**
 * Media helpers shared by the Worker (rendering) and tests.
 * Every media field accepts either an uploaded R2 key ("public/2026-11/abc.webp") or any https URL.
 */
export type VideoSource =
  | { kind: 'youtube'; id: string; thumb: string; embed: string }
  | { kind: 'vimeo'; id: string; embed: string }
  | { kind: 'facebook'; embed: string }
  | { kind: 'drive'; embed: string }
  | { kind: 'file'; src: string }
  | { kind: 'link'; href: string };

export const isHttpUrl = (v: string) => /^https?:\/\//i.test(v.trim());

/** R2 key → /media/… ; absolute URL or site path (/assets/…) → itself ; anything else → '' */
export function mediaSrc(v: string | null | undefined): string {
  const s = String(v || '').trim();
  if (!s) return '';
  if (isHttpUrl(s)) return s;
  if (s.startsWith('/')) return /^\/[\w./%-]+$/.test(s) && !s.startsWith('//') && !s.includes('..') ? s : '';
  if (/^[\w./-]+$/.test(s) && !s.includes('..')) return `/media/${s.split('/').map(encodeURIComponent).join('/')}`;
  return '';
}

const YT_ID = /^[\w-]{11}$/;

/** Recognise YouTube (watch, youtu.be, shorts, embed, live), Vimeo, Facebook, Google Drive, direct files or uploads. */
export function parseVideo(input: string | null | undefined): VideoSource | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (!isHttpUrl(raw)) {
    const src = mediaSrc(raw); // uploaded file (R2 key)
    return src ? { kind: 'file', src } : null;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let yt = '';
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    yt = u.searchParams.get('v') || '';
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (!yt && m) yt = m[2];
  }
  if (yt && YT_ID.test(yt)) {
    return { kind: 'youtube', id: yt, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/(\d{6,})/)?.[1];
    if (id) return { kind: 'vimeo', id, embed: `https://player.vimeo.com/video/${id}?autoplay=1` };
  }
  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    return { kind: 'facebook', embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false&autoplay=true` };
  }
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get('id');
    if (id) return { kind: 'drive', embed: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname)) return { kind: 'file', src: raw };
  return { kind: 'link', href: raw };
}

/** Bangla label for the admin preview. */
export function videoKindLabel(v: VideoSource | null): string {
  if (!v) return 'ভিডিও নেই';
  return { youtube: 'ইউটিউব', vimeo: 'ভিমিও', facebook: 'ফেসবুক', drive: 'গুগল ড্রাইভ', file: 'ভিডিও ফাইল', link: 'বাইরের লিংক' }[v.kind];
}

/** "শিরোনাম | বিবরণ" lines → [{title, text}] */
export function titledLines(lines: string[] | string): { title: string; text: string }[] {
  const arr = Array.isArray(lines) ? lines : String(lines || '').split('\n');
  return arr
    .map((l) => String(l).trim())
    .filter(Boolean)
    .map((l) => {
      const [title, ...rest] = l.split('|');
      return { title: title.trim(), text: rest.join('|').trim() };
    });
}
