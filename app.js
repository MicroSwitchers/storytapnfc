/* StoryTouch 2.0.2. No accounts, analytics, CDN dependencies, or audio uploads. */
(function () {
  'use strict';
  const C = window.StoryCore, DB = window.StoryStore;
  const $ = id => document.getElementById(id), esc = C.escape;
  let customs = [], links = [], dbReady = false, child = false, editing = null;
  let selected = null, objectURL = null, playGeneration = 0, activeTagKey = null;
  let draft = null, draftURL = null, recorder = null, stream = null, recordingState = 'idle';
  let recordTimer = null, recordStarted = 0, recordSeconds = 0, importing = false;
  let stopRecordMonitor = null, recordingInterrupted = false;
  let recordingRequest = 0;
  let nfcSession = null, confirmResolve = null;
  let options = StoryChild.preferences(), cueContext, blackChild = false, resumeChildScan = false;
  let appInitialized = false, childGeneration = 0, playerDrawerOpen = true;
  let sourceMode = 'record', removedExamples = [], draftTimer, draftDirty = false, restoringDraft = false, draftRevision = 0;
  let lastSavedId = null, linkedTestId = null, previewing = false, wantedVoice = '';
  let draftImage = null, editImage = null, selectedImageURL = null;
  const pictureURLs = new Map(), cardURLs = new Map();
  const speechPlayer = new StorySpeech.Player();
  const audio = $('story-audio');
  const nativeMedia = new StoryMedia.Controls({ play: () => resumeAudio().catch(report), pause: pauseSelected, stop: stopAudio,
    seekbackward: details => seekMedia(audio.currentTime - (details.seekOffset || 10)),
    seekforward: details => seekMedia(audio.currentTime + (details.seekOffset || 10)), seekto: details => seekMedia(details.seekTime) });
  const pwa = new StoryPWA.Runtime({ version: 'storytouch-shell-v2.0.2-release', change: pwaStatus, canUpdate: () => !child && !recordingBusy() && !importing && audio.paused && $('audio-preview').paused && speechPlayer.state !== 'playing' && !$('story-save').disabled && !$('example-folder-add').disabled && !$('backup-export').disabled,
    beforeUpdate: async () => {
      requireDB(); clearTimeout(draftTimer); if (draftDirty) await persistDraft();
      if (draftDirty) throw new Error('Finish editing your draft before updating.');
      await DB.putSetting('preferences', options); await DB.all('stories'); await DB.all('links');
    } });
  function pwaStatus(state) {
    const ready = state.offline === 'ready';
    $('offline-badge').textContent = ready ? state.online ? 'Ready for offline stories' : 'Offline · ready to play' : state.offline === 'checking' ? 'Saving offline files…' : state.offline === 'unsupported' ? 'Use HTTPS for offline setup' : 'Offline files need attention';
    $('offline-badge').dataset.state = ready ? 'ready' : state.offline;
    $('offline-detail').textContent = ready ? '✓ App and ' + state.audioCount + ' bundled stories available offline. Your saved audio is kept on this device too.' : state.offline === 'checking' ? 'Saving the app and bundled stories for offline use…' : 'Offline setup is incomplete. Connect and download the offline files.';
    $('pwa-message').textContent = state.message; $('install-help').textContent = state.help;
    $('install-state').textContent = state.installed ? '✓ StoryTouch is installed on this device.' : 'Add StoryTouch to your home screen for fewer browser controls.';
    $('install-app').textContent = state.installed ? 'Installed' : state.installable ? 'Install StoryTouch' : 'How to install'; $('install-app').disabled = state.installed;
    $('app-update').hidden = !['waiting','applying'].includes(state.update); $('update-now').disabled = state.busy;
    $('update-now').textContent = state.update === 'applying' ? 'Updating…' : 'Update app';
    $('update-feedback').textContent = state.updateMessage || '';
    $('offline-check').textContent = ready ? 'Check offline files' : 'Download offline files';
    $('offline-check').disabled = state.busy || state.offline === 'unsupported'; $('check-updates').disabled = state.busy || state.offline === 'unsupported';
  }
  function syncNativeMedia() {
    const state = $('player-state').textContent;
    const playing = selected?.kind === 'text' ? speechPlayer.state === 'playing' : !audio.paused && !audio.ended;
    nativeMedia.sync(selected, ['Stopped','Finished'].includes(state) ? 'none' : playing ? 'playing' : 'paused', audio);
  }
  function pauseSelected() { if (selected?.kind === 'text') speechPlayer.pause(); else audio.pause(); }
  function seekMedia(position) {
    if (!selected || selected.kind === 'text' || recordingBusy() || !Number.isFinite(position)) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : selected.duration;
    if (duration > 0) { audio.currentTime = Math.max(0, Math.min(position, duration)); updateProgress(); }
  }
  const wakeKeeper = new StoryChild.WakeKeeper(state => {
    const messages = { active: 'Screen is staying awake for tag listening.', off: 'Screen can sleep normally.',
      released: 'The phone released the keep-awake request. Keep it unlocked and this app visible.',
      unavailable: 'Keep-awake is unavailable or was declined. Keep the phone unlocked so tags can be read.' };
    $('wake-lock-state').textContent = messages[state];
    if (child && ['released','unavailable'].includes(state)) childStatus(messages[state], false);
  });
  const immersive = new StoryChild.Immersive(state => {
    $('fullscreen-state').textContent = state === 'active' ? 'Full screen is active. System navigation is still controlled by your phone.' : state === 'off' ? 'Child mode requests full screen with browser controls hidden wherever supported.' : 'This browser could not enter full screen. Install and open StoryTouch from its home-screen icon for fewer controls.';
  });
  new StoryChild.TouchPause({ enabled: () => child && options.touchToPause,
    playing: () => selected && (selected.kind === 'text' ? speechPlayer.state === 'playing' : !audio.paused && !audio.ended),
    pause: () => { pauseSelected(); childStatus('Paused after a screen touch. Tap your object to continue.', false); }
  });
  function setPlayerDrawer(open, focus = false) {
    playerDrawerOpen = open;
    const body = $('player-drawer-body');
    if (!open && body.contains?.(document.activeElement)) $('player-drawer-toggle').focus();
    body.hidden = !open; body.inert = !open;
    $('player-drawer-toggle').setAttribute('aria-expanded', String(open));
    $('player-drawer-toggle').textContent = open ? 'Hide player controls' : 'Show player controls';
    if (focus) $('player-drawer-toggle').focus();
  }
  const exitHold = new StoryChild.HoldExit($('child-exit'), {
    required: () => child,
    settings: () => ({ method: options.exitMethod, seconds: options.exitHoldSeconds, taps: options.exitTapCount }),
    exit: () => { if (child) setChild(false, true).catch(report); },
    progress: (remaining, method = options.exitMethod) => {
      const instruction = options.exitMethod === 'taps' ? 'Tap ' + options.exitTapCount + ' times in a row for parent controls.' : 'Hold for ' + options.exitHoldSeconds + ' seconds for parent controls.';
      $('child-exit').setAttribute('aria-label', instruction);
      $('child-exit').classList.toggle('is-activating', !!remaining);
      $('child-exit-status').textContent = remaining ? remaining + (method === 'taps' ? ' more taps.' : ' seconds remaining.') : '';
      $('child-exit-help').textContent = instruction;

    }
  });
  function on(id, event, handler) {
    $(id).addEventListener(event, e => {
      try { Promise.resolve(handler(e)).catch(report); } catch (error) { report(error); }
    });
  }
  function report(error) {
    const message = error?.name === 'QuotaExceededError' ? 'This device is out of storage. Export a backup, free some space, and try again.' : (error?.message || 'Something went wrong. Please try again.');
    $('app-error').textContent = message; $('app-error').hidden = false;
  }
  function tell(message) {
    $('app-status').textContent = message; $('app-error').hidden = true;
  }
  function childStatus(message) { $('child-status').textContent = message; }
  function cue() {
    if (recordingBusy() || !options.sounds) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      cueContext ||= new AC();
      cueContext.resume().catch(() => {});
      const o = cueContext.createOscillator(), g = cueContext.createGain(), t = cueContext.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(660, t); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.035, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
      o.connect(g); g.connect(cueContext.destination); o.start(t); o.stop(t + .2);
    } catch (_) { /* Feedback is optional; playback stays available. */ }
  }
  function saveOptions() { try { localStorage.setItem('storytouch-options', JSON.stringify(options)); } catch (_) {} if (dbReady) DB.putSetting('preferences', options).catch(report); }
  function childStartUI() {
    $('mode-button').disabled = !appInitialized || child || recordingBusy() || importing;
    $('mode-button').textContent = appInitialized ? 'Start listening' : 'Loading stories';
    $('mode-button').setAttribute('aria-busy', String(!appInitialized));
  }
  function syncChildSettings() {
    $('child-screen-now').checked = options.childScreen === 'now-playing'; $('child-screen-black').checked = options.childScreen === 'black';
    $('child-show-stop').checked = options.showStop; $('child-settings').classList.toggle('has-stop', options.showStop);
    $('child-keep-awake').checked = options.keepAwake; $('child-tap-pause').checked = options.tapToPause; $('child-touch-pause').checked = options.touchToPause;
    $('exit-method-hold').checked = options.exitMethod === 'hold'; $('exit-method-taps').checked = options.exitMethod === 'taps';
    $('exit-hold-seconds').value = String(options.exitHoldSeconds); $('exit-tap-count').value = String(options.exitTapCount);
    $('exit-hold-setting').hidden = options.exitMethod !== 'hold'; $('exit-tap-setting').hidden = options.exitMethod !== 'taps';
  }
  function saveChildSettings() {
    options = StoryChild.preferences({ ...options, childScreen: $('child-screen-now').checked ? 'now-playing' : 'black', showStop: $('child-show-stop').checked,
      exitMethod: $('exit-method-taps').checked ? 'taps' : 'hold', exitHoldSeconds: Number($('exit-hold-seconds').value), exitTapCount: Number($('exit-tap-count').value),
      touchToPause: $('child-touch-pause').checked, keepAwake: $('child-keep-awake').checked, tapToPause: $('child-tap-pause').checked });
    saveOptions(); syncChildSettings(); $('child-settings-saved').textContent = 'Saved on this phone';
  }
  function stories() { return customs; }
  function storyById(id) { return stories().find(s => s.id === id); }
  function requireDB() { if (!dbReady) throw new Error('Local storage is unavailable. Use a regular browser window with site storage enabled, then reload.'); }
  function canonicalURL() { return new URL('./index.html', location.href).href; }
  function tagURL(code) { const u = new URL(canonicalURL()); u.hash = 'tag=' + encodeURIComponent(code); return u.href; }
  async function refresh() { customs = await DB.all('stories'); links = await DB.all('links'); removedExamples = await DB.getSetting('removed-examples', []); customs.sort((a, b) => b.created - a.created); render(); }
  function icon(name) {
    const paths = { play: '<path d="m8 4 12 8-12 8Z"/>', tag: '<path d="M3 3h7l11 11-7 7L3 10Z"/><circle cx="7" cy="7" r="1"/>', edit: '<path d="m4 16-1 5 5-1L21 7l-4-4ZM14 6l4 4"/>' };
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths[name] + '</svg>';
  }
  function storyArt(story) {
    if (story.image instanceof Blob && C.IMAGE_MIMES.includes(story.image.type)) {
      if (!cardURLs.has(story.id)) cardURLs.set(story.id, URL.createObjectURL(story.image));
      return '<img src="' + esc(cardURLs.get(story.id)) + '" alt="">';
    }
    return C.BOOK_ICON;
  }
  function storyCard(story) {
    const linked = links.some(link => link.storyId === story.id);
    return `<article class="story-card"><div class="story-cover">${storyArt(story)}<button class="card-edit icon-button" data-edit="${esc(story.id)}" aria-label="Edit ${esc(story.title)}">${icon('edit')}</button></div><div class="card-body"><h3>${esc(story.title)}</h3><p class="card-meta">${story.kind === 'text' ? 'Read aloud' : story.duration ? C.formatTime(story.duration) : 'Audio story'}${linked ? '<span class="linked-dot">Object linked</span>' : ''}</p><div class="card-actions"><button class="button preview-button" data-play="${esc(story.id)}" aria-label="Preview ${esc(story.title)}">${icon('play')} Listen</button><button class="button ${linked ? 'outline' : 'dark'}" data-link="${esc(story.id)}" aria-label="${linked ? 'Change' : 'Link'} object for ${esc(story.title)}">${icon('tag')} ${linked ? 'Linked' : 'Link object'}</button></div></div></article>`;
  }
  function render() {
    for (const url of cardURLs.values()) URL.revokeObjectURL(url); cardURLs.clear();
    const list = stories(); $('library-count').textContent = list.length;
    $('story-grid').innerHTML = list.map(storyCard).join(''); $('empty-library').hidden = list.length > 0;
    $('examples-reset').hidden = !removedExamples.length;
    const prior = $('link-story').value;
    $('link-story').innerHTML = list.map(story => `<option value="${esc(story.id)}">${esc(story.title)}</option>`).join('');
    if (storyById(prior)) $('link-story').value = prior;
    $('linked-tags').innerHTML = links.length ? links.map(link => `<div class="tag-row"><strong>${esc(storyById(link.storyId)?.title || 'Story missing')}</strong><span class="small quiet">${esc(link.key.startsWith('code:') ? link.key.slice(5) : 'Object tag')}</span><div class="tag-actions">${link.key.startsWith('code:') ? `<button class="text-button" data-write="${esc(link.key)}">Write URL</button><button class="text-button" data-copy="${esc(link.key)}">Copy URL</button>` : ''}<button class="text-button danger-text" data-unlink="${esc(link.key)}">Unlink</button></div></div>`).join('') : '<p class="small quiet">No objects linked yet.</p>';
    document.querySelectorAll('[data-write]').forEach(button => { button.disabled = !canNFC(); });
    $('read-link').disabled = !canNFC() || !list.length; updateLinkPreview();
  }
  function updateLinkPreview() {
    const s = storyById($('link-story').value);
    $('link-preview').innerHTML = s ? `<span aria-hidden="true">${storyArt(s)}</span><div><strong>${esc(s.title)}</strong><small>${s.kind === 'text' ? 'Written story' : 'Audio story'}</small></div>` : '<p>Add a story first.</p>';
  }
  function wizardState(step, instruction) {
    for (let i = 1; i <= 3; i++) {
      const el = $('wizard-step-' + i); el.classList.toggle('is-complete', i < step); el.classList.toggle('is-current', i === step);
      if (i === step) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
    }
    $('wizard-instruction').textContent = instruction || (step === 3 ? 'Your tag is ready' : 'Tap the tag to your phone');
    $('link-complete').hidden = step !== 3; $('link-active').hidden = step === 3;
  }
  function wizardSuccess(id, tested = false) {
    $('test-linked-tag').disabled = !canNFC();
    linkedTestId = id; wizardState(3, tested ? 'It works. Ready for a little listener.' : 'A little tap. Your story.');
    $('linked-story-display').textContent = '✓ ' + storyById(id).title + (tested ? ' · Test passed' : ' · Tag linked');
    $('link-scan-state').textContent = tested ? 'Try it in child mode.' : 'Tap the same tag once more to test it.';
  }
  function openTagSetup(id) {
    setTab('link', true); if (storyById(id)) $('link-story').value = id;
    updateLinkPreview(); wizardState(2); $('link-heading').focus();
  }
  function recordingBusy() { return recordingState !== 'idle'; }
  function setTab(name, focus = false) {
    if (child) return;
    if (recordingBusy() && name !== 'add') { tell('Stop recording first.'); return; }
    if (name !== 'link') stopNFC();
    ['library','add','setup','link'].forEach(key => { $('panel-' + key).hidden = key !== name; });
    ['library','setup'].forEach(key => { $('tab-' + key).setAttribute('aria-selected', String(key === name)); $('tab-' + key).tabIndex = key === name ? 0 : -1; });
    if (focus) (name === 'add' ? $('add-heading') : name === 'link' ? $('link-heading') : $('tab-' + name)).focus();
    window.scrollTo?.({ top: 0, behavior: 'instant' });
  }
  function syncChildStory() {
    const hasStory = child && !!selected;
    document.body.classList.toggle('child-has-story', hasStory);
    $('child-idle').hidden = hasStory; $('child-now-playing').hidden = !hasStory;
    if (!selected) return;
    $('child-story-title').textContent = selected.title;
    const text = selected.kind === 'text' ? selected.text : selected.transcript || '';
    $('child-story-text').textContent = text; $('child-story-text').hidden = !text;
    if (selectedImageURL) URL.revokeObjectURL(selectedImageURL); selectedImageURL = null;
    if (selected.image instanceof Blob && C.IMAGE_MIMES.includes(selected.image.type)) {
      selectedImageURL = URL.createObjectURL(selected.image);
      $('child-art').innerHTML = '<img src="' + esc(selectedImageURL) + '" alt="">';
    } else $('child-art').innerHTML = C.BOOK_ICON;
  }
  function childPresentation() {
    document.body.classList.toggle('child-active', child); document.body.classList.toggle('black-child', child && blackChild);
    document.documentElement.classList.toggle('child-mode', child);
    $('app-theme').setAttribute('content', child && blackChild ? '#000000' : '#101817');
    $('parent-view').hidden = child; $('parent-view').inert = child; $('child-view').hidden = !child;
    $('child-content').hidden = child && blackChild; $('player').inert = child && blackChild;
    $('child-stop-audio').hidden = !(child && blackChild && options.showStop);
    exitHold.cancel(); syncChildStory(); childStartUI();
  }
  async function listenForChildTags() {
    if (!child || nfcSession?.mode === 'child') return;
    const session = await startScan('child');
    if (child && session && nfcSession === session && session.ready) { blackChild = options.childScreen === 'black'; childPresentation(); $('child-exit').focus({ preventScroll: true }); }
  }
  async function setChild(value, unlocked = false, autoScan = true) {
    if (value && !appInitialized) { tell('Your stories are still loading.'); return; }
    if (value && child) return;
    if (recordingBusy()) { tell('Stop recording first.'); return; }
    if (!value && child && !unlocked) return;
    if (value && autoScan && !canNFC()) { report(new Error('Tag listening needs an NFC-enabled Android phone with Chrome. Open StoryTouch there to start.')); return; }
    const generation = ++childGeneration;
    stopNFC(); stopAudio(); selected = null; resetPlayerURL(); $('player').hidden = true; syncNativeMedia();
    child = value; blackChild = value && options.childScreen === 'black'; resumeChildScan = false; childPresentation();
    setPlayerDrawer(!value || options.childScreen === 'now-playing');
    try { if (value) sessionStorage.setItem('storytouch-child-active', 'yes'); else sessionStorage.removeItem('storytouch-child-active'); } catch (_) {}
    wakeKeeper.setEnabled(value && options.keepAwake);
    if (value) {
      childStatus('Tap your object.', false); $('child-exit').focus({ preventScroll: true });
      if (autoScan) {
        try { const scanning = listenForChildTags(); immersive.setEnabled(true); await scanning; }
        catch (error) {
          if (generation !== childGeneration || !child) return;
          await setChild(false, true); report(new Error('Tag listening could not start. Allow NFC, then try Start listening again. ' + error.message));
        }
      } else immersive.setEnabled(true);
    } else { immersive.setEnabled(false); $('mode-button').focus(); }
  }
  function resetPlayerURL() { if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; } }
  function stopAudio() {
    activeTagKey = null; playGeneration++; audio.pause();
    try { audio.currentTime = 0; } catch (_) {}
    speechPlayer.stop(); previewing = false;
    if (StorySpeech.supported()) speechSynthesis.cancel();
    $('player-state').textContent = 'Stopped'; $('player-toggle').textContent = 'Play'; $('player-toggle').setAttribute('aria-label', 'Play story');
    updateProgress();
  }
  function loadStory(s) {
    if (!s) throw new Error('That story is no longer in this library.');
    playGeneration++; audio.pause(); speechPlayer.stop(); previewing = false; resetPlayerURL(); selected = s;
    $('player-speed').value = String(s.rate || options.playbackRate || 1);
    if (s.kind === 'text') { audio.removeAttribute('src'); audio.load(); }
    else { objectURL = URL.createObjectURL(s.blob); audio.src = objectURL; }
    audio.playbackRate = Number($('player-speed').value);
    $('player').hidden = false; $('player-title').textContent = s.title;
    $('player-picture').innerHTML = C.BOOK_ICON;
    $('player-transcript').textContent = s.kind === 'text' ? s.text : (s.transcript || ''); $('player-text').hidden = !(s.text || s.transcript);
    $('player-text').open = false; $('player-state').textContent = 'Ready to listen'; syncChildStory(); updateProgress();
  }
  async function resumeAudio() {
    if (recordingBusy()) { tell('Stop recording before playing a story.'); return; }
    if (!selected) return;
    if (selected.kind === 'text') {
      const callbacks = { state: state => playerSpeechState(state), error: error => { playerSpeechState('Press Play to retry'); if (blackChild) { blackChild = false; childPresentation(); } setPlayerDrawer(true); report(error); $('player-toggle').focus(); } };
      if (speechPlayer.story?.id === selected.id && ['paused','finished'].includes(speechPlayer.state)) speechPlayer.resume();
      else speechPlayer.start(selected, Number($('player-speed').value), callbacks);
      return;
    }
    if (StorySpeech.supported()) speechSynthesis.cancel();
    const generation = ++playGeneration;
    try { await audio.play(); }
    catch (error) {
      if (generation !== playGeneration) return;
      if (error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        $('player-state').textContent = 'Press Play to start';
        if (child && blackChild) {
          // Never strand the listener behind a black screen if the browser requires a Play gesture.
          blackChild = false; childPresentation(); setPlayerDrawer(true); childStatus('Press Play once to allow sound.', false);
        } else if (child) childStatus('Your story is ready. Press Play to start.', false);
        $('player-toggle').focus();
      } else report(new Error('This audio could not play in this browser. Try an MP3 or WAV recording.'));
    }
  }
  function playStory(id) { if (recordingBusy()) { tell('Stop recording before playing a story.'); return; } activeTagKey = null; const s = storyById(id); loadStory(s); if (child) childStatus('Your story: ' + s.title, false); return resumeAudio(); }
  async function playTagStory(id, key) {
    if (child && activeTagKey === key && selected?.id === id) {
      const playing = selected.kind === 'text' ? speechPlayer.state === 'playing' : !audio.paused && !audio.ended;
      const paused = selected.kind === 'text' ? speechPlayer.state === 'paused' : audio.paused && !audio.ended && $('player-state').textContent === 'Paused';
      if (playing && options.tapToPause) { if (selected.kind === 'text') speechPlayer.pause(); else audio.pause(); childStatus('Paused: ' + selected.title, false); return; }
      if (paused) { await resumeAudio(); childStatus('Continuing: ' + selected.title, false); return; }
    }
    const playback = playStory(id); activeTagKey = key; await playback;
  }
  function playerSpeechState(state) { $('player-state').textContent = state; const playing = speechPlayer.state === 'playing'; $('player-toggle').textContent = playing ? 'Pause' : 'Play'; $('player-toggle').setAttribute('aria-label', playing ? 'Pause story' : 'Play story'); syncNativeMedia(); if (playing && child && options.childScreen === 'black' && !blackChild) { blackChild = true; childPresentation(); $('child-exit').focus(); } if (state === 'Finished' && child) childStatus('Ready for another object.', false); }
  function updateProgress() {
    syncNativeMedia();
    $('player-seek').disabled = selected?.kind === 'text';
    $('player-seek').hidden = selected?.kind === 'text';
    if (selected?.kind === 'text') { $('player-seek').value = 0; $('player-time').textContent = 'Written story'; $('player-seek').setAttribute('aria-valuetext','Written story'); return; }
    const duration = Number.isFinite(audio.duration) ? audio.duration : (selected?.duration || 0);
    $('player-seek').value = duration ? Math.min(100, audio.currentTime / duration * 100) : 0;
    $('player-time').textContent = C.formatTime(audio.currentTime) + ' / ' + C.formatTime(duration);
    $('player-seek').setAttribute('aria-valuetext', C.formatTime(audio.currentTime) + ' of ' + C.formatTime(duration));
  }
  function confirmAction(message, label = 'Continue') {
    if ($('confirm-dialog').open) return Promise.resolve(false);
    $('confirm-message').textContent = message; $('confirm-yes').textContent = label;
    $('confirm-dialog').showModal(); $('confirm-no').focus();
    return new Promise(resolve => { confirmResolve = resolve; });
  }
  function finishConfirm(answer) { $('confirm-dialog').close(); const resolve = confirmResolve; confirmResolve = null; resolve?.(answer); }
  async function readPicture(file) {
    if (!file) return null;
    if (!C.IMAGE_MIMES.includes(file.type) || file.size > C.MAX_IMAGE) throw new Error('Choose a JPG, PNG, WebP, GIF or AVIF picture under 5 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 32000000) throw new Error('Choose a smaller picture.');
    } catch (_) { throw new Error('This picture could not be opened. Try a smaller JPG or PNG.'); }
    finally { URL.revokeObjectURL(url); }
    return file;
  }
  function picturePreview(id, image) {
    if (pictureURLs.has(id)) URL.revokeObjectURL(pictureURLs.get(id)); pictureURLs.delete(id);
    const preview = $(id); preview.hidden = !image;
    if (image) { const url = URL.createObjectURL(image); pictureURLs.set(id, url); preview.src = url; }
    else preview.removeAttribute('src');
  }
  function clearDraftPicture() { draftImage = null; $('story-image').value = ''; picturePreview('story-image-preview', null); $('story-image-clear').hidden = true; }
  function setDraft(blob, duration, name) {
    if (draftURL) URL.revokeObjectURL(draftURL);
    draft = { blob, duration, mime: blob.type || 'audio/wav', name };
    setSource(sourceMode === 'write' ? 'import' : sourceMode, false);
    draftURL = URL.createObjectURL(blob); $('audio-preview').src = draftURL; $('preview-wrap').hidden = false;
    $('file-state').textContent = name + ' · ' + C.formatTime(duration) + ' · ' + (blob.size / 1024 / 1024).toFixed(1) + ' MB';
    if (!restoringDraft) queueDraft();
  }
  function clearDraft(persist = true) {
    $('audio-preview').pause(); $('audio-preview').removeAttribute('src'); $('audio-preview').load();
    if (draftURL) URL.revokeObjectURL(draftURL);
    draftURL = null; draft = null; $('preview-wrap').hidden = true; $('file-state').textContent = 'No audio selected.'; $('audio-file').value = '';
    if (persist) queueDraft();
  }
  function audioDuration(blob) {
    return new Promise((resolve, reject) => {
      const a = new Audio(), url = URL.createObjectURL(blob);
      let timer, finished = false;
      const done = (error, seconds) => { if (finished) return; finished = true; clearTimeout(timer); a.onloadedmetadata = null; a.onerror = null; a.removeAttribute('src'); a.load(); URL.revokeObjectURL(url); error ? reject(error) : resolve(seconds); };
      a.onloadedmetadata = () => { if (Number.isFinite(a.duration) && a.duration > 0) done(null, a.duration); else done(null, 0); };
      a.onerror = () => done(new Error('This browser cannot read that audio. Try an MP3 or WAV file.'));
      timer = setTimeout(() => done(new Error('Could not read this file. Please choose a supported audio file.')), 15000);
      a.preload = 'metadata'; a.src = url;
    });
  }
  function recordingUI() {
    const busy = recordingBusy() || importing;
    $('record-start').disabled = importing;
    $('record-start').hidden = busy; $('record-stop').hidden = recordingState !== 'recording';
    $('audio-file').disabled = busy; $('story-save').disabled = busy; $('discard-audio').disabled = busy;
    $('record-noise-reduction').disabled = busy; $('audio-preview').controls = !busy;
    $('record-level-wrap').hidden = recordingState !== 'recording';
    $('record-elapsed').hidden = recordingState !== 'recording';
    childStartUI();
  }
  function releaseMicrophone() {
    clearInterval(recordTimer); stopRecordMonitor?.(); stopRecordMonitor = null;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
  }
  function recordLevel(level) {
    $('record-level').value = level?.value || 0;
    const message = !level ? 'Level meter unavailable. Listen to your preview before saving.' : level.state === 'loud' ? 'Too loud — move a little farther from the microphone to avoid distortion.' : level.state === 'quiet' ? 'Very quiet — speak a little closer to the microphone.' : 'Listening. Use your comfortable speaking voice.';
    if ($('record-level-state').textContent !== message) $('record-level-state').textContent = message;
  }
  async function startRecording() {
    requireDB();
    if (recordingBusy() || importing) return;
    setSource('record', false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording needs HTTPS (or localhost) and a browser with microphone recording. You can still import an audio file.');
    if (draft && !(await confirmAction('Replace the unsaved audio in this form with a new recording?', 'Replace audio'))) return;
    stopAudio(); $('audio-preview').pause(); recordingState = 'requesting'; recordingUI(); $('record-state').textContent = 'Waiting for microphone permission…';
    const request = ++recordingRequest;
    try {
      const input = await StoryRecording.openMicrophone($('record-noise-reduction').checked);
      if (request !== recordingRequest) { input.getTracks().forEach(t => t.stop()); return; }
      stream = input; recorder = StoryRecording.createRecorder(input);
      const activeRecorder = recorder;
      const chunks = []; let bytes = 0;
      recordingInterrupted = false;
      recorder.ondataavailable = e => { if (e.data?.size) { chunks.push(e.data); bytes += e.data.size; if (bytes > C.MAX_AUDIO && activeRecorder.state === 'recording') stopRecording(); } };
      recorder.onerror = () => { recordingInterrupted = true; report(new Error('Recording was interrupted. Check the preview before saving, or record again.')); stopRecording(); };
      recorder.onstop = () => {
        if (recordingState === 'recording') recordSeconds = (Date.now() - recordStarted) / 1000;
        releaseMicrophone();
        // Keep all original encoded chunks and wait for the final chunk before releasing capture.
        const blob = new Blob(chunks, { type: activeRecorder.mimeType || chunks.find(c => c.type)?.type || 'audio/webm' });
        recorder = null; recordingState = 'idle'; recordingUI();
        if (blob.size && blob.size <= C.MAX_AUDIO) { setDraft(blob, recordSeconds, 'New recording'); $('record-state').textContent = recordingInterrupted ? 'Recording was interrupted. Listen to the captured audio before saving, or record again.' : 'Recording finished. Listen to your preview, then save.'; }
        else report(new Error('No usable recording was captured, or it exceeded 100 MB. Please try a shorter recording.'));
      };
      input.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (activeRecorder !== recorder || recordingState !== 'recording') return;
        recordingInterrupted = true; stopRecording();
      }, { once: true }));
      recorder.start(1000); recordingState = 'recording'; recordStarted = Date.now(); recordSeconds = 0;
      $('record-state').textContent = 'Recording. Choose Stop recording when you’re finished.';
      $('record-elapsed').textContent = '0:00'; recordingUI();
      stopRecordMonitor = StoryRecording.monitor(input, recordLevel);
      recordTimer = setInterval(() => {
        recordSeconds = (Date.now() - recordStarted) / 1000;
        $('record-elapsed').textContent = C.formatTime(recordSeconds);
        if (recordSeconds >= 1800) { stopRecording(); tell('The 30-minute recording limit was reached. Your audio is ready to preview.'); }
      }, 500);
    } catch (error) {
      if (request !== recordingRequest) return;
      releaseMicrophone(); recorder = null; recordingState = 'idle'; recordingUI();
      $('record-state').textContent = 'Recording did not start.';
      const denied = ['NotAllowedError', 'PermissionDeniedError'].includes(error.name);
      throw new Error(denied ? 'Microphone access was not allowed. You can allow it in the browser’s site settings or import an audio file.' : 'Could not start the microphone. Check it is connected and available, or import an audio file.');
    }
  }
  function stopRecording() {
    if (recorder?.state === 'recording') {
      recordSeconds = (Date.now() - recordStarted) / 1000;
      clearInterval(recordTimer); stopRecordMonitor?.(); stopRecordMonitor = null;
      recordingState = 'finishing'; recordingUI(); $('record-state').textContent = 'Finishing recording…'; recorder.stop();
    }
  }
  async function importAudio() {
    const file = $('audio-file').files[0]; if (!file) return;
    setSource('import', false);
    requireDB();
    if (recordingBusy() || importing) return;
    if (!file.size || file.size > C.MAX_AUDIO) throw new Error('Choose a non-empty audio file smaller than 100 MB.');
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i.test(file.name)) throw new Error('Choose an audio file such as MP3, M4A, WAV, OGG, or WebM.');
    importing = true; recordingUI(); $('file-state').textContent = 'Checking audio…';
    try {
      const duration = await audioDuration(file);
      const type = file.type.startsWith('audio/') ? file.type : ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' }[file.name.split('.').pop().toLowerCase()]);
      setDraft(new Blob([file], { type }), duration, file.name);
      if (!$('story-title').value) $('story-title').value = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
      tell('Audio is ready to preview and save.');
    } finally { importing = false; recordingUI(); }
  }
  async function saveStory(e) {
    e.preventDefault(); requireDB();
    if (recordingBusy() || importing) throw new Error('Finish recording or importing before saving.');
    const title = $('story-title').value.trim(); if (!title) throw new Error('Give your story a name.');
    const story = { id: crypto.randomUUID ? crypto.randomUUID() : 's-' + Date.now() + '-' + Math.random().toString(36).slice(2), title, symbol: 'book', source: 'personal', created: Date.now() };
    if (draftImage) story.image = draftImage;
    if (sourceMode === 'write') {
      const text = $('story-written').value.trim(); if (!text) throw new Error('Write a little story first.');
      Object.assign(story, { kind: 'text', text, transcript: text, ...voiceDetails('tts'), duration: 0 });
    } else {
      if (!draft) throw new Error('Record or choose some audio first.');
      Object.assign(story, { kind: 'audio', transcript: $('story-transcript').value, blob: draft.blob, mime: draft.mime, duration: draft.duration });
    }
    $('story-save').disabled = true;
    try {
      await DB.putStory(story); clearTimeout(draftTimer); clearDraft(false); clearDraftPicture(); $('story-form').reset(); setSource('record', false); await DB.putSetting('draft', null); draftDirty = false;
      await refresh(); lastSavedId = story.id;
      openTagSetup(story.id); tell('Story saved. Now link an object.'); updateStorage();
    } finally { $('story-save').disabled = false; }
  }
  function editStory(id) {
    editing = storyById(id); if (!editing) return;
    editImage = editing.image || null; $('edit-image').value = ''; picturePreview('edit-image-preview', editImage);
    $('edit-title').value = editing.title; $('edit-symbol').value = 'book'; $('edit-transcript').value = editing.kind === 'text' ? editing.text : (editing.transcript || '');
    $('edit-written-controls').hidden = editing.kind !== 'text'; $('edit-text-label').textContent = editing.kind === 'text' ? 'Your written story' : 'Story text or notes';
    populateVoices(); $('edit-voice').value = editing.voiceURI || ''; $('edit-rate').value = String(editing.rate || .9); $('download-audio').textContent = editing.kind === 'text' ? 'Download story text' : 'Download audio';
    $('edit-dialog').showModal();
  }
  async function saveEdit(e) {
    e.preventDefault(); requireDB(); const title = $('edit-title').value.trim(); if (!title) return;
    const updated = { ...editing, image: editImage || undefined, title, symbol: 'book', transcript: $('edit-transcript').value, updated: Date.now() };
    if (editing.kind === 'text') { if (!updated.transcript.trim()) throw new Error('Your written story needs some words.'); Object.assign(updated, { text: updated.transcript, ...voiceDetails('edit') }); }
    await DB.putStory(updated); $('edit-dialog').close(); await refresh();
    if (selected?.id === updated.id) loadStory(updated);
    $('link-story').value = updated.id; tell('Story saved.');
  }
  async function removeStory() {
    const s = editing;
    if (!(await confirmAction('Delete “' + s.title + '” and its tag links from this device? Export a backup first if you want to keep it.', 'Delete story'))) return;
    if (s.catalogId && !removedExamples.includes(s.catalogId)) removedExamples.push(s.catalogId);
    await DB.deleteStory(s.id, links, removedExamples); $('edit-dialog').close();
    if (selected?.id === s.id) { stopAudio(); selected = null; syncNativeMedia(); audio.removeAttribute('src'); audio.load(); resetPlayerURL(); $('player').hidden = true; }
    await refresh(); tell('Story and its links deleted from this device.'); updateStorage();
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function audioExtension(mime) { return /mp4|m4a/.test(mime) ? 'm4a' : /mpeg|mp3/.test(mime) ? 'mp3' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : /flac/.test(mime) ? 'flac' : /aac/.test(mime) ? 'aac' : 'webm'; }
  async function saveLink(key, storyId) {
    requireDB(); if (!storyById(storyId)) throw new Error('Choose a story first.');
    const prior = links.find(l => l.key === key);
    if (prior && prior.storyId !== storyId && !(await confirmAction('This tag already plays “' + storyById(prior.storyId)?.title + '”. Link it to the selected story instead?', 'Replace link'))) return false;
    await DB.putLink({ key, storyId }); await refresh(); tell('Tag linked to “' + storyById(storyId).title + '”.'); wizardSuccess(storyId); cue(); return true;
  }
  function canNFC() { return window.isSecureContext && typeof window.NDEFReader === 'function'; }
  function nfcError(error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Allow NFC in Android Chrome, then try again.';
    if (error.name === 'NotSupportedError') return 'NFC is unavailable on this device.';
    if (error.name === 'NotReadableError') return 'Cannot read NFC. Turn NFC on, keep the phone unlocked, and try again.';
    if (error.name === 'NetworkError') return 'The NFC tag could not be written. Keep a writable NDEF tag near the reader and try again.';
    return 'NFC could not start. Check NFC is enabled on a compatible Android phone, then try again.';
  }
  function stopNFC() {
    const old = nfcSession; nfcSession = null; old?.controller.abort();
    $('cancel-link-scan').hidden = true;
    $('tag-visual').classList.remove('is-scanning'); $('read-link').disabled = !canNFC() || !stories().length;
  }
  async function startScan(mode) {
    if (!canNFC()) throw new Error('In-app NFC needs Android Chrome on an NFC phone over HTTPS. Use a story button or a manual code on this browser.');
    if (mode !== 'child') requireDB();
    if (mode !== 'child' && !storyById($('link-story').value)) throw new Error('Choose a story first.');
    stopNFC();
    const session = { controller: new AbortController(), reader: new NDEFReader(), mode, ready: false, lastKey: '', lastTime: 0, storyId: $('link-story').value };
    nfcSession = session;
    session.reader.onreadingerror = () => { if (nfcSession !== session) return; const m = 'Tag could not be read. Try an NDEF tag and hold it closer.'; mode === 'child' ? childStatus(m) : ($('link-scan-state').textContent = m); };
    session.reader.onreading = async event => {
      if (nfcSession !== session || document.hidden) return;
      try {
        const keys = C.tagKeys(event, canonicalURL());
        if (mode === 'link') {
          const key = keys[0];
          if (!key) { $('link-scan-state').textContent = 'This tag has no readable code or serial number. Save a code link and write its URL to a writable NDEF tag.'; return; }
          stopNFC(); await saveLink(key, session.storyId);
        } else {
          const match = keys.map(k => links.find(l => l.key === k)).find(Boolean);
          if (!match) { if (mode === 'test') $('link-scan-state').textContent = 'No linked story on this tag. Try your tag again.'; else childStatus('This tag has no story here yet. Ask a grown-up to link it in Parent mode.'); return; }
          if (mode === 'test') { if (match.storyId !== session.storyId) { $('link-scan-state').textContent = 'That is a different story’s tag. Try this story’s tag.'; return; } stopNFC(); wizardSuccess(match.storyId, true); }
          const now = Date.now(), duplicate = session.lastKey === match.key && now - session.lastTime < 1200;
          session.lastKey = match.key; session.lastTime = now;
          if (duplicate) return;
          if (mode === 'child') await playTagStory(match.storyId, match.key); else await playStory(match.storyId);
        }
      } catch (error) { report(error); }
    };
    if (mode === 'child') { childStatus('Starting NFC…', false); }
    else { $('cancel-link-scan').hidden = false; $('read-link').disabled = true; $('tag-visual').classList.add('is-scanning'); wizardState(2, mode === 'test' ? 'Tap the same tag again' : 'Hold the tag near your phone'); $('link-scan-state').textContent = 'Starting NFC…'; }
    try {
      await session.reader.scan({ signal: session.controller.signal });
      if (nfcSession !== session) return;
      session.ready = true;
      if (mode === 'child') childStatus('Listening for your objects. Tap a tag near the back of the phone.', false);
      else $('link-scan-state').textContent = mode === 'test' ? 'Tap your linked tag. We’ll play the story.' : 'Hold the tag near the phone. Keep it still for a moment.';
      cue();
      return session;
    } catch (error) { if (nfcSession !== session || error.name === 'AbortError') return; stopNFC(); if (mode === 'child') childStatus('Tag listening could not start. Choose Start tag listening to try again, or tap a story.', false); throw new Error(nfcError(error)); }
  }
  async function writeTag(key) {
    if (!canNFC()) throw new Error('Writing tags needs Android Chrome and an NFC phone over HTTPS.');
    const code = key.slice(5), url = tagURL(code);
    if (!(await confirmAction('Write the StoryTouch URL for ' + code + ' to the next NFC tag? This replaces the tag’s current contents. Your audio stays on this device.', 'Write tag'))) return;
    stopNFC();
    const session = { controller: new AbortController(), mode: 'write' }; nfcSession = session;
    $('cancel-link-scan').hidden = false; $('link-scan-state').textContent = 'Hold a writable NDEF tag near the phone. Its contents will be replaced.';
    try {
      await new NDEFReader().write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true, signal: session.controller.signal });
      if (nfcSession !== session) return;
      stopNFC(); wizardSuccess(links.find(l => l.key === key).storyId); tell('Tag written. Tap it again to test.'); cue();
    } catch (error) { if (nfcSession !== session || error.name === 'AbortError') return; stopNFC(); throw new Error(nfcError(error)); }
  }
  function playCode(raw, autoplay = true) {
    const code = C.code(raw), link = links.find(l => l.key === 'code:' + code);
    if (!link) { childStatus('No story is linked to ' + code + ' on this device. Ask a grown-up to link it or restore a backup.'); return; }
    const story = storyById(link.storyId);
    if (autoplay) return playStory(story.id);
    loadStory(story); childStatus('“' + story.title + '” is ready. Press Play to start.', false);
  }
  function blobBase64(blob) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  }
  async function exportBackup() {
    requireDB();
    if (customs.reduce((sum, s) => sum + (s.blob?.size || 0), 0) > 200 * 1024 * 1024) throw new Error('This library is too large for a single browser backup (200 MB of audio). Download audio from each story’s Edit menu.');
    $('backup-export').disabled = true;
    try {
      const rows = [];
      for (const s of customs) { const { blob, image, ...meta } = s; if (image instanceof Blob) meta.image = { mime: image.type, data: await blobBase64(image) }; rows.push(s.kind === 'text' ? meta : { ...meta, kind: 'audio', audio: await blobBase64(blob) }); }
      const data = { format: 'storytouch-backup', version: 2, removedExamples, exportedAt: new Date().toISOString(), stories: rows, links, options };
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'StoryTouch-' + new Date().toISOString().slice(0, 10) + '.storytouch.json');
      tell('Backup downloaded. Keep it somewhere safe; it contains your private audio.');
    } finally { $('backup-export').disabled = false; }
  }
  async function restoreBackup() {
    const file = $('backup-file').files[0]; $('backup-file').value = ''; if (!file) return;
    requireDB();
    if (file.size > 285 * 1024 * 1024) throw new Error('This backup is larger than the supported 285 MB limit.');
    let data; try { data = C.validateBackup(JSON.parse(await file.text())); } catch (error) { throw new Error('Backup could not be read. ' + error.message); }
    if (!(await confirmAction('Restore ' + data.stories.length + ' stories and ' + data.links.length + ' tag links? Other stories stay. Matching story IDs and tag codes are replaced.', 'Restore backup'))) return;
    const rows = await Promise.all(data.stories.map(async s => {
      const meta = { id: s.id, title: s.title, symbol: 'book', transcript: s.transcript, duration: s.duration, source: s.source === 'example' ? 'example' : 'personal', created: Number.isFinite(s.created) ? s.created : Date.now() };
      if (s.image) { const binary = atob(s.image.data), bytes = Uint8Array.from(binary, value => value.charCodeAt(0)); meta.image = await readPicture(new Blob([bytes], { type: s.image.mime })); }
      if (typeof s.catalogId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s.catalogId)) meta.catalogId = s.catalogId;
      if (typeof s.exampleFile === 'string') meta.exampleFile = s.exampleFile.slice(0,1000);
      if (s.kind === 'text') return { ...meta, kind: 'text', text: s.text, voiceURI: s.voiceURI, voiceLang: s.voiceLang, rate: s.rate };
      const binary = atob(s.audio), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { ...meta, kind: 'audio', mime: s.mime, blob: new Blob([bytes], { type: s.mime }) };
    }));
    const removed = data.removedExamples || [], ids = new Set(rows.map(s => s.id));
    const removeIds = customs.filter(s => s.catalogId && removed.includes(s.catalogId) && !ids.has(s.id)).map(s => s.id);
    await DB.restore(rows, data.links, removed, removeIds);
    if (selected && (rows.some(s => s.id === selected.id) || removeIds.includes(selected.id))) { stopAudio(); selected = null; syncNativeMedia(); resetPlayerURL(); $('player').hidden = true; }
    if (data.options && typeof data.options.sounds === 'boolean') { options = StoryChild.preferences(data.options); saveOptions(); $('feedback-sounds').checked = options.sounds; syncChildSettings(); }
    await refresh(); await syncExamples(); await refresh(); tell('Backup restored on this device.'); updateStorage();
  }
  async function updateStorage() {
    try {
      const estimate = await navigator.storage?.estimate(), persistent = await navigator.storage?.persisted?.();
      $('storage-state').textContent = (estimate ? ((estimate.usage || 0) / 1024 / 1024).toFixed(1) + ' MB used. ' : '') + (persistent ? 'Persistent storage granted. Still keep a backup.' : 'The browser may remove local data when space is low. Keep a backup.');
    } catch (_) { $('storage-state').textContent = 'Keep a backup in case browser storage is cleared.'; }
  }
  function setSource(mode, persist = true) {
    if (recordingBusy() && mode !== sourceMode) { tell('Stop recording first.'); return; }
    sourceMode = mode;
    ['write','record','import'].forEach(m => { $('source-' + m).setAttribute('aria-pressed', String(m === mode)); $('source-panel-' + m).hidden = m !== mode; });
    $('story-written').required = mode === 'write'; $('audio-draft-section').hidden = mode === 'write'; $('transcript-section').hidden = mode === 'write';
    if (previewing) { speechPlayer.stop(); previewing = false; }
    if (persist) queueDraft();
  }
  function voiceDetails(prefix) {
    const select = $(prefix + '-voice'), voice = window.speechSynthesis?.getVoices().find(v => v.voiceURI === select.value);
    return { voiceURI: select.value, voiceLang: voice?.lang || '', rate: Number($(prefix + '-rate').value) || .9 };
  }
  function populateVoices() {
    const voices = StorySpeech.supported() ? speechSynthesis.getVoices() : [];
    for (const id of ['tts-voice','edit-voice']) {
      const select = $(id), prior = id === 'tts-voice' ? (wantedVoice || select.value) : select.value;
      select.innerHTML = '<option value="">Device default</option>' + voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} · ${esc(v.lang)}${v.localService ? '' : ' · online'}</option>`).join('');
      if (voices.some(v => v.voiceURI === prior)) { select.value = prior; if (id === 'tts-voice') wantedVoice = ''; }
    }
    $('tts-preview').disabled = !StorySpeech.supported();
  }
  function queueDraft() {
    if (!dbReady || restoringDraft) return;
    clearTimeout(draftTimer); draftRevision++; draftDirty = true; $('draft-state').textContent = 'Saving draft…';
    draftTimer = setTimeout(() => persistDraft().catch(report), 180);
  }
  async function persistDraft() {
    const revision = draftRevision;
    const snapshot = { sourceMode, title: $('story-title').value, symbol: 'book', text: $('story-written').value, transcript: $('story-transcript').value, voiceURI: $('tts-voice').value || wantedVoice, rate: $('tts-rate').value, audio: draft, image: draftImage };
    await DB.putSetting('draft', snapshot); if (revision === draftRevision) { draftDirty = false; $('draft-state').textContent = '✓ Draft saved on this device'; }
  }
  async function restoreDraft() {
    const saved = await DB.getSetting('draft'); if (!saved) return;
    restoringDraft = true;
    $('story-title').value = saved.title || ''; $('story-symbol').value = 'book'; $('story-written').value = saved.text || ''; $('story-transcript').value = saved.transcript || '';
    if (saved.image instanceof Blob && C.IMAGE_MIMES.includes(saved.image.type) && saved.image.size <= C.MAX_IMAGE) { draftImage = saved.image; picturePreview('story-image-preview', draftImage); $('story-image-clear').hidden = false; }
    wantedVoice = saved.voiceURI || ''; $('tts-rate').value = saved.rate || '.9';
    sourceMode = ['write','record','import'].includes(saved.sourceMode) ? saved.sourceMode : 'record';
    if (saved.audio?.blob instanceof Blob) setDraft(saved.audio.blob, saved.audio.duration || 0, saved.audio.name || 'Saved audio draft');
    restoringDraft = false; $('draft-state').textContent = '✓ Your saved draft is here';
  }
  async function syncExamples() {
    requireDB();
    let catalog;
    try { const response = await fetch('./example-stories/stories.json'); if (!response.ok) throw new Error('Starter folder is unavailable.'); catalog = await response.json(); }
    catch (_) { $('example-state').textContent = 'Starter folder could not load. Your saved stories are still here.'; return; }
    if (catalog.version !== 1 || !Array.isArray(catalog.stories) || catalog.stories.length > 2000) throw new Error('The starter-story catalog is invalid.');
    // Retire only these reserved bundled IDs, never personal stories or folder imports.
    const retired = new Set((Array.isArray(catalog.retiredIds) ? catalog.retiredIds : []).filter(id => C.DEMOS.some(s => s.id === id)));
    const removeIds = [...retired].filter(id => {
      const saved = storyById(id);
      return saved ? saved.source === 'example' : links.some(l => l.storyId === id);
    });
    if (removeIds.length) {
      await DB.restore([], [], removedExamples, removeIds);
      await refresh();
    }
    const known = new Set(customs.map(s => s.id));
    for (const entry of catalog.stories) {
      if (known.has(entry.id) || removedExamples.includes(entry.id)) continue;
      if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id) || typeof entry.file !== 'string' || entry.file.split('/').some(part => !part || part === '..' || part === '.' || part.includes('\\')) || entry.file.startsWith('/') || !/\.(mp3|wav|m4a|ogg|aac|flac|webm)$/i.test(entry.file)) continue;
      const url = './example-stories/' + entry.file.split('/').map(encodeURIComponent).join('/');
      try {
        const response = await fetch(url); if (!response.ok) throw new Error('Could not load ' + entry.file);
        let blob = await response.blob(); if (!blob.size || blob.size > C.MAX_AUDIO) throw new Error('Starter audio must be 1–100 MB.');
        if (!blob.type.startsWith('audio/')) blob = new Blob([blob], { type: /\.mp3$/i.test(entry.file) ? 'audio/mpeg' : /\.wav$/i.test(entry.file) ? 'audio/wav' : 'audio/' + entry.file.split('.').pop().toLowerCase() });
        await DB.putStory({ id: entry.id, title: String(entry.title || entry.file).slice(0,100), symbol: 'book', transcript: String(entry.transcript || '').slice(0,20000), duration: Number.isFinite(entry.duration) ? entry.duration : 0, blob, mime: blob.type, kind: 'audio', source: 'example', catalogId: entry.id, created: 0 });
        known.add(entry.id);
      } catch (error) { $('example-state').textContent = 'Some starter audio could not be saved. ' + error.message; }
    }
  }
  async function importExampleFolder() {
    requireDB();
    const files = [...$('example-folder').files].filter(f => /\.(mp3|wav|m4a|ogg|aac|flac|webm)$/i.test(f.name)); $('example-folder').value = '';
    if (!files.length) { $('example-state').textContent = 'Choose a folder containing MP3 or other audio files.'; return; }
    if (files.length > 2000) throw new Error('Choose a folder with at most 2,000 audio files.');
    $('example-folder-add').disabled = true; let added = 0, skipped = 0;
    try {
      const known = new Set(customs.map(s => s.exampleFile).filter(Boolean));
      for (const file of files) {
        const signature = (file.webkitRelativePath || file.name) + '|' + file.size + '|' + file.lastModified;
        if (known.has(signature)) { skipped++; continue; }
        $('example-state').textContent = 'Adding ' + file.name + '…';
        try {
          if (!file.size || file.size > C.MAX_AUDIO) throw new Error('Invalid size');
          const duration = await audioDuration(file), bytes = new TextEncoder().encode(signature);
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('').slice(0,24);
          const mime = file.type.startsWith('audio/') ? file.type : (/\.mp3$/i.test(file.name) ? 'audio/mpeg' : 'audio/' + file.name.split('.').pop().toLowerCase());
          await DB.putStory({ id: 'folder-' + hash, title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g,' ').slice(0,100), symbol: 'book', transcript: '', blob: new Blob([file], { type: mime }), mime, duration, kind: 'audio', source: 'example', exampleFile: signature, created: Date.now() });
          known.add(signature); added++;
        } catch (_) { skipped++; }
      }
      await refresh(); $('example-state').textContent = '✓ ' + added + ' starter stories added' + (skipped ? ' · ' + skipped + ' duplicate or unsupported files skipped' : '') + '.';
    } finally { $('example-folder-add').disabled = false; }
  }
  document.querySelectorAll('[data-source]').forEach(b => b.addEventListener('click', () => setSource(b.dataset.source)));
  ['story-title','story-symbol','story-written','story-transcript','tts-voice','tts-rate'].forEach(id => on(id,'input', () => { if (id === 'tts-voice') wantedVoice = ''; queueDraft(); }));
  if (StorySpeech.supported()) speechSynthesis.addEventListener('voiceschanged', populateVoices);
  on('tts-preview','click', () => {
    if (recordingBusy()) { tell('Stop recording before playing a preview.'); return; }
    const text = $('story-written').value.trim(); if (!text) throw new Error('Write a few words to preview.');
    stopAudio(); previewing = true;
    speechPlayer.start({ id:'preview', text, ...voiceDetails('tts') }, Number($('tts-rate').value), { state: state => { $('tts-preview-state').textContent = state === 'Finished' ? '✓ Preview finished' : state + ' preview…'; }, error: error => { $('tts-preview-state').textContent = error.message; report(error); } });
  });
  on('tts-preview-stop','click', () => { speechPlayer.stop(); previewing = false; $('tts-preview-state').textContent = 'Preview stopped.'; });
  on('clear-story-draft','click', async () => { if (!(await confirmAction('Clear this unfinished story?', 'Clear draft'))) return; clearTimeout(draftTimer); clearDraft(false); clearDraftPicture(); $('story-form').reset(); setSource('record',false); await DB.putSetting('draft',null); draftDirty = false; $('draft-state').textContent = 'Start a new story.'; });
  on('example-folder-add','click', () => $('example-folder').click()); on('example-folder','change',importExampleFolder);
  on('examples-reset','click', async () => { requireDB(); removedExamples = []; await DB.putSetting('removed-examples',[]); await syncExamples(); await refresh(); tell('Starter stories restored.'); });
  on('link-done','click', () => setTab('library', true));
  on('add-back','click', () => setTab('library', true)); on('link-back','click', () => setTab('library', true));
  on('child-settings-shortcut', 'click', () => {
    if (recordingBusy()) { tell('Stop your recording before changing settings.'); return; }
    setTab('setup'); $('child-settings-heading').focus(); $('child-settings').scrollIntoView({ block: 'start' });
  });
  ['child-screen-now','child-screen-black','child-keep-awake','child-tap-pause','child-touch-pause','child-show-stop','exit-method-hold','exit-method-taps','exit-hold-seconds','exit-tap-count'].forEach(id => on(id, 'change', saveChildSettings));
  on('step-add', 'click', () => { setTab('add', true); $('story-title').focus(); });
  on('step-link', 'click', () => openTagSetup($('link-story').value));
  on('link-story','change', () => { stopNFC(); updateLinkPreview(); wizardState(2); $('link-scan-state').textContent = 'Choose Link this tag, then hold it near the back of your phone.'; });
  on('test-linked-tag','click', () => { if (linkedTestId) $('link-story').value = linkedTestId; return startScan('test'); });

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelector('.tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = ['library', 'setup'], current = tabs.indexOf(document.activeElement.dataset.tab); if (current < 0) return;
    e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + 2) % 2; setTab(tabs[next], true);
  });
  document.addEventListener('contextmenu', e => { if (child && !e.target.closest('input, textarea')) e.preventDefault(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || child && b.dataset.play) return;
    const run = async () => {
      if (b.dataset.play) await playStory(b.dataset.play);
      if (b.dataset.edit) editStory(b.dataset.edit);
      if (b.dataset.link) openTagSetup(b.dataset.link);
      if (b.dataset.write) { openTagSetup(links.find(link => link.key === b.dataset.write)?.storyId); await writeTag(b.dataset.write); }
      if (b.dataset.copy) {
        const url = tagURL(b.dataset.copy.slice(5));
        try { await navigator.clipboard.writeText(url); tell('Tag URL copied. This URL contains a code, not your audio.'); }
        catch (_) { tell('Tag URL: ' + url); }
      }
      if (b.dataset.unlink && await confirmAction('Remove this tag link from this device? The story and the NFC tag’s contents stay.', 'Unlink tag')) { await DB.deleteLink(b.dataset.unlink); await refresh(); tell('Tag link removed.'); }
    };
    run().catch(report);
  });
  ['library-add'].forEach(id => on(id, 'click', () => { setTab('add', true); $('story-title').focus(); }));
  on('mode-button', 'click', () => setChild(true));
  on('record-start', 'click', startRecording); on('record-stop', 'click', stopRecording);
  on('audio-file', 'change', importAudio); on('discard-audio', 'click', clearDraft); on('story-form', 'submit', saveStory);
  on('story-image', 'change', async () => { const image = await readPicture($('story-image').files[0]); if (!image) return; draftImage = image; picturePreview('story-image-preview', image); $('story-image-clear').hidden = false; queueDraft(); });
  on('story-image-clear', 'click', () => { clearDraftPicture(); queueDraft(); });
  on('edit-image', 'change', async () => { const image = await readPicture($('edit-image').files[0]); if (image) { editImage = image; picturePreview('edit-image-preview', image); } });
  on('edit-image-clear', 'click', () => { editImage = null; $('edit-image').value = ''; picturePreview('edit-image-preview', null); });
  on('edit-form', 'submit', saveEdit); on('edit-cancel', 'click', () => $('edit-dialog').close()); on('delete-story', 'click', removeStory);
  on('edit-link', 'click', () => { const id = editing.id; $('edit-dialog').close(); openTagSetup(id); });
  on('download-audio', 'click', () => { if (editing?.kind === 'text') { download(new Blob([editing.text], { type: 'text/plain' }), editing.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0,70) + '.txt'); return; } if (editing) download(editing.blob, editing.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 70) + '.' + audioExtension(editing.mime)); });
  on('player-drawer-toggle', 'click', () => setPlayerDrawer(!playerDrawerOpen));
  on('player-toggle', 'click', () => { if (selected?.kind === 'text') { if (speechPlayer.state === 'playing') speechPlayer.pause(); else return resumeAudio(); } else { if (audio.paused) return resumeAudio(); audio.pause(); } });
  on('player-restart', 'click', () => { if (selected?.kind === 'text') speechPlayer.stop(); else audio.currentTime = 0; return resumeAudio(); });
  on('player-stop', 'click', stopAudio); on('child-stop-audio', 'click', () => { stopAudio(); childStatus('Stopped.', false); });
  on('player-seek', 'input', () => { const d = Number.isFinite(audio.duration) ? audio.duration : selected?.duration; if (d) audio.currentTime = Number($('player-seek').value) / 100 * d; });
  on('player-speed', 'change', async () => { const rate = Number($('player-speed').value); audio.playbackRate = rate; options.playbackRate = rate; saveOptions(); if (selected) { selected.rate = rate; if (selected.kind === 'text') speechPlayer.setRate(rate); await DB.putStory(selected); await refresh(); } });
  audio.addEventListener('timeupdate', updateProgress); audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('play', () => { $('audio-preview').pause(); $('player-state').textContent = 'Playing'; $('player-toggle').textContent = 'Pause'; $('player-toggle').setAttribute('aria-label', 'Pause story'); syncNativeMedia(); if (child && options.childScreen === 'black' && !blackChild) { blackChild = true; childPresentation(); $('child-exit').focus(); } });
  audio.addEventListener('pause', () => { if (selected?.kind === 'text') return; $('player-state').textContent = audio.ended ? 'Finished' : 'Paused'; $('player-toggle').textContent = 'Play'; $('player-toggle').setAttribute('aria-label', 'Play story'); syncNativeMedia(); });
  audio.addEventListener('ended', () => { $('player-state').textContent = 'Finished'; syncNativeMedia(); if (child) childStatus('Ready for another object.', false); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) report(new Error('This audio could not be played. Try importing an MP3 or WAV file.')); });
  $('audio-preview').addEventListener('play', () => { if (recordingBusy()) { $('audio-preview').pause(); return; } audio.pause(); speechPlayer.stop(); });
  on('link-form', 'submit', async e => { e.preventDefault(); await saveLink('code:' + C.code($('tag-code').value), $('link-story').value); });
  on('read-link', 'click', () => startScan('link'));
  on('cancel-link-scan', 'click', () => { stopNFC(); tell('Tag operation cancelled.'); });
  on('confirm-yes', 'click', () => finishConfirm(true)); on('confirm-no', 'click', () => finishConfirm(false));
  $('confirm-dialog').addEventListener('cancel', e => { e.preventDefault(); finishConfirm(false); });
  on('backup-export', 'click', exportBackup); on('backup-import', 'click', () => $('backup-file').click()); on('backup-file', 'change', restoreBackup);
  on('persist-storage', 'click', async () => { if (!navigator.storage?.persist) throw new Error('This browser does not offer a persistent-storage request. Keep an exported backup.'); const granted = await navigator.storage.persist(); tell(granted ? 'The browser agreed to keep local storage. Keep an exported backup too.' : 'The browser did not grant persistent storage. Export regular backups.'); await updateStorage(); });
  on('feedback-sounds', 'change', () => { options.sounds = $('feedback-sounds').checked; saveOptions(); if (options.sounds) cue(); });
  
  
  on('install-app', 'click', () => pwa.install());
  on('check-updates', 'click', () => pwa.checkUpdates());
  on('offline-check', 'click', () => pwa.state.offline === 'ready' ? pwa.verify() : pwa.downloadOffline());
  on('update-now', 'click', () => pwa.applyUpdate());
  document.addEventListener('visibilitychange', () => {
    exitHold.cancel();
    if (document.hidden) {
      if (nfcSession?.mode === 'child') childStatus('Tag listening is paused while the screen is off or the app is hidden.', false);
      else if (nfcSession) stopNFC();
    } else if (child && nfcSession?.mode === 'child' && nfcSession.ready) {
      nfcSession.lastKey = ''; nfcSession.lastTime = 0;
      childStatus('Listening for your objects again.', false);
    }
    // Keep the existing child reader: Chrome suspends and resumes it with page visibility.
    wakeKeeper.setEnabled(child && options.keepAwake);
  });
  window.addEventListener('pagehide', () => { recordingRequest++; resumeChildScan = child && nfcSession?.mode === 'child'; exitHold.cancel(); wakeKeeper.setEnabled(false); stopNFC(); stopRecording(); releaseMicrophone(); if (recordingState === 'requesting') { recordingState = 'idle'; recordingUI(); } audio.pause(); speechPlayer.stop(); });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !child) return;
    wakeKeeper.setEnabled(options.keepAwake);
    if (resumeChildScan) { resumeChildScan = false; listenForChildTags().catch(error => { blackChild = false; childPresentation(); report(error); }); }
  });
  window.addEventListener('beforeunload', e => { if (draftDirty || recordingBusy()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('offline', () => { if (navigator.serviceWorker?.controller) $('offline-badge').textContent = 'Offline · ready to play'; });
  async function nfcPermissionGranted() { try { return canNFC() && (await navigator.permissions.query({ name: 'nfc' })).state === 'granted'; } catch (_) { return false; } }
  async function handleHash() {
    const params = new URLSearchParams(location.hash.slice(1)), code = params.get('tag');
    if (code) { if (!child) await setChild(true, false, false); blackChild = false; childPresentation(); setPlayerDrawer(true); playCode(code, false); }
    else if (!child && params.get('mode') === 'child') { if (await nfcPermissionGranted()) await setChild(true); else tell('Tap Start listening to allow NFC.'); }
    else if (!child && ['add','setup','library'].includes(params.get('view'))) setTab(params.get('view'), true);
  }
  window.addEventListener('hashchange', () => handleHash().catch(report));
  async function init() {
    try { const saved = JSON.parse(localStorage.getItem('storytouch-options')); if (saved) options = StoryChild.preferences(saved); } catch (_) {}
    $('feedback-sounds').checked = options.sounds;
    $('nfc-support').textContent = canNFC() ? 'NFC ready · Phone unlocked · App open' : 'NFC unavailable here · Use Android Chrome with NFC, or use a code.';
    $('read-link').disabled = !canNFC();
    try { await DB.open(); dbReady = true; const preferences = await DB.getSetting('preferences'); if (preferences) { options = StoryChild.preferences(preferences); $('feedback-sounds').checked = options.sounds; } await refresh(); await syncExamples(); await refresh(); await restoreDraft(); } catch (error) { render(); report(error); }
    syncChildSettings();
    appInitialized = true; childStartUI();
    populateVoices(); setSource(sourceMode, false); updateStorage(); pwa.init();
    if (location.protocol === 'file:') report(new Error('For reliable recording, storage, NFC, and offline setup, serve this folder over HTTPS or localhost. See Help & deployment.'));
    await handleHash();
    try {
      if (!child && sessionStorage.getItem('storytouch-child-active') === 'yes') {
        if (await nfcPermissionGranted()) await setChild(true); else tell('Allow NFC to resume listening.');
      }
    } catch (error) { report(error); }
  }
  init().catch(report);
})();
