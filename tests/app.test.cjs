'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../core.js');
function fixture(rows = [], links = []) {
  const elements = new Map(), events = new Map(), documentEvents = new Map(), storage = new Map(), readers = [];
  let data = rows, linkData = links, stopped = 0, meterStopped = 0;
  function element(id) {
    if (!elements.has(id)) {
      const handlers = new Map(), classes = new Set();
      const e = { value: '', textContent: '', hidden: true, checked: false, paused: true, ended: false, currentTime: 0, dataset: {},
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); }, add(name) { classes.add(name); }, remove(name) { classes.delete(name); } },
        addEventListener(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); },
        async emit(name, event = {}) { for (const fn of handlers.get(name) || []) await fn(event); },
        setAttribute() {}, removeAttribute() {}, load() {}, focus() {}, reset() {}, scrollIntoView() {}, querySelectorAll() { return []; },
        pause() { this.paused = true; for (const fn of handlers.get('pause') || []) fn(); },
        async play() { this.paused = false; this.ended = false; for (const fn of handlers.get('play') || []) fn(); } };
      elements.set(id, e);
      let src;
      Object.defineProperty(e, 'src', { get() { return src; }, set(value) { src = value; e.currentTime = 0; } });
    }
    return elements.get(id);
  }
  const track = { stop() { stopped++; }, addEventListener(name, callback) { this[name] = callback; } };
  const stream = { getTracks() { return [track]; }, getAudioTracks() { return [track]; } };
  const recorder = { state: 'inactive', mimeType: 'audio/webm;codecs=opus',
    start() { this.state = 'recording'; }, stop() { this.state = 'inactive'; },
    chunk(text) { this.ondataavailable({ data: new Blob([text], { type: this.mimeType }) }); },
    finish() { this.state = 'inactive'; this.onstop(); } };
  const DB = { async all(store) { return store === 'stories' ? data : linkData; }, async getSetting(key, fallback) { return fallback; },
    async putStory(story) { data.push(story); }, async putSetting() {},
    async restore(stories, links, removed, removeIds) { data = data.filter(s => !removeIds.includes(s.id)); linkData = linkData.filter(l => !removeIds.includes(l.storyId)); data.push(...stories); } };
  const root = { StoryCore: C, StoryStore: DB, StorySpeech: { supported() { return false; }, Player: class {
    constructor() { this.state = 'stopped'; } stop() { this.state = 'stopped'; }
    start(story, rate, callbacks) { this.story = story; this.callbacks = callbacks; this.state = 'playing'; callbacks.state('Playing'); }
    pause() { this.state = 'paused'; this.callbacks.state('Paused'); }
    resume() { this.state = 'playing'; this.callbacks.state('Playing'); }
  } },
    StoryRecording: { async openMicrophone() { return stream; }, createRecorder() { return recorder; }, monitor() { return () => { meterStopped++; }; } },
    document: { documentElement: element('html'), body: element('body'), hidden: false, getElementById: element, querySelector: element, querySelectorAll() { return []; }, addEventListener(name, fn) { documentEvents.set(name, fn); } },
    navigator: { mediaDevices: { getUserMedia() {} } }, isSecureContext: true, MediaRecorder: function () {},
    addEventListener(name, callback) { events.set(name, callback); }, Blob, TextEncoder, AbortController, performance, URLSearchParams,
    URL: class extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} },
    location: { href: 'https://storytouch.test/index.html' },
    sessionStorage: { setItem(key, value) { storage.set(key, value); }, getItem(key) { return storage.get(key); }, removeItem(key) { storage.delete(key); } },
    localStorage: { setItem() {} },
    NDEFReader: class { constructor() { readers.push(this); } async scan({ signal }) { this.signal = signal; } },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, Date, console,
    fetch: async () => ({ ok: true, json: async () => ({ version: 1, retiredIds: C.DEMOS.map(s => s.id), stories: [] }) }) };
  root.window = root; root.globalThis = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../child-mode.js'), 'utf8'), root);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pwa.js'), 'utf8'), root);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media.js'), 'utf8'), root);
  let script = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  script = script.replace('init().catch(report);', 'dbReady = true; appInitialized = true; globalThis.hooks = { setPlayerDrawer, startRecording, stopRecording, syncExamples, refresh, setChild, saveChildSettings, playTagStory, startScan, stopNFC, exitHold, handleHash, canUpdate: () => pwa.canUpdate(), state: () => ({ recordingState, draft, child, blackChild, options, nfcSession, selected }), setRows: rows => { customs = rows; }, configure: saved => { options = StoryChild.preferences(saved); }, setInitialized: value => { appInitialized = value; childStartUI(); } };');
  vm.runInNewContext(script, root); root.hooks.setRows(rows);
  return { root, recorder, stream, track, events, documentEvents, element, readers, storage, counts: () => ({ stopped, meterStopped }), data: () => data, links: () => linkData };
}
test('stop waits for the final encoded chunk and releases the microphone after finalization', async () => {
  const f = fixture(); await f.root.hooks.startRecording(); f.recorder.chunk('first');
  f.root.hooks.stopRecording();
  assert.equal(f.root.hooks.state().recordingState, 'finishing');
  assert.equal(f.counts().stopped, 0, 'capture released before final audio');
  f.recorder.chunk('last'); f.recorder.finish();
  const { draft, recordingState } = f.root.hooks.state();
  assert.equal(recordingState, 'idle'); assert.equal(await draft.blob.text(), 'firstlast');
  assert.equal(draft.mime, f.recorder.mimeType); assert.equal(f.counts().stopped, 1); assert.equal(f.counts().meterStopped, 1);
});
test('microphone denial restores idle controls and does not leave a stream', async () => {
  const f = fixture(); f.root.StoryRecording.openMicrophone = async () => { throw { name: 'NotAllowedError' }; };
  await assert.rejects(f.root.hooks.startRecording(), /Microphone access was not allowed/);
  assert.equal(f.root.hooks.state().recordingState, 'idle');
  assert.equal(f.element('record-start').hidden, false); assert.equal(f.element('story-save').disabled, false);
});
test('encoder startup failure releases its microphone and restores the controls', async () => {
  const f = fixture(); f.recorder.start = () => { throw new Error('encoder failure'); };
  await assert.rejects(f.root.hooks.startRecording(), /Could not start/);
  assert.equal(f.counts().stopped, 1); assert.equal(f.root.hooks.state().recordingState, 'idle');
});
test('leaving during a pending permission request prevents late capture and stops its stream', async () => {
  const f = fixture(); let release;
  f.root.StoryRecording.openMicrophone = () => new Promise(resolve => { release = resolve; });
  const pending = f.root.hooks.startRecording();
  assert.equal(f.root.hooks.state().recordingState, 'requesting');
  f.events.get('pagehide')(); release(f.stream); await pending;
  assert.equal(f.root.hooks.state().recordingState, 'idle'); assert.equal(f.counts().stopped, 1);
  assert.equal(f.recorder.state, 'inactive');
});
test('an ended microphone preserves captured audio and labels the recording as interrupted', async () => {
  const f = fixture(); await f.root.hooks.startRecording(); f.recorder.chunk('partial');
  f.track.ended(); f.recorder.finish();
  assert.equal(await f.root.hooks.state().draft.blob.text(), 'partial');
  assert.match(f.element('record-state').textContent, /interrupted/);
  assert.equal(f.counts().stopped, 1);
});
test('retirement removes only bundled examples and their links, keeping personal and folder audio', async () => {
  const rows = [
    { id: 'demo-hello', source: 'example', created: 0 },
    { id: 'demo-chimes', source: 'example', created: 0 },
    { id: 'demo-rain', source: 'personal', created: 0 },
    { id: 'my-voice', source: 'personal', created: 1 },
    { id: 'folder-music', source: 'example', created: 1 }
  ];
  const f = fixture(rows, [{ key: 'code:OLD', storyId: 'demo-hello' }, { key: 'code:VOICE', storyId: 'my-voice' }]);
  await f.root.hooks.syncExamples();
  assert.deepEqual(f.data().map(s => s.id).sort(), ['demo-rain','folder-music','my-voice']);
  assert.deepEqual(f.links().map(l => l.key), ['code:VOICE']);
  await f.root.hooks.syncExamples(); assert.equal(f.data().length, 3, 'repeated migration changed preserved stories');
});
test('catalog sync keeps existing names and imports encoded paths with stable IDs', async () => {
  const f = fixture([{ id: 'starter-keep', title: 'My renamed story', source: 'example', created: 0 }]);
  const requested = [];
  f.root.fetch = async url => { requested.push(url); return { ok: true, json: async () => ({ version: 1, retiredIds: [], stories: [
    { id: 'starter-keep', title: 'Original', file: 'keep.mp3' },
    { id: 'starter-new', title: "Giraffe's New Friend", file: "Giraffe's New Friend.mp3", symbol: 'leaf' }
  ] }), blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }) }; };
  await f.root.hooks.syncExamples();
  assert.equal(f.data().find(s => s.id === 'starter-keep').title, 'My renamed story');
  assert.equal(f.data().find(s => s.id === 'starter-new').mime, 'audio/mpeg');
  assert.ok(requested.includes("./example-stories/Giraffe's%20New%20Friend.mp3"));
});
test('legacy tag links to retired virtual demos are removed even when no audio row exists', async () => {
  const f = fixture([], [{ key: 'code:OLD', storyId: 'demo-hello' }]);
  await f.root.hooks.refresh(); await f.root.hooks.syncExamples();
  assert.equal(f.links().length, 0);
});
test('child mode starts a persistent reader and the locked exit rejects an ordinary exit', async () => {
  const f = fixture(); await f.root.hooks.setChild(true);
  assert.equal(f.readers.length, 1); assert.equal(f.root.hooks.state().nfcSession.ready, true);
  await f.root.hooks.setChild(false); assert.equal(f.root.hooks.state().child, true);
  await f.root.hooks.setChild(false, true); assert.equal(f.root.hooks.state().child, false);
  assert.equal(f.readers[0].signal.aborted, true); assert.equal(f.storage.has('storytouch-child-active'), false);
});
test('black child mode hides story controls and always locks exit, even with the ordinary lock off', async () => {
  const f = fixture(); f.root.hooks.configure({ childScreen: 'black', childLock: false });
  await f.root.hooks.setChild(true);
  assert.equal(f.root.hooks.state().blackChild, true); assert.equal(f.element('child-content').hidden, true);
  assert.equal(f.element('player').inert, true); assert.equal(f.root.document.body.classList.contains('black-child'), true);
  await f.root.hooks.setChild(false); assert.equal(f.root.hooks.state().child, true);
  await f.root.hooks.setChild(false, true); assert.equal(f.element('player').inert, false);
});
test('unsupported NFC stays in adult mode without exposing any child story picker', async () => {
  const f = fixture(); f.root.NDEFReader = undefined; await f.root.hooks.setChild(true);
  assert.equal(f.root.hooks.state().child, false); assert.match(f.element('app-error').textContent, /Android phone/);
});
test('NFC denial returns to adult mode and clears the listening session', async () => {
  const f = fixture(); f.root.NDEFReader = class { async scan() { throw { name: 'NotAllowedError' }; } };
  await f.root.hooks.setChild(true); assert.equal(f.root.hooks.state().child, false);
  assert.equal(f.root.hooks.state().nfcSession, null); assert.match(f.element('app-error').textContent, /Allow NFC/);
});
test('the Start control waits for initialization and its actual click handler opens child mode', async () => {
  const f = fixture(); f.root.hooks.setInitialized(false);
  assert.equal(f.element('mode-button').disabled, true);
  await f.root.hooks.setChild(true); assert.equal(f.root.hooks.state().child, false);
  f.root.hooks.setInitialized(true); assert.equal(f.element('mode-button').disabled, false);
  await f.element('mode-button').emit('click'); await Promise.resolve();
  assert.equal(f.root.hooks.state().child, true); assert.equal(f.readers.length, 1);
});
test('repeated Start calls retain the active reader and preserve playback', async () => {
  const f = fixture(audioRows()); await f.root.hooks.setChild(true);
  await f.root.hooks.playTagStory('bell', 'code:BELL'); f.element('story-audio').currentTime = 7;
  await f.root.hooks.setChild(true); await f.root.hooks.setChild(true);
  assert.equal(f.readers.length, 1); assert.equal(f.readers[0].signal.aborted, false);
  assert.equal(f.element('story-audio').paused, false); assert.equal(f.element('story-audio').currentTime, 7);
});
test('a repeated Start during pending NFC permission does not create another reader', async () => {
  const f = fixture(); let resolve;
  f.root.NDEFReader = class { constructor() { f.readers.push(this); } scan({ signal }) { this.signal = signal; return new Promise(r => { resolve = r; }); } };
  const starting = f.root.hooks.setChild(true);
  await f.root.hooks.setChild(true); assert.equal(f.readers.length, 1);
  resolve(); await starting; assert.equal(f.root.hooks.state().nfcSession.ready, true);
});
test('visibility suspends child listening without aborting it and cancels an in-progress exit hold', async () => {
  const f = fixture(); await f.root.hooks.setChild(true); f.root.hooks.exitHold.start('key', ' ');
  f.root.document.hidden = true; f.documentEvents.get('visibilitychange')();
  assert.equal(f.readers[0].signal.aborted, false); assert.equal(f.root.hooks.exitHold.active, null);
  f.root.document.hidden = false; f.documentEvents.get('visibilitychange')();
  assert.equal(f.readers.length, 1); assert.equal(f.root.hooks.state().nfcSession.ready, true);
});
test('a page restored from browser back-forward cache restarts its former child reader', async () => {
  const f = fixture(); await f.root.hooks.setChild(true);
  f.events.get('pagehide')(); assert.equal(f.readers[0].signal.aborted, true);
  f.events.get('pageshow')({ persisted: true }); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.readers.length, 2); assert.equal(f.root.hooks.state().child, true);
});
function audioRows(kind = 'audio') {
  return [{ id: 'bell', title: 'Bell song', kind, symbol: 'star', source: 'personal', created: 1, text: 'Let us sing.', blob: new Blob(['audio']) }];
}
test('optional repeat-tag pause and resume preserve the audio position; another tag restarts', async () => {
  const f = fixture(audioRows()); f.root.hooks.configure({ tapToPause: true }); await f.root.hooks.setChild(true);
  await f.root.hooks.playTagStory('bell', 'code:BELL'); f.element('story-audio').currentTime = 12;
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('story-audio').paused, true);
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('story-audio').paused, false);
  assert.equal(f.element('story-audio').currentTime, 12);
  await f.root.hooks.playTagStory('bell', 'code:OTHER'); assert.equal(f.element('story-audio').currentTime, 0);
});
test('repeat-tag pause also supports written stories', async () => {
  const f = fixture(audioRows('text')); f.root.hooks.configure({ tapToPause: true }); await f.root.hooks.setChild(true);
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('player-state').textContent, 'Playing');
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('player-state').textContent, 'Paused');
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('player-state').textContent, 'Playing');
});
test('repeat-tag behavior stays restart-by-default and finished audio restarts rather than pauses', async () => {
  const f = fixture(audioRows()); await f.root.hooks.setChild(true);
  await f.root.hooks.playTagStory('bell', 'code:BELL'); f.element('story-audio').currentTime = 5;
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('story-audio').currentTime, 0);
  f.root.hooks.configure({ tapToPause: true }); f.element('story-audio').ended = true; f.element('story-audio').paused = true;
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('story-audio').paused, false);
});
test('rapid duplicate NFC reads do not immediately pause a new story and hidden reads do nothing', async () => {
  const f = fixture(audioRows(), [{ key: 'code:BELL', storyId: 'bell' }]);
  await f.root.hooks.refresh(); f.root.hooks.configure({ tapToPause: true }); await f.root.hooks.setChild(true);
  const event = { message: { records: [{ recordType: 'text', data: new TextEncoder().encode('BELL') }] } };
  await f.readers[0].onreading(event); await f.readers[0].onreading(event);
  assert.equal(f.element('story-audio').paused, false); assert.equal(f.readers[0].signal.aborted, false);
  f.root.hooks.state().nfcSession.lastTime = 0; f.root.document.hidden = true; await f.readers[0].onreading(event);
  assert.equal(f.element('story-audio').paused, false);
  f.root.document.hidden = false; await f.readers[0].onreading(event); assert.equal(f.element('story-audio').paused, true);
});
test('all child settings save together without dropping voice or playback preferences', () => {
  const f = fixture(); f.root.hooks.configure({ spoken: true, playbackRate: .9 });
  f.element('child-screen-black').checked = true; f.element('child-touch-pause').checked = true;
  f.element('child-keep-awake').checked = true; f.element('child-tap-pause').checked = true;
  f.root.hooks.saveChildSettings(); const o = f.root.hooks.state().options;
  assert.equal(o.childScreen, 'black'); assert.equal(o.tapToPause, true); assert.equal(o.keepAwake, true);
  assert.equal(o.touchToPause, true); assert.equal(o.childLock, true); assert.equal(o.spoken, true); assert.equal(o.playbackRate, .9);
});
test('the installed Add story shortcut opens its intended parent panel', async () => {
  const f = fixture(); f.root.location.hash = '#view=add'; await f.root.hooks.handleHash();
  assert.equal(f.element('panel-add').hidden, false); assert.equal(f.element('panel-library').hidden, true);
});
test('a cold child shortcut asks for a deliberate start, and parent URLs cannot bypass an active lock', async () => {
  const f = fixture(); f.root.location.hash = '#mode=child'; await f.root.hooks.handleHash();
  assert.equal(f.root.hooks.state().child, false); assert.equal(f.readers.length, 0);
  f.root.navigator.permissions = { async query() { return { state: 'granted' }; } }; await f.root.hooks.handleHash();
  assert.equal(f.root.hooks.state().child, true); f.root.location.hash = '#view=add'; await f.root.hooks.handleHash();
  assert.equal(f.root.hooks.state().child, true);
});
test('app updates wait for folder imports, backup downloads and preview playback', () => {
  const f = fixture(); assert.equal(f.root.hooks.canUpdate(), true);
  for (const id of ['example-folder-add','backup-export','story-save']) {
    f.element(id).disabled = true; assert.equal(f.root.hooks.canUpdate(), false); f.element(id).disabled = false;
  }
  f.element('audio-preview').paused = false; assert.equal(f.root.hooks.canUpdate(), false);
});

