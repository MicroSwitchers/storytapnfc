'use strict';
const frame = document.getElementById('pwa-app'), output = document.getElementById('pwa-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }
async function until(check, label) { for (let i = 0; i < 220; i++) { try { if (await check()) return; } catch (_) {} await wait(100); } throw new Error('Timed out: ' + label); }
function pass(message) { output.textContent += 'PASS ' + message + '\n'; }
function fail(error) { output.textContent += '\nFAIL ' + error.stack + '\n'; }
async function load() {
  await new Promise(resolve => { frame.onload = resolve; frame.src = '../index.html?pwa-test=' + Date.now(); });
  await until(() => frame.contentDocument.getElementById('mode-button')?.disabled === false, 'app initialization');
  await until(() => frame.contentDocument.getElementById('offline-badge')?.textContent.includes('Ready for offline'), 'verified offline readiness');
}
let bytes, version;
document.getElementById('pwa-run').addEventListener('click', async () => {
  document.getElementById('pwa-run').disabled = true; output.textContent = '';
  try {
    await load(); let w = frame.contentWindow, d = frame.contentDocument;
    version = d.getElementById('version-label').textContent;
    const registration = await w.navigator.serviceWorker.ready;
    const status = await w.StoryPWA.request(registration.active, 'OFFLINE_STATUS');
    assert(status.ready && status.audioCount === 4, 'Incomplete app/audio cache'); pass('Worker verifies the complete app and all four bundled MP3s');
    const cache = await caches.open((await caches.keys()).find(k => k.startsWith(status.version) && k.endsWith(':' + registration.scope)));
    await cache.delete(new URL('../pwa.js', location.href));
    d.getElementById('offline-check').click();
    await until(() => d.getElementById('offline-check').textContent === 'Download offline files', 'detect missing cached asset');
    d.getElementById('offline-check').click();
    await until(() => d.getElementById('offline-check').textContent === 'Check offline files' && !d.getElementById('offline-check').disabled, 'offline repair');
    assert(await cache.match(new URL('../pwa.js', location.href)), 'Missing file not repaired'); pass('Missing offline files are detected and repaired');
    const first = (await w.StoryStore.all('stories')).find(s => s.source === 'example'); bytes = first.blob.size;
    await w.StoryStore.putStory({ ...first, id: 'pwa-check-personal', title: 'PWA check story', source: 'personal', catalogId: undefined, created: Date.now() });
    await w.StoryStore.putLink({ key: 'code:PWA-TEST', storyId: 'pwa-check-personal' });
    await load(); w = frame.contentWindow; d = frame.contentDocument;
    d.querySelector('[data-play="pwa-check-personal"]').click();
    await until(() => d.getElementById('story-audio').currentTime > 0, 'stored audio playback');
    if (w.navigator.mediaSession && w.MediaMetadata) assert(w.navigator.mediaSession.metadata.title === 'PWA check story', 'Native media metadata missing');
    d.getElementById('player-stop').click(); pass('Saved MP3 plays and native media metadata is populated where supported');
    d.getElementById('story-title').value = 'PWA offline draft'; d.getElementById('story-written').value = 'This draft stays on the device.';
    d.getElementById('story-written').dispatchEvent(new w.Event('input'));
    await until(async () => (await w.StoryStore.getSetting('draft'))?.title === 'PWA offline draft', 'draft saved');
    pass('Private story, tag link and draft saved for reload checks');
    output.textContent += '\nOFFLINE STAGE READY — stop the local server, then run step 2.\n'; document.getElementById('pwa-offline').disabled = false;
  } catch (error) { fail(error); document.getElementById('pwa-run').disabled = false; }
});
document.getElementById('pwa-offline').addEventListener('click', async () => {
  document.getElementById('pwa-offline').disabled = true;
  try {
    await load(); const w = frame.contentWindow, d = frame.contentDocument;
    const rows = await w.StoryStore.all('stories'), links = await w.StoryStore.all('links');
    assert(rows.find(s => s.id === 'pwa-check-personal')?.blob.size === bytes, 'Private audio lost on offline reload');
    assert(links.some(l => l.key === 'code:PWA-TEST'), 'Tag link lost on offline reload');
    assert(d.getElementById('story-title').value === 'PWA offline draft', 'Draft lost on offline reload');
    pass('Full app reload works with the server stopped, preserving private audio, links and draft');
    d.querySelector('[data-play="pwa-check-personal"]').click(); await until(() => d.getElementById('story-audio').currentTime > 0, 'offline saved-audio playback');
    d.getElementById('player-stop').click(); pass('Saved recording/audio plays without the server');
    const catalog = await (await w.fetch('./example-stories/stories.json')).json();
    const range = await w.fetch('./example-stories/' + catalog.stories[0].file.split('/').map(encodeURIComponent).join('/'), { headers: { Range: 'bytes=0-99' } });
    assert(range.status === 206 && (await range.arrayBuffer()).byteLength === 100, 'Offline MP3 range response failed');
    pass('Bundled MP3 range requests work without the server');
    const fallback = document.createElement('iframe'); fallback.title = 'Offline fallback check'; fallback.hidden = true; document.body.append(fallback);
    await new Promise(resolve => { fallback.onload = resolve; fallback.src = '../not-downloaded-page'; });
    assert(fallback.contentDocument.title === 'Offline — StoryTouch', 'Missing page did not show offline fallback'); fallback.remove();
    pass('Uncached navigation shows the offline recovery page');
    output.textContent += '\nOFFLINE CHECKS PASSED — restart the server with the next worker version, then run step 3.\n';
    document.getElementById('pwa-update').disabled = false;
  } catch (error) { fail(error); document.getElementById('pwa-offline').disabled = false; }
});
document.getElementById('pwa-update').addEventListener('click', async () => {
  document.getElementById('pwa-update').disabled = true;
  try {
    let w = frame.contentWindow, d = frame.contentDocument;
    d.getElementById('check-updates').click(); await until(() => !d.getElementById('app-update').hidden, 'update ready');
    assert(d.getElementById('version-label').textContent === version, 'Update replaced the app without consent');
    pass('New version waits for the adult to apply it');
    d.getElementById('story-title').value = 'Update preserved this draft';
    d.getElementById('story-title').dispatchEvent(new w.Event('input'));
    d.getElementById('update-now').click();
    await until(() => frame.contentDocument.getElementById('version-label')?.textContent !== version && frame.contentDocument.getElementById('mode-button')?.disabled === false, 'updated app reload');
    w = frame.contentWindow; d = frame.contentDocument;
    assert(d.getElementById('story-title').value === 'Update preserved this draft', 'Update did not save the pending draft');
    assert((await w.StoryStore.all('stories')).find(s => s.id === 'pwa-check-personal')?.blob.size === bytes, 'Update changed private audio');
    assert((await w.StoryStore.all('links')).some(l => l.key === 'code:PWA-TEST'), 'Update changed tag links');
    pass('User-approved update reloads once and preserves a pending draft, private audio and tag links');
    output.textContent += '\nALL PWA BROWSER CHECKS PASSED\n';
  } catch (error) { fail(error); document.getElementById('pwa-update').disabled = false; }
});
