'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  let time = 0, next = 0; const timers = new Map(), handlers = new Map(), globalEvents = new Map(), documentEvents = new Map();
  const root = { document: { hidden: false, addEventListener(name, fn) { documentEvents.set(name, fn); } }, navigator: {}, performance: { now: () => time },
    setInterval(fn) { const id = ++next; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); },
    addEventListener(name, fn) { globalEvents.set(name, fn); } };
  root.globalThis = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../child-mode.js'), 'utf8'), root);
  const button = { addEventListener(name, fn) { handlers.set(name, fn); }, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 60 }; } };
  const emit = (type, data = {}) => handlers.get(type)?.({ type, button: 0, pointerId: 1, isPrimary: true, preventDefault() {}, ...data });
  return { root, button, emit, globalEvents, documentEvents, advance(ms, tick = true) { time += ms; if (tick) [...timers.values()].forEach(fn => fn()); } };
}
test('legacy preferences gain child defaults and invalid settings are normalized', () => {
  const { root } = fixture(), defaults = root.StoryChild.preferences({ spoken: true });
  assert.equal(defaults.childScreen, 'black'); assert.equal(defaults.childLock, true);
  assert.equal(defaults.touchToPause, true); assert.equal(defaults.keepAwake, true); assert.equal(defaults.tapToPause, false);
  const saved = root.StoryChild.preferences({ childScreen: 'black', childLock: false, keepAwake: false, tapToPause: true, playbackRate: 99 });
  assert.equal(saved.childScreen, 'black'); assert.equal(saved.childLock, true); assert.equal(saved.keepAwake, false);
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

test('screen-touch pause defaults on, can be disabled, and old unlocked exits become hold-only', () => {
  const f = fixture(); assert.equal(f.root.StoryChild.preferences().touchToPause, true);
  const saved = f.root.StoryChild.preferences({ touchToPause: false, childLock: false });
  assert.equal(saved.touchToPause, false); assert.equal(saved.childLock, true);
});
test('immersive mode requests hidden navigation UI and releases only its own full-screen session', async () => {
  const f = fixture(); let requestOptions, exits = 0;
  const doc = f.root.document;
  doc.documentElement = { async requestFullscreen(options) { requestOptions = options; doc.fullscreenElement = this; } };
  doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; };
  const immersive = new f.root.StoryChild.Immersive(); await immersive.setEnabled(true);
  assert.equal(requestOptions.navigationUI, 'hide'); await immersive.setEnabled(false); assert.equal(exits, 1);
  doc.fullscreenElement = {}; await immersive.setEnabled(true); await immersive.setEnabled(false); assert.equal(exits, 1);
});
test('a late fullscreen grant after the parent exits is immediately released', async () => {
  const f = fixture(); let resolve, exits = 0; const doc = f.root.document;
  doc.documentElement = { requestFullscreen() { return new Promise(r => { resolve = () => { doc.fullscreenElement = this; r(); }; }); } };
  doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; };
  const immersive = new f.root.StoryChild.Immersive(), pending = immersive.setEnabled(true);
  await immersive.setEnabled(false); resolve(); await pending; assert.equal(exits, 1);
});
test('unsupported, denied and non-gesture fullscreen requests are safe fallbacks', async () => {
  const f = fixture(), states = []; const immersive = new f.root.StoryChild.Immersive(s => states.push(s));
  await immersive.setEnabled(true); assert.equal(states.at(-1), 'unavailable');
  f.root.document.documentElement = { async requestFullscreen() { throw new Error('Denied'); } };
  await immersive.setEnabled(true); assert.equal(states.at(-1), 'unavailable');
  let requests = 0; f.root.navigator.userActivation = { isActive: false };
  f.root.document.documentElement.requestFullscreen = async () => { requests++; };
  await immersive.setEnabled(true); assert.equal(requests, 0);
});
function touchFixture() {
  const f = fixture(); let playing = true, enabled = true, pauses = 0;
  new f.root.StoryChild.TouchPause({ enabled: () => enabled, playing: () => playing, pause() { pauses++; playing = false; } });
  function event(type, { special = false, detail = 1 } = {}) {
    const e = { button: 0, detail, target: { closest() { return special ? {} : null; } }, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    f.documentEvents.get(type)(e); return e;
  }
  return { f, event, play() { playing = true; }, disable() { enabled = false; }, pauses: () => pauses };
}
test('touching a playing story pauses once and consumes that gesture instead of restarting media', () => {
  const t = touchFixture(); assert.equal(t.event('pointerdown').prevented, true); assert.equal(t.pauses(), 1);
  assert.equal(t.event('click').stopped, true);
  t.event('pointerdown'); assert.equal(t.event('click').stopped, false, 'next touch may use Play');
});
test('screen touches preserve exit holds and drawer use while still pausing playback', () => {
  const t = touchFixture(); assert.equal(t.event('pointerdown', { special: true }).prevented, false);
  assert.equal(t.event('click').stopped, false); assert.equal(t.pauses(), 1);
  t.play(); t.disable(); assert.equal(t.event('pointerdown').prevented, false); assert.equal(t.pauses(), 1);
});
test('keyboard activation and a cancelled pointer do not inherit a stale paused-touch click block', () => {
  const t = touchFixture(); t.event('pointerdown'); assert.equal(t.event('click', { detail: 0 }).stopped, false);
  t.play(); t.event('pointerdown'); t.f.documentEvents.get('pointercancel')(); assert.equal(t.event('click').stopped, false);
});

test('parent hold supports every configured duration from two through five seconds', () => {
  for (const seconds of [2,3,4,5]) {
    const f = fixture(); let exits = 0;
    new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {}, settings: () => ({ method: 'hold', seconds }) });
    f.emit('pointerdown'); f.advance(seconds * 1000 - 1); assert.equal(exits, 0); f.advance(1); assert.equal(exits, 1);
  }
});
test('tap exits require three to five consecutive clicks and never complete from a hold', () => {
  for (const taps of [3,4,5]) {
    const f = fixture(); let exits = 0;
    new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {}, settings: () => ({ method: 'taps', taps }) });
    f.emit('pointerdown'); f.advance(6000); assert.equal(exits, 0);
    for (let i = 1; i < taps; i++) { f.emit('click'); f.emit('pointerleave'); f.advance(100); assert.equal(exits, 0); }
    f.emit('click'); assert.equal(exits, 1);
  }
});
test('a pause between taps or a loss of focus resets the parent gesture', () => {
  const f = fixture(); let exits = 0;
  new f.root.StoryChild.HoldExit(f.button, { required: () => true, exit: () => exits++, progress() {}, settings: () => ({ method: 'taps', taps: 3 }) });
  f.emit('click'); f.emit('click'); f.advance(1100); f.emit('click'); assert.equal(exits, 0);
  f.emit('blur'); f.emit('click'); f.emit('click'); assert.equal(exits, 0); f.emit('click'); assert.equal(exits, 1);
});
test('new display and parent-handle preferences are normalized independently of legacy story-button mode', () => {
  const p = fixture().root.StoryChild.preferences;
  assert.equal(p({ childScreen: 'stories' }).childScreen, 'black'); assert.equal(p({ childScreen: 'now-playing' }).childScreen, 'now-playing');
  assert.equal(p({ exitHoldSeconds: 99 }).exitHoldSeconds, 3); assert.equal(p({ exitTapCount: 2 }).exitTapCount, 4);
  assert.equal(p({ exitMethod: 'taps', exitTapCount: 5, showStop: true }).showStop, true);
});
