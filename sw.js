/* Bump VERSION whenever a release changes any packaged asset. */
'use strict';
const VERSION = 'storytouch-shell-v1.0.0';
const CACHE = VERSION + ':' + self.registration.scope;
const SHELL = [
  './', './index.html', './styles.css', './core.js', './storage.js', './app.js',
  './manifest.webmanifest', './README.html', './README.md', './assets/icons/storytouch.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png', './assets/audio/hello.wav', './assets/audio/chimes.wav', './assets/audio/rain.wav'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  // No skipWaiting: a new release waits until old app tabs close.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Scope in the cache name prevents one subfolder app from clearing another's shell.
    for (const key of await caches.keys()) {
      if (key.startsWith('storytouch-shell-') && key.endsWith(':' + self.registration.scope) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navigations always use the consistent cached shell, including #tag links.
    if (event.request.mode === 'navigate') {
      const page = await cache.match(event.request, { ignoreSearch: true });
      if (page) return page;
      return (await cache.match(new URL('./index.html', self.registration.scope))) || fetch(event.request);
    }
    const cached = await cache.match(event.request, { ignoreSearch: false });
    if (cached) {
      // WAV range requests need real 206 responses for Safari seeking and offline playback.
      const range = event.request.headers.get('range');
      if (range) {
        const bytes = await cached.arrayBuffer();
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match) {
          const length = bytes.byteLength;
          let start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
          const end = match[1] ? (match[2] ? Math.min(Number(match[2]), length - 1) : length - 1) : length - 1;
          if (start >= length || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + length } });
          return new Response(bytes.slice(start, end + 1), { status: 206, headers: { 'Content-Type': cached.headers.get('Content-Type') || 'audio/wav', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${length}`, 'Accept-Ranges': 'bytes' } });
        }
      }
      return cached;
    }
    return fetch(event.request);
  })());
});
