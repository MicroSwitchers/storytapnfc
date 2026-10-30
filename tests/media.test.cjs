'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  const handlers = new Map(), positions = [];
  const session = { setActionHandler(name, callback) { handlers.set(name, callback); }, setPositionState(value) { positions.push(value); } };
  const root = { navigator: { mediaSession: session }, location: { href: 'https://stories.test/family/index.html' }, URL, MediaMetadata: class { constructor(data) { Object.assign(this, data); } } };
  root.globalThis = root; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media.js'), 'utf8'), root);
  return { root, session, handlers, positions };
}
test('native controls receive story metadata and call the existing player actions', () => {
  const f = fixture(); let paused = 0; const controls = new f.root.StoryMedia.Controls({ pause: () => paused++ });
  controls.sync({ id: 'teddy', title: 'Teddy Bear', kind: 'audio' }, 'playing', { duration: 20, currentTime: 4, playbackRate: 1 });
  assert.equal(f.session.metadata.title, 'Teddy Bear'); assert.equal(f.session.playbackState, 'playing');
  f.handlers.get('pause')({}); assert.equal(paused, 1); assert.equal(f.positions[0].position, 4);
});
test('native timeline positions are clamped and unknown durations are cleared', () => {
  const f = fixture(), controls = new f.root.StoryMedia.Controls({});
  controls.sync({ id: 'song', kind: 'audio', title: 'Song', duration: 12 }, 'paused', { duration: Infinity, currentTime: 80, playbackRate: 0 });
  assert.equal(f.positions.at(-1).position, 12); assert.equal(f.positions.at(-1).playbackRate, 1);
  controls.sync({ id: 'unknown', title: 'Unknown', kind: 'audio' }, 'paused', {}); assert.equal(f.positions.at(-1), undefined);
});
test('written stories do not advertise unsupported seeking and clearing a story removes handlers', () => {
  const f = fixture(), controls = new f.root.StoryMedia.Controls({});
  controls.sync({ id: 'written', title: 'Written', kind: 'text' }, 'playing', {}); assert.equal(f.handlers.get('seekto'), null);
  controls.sync(null, 'none', {}); assert.equal(f.session.metadata, null); assert.equal(f.handlers.get('play'), null);
});
test('unsupported media APIs are optional and cannot break playback', () => {
  const f = fixture(); delete f.root.navigator.mediaSession;
  assert.doesNotThrow(() => new f.root.StoryMedia.Controls({}).sync({ id: 'story' }, 'playing', {}));
});
