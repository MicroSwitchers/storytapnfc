'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { MessageChannel } = require('node:worker_threads');
function fixture() {
  const events = new Map(), states = [], requests = []; let reloads = 0, saved = 0, allowed = true;
  const worker = { postMessage(data, ports) { requests.push(data.type); ports[0].postMessage(data.type === 'APPLY_UPDATE' ? { ok: true } : { ready: true, audioCount: 4 }); } };
  const registration = { active: worker, waiting: null, addEventListener() {}, async update() {} };
  const sw = { async register() { return registration; }, ready: Promise.resolve(registration), addEventListener(name, fn) { events.set(name, fn); } };
  const root = { navigator: { onLine: true, userAgent: 'Test browser', serviceWorker: sw }, isSecureContext: true,
    location: { protocol: 'https:', reload() { reloads++; } }, matchMedia: () => ({ matches: false }), MessageChannel, setTimeout, clearTimeout,
    addEventListener(name, fn) { events.set(name, fn); } };
  root.globalThis = root; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pwa.js'), 'utf8'), root);
  const runtime = new root.StoryPWA.Runtime({ change: value => states.push(value), canUpdate: () => allowed, beforeUpdate: async () => { saved++; } });
  return { root, runtime, states, requests, registration, events, worker, counts: () => ({ reloads, saved }), allow(value) { allowed = value; } };
}
test('offline readiness is based on an active worker verification, not registration alone', async () => {
  const f = fixture(); await f.runtime.init();
  assert.equal(f.runtime.state.offline, 'ready'); assert.equal(f.runtime.state.audioCount, 4);
  assert.ok(f.requests.includes('OFFLINE_STATUS')); assert.equal(f.counts().reloads, 0);
});
test('an installed offline app can reuse its existing registration when network registration fails', async () => {
  const f = fixture(); f.root.navigator.serviceWorker.register = async () => { throw new Error('Offline'); };
  f.root.navigator.serviceWorker.getRegistration = async () => f.registration;
  await f.runtime.init(); assert.equal(f.runtime.state.offline, 'ready');
});
test('opening from a local file gives an honest installation and offline explanation', async () => {
  const f = fixture(); f.root.location.protocol = 'file:'; await f.runtime.init();
  assert.equal(f.runtime.state.offline, 'unsupported'); assert.match(f.root.StoryPWA.installHelp(), /START-LOCAL/);
});
test('update application is blocked during a busy activity and saves before activation', async () => {
  const f = fixture(); f.registration.waiting = f.worker; await f.runtime.init();
  f.allow(false); await f.runtime.applyUpdate(); assert.equal(f.counts().saved, 0); assert.ok(!f.requests.includes('APPLY_UPDATE'));
  f.allow(true); await f.runtime.applyUpdate(); assert.equal(f.counts().saved, 1); assert.equal(f.runtime.state.update, 'applying');
  assert.equal(f.counts().reloads, 0); f.events.get('controllerchange')(); f.events.get('controllerchange')();
  assert.equal(f.counts().reloads, 1);
});
test('a failed draft save cannot trigger worker takeover or reload', async () => {
  const f = fixture(); f.registration.waiting = f.worker; await f.runtime.init();
  f.runtime.beforeUpdate = async () => { throw new Error('Storage full'); };
  await f.runtime.applyUpdate(); assert.ok(!f.requests.includes('APPLY_UPDATE')); assert.equal(f.counts().reloads, 0);
  assert.equal(f.runtime.state.update, 'waiting'); assert.match(f.runtime.state.message, /Storage full/);
});
test('other open app windows produce a recoverable update message', async () => {
  const f = fixture(); f.registration.waiting = { postMessage(data, ports) { ports[0].postMessage({ ok: false, reason: 'Close other StoryTouch windows before updating.' }); } };
  await f.runtime.init(); await f.runtime.applyUpdate();
  assert.equal(f.runtime.state.update, 'waiting'); assert.equal(f.runtime.state.busy, false); assert.equal(f.counts().reloads, 0);
});
test('download errors recover the controls without changing saved library data', async () => {
  const f = fixture(); await f.runtime.init();
  f.registration.active = { postMessage(data, ports) { ports[0].postMessage({ ok: false, error: 'Connect and try again' }); } };
  await f.runtime.downloadOffline(); assert.equal(f.runtime.state.busy, false); assert.match(f.runtime.state.message, /Connect/);
});
test('installation consumes its prompt once and reflects an installed standalone app', async () => {
  const f = fixture(); let prompts = 0;
  f.events.get('beforeinstallprompt')({ preventDefault() {}, async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await f.runtime.install(); await f.runtime.install(); assert.equal(prompts, 1);
  f.events.get('appinstalled')(); assert.equal(f.runtime.state.installed, true); assert.equal(f.runtime.state.installable, false);
  f.root.navigator.standalone = true; assert.equal(f.root.StoryPWA.standalone(), true);
});
test('offline update checks do not issue a network update request', async () => {
  const f = fixture(); await f.runtime.init(); let calls = 0; f.registration.update = async () => { calls++; };
  f.events.get('offline')(); await f.runtime.checkUpdates(); assert.equal(calls, 0); assert.match(f.runtime.state.message, /offline/);
});

function newerActive(f) {
  f.runtime.version = 'storytouch-shell-v1.4.0-release';
  f.registration.active = { postMessage(data, ports) { ports[0].postMessage({ ready: true, audioCount: 4, version: 'storytouch-shell-v1.5.0-release' }); } };
}
test('an untouched adult launch saves then refreshes to the newer active release exactly once', async () => {
  const f = fixture(); newerActive(f); await f.runtime.init(); await f.runtime.verify();
  assert.equal(f.counts().saved, 1); assert.equal(f.counts().reloads, 1);
});
test('active playback or child mode defers a new release without interrupting the activity', async () => {
  const f = fixture(); newerActive(f); f.allow(false); await f.runtime.init();
  assert.equal(f.counts().reloads, 0); assert.equal(f.runtime.state.update, 'waiting');
  f.allow(true); await f.runtime.applyUpdate(); assert.equal(f.counts().reloads, 1);
});
test('after interaction an active release waits for Update app and does not require other tabs to close', async () => {
  const f = fixture(); newerActive(f); f.events.get('pointerdown')(); await f.runtime.init();
  assert.equal(f.counts().reloads, 0); await f.runtime.applyUpdate(); assert.equal(f.counts().reloads, 1);
  assert.ok(!f.requests.includes('APPLY_UPDATE'));
});
test('a failed draft save defers an active release and can be retried', async () => {
  const f = fixture(); newerActive(f); f.runtime.beforeUpdate = async () => { throw new Error('Storage full'); }; await f.runtime.init();
  assert.equal(f.counts().reloads, 0); assert.equal(f.runtime.state.update, 'waiting');
  f.runtime.beforeUpdate = async () => {}; await f.runtime.applyUpdate(); assert.equal(f.counts().reloads, 1);
});
test('a current page never reloads into an older cached worker', async () => {
  const f = fixture(); newerActive(f); f.runtime.version = 'storytouch-shell-v2.0.0-release'; await f.runtime.init();
  assert.equal(f.counts().reloads, 0); assert.equal(f.runtime.state.update, 'none');
});
