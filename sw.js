/* FockNote service worker.
 * Strategy:
 *  - Precache the app shell + the vendored Sveltia bundle (same-origin) so the
 *    editor loads offline.
 *  - Same-origin GETs: cache-first, fall back to network, then cache the result.
 *  - Cross-origin (api.github.com, avatars, …): NOT intercepted — Sveltia's data
 *    layer talks straight to GitHub over the network; we never cache reads/writes.
 * Bump CACHE when the vendored bundle is re-vendored to evict the old one.
 */
const CACHE = 'focknote-v10-sveltia-0.166.3';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './read/',
  './read/index.html',
  './read/reader.css',
  './read/reader.js',
  './read/vendor/marked.esm.js',
  './read/vendor/turndown.browser.es.js',
  './admin/',
  './admin/index.html',
  './admin/sveltia-cms.js',
  './admin/config.yml',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Let everything cross-origin (GitHub API, avatars, media CDN) hit the network untouched.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    // ignoreSearch so Sveltia's cache-busted config.yml?... still hits the precache.
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((resp) => {
          if (resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => {
          // Offline navigation → fall back to the cached app shell.
          if (request.mode === 'navigate') return caches.match('./admin/');
          return Response.error();
        });
    })
  );
});
