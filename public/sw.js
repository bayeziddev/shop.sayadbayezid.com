// Minimal service worker: cache static assets, offline fallback for navigations. API calls are never cached.
const V = 'sb-v1';
const ASSETS = ['/assets/css/site.css', '/assets/js/app.js', '/assets/js/lib.js', '/assets/js/track.js', '/assets/js/theme.js', '/assets/img/favicon.svg', '/offline'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/offline')));
    return;
  }
  if (u.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put(e.request, copy)); return res; })));
  }
});
