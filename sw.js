/* Prepline service worker. The same file serves the live site (/preplist-sorter/), the test site
 * (/prepline-test/) and the team site (/prepline-team/); each registers it with its own path as the
 * scope, and its caches are named after that scope, so the sites (same origin) never share or
 * delete each other's caches.
 * Strategy
 *  - App pages (navigations): network first, fresh from the server every time you are online
 *    (revalidated with no-cache), cached copy only when offline or the network takes > 6 s.
 *    So an old index can never be served for ever: the next online load replaces it.
 *  - Pinned CDN libraries (cdnjs xlsx / pdf.js, versioned URLs): cache first.
 *  - Google Fonts, icons, manifest: stale-while-revalidate.
 *  - Anything else (other sites, non-GET): not touched.
 * Updates: a new sw.js installs alongside the old one and WAITS. The page shows
 * "Update available - Reload"; Reload sends SKIP_WAITING, then the page reloads once.
 */
const VERSION = '3.3.3';
const SCOPE_PATH = new URL(self.registration.scope).pathname;   // '/preplist-sorter/', '/prepline-test/' or '/prepline-team/'
// The team site serves every library from itself (no CDN, no Google Fonts): never contact a CDN there.
const NO_CDN = SCOPE_PATH === '/prepline-team/';
const CACHE_PREFIX = 'prepline:' + SCOPE_PATH;                  // e.g. 'prepline:/preplist-sorter/'
const CACHE = CACHE_PREFIX + VERSION;
// 3.3.0 (test site only) used 'prepline-test-<version>'
const LEGACY_PREFIX = SCOPE_PATH === '/prepline-test/' ? 'prepline-test-' : null;
const APP_SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
// Same-site library copies (team site). Precached when present, skipped where absent (404).
const LOCAL_LIBS = ['./lib/xlsx.full.min.js', './lib/pdf.min.js', './lib/pdf.worker.min.js'];
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.min.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL.map(u => new Request(u, {cache: 'reload'})));
    // Same-site library copies: best effort, a 404 on the other sites is simply skipped.
    await Promise.allSettled(LOCAL_LIBS.map(async u => {
      const res = await fetch(new Request(u, {cache: 'reload'}));
      if (res.ok) await cache.put(u, res);
    }));
    // CDN libraries: best effort, so a CDN hiccup never blocks installing the app. Never on the team site.
    if (!NO_CDN) await Promise.allSettled(CDN_LIBS.map(async u => {
      let res;
      try { res = await fetch(u, {mode: 'cors'}); } catch (e) { res = await fetch(u, {mode: 'no-cors'}); }
      if (res && (res.ok || res.type === 'opaque')) await cache.put(u, res);
    }));
  })());
  // No skipWaiting here: the page asks the user first (see SKIP_WAITING below).
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // only this site's own old caches: never the other site's
    await Promise.all(keys.filter(k => k !== CACHE && (k.startsWith(CACHE_PREFIX) || (LEGACY_PREFIX && k.startsWith(LEGACY_PREFIX)))).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({version: VERSION, cache: CACHE});
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirstPage(request){
  const cache = await caches.open(CACHE);
  const url = new URL(request.url); url.hash = '';
  const key = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;   // '/' and '/index.html' share one copy
  const net = fetch(url.href, {cache: 'no-cache', credentials: 'same-origin'}).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  try {
    return await Promise.race([net, timeout(6000)]);
  } catch (e) {
    const hit = await cache.match(key, {ignoreSearch: true}) || await cache.match(SCOPE_PATH + 'index.html');
    if (hit) return hit;
    return net;   // nothing cached: wait for the network after all
  }
}

async function cacheFirst(request){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request.url, res.clone());
  return res;
}

async function staleWhileRevalidate(request){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const net = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => hit || Response.error());
  return hit || net;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(SCOPE_PATH)) return;          // never touch the live app or other paths
    if (req.mode === 'navigate') { event.respondWith(networkFirstPage(req)); return; }
    if (url.pathname === SCOPE_PATH + 'sw.js') return;
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (NO_CDN) return;   // team site: nothing outside the site is ever handled (or requested) here
  if (CDN_LIBS.includes(url.href)) { event.respondWith(cacheFirst(req)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { event.respondWith(staleWhileRevalidate(req)); return; }
  // everything else: straight to the network (no analytics by design)
});
