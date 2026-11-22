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
  const vibrations = [];
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
    navigator: { mediaDevices: { getUserMedia() {} }, vibrate(pattern) { vibrations.push(pattern); return true; } }, isSecureContext: true, MediaRecorder: function () {},
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
  return { root, recorder, stream, track, events, documentEvents, element, readers, vibrations, storage, counts: () => ({ stopped, meterStopped }), data: () => data, links: () => linkData };
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
test('story cards identify device storage and source, while linked tags expose their unlink action and ID', async () => {
  const story = { ...audioRows()[0], origin: 'uploaded', sourceName: 'bedtime-song.mp3', created: 1000 };
  const f = fixture([story], [{ key: 'code:BELL', storyId: story.id }]); await f.root.hooks.refresh();
  const card = f.element('story-grid').innerHTML, tags = f.element('linked-tags').innerHTML;
  assert.match(card, /Stored on this device in StoryTouch/); assert.match(card, /Uploaded file: bedtime-song\.mp3/);
  assert.match(card, /Edit or delete Bell song/);
  assert.match(tags, /Tag ID: BELL/); assert.match(tags, /Unlink tag/);
  assert.match(tags, /physical tag is not erased/);
});
test('tag preview displays clear text details for linked, blank, and unassociated tags', async () => {
  async function preview(event, rows = [], links = []) {
    const f = fixture(rows, links);
    await f.root.hooks.refresh(); await f.root.hooks.startScan('preview');
    await f.readers[0].onreading(event);
    return { text: f.element('preview-tag-status').textContent, aborted: f.readers[0].signal.aborted };
  }
  const story = { ...audioRows()[0], title: 'Snowy Day' };
  const linked = await preview({ serialNumber: '04:AA', message: { records: [{ recordType: 'text', data: new TextEncoder().encode('BELL') }] } },
    [story], [{ key: 'code:BELL', storyId: 'bell' }]);
  assert.equal(linked.text, 'Title: Snowy Day\nTag ID: serial number 04:AA; tag code BELL\nTag data: StoryTouch tag code BELL.\nStatus: Linked to this story.');
  assert.equal(linked.aborted, true);
  const idLinked = await preview({ serialNumber: '04:CC', message: { records: [] } },
    [story], [{ key: 'uid:04:cc', storyId: 'bell' }]);
  assert.equal(idLinked.text, 'Title: Snowy Day\nTag ID: serial number 04:CC\nTag data: Blank (no NDEF records).\nStatus: Linked to this story by tag ID.');
  const blank = await preview({ serialNumber: '04:BB', message: { records: [] } });
  assert.equal(blank.text, 'Title: No linked story\nTag ID: serial number 04:BB\nTag data: Blank (no NDEF records).\nStatus: Not linked to a story in this library.');
  const unknown = await preview({ message: { records: [{ recordType: 'text', data: new TextEncoder().encode('UNKNOWN') }] } });
  assert.equal(unknown.text, 'Title: No linked story\nTag ID: tag code UNKNOWN\nTag data: StoryTouch tag code UNKNOWN.\nStatus: Not linked to a story in this library.');
  const unrecognized = await preview({ serialNumber: '04:DD', message: { records: [{ recordType: 'mime', data: new Uint8Array([1]) }] } });
  assert.equal(unrecognized.text, 'Title: No linked story\nTag ID: serial number 04:DD\nTag data: Written NDEF data is present, but no StoryTouch tag code was recognized.\nStatus: Not linked to a story in this library.');
});
test('haptic feedback distinguishes ready, recognized, and unknown tags and can be disabled', async () => {
  const f = fixture(audioRows(), [{ key: 'code:BELL', storyId: 'bell' }]); f.root.hooks.configure({ sounds: false });
  await f.root.hooks.refresh(); await f.root.hooks.setChild(true);
  assert.deepEqual(Array.from(f.vibrations[0]), [18], 'listening start should give a short confirmation');
  const event = { message: { records: [{ recordType: 'text', data: new TextEncoder().encode('BELL') }] } };
  await f.readers[0].onreading(event);
  assert.deepEqual(Array.from(f.vibrations[1]), [32], 'a recognized tag should give a distinct confirmation');
  await f.element('child-pause-audio').emit('click');
  assert.deepEqual(Array.from(f.vibrations[2]), [18, 35, 18], 'pause should have its own feedback');
  await f.element('child-pause-audio').emit('click');
  assert.deepEqual(Array.from(f.vibrations[3]), [32], 'resume should confirm playback');
  await f.element('child-stop-audio').emit('click');
  assert.deepEqual(Array.from(f.vibrations[4]), [45], 'stop should have its own feedback');
  await f.readers[0].onreading(event);
  assert.equal(f.vibrations.length, 5, 'duplicate reads should not vibrate');

  const unknown = fixture(); await unknown.root.hooks.setChild(true);
  await unknown.readers[0].onreading({ message: { records: [] } });
  assert.deepEqual(Array.from(unknown.vibrations[1]), [22, 50, 22], 'an unlinked tag should give a distinct warning');
  await unknown.readers[0].onreading({ message: { records: [] } });
  assert.equal(unknown.vibrations.length, 2, 'repeated unknown reads should be rate limited');

  const disabled = fixture(); disabled.element('feedback-haptics').checked = false;
  await disabled.element('feedback-haptics').emit('change');
  await disabled.root.hooks.setChild(true);
  assert.equal(disabled.vibrations.length, 0, 'disabled haptics should stay silent');

  const unsupported = fixture(); unsupported.root.navigator.vibrate = undefined;
  await unsupported.root.hooks.setChild(true);
  assert.equal(unsupported.root.hooks.state().child, true, 'unsupported vibration should not prevent NFC listening');
});
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
test('repeat-tag stop takes precedence over pause and resets both story types without leaving child mode', async () => {
  for (const kind of ['audio', 'text']) {
    const f = fixture(audioRows(kind)); f.root.hooks.configure({ tapToPause: true, tapToStop: true }); await f.root.hooks.setChild(true);
    await f.root.hooks.playTagStory('bell', 'code:BELL');
    if (kind === 'audio') f.element('story-audio').currentTime = 12;
    await f.root.hooks.playTagStory('bell', 'code:BELL');
    assert.equal(f.root.hooks.state().child, true);
    if (kind === 'audio') {
      assert.equal(f.element('story-audio').paused, true); assert.equal(f.element('story-audio').currentTime, 0);
    } else assert.equal(f.element('player-state').textContent, 'Stopped');
    await f.root.hooks.playTagStory('bell', 'code:BELL');
    assert.equal(f.element('story-audio').paused, kind === 'text');
    await f.element('child-pause-audio').emit('click');
    await f.root.hooks.playTagStory('bell', 'code:BELL');
    assert.equal(f.element('player-state').textContent, 'Stopped');
    assert.equal(f.root.hooks.state().nfcSession.controller.signal.aborted, false);
  }
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
test('all child settings save together without dropping voice or playback preferences', async () => {
  const f = fixture(); f.root.hooks.configure({ spoken: true, playbackRate: .9 });
  f.element('child-screen-black').checked = true; f.element('child-touch-action').value = 'stop';
  f.element('child-show-stop').checked = true; f.element('child-show-pause').checked = true;
  f.element('child-keep-awake').checked = true; f.element('child-tap-pause').checked = true; f.element('child-tap-stop').checked = true;
  await f.element('child-tap-stop').emit('change'); const o = f.root.hooks.state().options;
  assert.equal(o.childScreen, 'black'); assert.equal(o.tapToPause, true); assert.equal(o.tapToStop, true); assert.equal(o.keepAwake, true);
  assert.equal(o.touchAction, 'stop'); assert.equal(o.showStop, true); assert.equal(o.showPause, true);
  assert.equal(o.childLock, true); assert.equal(Object.hasOwn(o, 'spoken'), false); assert.equal(o.playbackRate, .9);
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

test('configured screen-touch Pause works for audio and written stories, leaving NFC running', async () => {
  for (const kind of ['audio', 'text']) {
    const f = fixture(audioRows(kind)); f.root.hooks.configure({ touchAction: 'pause' });
    await f.root.hooks.setChild(true); await f.root.hooks.playTagStory('bell', 'code:BELL');
    f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
    assert.equal(f.element('player-state').textContent, 'Paused'); assert.equal(f.readers[0].signal.aborted, false);
  }
});
test('screen touch never pauses adult playback and respects the saved child-mode opt-out', async () => {
  const f = fixture(audioRows()); await f.root.hooks.playTagStory('bell', 'code:BELL');
  assert.equal(f.root.hooks.state().options.touchAction, 'none');
  const touch = () => f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
  touch(); assert.equal(f.element('story-audio').paused, false);
  f.root.hooks.configure({ touchAction: 'none' }); await f.root.hooks.setChild(true); await f.root.hooks.playTagStory('bell', 'code:BELL');
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
test('default red Stop resets media without stopping NFC or leaving dark mode', async () => {
  const f = fixture(audioRows()); await f.root.hooks.setChild(true);
  assert.equal(f.element('child-stop-audio').hidden, false); assert.equal(f.element('child-pause-audio').hidden, true);
  await f.root.hooks.playTagStory('bell', 'code:BELL');
  f.element('story-audio').currentTime = 8; await f.element('child-stop-audio').emit('click');
  assert.equal(f.element('story-audio').paused, true); assert.equal(f.element('story-audio').currentTime, 0);
  assert.equal(f.readers[0].signal.aborted, false); assert.equal(f.root.hooks.state().blackChild, true);
});
test('optional Pause and Resume work with either story type and screen-touch Stop resets playback', async () => {
  for (const kind of ['audio', 'text']) {
    const f = fixture(audioRows(kind)); f.root.hooks.configure({ showStop: false, showPause: true, touchAction: 'stop' });
    await f.root.hooks.setChild(true);
    const pause = f.element('child-pause-audio'), label = f.element('child-pause-label'), audio = f.element('story-audio');
    assert.equal(f.element('child-stop-audio').hidden, true); assert.equal(pause.hidden, false); assert.equal(pause.disabled, true);
    await f.root.hooks.playTagStory('bell', 'code:BELL'); audio.currentTime = 8;
    assert.equal(pause.disabled, false); assert.equal(label.textContent, 'Pause');
    await pause.emit('click'); assert.equal(f.element('player-state').textContent, 'Paused'); assert.equal(label.textContent, 'Resume');
    await pause.emit('click'); assert.equal(f.element('player-state').textContent, 'Playing'); assert.equal(audio.currentTime, 8);
    f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
    assert.equal(f.element('player-state').textContent, 'Stopped'); assert.equal(pause.disabled, true); assert.equal(audio.currentTime, 0);
    assert.equal(f.readers[0].signal.aborted, false);
    await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(label.textContent, 'Pause'); assert.equal(audio.currentTime, 0);
  }
});
test('a tag resumes a screen-paused story at the same position even when repeat-tag pause is off', async () => {
  const f = fixture(audioRows()); f.root.hooks.configure({ touchAction: 'pause' });
  await f.root.hooks.setChild(true); await f.root.hooks.playTagStory('bell', 'code:BELL');
  f.element('story-audio').currentTime = 12;
  f.documentEvents.get('pointerdown')({ button: 0, target: { closest() { return null; } }, preventDefault() {} });
  await f.root.hooks.playTagStory('bell', 'code:BELL'); assert.equal(f.element('story-audio').paused, false);
  assert.equal(f.element('story-audio').currentTime, 12);
});

test('home offers one next step: add a story, then link a tag, then start listening', async () => {
  const f = fixture(); await f.root.hooks.refresh();
  assert.equal(f.element('home-title').textContent, 'Add your first story.');
  assert.equal(f.element('next-step').hidden, false); assert.equal(f.element('mode-button').hidden, true);
  f.data().push(audioRows()[0]); await f.root.hooks.refresh();
  assert.equal(f.element('home-title').textContent, 'Link your first tag.'); assert.equal(f.element('mode-button').hidden, true);
  f.links().push({ key: 'code:BELL', storyId: 'bell' }); await f.root.hooks.refresh();
  assert.equal(f.element('home-title').textContent, 'Ready to listen.');
  assert.equal(f.element('next-step').hidden, true); assert.equal(f.element('mode-button').hidden, false);
});
test('a device without NFC sees the requirement and is not offered a start it cannot use', async () => {
  const f = fixture(audioRows(), [{ key: 'code:BELL', storyId: 'bell' }]); f.root.NDEFReader = undefined; await f.root.hooks.refresh();
  assert.equal(f.element('home-needs').hidden, false); assert.equal(f.element('mode-button').hidden, true);
  assert.match(f.element('home-title').textContent, /Android/);
});
test('adult Stop closes the player and keeps its stopped state', async () => {
  const f = fixture(audioRows()); await f.root.hooks.playTagStory('bell', 'code:BELL');
  assert.equal(f.element('player').hidden, false); await f.element('player-stop').emit('click');
  assert.equal(f.element('player').hidden, true); assert.equal(f.root.hooks.state().selected, null);
  assert.equal(f.element('player-state').textContent, 'Stopped');
});
test('an unknown tag on the dark screen gives a visible signal and keeps NFC running', async () => {
  const f = fixture(audioRows(), [{ key: 'code:BELL', storyId: 'bell' }]); await f.root.hooks.refresh(); await f.root.hooks.setChild(true);
  assert.equal(f.element('child-ready').hidden, false);
  await f.readers[0].onreading({ message: { records: [{ recordType: 'text', data: new TextEncoder().encode('OTHER') }] } });
  assert.equal(f.element('child-signal').hidden, false); assert.equal(f.element('child-ready').hidden, true);
  assert.equal(f.readers[0].signal.aborted, false);
});
test('a failed tag scan is explained in the wizard and offers the scan again', async () => {
  const f = fixture(audioRows()); await f.root.hooks.refresh(); f.element('link-story').value = 'bell';
  f.root.NDEFReader = class { async scan() { throw { name: 'NotReadableError' }; } };
  await f.element('read-link').emit('click'); await new Promise(resolve => setImmediate(resolve));
  assert.match(f.element('link-scan-state').textContent, /Turn NFC on/); assert.equal(f.element('read-link').hidden, false);
  assert.equal(f.element('tag-visual').classList.contains('is-error'), true); assert.equal(f.element('app-error').hidden, true);
});
