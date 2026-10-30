'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  let time = 0, next = 0; const timers = new Map(), handlers = new Map(), globalEvents = new Map();
  const root = { document: { hidden: false }, navigator: {}, performance: { now: () => time },
    setInterval(fn) { const id = ++next; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); },
    addEventListener(name, fn) { globalEvents.set(name, fn); } };
  root.globalThis = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../child-mode.js'), 'utf8'), root);
  const button = { addEventListener(name, fn) { handlers.set(name, fn); }, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 60 }; } };
  const emit = (type, data = {}) => handlers.get(type)?.({ type, button: 0, pointerId: 1, isPrimary: true, preventDefault() {}, ...data });
  return { root, button, emit, globalEvents, advance(ms, tick = true) { time += ms; if (tick) [...timers.values()].forEach(fn => fn()); } };
}
test('legacy preferences gain child defaults and invalid settings are normalized', () => {
  const { root } = fixture(), defaults = root.StoryChild.preferences({ spoken: true });
  assert.equal(defaults.childScreen, 'stories'); assert.equal(defaults.childLock, true);
  assert.equal(defaults.keepAwake, true); assert.equal(defaults.tapToPause, false);
  const saved = root.StoryChild.preferences({ childScreen: 'black', childLock: false, keepAwake: false, tapToPause: true, playbackRate: 99 });
  assert.equal(saved.childScreen, 'black'); assert.equal(saved.childLock, false); assert.equal(saved.keepAwake, false);
  assert.equal(saved.tapToPause, true); assert.equal(saved.playbackRate, 1);
});
test('a click cannot exit a locked mode and a continuous pointer hold exits after three seconds', () => {
  const f = fixture(); let exits = 0;
  new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {} });
  f.emit('click'); assert.equal(exits, 0);
  f.emit('pointerdown'); f.advance(2999); assert.equal(exits, 0); f.advance(1); assert.equal(exits, 1);
  f.emit('pointerup'); f.advance(4000); assert.equal(exits, 1);
});
test('short holds do not accumulate and a pointer moving off the button cancels', () => {
  const f = fixture(); let exits = 0;
  new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {} });
  f.emit('pointerdown'); f.advance(2000); f.emit('pointerup');
  f.emit('pointerdown'); f.advance(2000); f.emit('pointermove', { clientX: 250, clientY: 20 }); f.advance(4000);
  assert.equal(exits, 0);
});
test('keyboard holds support Space and Enter without counting auto-repeat', () => {
  const f = fixture(); let exits = 0;
  new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {} });
  f.emit('keydown', { key: ' ', repeat: false }); f.advance(2000); f.emit('keyup', { key: ' ' }); assert.equal(exits, 0);
  f.emit('keydown', { key: 'Enter', repeat: false }); f.advance(2000); f.emit('keydown', { key: 'Enter', repeat: true });
  f.advance(1000); assert.equal(exits, 1);
});
test('a release after the deadline completes even if the interval has not run yet', () => {
  const f = fixture(); let exits = 0;
  new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {} });
  f.emit('pointerdown'); f.advance(3001, false); f.emit('pointerup'); assert.equal(exits, 1);
});
test('pointer cancellation, lost focus and explicit cancellation always cancel an incomplete hold', () => {
  const f = fixture(); let exits = 0;
  const hold = new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {} });
  for (const cancel of [() => f.emit('pointercancel'), () => f.emit('blur'), () => f.globalEvents.get('blur')(), () => hold.cancel()]) {
    f.emit('pointerdown'); f.advance(2000); cancel(); f.advance(2000);
  }
  assert.equal(exits, 0);
});
test('unlocked mode exits with an ordinary click', () => {
  const f = fixture(); let exits = 0;
  new f.root.StoryChild.HoldExit(f.button, { required: () => false, exit: () => exits++, progress() {} });
  f.emit('click'); assert.equal(exits, 1);
});
test('wake lock is acquired, released on hide and reacquired when visible', async () => {
  const f = fixture(), states = []; let requests = 0, releases = 0;
  f.root.navigator.wakeLock = { async request(kind) { assert.equal(kind, 'screen'); requests++; return { addEventListener() {}, async release() { releases++; } }; } };
  const keeper = new f.root.StoryChild.WakeKeeper(s => states.push(s));
  await keeper.setEnabled(true); assert.equal(states.at(-1), 'active');
  f.root.document.hidden = true; await keeper.setEnabled(true); assert.equal(releases, 1);
  f.root.document.hidden = false; await keeper.setEnabled(true); assert.equal(requests, 2);
  await keeper.setEnabled(false); assert.equal(releases, 2); assert.equal(states.at(-1), 'off');
});
test('a wake lock resolving after exit is immediately released', async () => {
  const f = fixture(); let resolve, releases = 0;
  f.root.navigator.wakeLock = { request() { return new Promise(r => { resolve = r; }); } };
  const keeper = new f.root.StoryChild.WakeKeeper();
  const pending = keeper.setEnabled(true); keeper.setEnabled(false);
  resolve({ async release() { releases++; } }); await pending;
  assert.equal(keeper.lock, null); assert.equal(releases, 1);
});
test('unsupported or denied wake lock remains a recoverable status', async () => {
  const f = fixture(), states = [], keeper = new f.root.StoryChild.WakeKeeper(s => states.push(s));
  await keeper.setEnabled(true); assert.equal(states.at(-1), 'unavailable');
  f.root.navigator.wakeLock = { async request() { throw new Error('Low battery'); } };
  await keeper.setEnabled(true); assert.equal(states.at(-1), 'unavailable');
});
