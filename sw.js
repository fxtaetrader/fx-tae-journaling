/* FX TAE Charts - service worker
   - App shell is cached so the app opens instantly and works as an installed app.
   - Pages are fetched network-first, so new versions you upload show up on next open.
   - Firebase / Firestore / Auth traffic is never intercepted or cached. */
const VERSION = 'fxtae-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com', 'images.unsplash.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(SHELL.map(u => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(res) {
  return res && (res.ok || res.type === 'opaque');
}

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then(cache =>
    cache.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (cacheable(res)) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
}

function networkFirstPage(req) {
  return caches.open(VERSION).then(cache => {
    const fallback = () => cache.match(req).then(h => h || cache.match('./index.html') || cache.match('./'));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);   // slow connection -> use the cached copy
    return fetch(req, { signal: ctrl.signal }).then(res => {
      clearTimeout(timer);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => { clearTimeout(timer); return fallback(); });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.indexOf('/__/') === 0) return;                 // Firebase Hosting auth helpers
  if (req.mode === 'navigate') { event.respondWith(networkFirstPage(req)); return; }
  if (url.origin === self.location.origin) { event.respondWith(staleWhileRevalidate(req)); return; }
  if (CDN_HOSTS.indexOf(url.hostname) >= 0) { event.respondWith(staleWhileRevalidate(req)); return; }
  // everything else (firestore.googleapis.com, identitytoolkit, securetoken, accounts.google.com, ...) goes straight to the network
});
