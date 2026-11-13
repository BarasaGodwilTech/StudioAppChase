/* Chase X Records service worker
   - app files: network first (new versions apply right away), cached copy when offline
   - song / artist / settings data: network first, cached copy when offline
   - pictures and fonts: shown from the cache at once, refreshed in the background
   - saved songs live in the "cx-audio" cache, which the app manages itself */
const SHELL = 'cx-shell-v3', DATA = 'cx-data', IMG = 'cx-img';
const FILES = ['/', '/styles.css', '/app.js', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cx-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function netFirst(req, cacheName, ms) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms))]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) return hit;
    // slow but not offline: wait for the real answer
    return fetch(req);
  }
}
async function swr(req, cacheName, max) {
  const cache = await caches.open(cacheName), hit = await cache.match(req);
  const net = fetch(req).then(async res => {
    if (res && (res.ok || res.type === 'opaque')) {
      await cache.put(req, res.clone());
      if (max) { const ks = await cache.keys(); if (ks.length > max) await Promise.all(ks.slice(0, ks.length - max).map(k => cache.delete(k))); }
    }
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('range') || !/^https?:$/.test(url.protocol)) return;
  const same = url.origin === location.origin;
  if (same && (url.pathname.startsWith('/admin') || url.pathname.startsWith('/videos/') || /\.(mp4|webm|mov|mp3|m4a|wav|ogg|flac|aac)$/i.test(url.pathname))) return;

  if (same && (url.pathname === '/api/bootstrap' || url.pathname === '/api/config')) { e.respondWith(netFirst(req, DATA, 6000)); return; }
  if (same && url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    if (!same || (url.pathname !== '/' && url.pathname !== '/index.html')) return;
    e.respondWith(netFirst(new Request(location.origin + '/'), SHELL, 4000));
    return;
  }
  if (same && /\.(js|css|webmanifest|json|svg|ico|woff2?)$/i.test(url.pathname)) { e.respondWith(netFirst(req, SHELL, 3000)); return; }
  if (req.destination === 'image' || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(swr(req, IMG, 300)); return; }
});
