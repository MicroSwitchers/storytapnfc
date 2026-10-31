/* Bump VERSION whenever a release changes any packaged asset. */
'use strict';
const VERSION = 'storytouch-shell-v2.0.1-release';
const EXAMPLE_REV = '278987fe704a';
const CACHE = VERSION + '-' + EXAMPLE_REV + ':' + self.registration.scope;
const READY = new URL('./.offline-ready', self.registration.scope).href;
const SHELL = [
  './', './index.html', './styles.css', './core.js', './storage.js', './speech.js', './recording.js', './child-mode.js', './pwa.js', './media.js', './app.js',
  './offline.html', './manifest.webmanifest', './README.html', './README.md', './assets/icons/storytouch.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png', './example-stories/stories.json',
  './assets/icons/storytouch.svg?v=2.0.1', './assets/icons/icon-192.png?v=2.0.1', './assets/icons/icon-512.png?v=2.0.1',
  './assets/icons/maskable-512.png?v=2.0.1', './assets/icons/apple-touch-icon.png?v=2.0.1'
];
function exampleFiles(catalog) {
  if (catalog.version !== 1 || !Array.isArray(catalog.stories) || catalog.stories.length > 2000) throw new Error('Invalid starter catalog');
  return catalog.stories.map(s => {
    if (typeof s.file !== 'string' || s.file.startsWith('/') || s.file.split('/').some(p => !p || p === '.' || p === '..' || /[\\?#]/.test(p)) || !/\.(mp3|wav|m4a|ogg|aac|flac|webm)$/i.test(s.file)) throw new Error('Invalid starter path');
    return './example-stories/' + s.file.split('/').map(encodeURIComponent).join('/');
  });
}
async function populate(cache) {
  // Filenames are stable, so bypass the browser's HTTP cache when assembling a release.
  const fresh = files => files.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' }));
  await cache.addAll(fresh(SHELL));
  const response = await cache.match('./example-stories/stories.json');
  const files = exampleFiles(await response.json());
  await cache.addAll(fresh(files));
  // Write the completion marker only after the entire shell AND all starter audio are cached.
  await cache.put(READY, new Response(JSON.stringify({ version: VERSION, files }), { headers: { 'Content-Type': 'application/json' } }));
}
async function offlineStatus() {
  const cache = await caches.open(CACHE), marker = await cache.match(READY);
  let files = [], complete = false;
  try { const data = await marker?.json(); if (data?.version === VERSION && Array.isArray(data.files)) { files = data.files; complete = true; } } catch (_) {}
  const expected = [...SHELL, ...files], present = await Promise.all(expected.map(file => cache.match(file)));
  const missing = expected.filter((_, i) => !present[i]);
  return { version: VERSION, ready: complete && !missing.length, missing, audioCount: files.length };
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existed = (await caches.keys()).includes(CACHE);
    try { await populate(await caches.open(CACHE)); await self.skipWaiting(); }
    catch (error) { if (!existed) await caches.delete(CACHE); throw error; }
  })());
  // Activate the complete release even with old tabs open. Never navigate those tabs: their media and recordings keep running.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('storytouch-shell-') && key.endsWith(':' + self.registration.scope) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
function appClient(client) {
  const url = new URL(client.url), scope = new URL(self.registration.scope);
  return url.origin === scope.origin && [scope.pathname, scope.pathname + 'index.html'].includes(url.pathname);
}
self.addEventListener('message', event => {
  const reply = value => event.ports?.[0]?.postMessage(value);
  if (!['OFFLINE_STATUS', 'CACHE_OFFLINE', 'APPLY_UPDATE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'OFFLINE_STATUS') { reply(await offlineStatus()); return; }
      if (event.data.type === 'CACHE_OFFLINE') {
        // Repair only this deployed release, never mix a newer app shell into an older running app.
        const response = await fetch(new URL('./sw.js', self.registration.scope), { cache: 'no-store' });
        if (!response.ok) throw new Error('Connect to the internet to download offline files.');
        const script = await response.text();
        if (!script.includes("const VERSION = '" + VERSION + "';") || !script.includes("const EXAMPLE_REV = '" + EXAMPLE_REV + "';")) throw new Error('A newer app version is available. Check for updates first.');
        await populate(await caches.open(CACHE)); reply(await offlineStatus()); return;
      }
      const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(appClient);
      if (!event.source || !appClient(event.source) || clients.some(c => c.id !== event.source.id)) {
        reply({ ok: false, reason: 'Close other StoryTouch windows before updating. Your stories stay saved.' }); return;
      }
      reply({ ok: true }); await self.skipWaiting();
    } catch (error) { reply({ ok: false, error: error.message || 'Offline setup could not finish. Try again when connected.' }); }
  })());
});
async function ranged(response, header) {
  // Unsupported multi-range requests are deliberately served as the full 200 response.
  if (!header || header.includes(',')) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer(), length = bytes.byteLength;
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, length - suffix); end = length - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), length - 1) : length - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start || start < 0) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + length } });
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding'); headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`); headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      const appRoute = [scope.pathname, scope.pathname + 'index.html'].includes(url.pathname);
      const page = await cache.match(appRoute ? new URL('./index.html', scope) : event.request, { ignoreSearch: true });
      if (page) return page;
      try { return await fetch(event.request); }
      catch (_) { return (await cache.match('./offline.html')) || new Response('You are offline. Open StoryTouch again when connected.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    }
    const cached = await cache.match(event.request);
    if (cached) return ranged(cached, event.request.headers.get('range'));
    try { return await fetch(event.request); }
    catch (_) { return new Response('This file is not available offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  })());
});
