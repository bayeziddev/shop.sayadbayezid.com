// Service worker: offline page for navigations, and a copy of styles/scripts/images for when there is no network.
// Styles and scripts are always asked from the server first (a cheap "has it changed?" check), so a returning
// visitor never sees a new page with old styles. The first version cached them forever, which is why phones
// kept showing old layouts after updates — the new cache name below deletes that old copy.
const V = 'sb-v2';
const PRECACHE = ['/offline', '/assets/img/favicon.svg'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

const save = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; };

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/offline')));
    return;
  }
  if (/^\/assets\/(css|js)\//.test(u.pathname)) {
    // Network first, revalidating any HTTP-cached copy; the saved copy only when offline.
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => save(e.request, res)).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  if (/^\/assets\/(img|fonts|demos)\//.test(u.pathname)) {
    // Images and fonts rarely change: cache first.
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => save(e.request, res))));
  }
});
