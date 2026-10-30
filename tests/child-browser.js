'use strict';
const frame = document.getElementById('child-app'), output = document.getElementById('child-results');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }
async function until(check, label) { for (let i = 0; i < 150; i++) { if (check()) return; await delay(100); } throw new Error('Timed out: ' + label); }
function pass(text) { output.textContent += 'PASS ' + text + '\n'; }
document.getElementById('run-child').addEventListener('click', async () => {
  const run = document.getElementById('run-child'); run.disabled = true; output.textContent = '';
  try {
    await new Promise(resolve => { frame.onload = resolve; frame.src = '../index.html?child-check'; });
    const w = frame.contentWindow, d = frame.contentDocument;
    await until(() => d.querySelectorAll('#example-grid .story-card').length === 4 && !d.getElementById('mode-button').disabled, 'ready Start button');
    assert([...d.querySelectorAll('button')].filter(b => b.textContent.includes('Start child mode')).length === 1, 'Duplicate child-mode entry buttons');
    d.getElementById('child-settings-shortcut').click();
    d.getElementById('child-keep-awake').checked = false; d.getElementById('child-lock').checked = false;
    d.getElementById('child-screen-black').click();
    Object.defineProperty(w, 'NDEFReader', { configurable: true, value: undefined });
    d.getElementById('mode-button').click();
    await until(() => d.body.classList.contains('child-active'), 'child mode without NFC');
    assert(!d.body.classList.contains('black-child') && !d.getElementById('child-content').hidden, 'Unsupported NFC prevented fallback child mode');
    assert(d.getElementById('child-status').textContent.includes('cannot read NFC'), 'Missing visible NFC fallback explanation');
    d.getElementById('child-exit').click();
    pass('One Start button opens child mode with story buttons when NFC is unavailable');
    Object.defineProperty(w, 'NDEFReader', { configurable: true, value: class { async scan() { throw new w.DOMException('Test denial', 'NotAllowedError'); } } });
    d.getElementById('mode-button').click();
    await until(() => d.getElementById('child-status').textContent.includes('play a story below'), 'permission-denial fallback');
    assert(d.body.classList.contains('child-active') && !d.getElementById('child-content').hidden, 'NFC denial returned to adult mode');
    d.getElementById('child-exit').click();
    pass('NFC permission denial keeps child mode open with fallback and retry guidance');
    let reader;
    Object.defineProperty(w, 'NDEFReader', { configurable: true, value: class { constructor() { reader = this; } async scan({ signal }) { this.signal = signal; } } });
    const audio = d.getElementById('story-audio'); let paused = true, playhead = 0;
    Object.defineProperty(audio, 'paused', { get: () => paused }); Object.defineProperty(audio, 'ended', { get: () => false });
    Object.defineProperty(audio, 'currentTime', { get: () => playhead, set: value => { playhead = value; } });
    audio.play = async () => { paused = false; audio.dispatchEvent(new w.Event('play')); };
    audio.pause = () => { paused = true; audio.dispatchEvent(new w.Event('pause')); };
    d.getElementById('child-settings-shortcut').click();
    d.getElementById('tag-code').value = 'CHILD-BROWSER-TEST'; d.getElementById('link-form').requestSubmit();
    await until(() => d.getElementById('linked-tags').textContent.includes('CHILD-BROWSER-TEST'), 'test tag link');
    d.getElementById('child-keep-awake').checked = false; d.getElementById('child-tap-pause').checked = true;
    d.getElementById('child-lock').checked = false; d.getElementById('child-tap-pause').dispatchEvent(new w.Event('change'));
    d.getElementById('mode-button').click();
    await until(() => d.body.classList.contains('black-child'), 'black screen');
    const visibleButtons = [...d.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width && b.getBoundingClientRect().height && w.getComputedStyle(b).visibility !== 'hidden');
    assert(visibleButtons.length === 1 && visibleButtons[0].id === 'child-exit', 'Black mode exposes extra buttons');
    assert(w.getComputedStyle(d.getElementById('child-view')).backgroundColor === 'rgb(0, 0, 0)', 'Child screen is not pure black');
    assert(d.getElementById('player').inert && d.getElementById('child-content').hidden, 'Hidden controls remain interactive');
    pass('Black screen shows only the exit button and hides/inerts the story controls');
    const event = { message: { records: [{ recordType: 'text', data: new w.TextEncoder().encode('CHILD-BROWSER-TEST') }] } };
    await reader.onreading(event); playhead = 8; await reader.onreading(event);
    assert(!paused && !reader.signal.aborted, 'Duplicate read paused audio or stopped listening');
    await delay(1250); await reader.onreading(event); assert(paused, 'Repeat tap did not pause');
    await delay(1250); await reader.onreading(event); assert(!paused && playhead === 8, 'Repeat tap did not continue at saved position');
    pass('Continuous NFC session and repeat-tag pause/resume work with simulated reads');
    const exit = d.getElementById('child-exit'); exit.click(); assert(d.body.classList.contains('black-child'), 'A click escaped black mode');
    exit.dispatchEvent(new w.PointerEvent('pointerdown', { button: 0, pointerId: 1, isPrimary: true }));
    await delay(500); exit.dispatchEvent(new w.PointerEvent('pointerup', { button: 0, pointerId: 1 }));
    await delay(2700); assert(d.body.classList.contains('black-child'), 'Short hold escaped black mode');
    pass('A tap and an incomplete hold cannot exit black mode');
    exit.dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', repeat: false, cancelable: true }));
    await until(() => !d.body.classList.contains('child-active'), 'three-second exit');
    assert(reader.signal.aborted && !d.getElementById('parent-view').hidden, 'Exit did not stop NFC or restore adults');
    pass('Three-second keyboard hold exits and stops NFC');
    d.getElementById('child-screen-stories').click(); d.getElementById('mode-button').click();
    await until(() => d.body.classList.contains('child-active'), 'normal child screen');
    assert(!d.getElementById('child-content').hidden && !d.body.classList.contains('black-child'), 'Normal child buttons missing');
    d.getElementById('child-exit').click(); assert(!d.body.classList.contains('child-active'), 'Unlocked normal mode did not exit with a click');
    pass('Story-button mode and the optional unlocked exit work');
    output.textContent += '\nALL CHILD-MODE BROWSER CHECKS PASSED\n';
  } catch (error) { output.textContent += '\nFAIL ' + error.stack; }
  finally { run.disabled = false; }
});