test('child mode always locks legacy unlocked preferences and tucks the player drawer', async () => {
  const f = fixture(); f.root.hooks.configure({ childLock: false }); await f.root.hooks.setChild(true);
  assert.equal(f.element('player-drawer-body').hidden, true); assert.equal(f.element('player-drawer-body').inert, true);
  await f.root.hooks.setChild(false); assert.equal(f.root.hooks.state().child, true);
  f.root.hooks.setPlayerDrawer(true); assert.equal(f.element('player-drawer-body').inert, false);
  f.root.hooks.setPlayerDrawer(false); assert.equal(f.element('player-drawer-body').hidden, true);
  await f.root.hooks.setChild(false, true); assert.equal(f.element('player-drawer-body').hidden, false);
});

test('screen touch pauses audio and written stories in child mode, leaving the NFC session running', async () => {
  for (const kind of ['audio', 'text']) {
    const f = fixture(audioRows(kind)); await f.root.hooks.setChild(true); await f.root.hooks.playTagStory('bell', 'code:BELL');
    f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
    assert.equal(f.element('player-state').textContent, 'Paused'); assert.equal(f.readers[0].signal.aborted, false);
  }
});
test('screen touch never pauses adult playback and respects the saved child-mode opt-out', async () => {
  const f = fixture(audioRows()); await f.root.hooks.playTagStory('bell', 'code:BELL');
  const touch = () => f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
  touch(); assert.equal(f.element('story-audio').paused, false);
  f.root.hooks.configure({ touchToPause: false }); await f.root.hooks.setChild(true); await f.root.hooks.playTagStory('bell', 'code:BELL');
  touch(); assert.equal(f.element('story-audio').paused, false);
});

