'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
function backup(image) {
  return { format: 'storytouch-backup', version: 2, stories: [{ id: 'picture-story', title: 'A story', symbol: 'book', transcript: 'Words', kind: 'text', text: 'Words', voiceURI: '', voiceLang: '', rate: 1, duration: 0, ...(image === undefined ? {} : { image }) }], links: [] };
}
test('old picture-free backups remain valid and optional picture data is retained', () => {
  assert.equal(C.validateBackup(backup()).stories.length, 1);
  const data = backup({ mime: 'image/png', data: 'YQ==' });
  assert.equal(C.validateBackup(data).stories[0].image.data, 'YQ==');
});
test('backup pictures reject active SVG content, invalid base64 and oversized data', () => {
  for (const image of [{ mime: 'image/svg+xml', data: 'YQ==' }, { mime: 'image/png', data: '$$$$' }, { mime: 'image/png', data: '' }, { mime: 'image/png', data: 'A'.repeat(Math.ceil(C.MAX_IMAGE / 3) * 4 + 4) }]) assert.throws(() => C.validateBackup(backup(image)), /picture/);
});
test('child markup contains only tag-selected content, Stop and the parent handle', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const child = html.slice(html.indexOf('<section id="child-view"'), html.indexOf('</section>', html.indexOf('<section id="child-view"')));
  assert.doesNotMatch(child, /data-play|<select|<form|child-stories|child-code/);
  assert.match(child, /child-now-playing/); assert.match(child, /child-stop-audio/); assert.match(child, /child-exit/);
  assert.match(html, /id="exit-hold-seconds"[\s\S]*?value="2"[\s\S]*?value="5"/);
  assert.match(html, /id="exit-tap-count"[\s\S]*?value="3"[\s\S]*?value="5"/);
});
