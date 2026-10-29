/* StoryTouch 1.1.0. No accounts, analytics, CDN dependencies, or audio uploads. */
(function () {
  'use strict';
  const C = window.StoryCore, DB = window.StoryStore;
  const $ = id => document.getElementById(id), esc = C.escape;
  let customs = [], links = [], dbReady = false, child = false, editing = null;
  let selected = null, objectURL = null, playGeneration = 0;
  let draft = null, draftURL = null, recorder = null, stream = null, recordingState = 'idle';
  let recordTimer = null, recordStarted = 0, recordSeconds = 0, importing = false;
  let nfcSession = null, installPrompt = null, confirmResolve = null;
  let options = { spoken: false, sounds: true, playbackRate: 1 }, cueContext;
  let sourceMode = 'write', removedExamples = [], draftTimer, draftDirty = false, restoringDraft = false, draftRevision = 0;
  let lastSavedId = null, linkedTestId = null, previewing = false, wantedVoice = '';
  const speechPlayer = new StorySpeech.Player();
  const audio = $('story-audio');
  function on(id, event, handler) {
    $(id).addEventListener(event, e => {
      try { Promise.resolve(handler(e)).catch(report); } catch (error) { report(error); }
    });
  }
  function report(error) {
    const message = error?.name === 'QuotaExceededError' ? 'This device is out of storage. Export a backup, free some space, and try again.' : (error?.message || 'Something went wrong. Please try again.');
    $('app-error').textContent = message; $('app-error').hidden = false;
  }
  function tell(message, speak = false) {
    $('app-status').textContent = message; $('app-error').hidden = true;
    if (speak) say(message);
  }
  function say(message) {
    if (!options.spoken || !(StorySpeech.supported()) || speechPlayer.state === 'playing') return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message); utterance.rate = .9;
    speechSynthesis.speak(utterance);
  }
  function childStatus(message, speak = true) { $('child-status').textContent = message; if (speak) say(message); }
  function cue() {
    if (!options.sounds) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      cueContext ||= new AC();
      cueContext.resume().catch(() => {});
      const o = cueContext.createOscillator(), g = cueContext.createGain(), t = cueContext.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(660, t); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.035, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
      o.connect(g); g.connect(cueContext.destination); o.start(t); o.stop(t + .2);
    } catch (_) { /* Visual and spoken guidance remain available. */ }
  }
  function saveOptions() { try { localStorage.setItem('storytouch-options', JSON.stringify(options)); } catch (_) {} if (dbReady) DB.putSetting('preferences', options).catch(report); }
  function stories() { return customs; }
  function storyById(id) { return stories().find(s => s.id === id); }
  function requireDB() { if (!dbReady) throw new Error('Local storage is unavailable. Use a regular browser window with site storage enabled, then reload.'); }
  function canonicalURL() { return new URL('./index.html', location.href).href; }
  function tagURL(code) { const u = new URL(canonicalURL()); u.hash = 'tag=' + encodeURIComponent(code); return u.href; }
  async function refresh() { customs = await DB.all('stories'); links = await DB.all('links'); removedExamples = await DB.getSetting('removed-examples', []); customs.sort((a, b) => b.created - a.created); render(); }
  function storyCard(s) {
    const text = s.kind === 'text', example = s.source === 'example';
    return `<article class="story-card"><div class="story-cover ${esc(s.symbol)}"><span class="cover-ring" aria-hidden="true"></span><span class="sample-label">${example ? 'STARTER STORY' : text ? 'WRITTEN STORY' : 'YOUR AUDIO'}</span><span class="picture" aria-hidden="true">${C.SYMBOLS[s.symbol] || C.SYMBOLS.book}</span></div><div class="card-body"><h3>${esc(s.title)}</h3><p class="card-meta">${text ? 'Aa · Device voice' : '♫ · ' + (s.duration ? C.formatTime(s.duration) : 'Audio story')} ${links.some(l => l.storyId === s.id) ? '<span class="linked-badge">✓ Tag linked</span>' : ''}</p><div class="card-actions"><button class="button dark" data-play="${esc(s.id)}" aria-label="Play ${esc(s.title)}"><span aria-hidden="true">▶</span> Play</button><button class="button outline" data-link="${esc(s.id)}" aria-label="Link tag to ${esc(s.title)}">))) Link tag</button></div><button class="text-button card-edit" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.title)}">Rename / edit</button></div></article>`;
  }
  function render() {
    const list = stories(), personal = list.filter(s => s.source !== 'example'), examples = list.filter(s => s.source === 'example');
    $('library-count').textContent = list.length;
    $('hero-add').innerHTML = (personal.length ? 'Add another story' : 'Add your first story') + ' <span aria-hidden="true">＋</span>';
    $('story-grid').innerHTML = personal.map(storyCard).join('');
    $('example-grid').innerHTML = examples.map(storyCard).join(''); $('empty-library').hidden = personal.length > 0;
    $('examples-reset').hidden = !removedExamples.length;
    $('child-stories').innerHTML = list.map(s => `<button class="child-story" data-play="${esc(s.id)}" aria-label="Play ${esc(s.title)}"><span class="picture" aria-hidden="true">${C.SYMBOLS[s.symbol] || C.SYMBOLS.book}</span><strong>${esc(s.title)}</strong><small><span aria-hidden="true">▶</span> Play story</small></button>`).join('');
    const prior = $('link-story').value;
    $('link-story').innerHTML = list.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
    if (storyById(prior)) $('link-story').value = prior;
    $('linked-tags').innerHTML = links.length ? '<h3>Your linked tags</h3>' + links.map(l => `<div class="tag-row"><strong><span aria-hidden="true">✓</span> ${esc(storyById(l.storyId)?.title || 'Story missing')}</strong><span class="quiet">${esc(l.key.startsWith('code:') ? l.key.slice(5) : 'Tag ' + l.key.slice(4))}</span><div class="tag-actions">${l.key.startsWith('code:') ? `<button class="button outline" data-write="${esc(l.key)}">Write URL to NFC tag</button><button class="text-button" data-copy="${esc(l.key)}">Copy tag URL</button>` : ''}<button class="text-button danger-text" data-unlink="${esc(l.key)}">Unlink</button></div></div>`).join('') : '';
    document.querySelectorAll('[data-write]').forEach(b => { b.disabled = !canNFC(); });
    $('read-link').disabled = !canNFC() || !list.length; updateLinkPreview();
  }
  function updateLinkPreview() {
    const s = storyById($('link-story').value);
    $('link-preview').innerHTML = s ? `<span aria-hidden="true">${C.SYMBOLS[s.symbol] || C.SYMBOLS.book}</span><div><strong>${esc(s.title)}</strong><small>${s.kind === 'text' ? 'Written story' : 'Audio story'}</small></div>` : '<p>Add a story first.</p>';
  }
  function wizardState(step, instruction) {
    for (let i = 1; i <= 3; i++) {
      const el = $('wizard-step-' + i); el.classList.toggle('is-complete', i < step); el.classList.toggle('is-current', i === step);
      if (i === step) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
    }
    $('wizard-instruction').textContent = instruction || (step === 3 ? 'Your tag is ready' : 'Tap the tag to your phone');
    $('link-complete').hidden = step !== 3;
  }
  function wizardSuccess(id, tested = false) {
    $('test-linked-tag').disabled = !canNFC();
    linkedTestId = id; wizardState(3, tested ? 'It works. Ready for a little listener.' : 'A little tap. Your story.');
    $('linked-story-display').textContent = '✓ ' + storyById(id).title + (tested ? ' · Test passed' : ' · Tag linked');
    $('link-scan-state').textContent = tested ? 'Try it in child mode.' : 'Tap the same tag once more to test it.';
  }
  function openTagSetup(id) {
    setTab('setup', true); if (storyById(id)) $('link-story').value = id;
    updateLinkPreview(); wizardState(2); $('read-link').focus();
  }
  function recordingBusy() { return recordingState !== 'idle'; }
  function setTab(name, focus = false) {
    if (recordingBusy() && name !== 'add') { tell('Stop your recording before leaving this page.'); return; }
    if (name !== 'setup') stopNFC();
    ['library', 'add', 'setup'].forEach(n => { $('panel-' + n).hidden = n !== name; $('tab-' + n).setAttribute('aria-selected', String(n === name)); $('tab-' + n).tabIndex = n === name ? 0 : -1; });
    document.querySelector('.hero').hidden = name !== 'library';
    if (focus) $('tab-' + name).focus();
  }
  function setChild(value) {
    if (recordingBusy()) { tell('Stop your recording before changing mode.'); return; }
    stopNFC(); stopAudio(); child = value;
    $('parent-view').hidden = value; $('child-view').hidden = !value;
    $('mode-button').textContent = value ? 'Parent mode' : 'Enter child mode ↗';
    if (value) { childStatus(canNFC() ? 'Choose a story below, or start listening for tags.' : 'Tap a story or enter its code. In-app NFC is unavailable in this browser.', false); $('child-heading').tabIndex = -1; $('child-heading').focus(); }
    else { $('tab-' + (document.querySelector('[data-tab][aria-selected=true]')?.dataset.tab || 'library')).focus(); }
  }
  function resetPlayerURL() { if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; } }
  function stopAudio() {
    playGeneration++; audio.pause();
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
    $('player-picture').textContent = C.SYMBOLS[s.symbol] || C.SYMBOLS.book;
    $('player-transcript').textContent = s.kind === 'text' ? s.text : (s.transcript || ''); $('player-text').hidden = !(s.text || s.transcript);
    $('player-text').open = false; $('player-state').textContent = 'Ready to listen'; updateProgress();
  }
  async function resumeAudio() {
    if (!selected) return;
    if (selected.kind === 'text') {
      const callbacks = { state: state => playerSpeechState(state), error: error => { playerSpeechState('Press Play to retry'); report(error); $('player-toggle').focus(); } };
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
        if (child) childStatus('Your story is ready. Press Play to start.', false);
        $('player-toggle').focus();
      } else report(new Error('This audio could not play in this browser. Try an MP3 or WAV recording.'));
    }
  }
  function playStory(id) { const s = storyById(id); loadStory(s); if (child) childStatus('Your story: ' + s.title, false); return resumeAudio(); }
  function playerSpeechState(state) { $('player-state').textContent = state; const playing = speechPlayer.state === 'playing'; $('player-toggle').textContent = playing ? 'Pause' : 'Play'; $('player-toggle').setAttribute('aria-label', playing ? 'Pause story' : 'Play story'); if (state === 'Finished' && child) childStatus('Choose another story whenever you’re ready.', false); }
  function updateProgress() {
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
  }
  async function startRecording() {
    requireDB();
    if (recordingBusy() || importing) return;
    setSource('record', false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording needs HTTPS (or localhost) and a browser with microphone recording. You can still import an audio file.');
    if (draft && !(await confirmAction('Replace the unsaved audio in this form with a new recording?', 'Replace audio'))) return;
    stopAudio(); $('audio-preview').pause(); recordingState = 'requesting'; recordingUI(); $('record-state').textContent = 'Waiting for microphone permission…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = []; let bytes = 0;
      recorder.ondataavailable = e => { if (e.data?.size) { chunks.push(e.data); bytes += e.data.size; if (bytes > C.MAX_AUDIO && recorder.state === 'recording') stopRecording(); } };
      recorder.onerror = () => { report(new Error('Recording was interrupted. Check the preview before saving, or record again.')); stopRecording(); };
      recorder.onstop = () => {
        clearInterval(recordTimer); stream?.getTracks().forEach(t => t.stop()); stream = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
        recordingState = 'idle'; recordingUI();
        if (blob.size && blob.size <= C.MAX_AUDIO) { setDraft(blob, recordSeconds, 'New recording'); $('record-state').textContent = 'Recording finished. Listen to your preview, then save.'; }
        else report(new Error('No usable recording was captured, or it exceeded 100 MB. Please try a shorter recording.'));
      };
      recorder.start(1000); recordingState = 'recording'; recordStarted = Date.now(); recordSeconds = 0;
      $('record-state').textContent = 'Recording · 0:00'; recordingUI();
      recordTimer = setInterval(() => {
        recordSeconds = (Date.now() - recordStarted) / 1000;
        $('record-state').textContent = 'Recording · ' + C.formatTime(recordSeconds);
        if (recordSeconds >= 1800) { stopRecording(); tell('The 30-minute recording limit was reached. Your audio is ready to preview.'); }
      }, 500);
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop()); stream = null; recordingState = 'idle'; recordingUI();
      $('record-state').textContent = 'Recording did not start.';
      const denied = ['NotAllowedError', 'PermissionDeniedError'].includes(error.name);
      throw new Error(denied ? 'Microphone access was not allowed. You can allow it in the browser’s site settings or import an audio file.' : 'Could not start the microphone. Check it is connected and available, or import an audio file.');
    }
  }
  function stopRecording() {
    if (recorder?.state === 'recording') {
      recordSeconds = (Date.now() - recordStarted) / 1000;
      recordingState = 'finishing'; recordingUI(); $('record-state').textContent = 'Finishing recording…'; recorder.stop();
      stream?.getTracks().forEach(t => t.stop());
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
    const story = { id: crypto.randomUUID ? crypto.randomUUID() : 's-' + Date.now() + '-' + Math.random().toString(36).slice(2), title, symbol: $('story-symbol').value, source: 'personal', created: Date.now() };
    if (sourceMode === 'write') {
      const text = $('story-written').value.trim(); if (!text) throw new Error('Write a little story first.');
      Object.assign(story, { kind: 'text', text, transcript: text, ...voiceDetails('tts'), duration: 0 });
    } else {
      if (!draft) throw new Error('Record or choose some audio first.');
      Object.assign(story, { kind: 'audio', transcript: $('story-transcript').value, blob: draft.blob, mime: draft.mime, duration: draft.duration });
    }
    $('story-save').disabled = true;
    try {
      await DB.putStory(story); clearTimeout(draftTimer); clearDraft(false); $('story-form').reset(); setSource('write', false); await DB.putSetting('draft', null); draftDirty = false;
      await refresh(); lastSavedId = story.id; $('saved-title').textContent = '“' + title + '” is saved'; $('saved-banner').hidden = false;
      setTab('library', true); tell('“' + title + '” is saved on this device.'); updateStorage();
    } finally { $('story-save').disabled = false; }
  }
  function editStory(id) {
    editing = storyById(id); if (!editing) return;
    $('edit-title').value = editing.title; $('edit-symbol').value = editing.symbol; $('edit-transcript').value = editing.kind === 'text' ? editing.text : (editing.transcript || '');
    $('edit-written-controls').hidden = editing.kind !== 'text'; $('edit-text-label').textContent = editing.kind === 'text' ? 'Your written story' : 'Story text or notes';
    populateVoices(); $('edit-voice').value = editing.voiceURI || ''; $('edit-rate').value = String(editing.rate || .9); $('download-audio').textContent = editing.kind === 'text' ? 'Download story text' : 'Download audio';
    $('edit-dialog').showModal();
  }
  async function saveEdit(e) {
    e.preventDefault(); requireDB(); const title = $('edit-title').value.trim(); if (!title) return;
    const updated = { ...editing, title, symbol: $('edit-symbol').value, transcript: $('edit-transcript').value, updated: Date.now() };
    if (editing.kind === 'text') { if (!updated.transcript.trim()) throw new Error('Your written story needs some words.'); Object.assign(updated, { text: updated.transcript, ...voiceDetails('edit') }); }
    await DB.putStory(updated); $('edit-dialog').close(); await refresh();
    if (selected?.id === updated.id) loadStory(updated);
    $('link-story').value = updated.id; tell('Story details saved. Use Tags & setup to link this story.');
  }
  async function removeStory() {
    const s = editing;
    if (!(await confirmAction('Delete “' + s.title + '” and its tag links from this device? Export a backup first if you want to keep it.', 'Delete story'))) return;
    if (s.catalogId && !removedExamples.includes(s.catalogId)) removedExamples.push(s.catalogId);
    await DB.deleteStory(s.id, links, removedExamples); $('edit-dialog').close();
    if (selected?.id === s.id) { stopAudio(); selected = null; audio.removeAttribute('src'); audio.load(); resetPlayerURL(); $('player').hidden = true; }
    await refresh(); if (lastSavedId === s.id) $('saved-banner').hidden = true; tell('Story and its links deleted from this device.'); updateStorage();
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
  function canNFC() { return window.isSecureContext && 'NDEFReader' in window; }
  function nfcError(error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'NFC permission was not allowed. Use Android Chrome over HTTPS and allow NFC, or use a story button or code.';
    if (error.name === 'NotSupportedError') return 'NFC is unavailable on this device. Use a story button or code.';
    if (error.name === 'NotReadableError') return 'Cannot read NFC. Turn NFC on, keep the phone unlocked, and try again.';
    if (error.name === 'NetworkError') return 'The NFC tag could not be written. Keep a writable NDEF tag near the reader and try again.';
    return 'NFC could not start. Check NFC is enabled on a compatible Android phone, then try again.';
  }
  function stopNFC() {
    const old = nfcSession; nfcSession = null; old?.controller.abort();
    $('child-scan').hidden = false; $('child-stop-scan').hidden = true; $('cancel-link-scan').hidden = true;
    $('tag-visual').classList.remove('is-scanning'); $('read-link').disabled = !canNFC() || !stories().length;
  }
  async function startScan(mode) {
    if (!canNFC()) throw new Error('In-app NFC needs Android Chrome on an NFC phone over HTTPS. Use a story button or a manual code on this browser.');
    if (mode !== 'child') requireDB();
    if (mode !== 'child' && !storyById($('link-story').value)) throw new Error('Choose a story first.');
    stopNFC();
    const session = { controller: new AbortController(), reader: new NDEFReader(), mode, lastKey: '', lastTime: 0, storyId: $('link-story').value };
    nfcSession = session;
    session.reader.onreadingerror = () => { if (nfcSession !== session) return; const m = 'Tag could not be read. Try an NDEF tag and hold it closer.'; mode === 'child' ? childStatus(m) : ($('link-scan-state').textContent = m); };
    session.reader.onreading = async event => {
      if (nfcSession !== session) return;
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
          if (session.lastKey === match.key && Date.now() - session.lastTime < 2500) return;
          session.lastKey = match.key; session.lastTime = Date.now();
          await playStory(match.storyId);
        }
      } catch (error) { report(error); }
    };
    if (mode === 'child') { $('child-scan').hidden = true; $('child-stop-scan').hidden = false; childStatus('Starting NFC…', false); }
    else { $('cancel-link-scan').hidden = false; $('read-link').disabled = true; $('tag-visual').classList.add('is-scanning'); wizardState(2, mode === 'test' ? 'Tap the same tag again' : 'Hold the tag near your phone'); $('link-scan-state').textContent = 'Starting NFC…'; }
    try {
      await session.reader.scan({ signal: session.controller.signal });
      if (nfcSession !== session) return;
      if (mode === 'child') childStatus('Listening. Hold your story tag near the back of the phone.');
      else $('link-scan-state').textContent = mode === 'test' ? 'Tap your linked tag. We’ll play the story.' : 'Hold the tag near the phone. Keep it still for a moment.';
      cue();
    } catch (error) { if (nfcSession !== session || error.name === 'AbortError') return; stopNFC(); if (mode === 'child') childStatus('Tag listening stopped. You can still tap a story.'); throw new Error(nfcError(error)); }
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
      for (const s of customs) { const { blob, ...meta } = s; rows.push(s.kind === 'text' ? meta : { ...meta, kind: 'audio', audio: await blobBase64(blob) }); }
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
    const rows = data.stories.map(s => {
      const meta = { id: s.id, title: s.title, symbol: s.symbol, transcript: s.transcript, duration: s.duration, source: s.source === 'example' ? 'example' : 'personal', created: Number.isFinite(s.created) ? s.created : Date.now() };
      if (typeof s.catalogId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s.catalogId)) meta.catalogId = s.catalogId;
      if (typeof s.exampleFile === 'string') meta.exampleFile = s.exampleFile.slice(0,1000);
      if (s.kind === 'text') return { ...meta, kind: 'text', text: s.text, voiceURI: s.voiceURI, voiceLang: s.voiceLang, rate: s.rate };
      const binary = atob(s.audio), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { ...meta, kind: 'audio', mime: s.mime, blob: new Blob([bytes], { type: s.mime }) };
    });
    const removed = data.removedExamples || [], ids = new Set(rows.map(s => s.id));
    const removeIds = customs.filter(s => s.catalogId && removed.includes(s.catalogId) && !ids.has(s.id)).map(s => s.id);
    await DB.restore(rows, data.links, removed, removeIds);
    if (selected && (rows.some(s => s.id === selected.id) || removeIds.includes(selected.id))) { stopAudio(); selected = null; resetPlayerURL(); $('player').hidden = true; }
    if (data.options && typeof data.options.spoken === 'boolean' && typeof data.options.sounds === 'boolean') { options = { spoken: data.options.spoken, sounds: data.options.sounds }; saveOptions(); $('spoken-guidance').checked = options.spoken; $('feedback-sounds').checked = options.sounds; }
    await refresh(); if (data.version === 1) { await syncExamples(); await refresh(); } tell('Backup restored on this device.'); updateStorage();
  }
  async function updateStorage() {
    try {
      const estimate = await navigator.storage?.estimate(), persistent = await navigator.storage?.persisted?.();
      $('storage-state').textContent = (estimate ? ((estimate.usage || 0) / 1024 / 1024).toFixed(1) + ' MB used. ' : '') + (persistent ? 'Persistent storage granted. Still keep a backup.' : 'The browser may remove local data when space is low. Keep a backup.');
    } catch (_) { $('storage-state').textContent = 'Keep a backup in case browser storage is cleared.'; }
  }
  async function initOffline() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') { $('offline-badge').textContent = 'Use HTTPS for offline setup'; return; }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      let readyTimer;
      const ready = await Promise.race([
        navigator.serviceWorker.ready.finally(() => clearTimeout(readyTimer)),
        new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error('Offline installation timed out')), 20000); })
      ]);
      if (ready.active) $('offline-badge').textContent = navigator.onLine ? 'Ready for offline stories' : 'Offline · ready to play';
      if (registration.waiting) tell('An app update is ready. Close all StoryTouch tabs and reopen to apply it.');
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', () => { if (registration.waiting && navigator.serviceWorker.controller) tell('An app update is ready. Close all StoryTouch tabs and reopen to apply it.'); });
      });
    } catch (_) { $('offline-badge').textContent = 'Offline setup unavailable'; tell('Offline setup did not complete. Stay online and reload before using the app offline.'); }
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
    const snapshot = { sourceMode, title: $('story-title').value, symbol: $('story-symbol').value, text: $('story-written').value, transcript: $('story-transcript').value, voiceURI: $('tts-voice').value || wantedVoice, rate: $('tts-rate').value, audio: draft };
    await DB.putSetting('draft', snapshot); if (revision === draftRevision) { draftDirty = false; $('draft-state').textContent = '✓ Draft saved on this device'; }
  }
  async function restoreDraft() {
    const saved = await DB.getSetting('draft'); if (!saved) return;
    restoringDraft = true;
    $('story-title').value = saved.title || ''; $('story-symbol').value = saved.symbol || 'bear'; $('story-written').value = saved.text || ''; $('story-transcript').value = saved.transcript || '';
    wantedVoice = saved.voiceURI || ''; $('tts-rate').value = saved.rate || '.9';
    sourceMode = ['write','record','import'].includes(saved.sourceMode) ? saved.sourceMode : 'write';
    if (saved.audio?.blob instanceof Blob) setDraft(saved.audio.blob, saved.audio.duration || 0, saved.audio.name || 'Saved audio draft');
    restoringDraft = false; $('draft-state').textContent = '✓ Your saved draft is here';
  }
  async function syncExamples() {
    requireDB();
    let catalog;
    try { const response = await fetch('./example-stories/stories.json'); if (!response.ok) throw new Error('Starter folder is unavailable.'); catalog = await response.json(); }
    catch (_) { $('example-state').textContent = 'Starter folder could not load. Your saved stories are still here.'; return; }
    if (catalog.version !== 1 || !Array.isArray(catalog.stories) || catalog.stories.length > 2000) throw new Error('The starter-story catalog is invalid.');
    const known = new Set(customs.map(s => s.id));
    for (const entry of catalog.stories) {
      if (known.has(entry.id) || removedExamples.includes(entry.id)) continue;
      if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id) || typeof entry.file !== 'string' || entry.file.split('/').some(part => !part || part === '..' || part === '.' || part.includes('\\')) || entry.file.startsWith('/') || !/\.(mp3|wav|m4a|ogg|aac|flac|webm)$/i.test(entry.file)) continue;
      const url = './example-stories/' + entry.file.split('/').map(encodeURIComponent).join('/');
      try {
        const response = await fetch(url); if (!response.ok) throw new Error('Could not load ' + entry.file);
        let blob = await response.blob(); if (!blob.size || blob.size > C.MAX_AUDIO) throw new Error('Starter audio must be 1–100 MB.');
        if (!blob.type.startsWith('audio/')) blob = new Blob([blob], { type: /\.mp3$/i.test(entry.file) ? 'audio/mpeg' : /\.wav$/i.test(entry.file) ? 'audio/wav' : 'audio/' + entry.file.split('.').pop().toLowerCase() });
        await DB.putStory({ id: entry.id, title: String(entry.title || entry.file).slice(0,100), symbol: Object.hasOwn(C.SYMBOLS,entry.symbol) ? entry.symbol : 'book', transcript: String(entry.transcript || '').slice(0,20000), duration: Number.isFinite(entry.duration) ? entry.duration : 0, blob, mime: blob.type, kind: 'audio', source: 'example', catalogId: entry.id, created: 0 });
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
    const text = $('story-written').value.trim(); if (!text) throw new Error('Write a few words to preview.');
    stopAudio(); previewing = true;
    speechPlayer.start({ id:'preview', text, ...voiceDetails('tts') }, Number($('tts-rate').value), { state: state => { $('tts-preview-state').textContent = state === 'Finished' ? '✓ Preview finished' : state + ' preview…'; }, error: error => { $('tts-preview-state').textContent = error.message; report(error); } });
  });
  on('tts-preview-stop','click', () => { speechPlayer.stop(); previewing = false; $('tts-preview-state').textContent = 'Preview stopped.'; });
  on('clear-story-draft','click', async () => { if (!(await confirmAction('Clear this unfinished story?', 'Clear draft'))) return; clearTimeout(draftTimer); clearDraft(false); $('story-form').reset(); setSource('write',false); await DB.putSetting('draft',null); draftDirty = false; $('draft-state').textContent = 'Start a new story.'; });
  on('example-folder-add','click', () => $('example-folder').click()); on('example-folder','change',importExampleFolder);
  on('examples-reset','click', async () => { requireDB(); removedExamples = []; await DB.putSetting('removed-examples',[]); await syncExamples(); await refresh(); tell('Starter stories restored.'); });
  on('next-link','click', () => openTagSetup(lastSavedId));
  on('link-story','change', () => { stopNFC(); updateLinkPreview(); wizardState(2); $('link-scan-state').textContent = 'Choose Link this tag, then hold it near the back of your phone.'; });
  on('test-linked-tag','click', () => { if (linkedTestId) $('link-story').value = linkedTestId; return startScan('test'); });

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelector('.tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = ['library', 'add', 'setup'], current = tabs.indexOf(document.activeElement.dataset.tab); if (current < 0) return;
    e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (current + (e.key === 'ArrowRight' ? 1 : -1) + 3) % 3; setTab(tabs[next], true);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const run = async () => {
      if (b.dataset.play) await playStory(b.dataset.play);
      if (b.dataset.edit) editStory(b.dataset.edit);
      if (b.dataset.link) openTagSetup(b.dataset.link);
      if (b.dataset.write) await writeTag(b.dataset.write);
      if (b.dataset.copy) {
        const url = tagURL(b.dataset.copy.slice(5));
        try { await navigator.clipboard.writeText(url); tell('Tag URL copied. This URL contains a code, not your audio.'); }
        catch (_) { tell('Tag URL: ' + url); }
      }
      if (b.dataset.unlink && await confirmAction('Remove this tag link from this device? The story and the NFC tag’s contents stay.', 'Unlink tag')) { await DB.deleteLink(b.dataset.unlink); await refresh(); tell('Tag link removed.'); }
    };
    run().catch(report);
  });
  ['hero-add', 'library-add', 'empty-add'].forEach(id => on(id, 'click', () => { setTab('add', true); $('story-title').focus(); }));
  on('tip-setup', 'click', () => setTab('setup', true));
  on('mode-button', 'click', () => setChild(!child)); on('setup-child', 'click', () => setChild(true));
  on('record-start', 'click', startRecording); on('record-stop', 'click', stopRecording);
  on('audio-file', 'change', importAudio); on('discard-audio', 'click', clearDraft); on('story-form', 'submit', saveStory);
  on('edit-form', 'submit', saveEdit); on('edit-cancel', 'click', () => $('edit-dialog').close()); on('delete-story', 'click', removeStory);
  on('edit-link', 'click', () => { const id = editing.id; $('edit-dialog').close(); openTagSetup(id); });
  on('download-audio', 'click', () => { if (editing?.kind === 'text') { download(new Blob([editing.text], { type: 'text/plain' }), editing.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0,70) + '.txt'); return; } if (editing) download(editing.blob, editing.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 70) + '.' + audioExtension(editing.mime)); });
  on('player-toggle', 'click', () => { if (selected?.kind === 'text') { if (speechPlayer.state === 'playing') speechPlayer.pause(); else return resumeAudio(); } else { if (audio.paused) return resumeAudio(); audio.pause(); } });
  on('player-restart', 'click', () => { if (selected?.kind === 'text') speechPlayer.stop(); else audio.currentTime = 0; return resumeAudio(); });
  on('player-stop', 'click', stopAudio); on('child-stop-audio', 'click', () => { stopAudio(); childStatus('Story stopped. Choose another whenever you’re ready.', false); });
  on('player-seek', 'input', () => { const d = Number.isFinite(audio.duration) ? audio.duration : selected?.duration; if (d) audio.currentTime = Number($('player-seek').value) / 100 * d; });
  on('player-speed', 'change', async () => { const rate = Number($('player-speed').value); audio.playbackRate = rate; options.playbackRate = rate; saveOptions(); if (selected) { selected.rate = rate; if (selected.kind === 'text') speechPlayer.setRate(rate); await DB.putStory(selected); await refresh(); } });
  audio.addEventListener('timeupdate', updateProgress); audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('play', () => { $('audio-preview').pause(); $('player-state').textContent = 'Playing'; $('player-toggle').textContent = 'Pause'; $('player-toggle').setAttribute('aria-label', 'Pause story'); });
  audio.addEventListener('pause', () => { if (selected?.kind === 'text') return; $('player-state').textContent = audio.ended ? 'Finished' : 'Paused'; $('player-toggle').textContent = 'Play'; $('player-toggle').setAttribute('aria-label', 'Play story'); });
  audio.addEventListener('ended', () => { $('player-state').textContent = 'Finished'; if (child) childStatus('That was lovely. Choose another story.', false); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) report(new Error('This audio could not be played. Try importing an MP3 or WAV file.')); });
  $('audio-preview').addEventListener('play', () => { audio.pause(); speechPlayer.stop(); });
  on('link-form', 'submit', async e => { e.preventDefault(); await saveLink('code:' + C.code($('tag-code').value), $('link-story').value); });
  on('read-link', 'click', () => startScan('link')); on('child-scan', 'click', () => startScan('child'));
  on('child-stop-scan', 'click', () => { stopNFC(); childStatus('Tag listening stopped. You can still tap a story.', false); });
  on('cancel-link-scan', 'click', () => { stopNFC(); tell('Tag operation cancelled.'); });
  on('child-code-form', 'submit', e => { e.preventDefault(); return playCode($('child-code').value); });
  on('confirm-yes', 'click', () => finishConfirm(true)); on('confirm-no', 'click', () => finishConfirm(false));
  $('confirm-dialog').addEventListener('cancel', e => { e.preventDefault(); finishConfirm(false); });
  on('backup-export', 'click', exportBackup); on('backup-import', 'click', () => $('backup-file').click()); on('backup-file', 'change', restoreBackup);
  on('persist-storage', 'click', async () => { if (!navigator.storage?.persist) throw new Error('This browser does not offer a persistent-storage request. Keep an exported backup.'); const granted = await navigator.storage.persist(); tell(granted ? 'The browser agreed to keep local storage. Keep an exported backup too.' : 'The browser did not grant persistent storage. Export regular backups.'); await updateStorage(); });
  on('spoken-guidance', 'change', () => { options.spoken = $('spoken-guidance').checked; saveOptions(); if (options.spoken) say('Spoken guidance is on.'); else if (StorySpeech.supported()) speechSynthesis.cancel(); });
  on('feedback-sounds', 'change', () => { options.sounds = $('feedback-sounds').checked; saveOptions(); if (options.sounds) cue(); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('install-app').textContent = 'Install StoryTouch'; });
  window.addEventListener('appinstalled', () => { installPrompt = null; $('install-app').textContent = 'StoryTouch installed'; tell('StoryTouch is installed.'); });
  on('install-app', 'click', async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('install-app').textContent = 'How to install'; } else { $('install-help').textContent = 'Android Chrome: browser menu → Add to Home screen → Install. iPhone/iPad Safari: Share → Add to Home Screen. Desktop Chrome/Edge: use the browser’s install icon or menu. Options depend on your browser.'; tell('Installation instructions are shown below the button.'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && nfcSession) { stopNFC(); if (child) childStatus('Tag listening paused. Choose Listen for tags again when you return.', false); } });
  window.addEventListener('pagehide', () => { stopNFC(); stopRecording(); stream?.getTracks().forEach(t => t.stop()); audio.pause(); speechPlayer.stop(); });
  window.addEventListener('beforeunload', e => { if (draftDirty || recordingBusy()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('offline', () => { if (navigator.serviceWorker?.controller) $('offline-badge').textContent = 'Offline · ready to play'; });
  window.addEventListener('online', () => { if (navigator.serviceWorker?.controller) $('offline-badge').textContent = 'Ready for offline stories'; });
  async function handleHash() { const code = new URLSearchParams(location.hash.slice(1)).get('tag'); if (code) { setChild(true); playCode(code, false); } }
  window.addEventListener('hashchange', () => handleHash().catch(report));
  async function init() {
    try { const saved = JSON.parse(localStorage.getItem('storytouch-options')); if (saved) options = { spoken: saved.spoken === true, sounds: saved.sounds !== false, playbackRate: [.75,.9,1,1.25,1.5].includes(saved.playbackRate) ? saved.playbackRate : 1 }; } catch (_) {}
    $('spoken-guidance').checked = options.spoken; $('feedback-sounds').checked = options.sounds;
    $('nfc-support').textContent = canNFC() ? 'NFC ready · Phone unlocked · App open' : 'NFC unavailable here · Use Android Chrome with NFC, or use a code.';
    $('read-link').disabled = !canNFC(); $('child-scan').disabled = !canNFC();
    try { await DB.open(); dbReady = true; const preferences = await DB.getSetting('preferences'); if (preferences) { options = { spoken: preferences.spoken === true, sounds: preferences.sounds !== false, playbackRate: [.75,.9,1,1.25,1.5].includes(preferences.playbackRate) ? preferences.playbackRate : 1 }; $('spoken-guidance').checked = options.spoken; $('feedback-sounds').checked = options.sounds; } await refresh(); await syncExamples(); await refresh(); await restoreDraft(); } catch (error) { render(); report(error); }
    populateVoices(); setSource(sourceMode, false); updateStorage(); initOffline();
    if (location.protocol === 'file:') report(new Error('For reliable recording, storage, NFC, and offline setup, serve this folder over HTTPS or localhost. See Help & deployment.'));
    await handleHash();
  }
  init().catch(report);
})();
