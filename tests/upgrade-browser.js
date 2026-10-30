'use strict';
const frame = document.getElementById('app'), output = document.getElementById('results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, label) => { if (!value) throw new Error(label); };
const pass = label => { output.textContent += 'PASS ' + label + '\n'; };
async function until(check, label) { for (let i = 0; i < 400; i++) { try { if (await check()) return; } catch (_) {} await wait(100); } throw new Error('Timed out: ' + label); }
async function load() {
  await new Promise(resolve => { frame.onload = resolve; frame.src = '../index.html?upgrade-test=' + Date.now(); });
  await until(() => frame.contentDocument.getElementById('mode-button')?.disabled === false, 'app initialized');
  await until(() => frame.contentDocument.getElementById('offline-badge')?.textContent.includes('Ready for offline'), 'complete offline cache');
}
let oldDocument, oldWindow, bytes, oldVersion;
document.getElementById('seed').onclick = async () => {
  document.getElementById('seed').disabled = true;
  try {
    await load(); let w = frame.contentWindow, d = frame.contentDocument;
    oldVersion = d.getElementById('version-label').textContent;
    assert(oldVersion === '1.3.1', 'Fixture must begin with cached 1.3.1');
    const first = (await w.StoryStore.all('stories')).find(s => s.source === 'example'); bytes = first.blob.size;
    await w.StoryStore.putStory({ ...first, symbol: 'bear', id: 'upgrade-private', title: 'Upgrade private audio', source: 'personal', catalogId: undefined });
    await w.StoryStore.putLink({ key: 'code:UPGRADE', storyId: 'upgrade-private' });
    await w.StoryStore.putSetting('draft', { sourceMode: 'write', title: 'Keep my draft', text: 'My story survives the update.', symbol: 'moon', rate: '.9' });
    await load(); oldWindow = frame.contentWindow; oldDocument = frame.contentDocument;
    oldDocument.querySelector('[data-play="upgrade-private"]').click();
    await until(() => oldDocument.getElementById('story-audio').currentTime > 0, 'old audio playing');
    pass('Cached 1.3.1 plays private audio with a saved tag link and draft');
    output.textContent += 'SWITCH SERVER PHASE TO current, then run step 2.\n';
    document.getElementById('upgrade').disabled = false;
  } catch (error) { output.textContent += 'FAIL ' + error.stack; }
};
document.getElementById('upgrade').onclick = async () => {
  document.getElementById('upgrade').disabled = true;
  try {
    const audio = oldDocument.getElementById('story-audio');
    if (audio.ended) { audio.currentTime = 0; await audio.play(); }
    const elapsed = audio.currentTime, registration = await oldWindow.navigator.serviceWorker.ready;
    await registration.update();
    await until(async () => (await oldWindow.StoryPWA.request(registration.active, 'OFFLINE_STATUS')).version === 'storytouch-shell-v1.4.1-release', 'new worker activated with old tab open');
    assert(frame.contentDocument === oldDocument && !audio.paused && audio.currentTime >= elapsed, 'Update interrupted live playback');
    pass('New complete worker activates with an old tab open and leaves its playing audio running');
    audio.pause(); await load(); const w = frame.contentWindow, d = frame.contentDocument;
    assert(d.getElementById('version-label').textContent === '1.4.1', 'Normal navigation still shows old release');
    assert(d.getElementById('app-update').hidden, 'Current release has a spurious update banner');
    pass('Normal navigation opens 1.4.1 without closing other tabs or clearing site data');
    assert((await w.StoryStore.all('stories')).find(s => s.id === 'upgrade-private')?.blob.size === bytes, 'Private audio lost');
    assert((await w.StoryStore.all('links')).some(l => l.key === 'code:UPGRADE' && l.storyId === 'upgrade-private'), 'Tag link lost');
    assert(d.getElementById('story-title').value === 'Keep my draft', 'Draft lost');
    pass('Private audio bytes, tag link and saved draft survive the cached release upgrade');
    const cards = [...d.querySelectorAll('.story-cover')];
    assert(cards.length === 5 && cards.every(card => card.querySelector('.book-icon')), 'Some stories still use specific pictures');
    assert(d.querySelector('[data-play="upgrade-private"]').closest('.story-card').querySelector('.book-icon'), 'Legacy bear symbol was not rendered as a book');
    assert(w.getComputedStyle(d.documentElement).colorScheme === 'dark', 'Dark theme missing');
    assert(w.getComputedStyle(d.body).backgroundColor === 'rgba(0, 0, 0, 0)' && w.getComputedStyle(d.documentElement).backgroundColor === 'rgb(13, 20, 20)', 'Dark page background missing');
    pass('All starter and legacy story icons are books; the real app uses the dark theme');
    d.querySelector('[data-play="upgrade-private"]').click(); await until(() => d.getElementById('story-audio').currentTime > 0, 'new app private playback');
    assert(d.getElementById('player-picture').querySelector('.book-icon'), 'Player icon is not a book');
    d.getElementById('player-stop').click();
    pass('Preserved personal audio plays in the new release with a book player icon');
    output.textContent += 'ALL CACHED RELEASE UPGRADE CHECKS PASSED\n';
  } catch (error) { output.textContent += 'FAIL ' + error.stack; }
};
