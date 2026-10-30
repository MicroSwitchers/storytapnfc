'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
function fixture() {
  const scope = 'https://stories.test/family/', handlers = new Map(), stores = new Map(), resources = new Map(), fetched = [];
  let offline = false, skipped = 0, claimed = 0;
  const url = value => new URL(typeof value === 'string' ? value : value.url || value.href, scope).href;
  function store(name) {
    if (!stores.has(name)) stores.set(name, new Map()); const entries = stores.get(name);
    return { async match(key, opts = {}) { const target = new URL(url(key)); if (opts.ignoreSearch) target.search = '';
      for (const [key, value] of entries) { const candidate = new URL(key); if (opts.ignoreSearch) candidate.search = ''; if (target.href === candidate.href) return value.clone(); } },
      async put(key, response) { entries.set(url(key), response.clone()); }, async delete(key) { return entries.delete(url(key)); },
      async addAll(keys) { const responses = await Promise.all(keys.map(key => fetcher(key))); if (responses.some(r => !r.ok)) throw new Error('Download failed'); for (let i = 0; i < keys.length; i++) entries.set(url(keys[i]), responses[i].clone()); } };
  }
  async function fetcher(key) { fetched.push(key); if (offline) throw new Error('Network offline'); const resource = resources.get(url(key)); return resource ? resource.clone() : new Response('not found', { status: 404 }); }
  const shell = script.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  for (const [, file] of shell.matchAll(/'([^']+)'/g)) resources.set(url(file), new Response(file === './offline.html' ? 'Offline page' : file === './index.html' ? 'StoryTouch app' : 'asset'));
  resources.set(url('./example-stories/stories.json'), Response.json({ version: 1, stories: [{ file: 'My Bell.mp3' }] }));
  resources.set(url('./example-stories/My%20Bell.mp3'), new Response('0123456789', { headers: { 'Content-Type': 'audio/mpeg' } }));
  resources.set(url('./sw.js'), new Response(script));
  const self = { registration: { scope }, addEventListener(name, fn) { handlers.set(name, fn); },
    clients: { async claim() { claimed++; }, async matchAll() { return [{ id: 'app', url: scope + 'index.html' }]; } }, async skipWaiting() { skipped++; } };
  const caches = { async open(name) { return store(name); }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); } };
  vm.runInNewContext(script, { self, caches, fetch: fetcher, URL, Request, Response, Headers, Promise });
  async function install() { let work; handlers.get('install')({ waitUntil(p) { work = p; } }); await work; }
  async function message(type, source = { id: 'app', url: scope + 'index.html' }) {
    let work, result; handlers.get('message')({ data: { type }, source, ports: [{ postMessage(value) { result = value; } }], waitUntil(p) { work = p; } }); await work; return result;
  }
  async function request(file, { range, navigate = false } = {}) {
    let work; handlers.get('fetch')({ request: { url: url(file), method: 'GET', mode: navigate ? 'navigate' : 'cors', headers: new Headers(range ? { Range: range } : {}) }, respondWith(p) { work = p; } }); return work;
  }
  return { scope, self, resources, stores, caches, install, message, request, fetched, offline(value) { offline = value; },
    cache: () => store([...stores.keys()].find(k => k.startsWith('storytouch-shell-'))), counts: () => ({ skipped, claimed }),
    async activate() { let work; handlers.get('activate')({ waitUntil(p) { work = p; } }); await work; } };
}
test('offline readiness requires the complete app shell and every bundled audio file', async () => {
  const f = fixture(); await f.install(); const status = await f.message('OFFLINE_STATUS');
  assert.equal(status.ready, true); assert.equal(status.audioCount, 1);
  await f.cache().delete('./example-stories/My%20Bell.mp3');
  assert.equal((await f.message('OFFLINE_STATUS')).ready, false);
});
test('installing a release bypasses stale HTTP-cached scripts, styles and audio', async () => {
  const f = fixture(); await f.install();
  assert.ok(f.fetched.length > 20); assert.ok(f.fetched.every(request => request.cache === 'reload'));
});
test('failed initial installation discards only its partial new cache', async () => {
  const f = fixture(); await f.caches.open('some-other-app'); f.resources.delete(f.scope + 'example-stories/My%20Bell.mp3');
  await assert.rejects(f.install(), /Download failed/);
  assert.deepEqual(await f.caches.keys(), ['some-other-app']); assert.equal(f.counts().skipped, 0);
});
test('offline root, query links and installed launch URLs return the cached app', async () => {
  const f = fixture(); await f.install(); f.offline(true);
  for (const url of ['./','./index.html?source=installed']) assert.equal(await (await f.request(url, { navigate: true })).text(), 'StoryTouch app');
});
test('unknown offline pages use a useful offline fallback instead of masquerading as the app', async () => {
  const f = fixture(); await f.install(); f.offline(true);
  assert.equal(await (await f.request('./not-cached', { navigate: true })).text(), 'Offline page');
  assert.equal((await f.request('./missing.mp3')).status, 503);
});
test('MP3 range responses preserve the media type and exact bytes for offline seeking', async () => {
  const f = fixture(); await f.install(); f.offline(true);
  const response = await f.request('./example-stories/My%20Bell.mp3', { range: 'bytes=2-5' });
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10'); assert.equal(await response.text(), '2345');
});
test('suffix, open-ended and unsatisfiable audio ranges behave correctly', async () => {
  const f = fixture(); await f.install();
  assert.equal(await (await f.request('./example-stories/My%20Bell.mp3', { range: 'bytes=-3' })).text(), '789');
  assert.equal(await (await f.request('./example-stories/My%20Bell.mp3', { range: 'bytes=8-' })).text(), '89');
  assert.equal((await f.request('./example-stories/My%20Bell.mp3', { range: 'bytes=20-' })).status, 416);
  assert.equal((await f.request('./example-stories/My%20Bell.mp3', { range: 'bytes=-0' })).status, 416);
  assert.equal((await f.request('./example-stories/My%20Bell.mp3', { range: 'bytes=3-1' })).status, 416);
});
test('online 404s and out-of-scope requests are not hidden by the app fallback', async () => {
  const f = fixture(); await f.install();
  assert.equal((await f.request('./missing-page', { navigate: true })).status, 404);
  assert.equal(await f.request('https://elsewhere.test/'), undefined);
});
test('repair restores missing offline files without changing the user library', async () => {
  const f = fixture(); await f.install(); await f.cache().delete('./pwa.js');
  const result = await f.message('CACHE_OFFLINE'); assert.equal(result.ready, true);
  assert.ok(await f.cache().match('./pwa.js'));
});
test('repair refuses to mix assets from a newer deployed release', async () => {
  const f = fixture(); await f.install(); await f.cache().delete('./pwa.js');
  f.resources.set(f.scope + 'sw.js', new Response("const VERSION = 'different';"));
  const result = await f.message('CACHE_OFFLINE'); assert.match(result.error, /newer app version/);
  assert.equal(await f.cache().match('./pwa.js'), undefined);
});
test('an update cannot take over another open StoryTouch window', async () => {
  const f = fixture(); f.self.clients.matchAll = async () => [{ id: 'app', url: f.scope + 'index.html' }, { id: 'recording', url: f.scope }];
  const result = await f.message('APPLY_UPDATE'); assert.equal(result.ok, false); assert.equal(f.counts().skipped, 0);
});
test('a complete release activates without forcing navigation; legacy update messages remain supported', async () => {
  const f = fixture(); await f.install(); assert.equal(f.counts().skipped, 1);
  assert.equal((await f.message('APPLY_UPDATE', { id: 'other', url: 'https://elsewhere.test/index.html' })).ok, false);
  assert.equal((await f.message('APPLY_UPDATE')).ok, true); assert.equal(f.counts().skipped, 2);
});
test('cache cleanup preserves other apps and other StoryTouch scopes', async () => {
  const f = fixture(); await f.install();
  await f.caches.open('unrelated'); await f.caches.open('storytouch-shell-old:' + f.scope); await f.caches.open('storytouch-shell-old:https://stories.test/other/');
  await f.activate(); const keys = await f.caches.keys();
  assert.ok(keys.includes('unrelated')); assert.ok(keys.includes('storytouch-shell-old:https://stories.test/other/'));
  assert.ok(!keys.includes('storytouch-shell-old:' + f.scope)); assert.equal(f.counts().claimed, 1);
});
