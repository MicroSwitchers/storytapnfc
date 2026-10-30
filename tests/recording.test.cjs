'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture(overrides = {}) {
  const root = { ...overrides, setInterval, clearInterval, Float32Array, Date, Math };
  root.globalThis = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../recording.js'), 'utf8'), root);
  return root;
}
test('natural capture uses optional quality targets without automatic gain or call filtering', () => {
  const { StoryRecording: R } = fixture();
  const c = R.constraints();
  assert.equal(c.video, false);
  assert.equal(c.audio.sampleRate.ideal, 48000);
  assert.equal(c.audio.channelCount.ideal, 1);
  assert.equal(c.audio.echoCancellation.ideal, false);
  assert.equal(c.audio.autoGainControl.ideal, false);
  assert.equal(c.audio.noiseSuppression.ideal, false);
  assert.equal(R.constraints(true).audio.noiseSuppression.ideal, true);
  assert.ok(Object.values(c.audio).every(value => !('exact' in value)));
});
test('constraint rejection retries once with a basic microphone request', async () => {
  const calls = [], stream = {};
  const root = fixture({ navigator: { mediaDevices: { getUserMedia: async c => {
    calls.push(c); if (calls.length === 1) throw { name: 'OverconstrainedError' }; return stream;
  } } } });
  assert.equal(await root.StoryRecording.openMicrophone(), stream);
  assert.equal(calls.length, 2); assert.equal(calls[1].audio, true);
});
test('permission denial is not retried', async () => {
  let calls = 0;
  const root = fixture({ navigator: { mediaDevices: { getUserMedia: async () => {
    calls++; throw { name: 'NotAllowedError' };
  } } } });
  await assert.rejects(root.StoryRecording.openMicrophone(), e => e.name === 'NotAllowedError');
  assert.equal(calls, 1);
});
test('Opus capture requests 192 kbps and preserves the original input stream', () => {
  class Recorder { static isTypeSupported(type) { return type.includes('opus'); }
    constructor(stream, options) { Object.assign(this, { stream, options }); } }
  const root = fixture({ MediaRecorder: Recorder }), stream = {};
  const r = root.StoryRecording.createRecorder(stream);
  assert.equal(r.stream, stream); assert.equal(r.options.audioBitsPerSecond, 192000);
  assert.equal(r.options.mimeType, 'audio/webm;codecs=opus');
});
test('bitrate rejection falls back to the supported native encoder', () => {
  class Recorder { static isTypeSupported(type) { return type === 'audio/mp4'; }
    constructor(stream, options) { if (options.audioBitsPerSecond) throw { name: 'NotSupportedError' }; this.options = options; } }
  const r = fixture({ MediaRecorder: Recorder }).StoryRecording.createRecorder({});
  assert.equal(r.options.mimeType, 'audio/mp4'); assert.equal(r.options.audioBitsPerSecond, undefined);
});
test('a missing MIME support probe still uses the browser default encoder', () => {
  class Recorder { constructor(stream, options) { this.options = options; } }
  const r = fixture({ MediaRecorder: Recorder }).StoryRecording.createRecorder({});
  assert.equal(r.options.mimeType, undefined); assert.equal(r.options.audioBitsPerSecond, 192000);
});
test('a rejected preferred codec falls back to a second supported codec', () => {
  class Recorder { static isTypeSupported() { return true; }
    constructor(stream, options) { if (options.mimeType?.includes('webm')) throw { name: 'NotSupportedError' }; this.options = options; } }
  const r = fixture({ MediaRecorder: Recorder }).StoryRecording.createRecorder({});
  assert.equal(r.options.mimeType, 'audio/ogg;codecs=opus');
});
test('unexpected recorder errors are not swallowed by compatibility fallbacks', () => {
  class Recorder { constructor() { throw { name: 'SecurityError' }; } }
  assert.throws(() => fixture({ MediaRecorder: Recorder }).StoryRecording.createRecorder({}), e => e.name === 'SecurityError');
});
test('level monitoring never connects to speakers and cleans up once', () => {
  let tick, disconnected = 0, closed = 0, resumed = 0;
  const levels = [], analyser = { fftSize: 0, disconnect() { disconnected++; }, getFloatTimeDomainData(samples) { samples.fill(.995); } };
  class Context { constructor() { this.state = 'running'; }
    createMediaStreamSource() { return { connect(target) { assert.equal(target, analyser); }, disconnect() { disconnected++; } }; }
    createAnalyser() { return analyser; }
    resume() { resumed++; return Promise.resolve(); }
    close() { closed++; return Promise.resolve(); } }
  const root = fixture({ AudioContext: Context });
  root.setInterval = fn => { tick = fn; return 1; }; root.clearInterval = () => {};
  const stop = root.StoryRecording.monitor({}, value => levels.push(value));
  tick(); assert.equal(levels[0].state, 'loud'); assert.ok(levels[0].value <= 1);
  stop(); stop(); assert.equal(resumed, 1); assert.equal(closed, 1); assert.equal(disconnected, 2);
});
test('recording remains available without the optional level meter', () => {
  const levels = [], root = fixture();
  const stop = root.StoryRecording.monitor({}, value => levels.push(value)); stop();
  assert.deepEqual(levels, [null]);
});