test('child mode suppresses long-press menus while adult controls and code inputs keep normal behavior', async () => {
  const f = fixture(); let blocked = 0; const menu = input => ({ target: { closest() { return input ? {} : null; } }, preventDefault() { blocked++; } });
  f.documentEvents.get('contextmenu')(menu(false)); assert.equal(blocked, 0);
  await f.root.hooks.setChild(true); f.documentEvents.get('contextmenu')(menu(false)); assert.equal(blocked, 1);
  f.documentEvents.get('contextmenu')(menu(true)); assert.equal(blocked, 1);
});

test('now-playing mode shows only the tagged story and its associated text and image', async () => {
  const row = { ...audioRows()[0], transcript: 'A bell rings softly.', image: new Blob(['picture'], { type: 'image/png' }) };
  const f = fixture([row]); f.root.hooks.configure({ childScreen: 'now-playing' }); await f.root.hooks.setChild(true);
  assert.equal(f.element('child-idle').hidden, false); await f.root.hooks.playTagStory('bell', 'code:BELL');
  assert.equal(f.element('child-idle').hidden, true); assert.equal(f.element('child-story-title').textContent, 'Bell song');
  assert.equal(f.element('child-story-text').textContent, 'A bell rings softly.'); assert.match(f.element('child-art').innerHTML, /<img/);
  assert.equal(f.element('player-drawer-body').hidden, false);
});
test('optional red Stop resets media without stopping NFC or leaving dark mode', async () => {
  const f = fixture(audioRows()); f.root.hooks.configure({ showStop: true }); await f.root.hooks.setChild(true);
  assert.equal(f.element('child-stop-audio').hidden, false); await f.root.hooks.playTagStory('bell', 'code:BELL');
  f.element('story-audio').currentTime = 8; await f.element('child-stop-audio').emit('click');
  assert.equal(f.element('story-audio').paused, true); assert.equal(f.element('story-audio').currentTime, 0);
  assert.equal(f.readers[0].signal.aborted, false); assert.equal(f.root.hooks.state().blackChild, true);
});
test('a tag resumes a screen-paused story at the same position even when repeat-tag pause is off', async () => {
  const f = fixture(audioRows()); await f.root.hooks.setChild(true); await f.root.hooks.playTagStory('bell', 'code:BELL');
  f.element('story-audio').currentTime = 12;
  f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('story-audio').paused, false);
  assert.equal(f.element('story-audio').currentTime, 12);
});
