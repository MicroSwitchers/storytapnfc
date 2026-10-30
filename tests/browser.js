'use strict';
const frame = document.getElementById('app'), output = document.getElementById('results');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }
async function until(check, label) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(100); }
  throw new Error('Timed out: ' + label);
}
function pass(message) { output.textContent += 'PASS ' + message + '\n'; }
async function load() {
  await new Promise(resolve => { frame.onload = resolve; frame.src = '../index.html?browser-check=' + Date.now(); });
  await until(() => frame.contentDocument.querySelectorAll('#example-grid .story-card').length === 4, 'four starter stories');
}
async function putFixtures() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('storytouch', 2);
    req.onupgradeneeded = () => { ['stories','links','settings'].forEach(name => req.result.createObjectStore(name, { keyPath: name === 'stories' ? 'id' : 'key' })); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  const wav = new Uint8Array(46), view = new DataView(wav.buffer);
  function str(offset, text) { [...text].forEach((c, i) => wav[offset + i] = c.charCodeAt(0)); }
  str(0, 'RIFF'); view.setUint32(4, 38, true); str(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, 2, true);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['stories','links','settings'], 'readwrite');
    for (const id of ['demo-hello','demo-chimes','demo-rain','browser-personal','browser-folder']) {
      tx.objectStore('stories').put({ id, title: id, source: id === 'browser-personal' ? 'personal' : 'example',
        ...(id.startsWith('demo-') ? { catalogId: id } : {}), kind: 'audio', symbol: 'bear', transcript: '',
        blob: new Blob([wav], { type: 'audio/wav' }), mime: 'audio/wav', duration: 1, created: 1 });
    }
    tx.objectStore('links').put({ key: 'code:OLD-TEST', storyId: 'demo-hello' });
    tx.objectStore('links').put({ key: 'code:PERSONAL-TEST', storyId: 'browser-personal' });
    tx.objectStore('settings').put({ key: 'removed-examples', value: [] });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  }); db.close();
}
document.getElementById('run').addEventListener('click', async () => {
  document.getElementById('run').disabled = true; output.textContent = '';
  let context, oscillator;
  try {
    await putFixtures(); await load();
    let w = frame.contentWindow, d = frame.contentDocument, rows = await w.StoryStore.all('stories');
    assert(!rows.some(s => s.id.startsWith('demo-')), 'Retired bundled stories remain');
    assert(rows.some(s => s.id === 'browser-personal') && rows.some(s => s.id === 'browser-folder'), 'Personal or folder audio removed');
    const links = await w.StoryStore.all('links');
    assert(!links.some(l => l.key === 'code:OLD-TEST') && links.some(l => l.key === 'code:PERSONAL-TEST'), 'Migration changed the wrong tag links');
    pass('Retired examples and their links removed; personal audio, folder imports and their links preserved');
    context = new AudioContext({ sampleRate: 48000 }); await context.resume();
    const catalog = await (await fetch('../example-stories/stories.json')).json();
    for (const entry of catalog.stories) {
      const response = await fetch('../example-stories/' + entry.file.split('/').map(encodeURIComponent).join('/'));
      assert(response.ok, 'Missing audio: ' + entry.file);
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      assert(decoded.duration > 1, 'Empty audio: ' + entry.file);
      pass(entry.title + ': MP3 decoded (' + decoded.duration.toFixed(1) + ' seconds)');
    }
    const chosen = rows.find(s => s.catalogId);
    d.querySelector('[data-edit="' + chosen.id + '"]').click(); d.getElementById('edit-title').value = 'A renamed starter';
    d.getElementById('edit-form').requestSubmit();
    await until(() => !d.getElementById('edit-dialog').open, 'starter rename');
    await load(); w = frame.contentWindow; d = frame.contentDocument;
    assert((await w.StoryStore.all('stories')).find(s => s.id === chosen.id).title === 'A renamed starter', 'Renamed story overwritten');
    pass('Starter rename survives reload and catalog sync');
    d.getElementById('tab-add').click(); d.getElementById('source-record').click();
    const destination = context.createMediaStreamDestination();
    oscillator = context.createOscillator(); const gain = context.createGain(); gain.gain.value = .2;
    oscillator.frequency.value = 440; oscillator.connect(gain); gain.connect(destination); oscillator.start();
    let requested;
    Object.defineProperty(w.navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async options => { requested = options; return destination.stream; } });
    // Spy on native capture, retaining its real encoder and original chunks.
    const original = w.StoryRecording.createRecorder; let capturedRecorder;
    w.StoryRecording.createRecorder = stream => { capturedRecorder = original(stream); return capturedRecorder; };
    d.getElementById('story-title').value = 'Browser tone recording';
    d.getElementById('record-start').click();
    await until(() => !d.getElementById('record-stop').hidden, 'capture start');
    assert(requested.audio.autoGainControl.ideal === false && requested.audio.noiseSuppression.ideal === false, 'Natural capture constraints not applied');
    assert(capturedRecorder.audioBitsPerSecond === 192000, 'High quality bitrate not selected');
    assert(d.getElementById('record-noise-reduction').disabled, 'Recording options changed during capture');
    await until(() => d.getElementById('record-level').value > 0, 'live level meter');
    await delay(1300); d.getElementById('record-stop').click();
    await until(() => !d.getElementById('preview-wrap').hidden, 'finished audio preview');
    assert(destination.stream.getTracks().every(t => t.readyState === 'ended'), 'Microphone tracks leaked');
    const draft = await (async () => { await until(async () => (await w.StoryStore.getSetting('draft'))?.audio?.blob?.size > 0, 'persisted draft'); return w.StoryStore.getSetting('draft'); })();
    const decoded = await context.decodeAudioData(await draft.audio.blob.arrayBuffer());
    assert(decoded.duration >= 1, 'Final recording is truncated');
    const samples = decoded.getChannelData(0); let energy = 0, peak = 0, crossings = 0;
    for (let i = 0; i < samples.length; i++) { energy += samples[i] ** 2; peak = Math.max(peak, Math.abs(samples[i])); if (i && samples[i - 1] < 0 && samples[i] >= 0) crossings++; }
    const rms = Math.sqrt(energy / samples.length), hz = crossings / decoded.duration;
    assert(rms > .08 && rms < .2 && peak < .5 && Math.abs(hz - 440) < 5, 'Encoded signal is silent, distorted or at the wrong speed');
    pass('Real MediaRecorder: 192 kbps, live level, final chunk, track cleanup and a clean 440 Hz round trip');
    d.getElementById('story-form').requestSubmit();
    await until(async () => (await w.StoryStore.all('stories')).some(s => s.title === 'Browser tone recording'), 'saved recording');
    await load(); w = frame.contentWindow; d = frame.contentDocument;
    const saved = (await w.StoryStore.all('stories')).find(s => s.title === 'Browser tone recording');
    assert(saved.blob.size === draft.audio.blob.size && saved.mime === draft.audio.blob.type, 'Saved audio bytes/type changed');
    d.querySelector('[data-play="' + saved.id + '"]').click();
    await until(() => d.getElementById('story-audio').currentTime > 0, 'saved recording playback');
    d.getElementById('player-stop').click(); pass('Recording saves, survives reload, and plays');
    // Permission rejection must recover the controls and retain the earlier draft/library.
    d.getElementById('tab-add').click(); d.getElementById('source-record').click();
    Object.defineProperty(w.navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Test denial', 'NotAllowedError'); } });
    d.getElementById('record-start').click();
    await until(() => d.getElementById('app-error').textContent.includes('Microphone access was not allowed'), 'microphone denial');
    assert(!d.getElementById('record-start').hidden && !d.getElementById('story-save').disabled, 'Denied microphone left controls locked');
    pass('Microphone denial recovers the recording controls');
    await until(() => d.getElementById('offline-badge').textContent.includes('Ready for offline'), 'offline install');
    const registration = await w.navigator.serviceWorker.ready;
    const cacheNames = await caches.keys(), cache = await caches.open(cacheNames.find(name => name.startsWith('storytouch-shell-v' + d.getElementById('version-label').textContent)));
    assert(await cache.match(new URL('../recording.js', location.href)), 'Recorder module missing offline');
    for (const entry of catalog.stories) assert(await cache.match(new URL('../example-stories/' + entry.file.split('/').map(encodeURIComponent).join('/'), location.href)), 'Starter not cached: ' + entry.file);
    const rangeURL = new URL('../example-stories/' + catalog.stories[0].file.split('/').map(encodeURIComponent).join('/'), location.href);
    await until(() => !!w.navigator.serviceWorker.controller, 'service worker control');
    const range = await w.fetch(rangeURL, { headers: { Range: 'bytes=0-99' } });
    assert(range.status === 206 && (await range.arrayBuffer()).byteLength === 100, 'Cached audio range response failed');
    pass('Service worker caches the new recorder and all four MP3s; cached range playback responds correctly');
    output.textContent += '\nALL BROWSER CHECKS PASSED\n';
  } catch (error) { output.textContent += '\nFAIL ' + error.stack; }
  finally { oscillator?.stop(); await context?.close(); document.getElementById('run').disabled = false; }
});
