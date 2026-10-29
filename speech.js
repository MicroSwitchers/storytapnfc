/* Basic device text-to-speech. Text and voice preferences are persisted, not a generated audio file. */
(function () {
  'use strict';
  const supported = () => typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
  class Player {
    constructor() { this.token = 0; this.state = 'stopped'; this.offset = 0; this.boundary = 0; }
    stop() {
      this.token++; if (supported()) speechSynthesis.cancel();
      this.state = 'stopped'; this.offset = 0; this.boundary = 0; this.utterance = null;
    }
    start(story, rate, callbacks = {}) {
      this.stop(); this.story = story; this.rate = rate; this.callbacks = callbacks;
      if (!supported()) { callbacks.error?.(new Error('Text-to-speech is unavailable here. Record your voice or add an MP3.')); return; }
      this.state = 'playing'; this.speakChunk();
    }
    speakChunk() {
      const token = ++this.token;
      let chunk = this.story.text.slice(this.offset, this.offset + 220);
      if (chunk.length === 220) { const cut = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '), chunk.lastIndexOf(' ')); if (cut > 80) chunk = chunk.slice(0, cut + 1); }
      if (!chunk) { this.state = 'finished'; this.callbacks.state?.('Finished'); return; }
      this.boundary = 0;
      const u = new SpeechSynthesisUtterance(chunk);
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find(v => v.voiceURI === this.story.voiceURI) || voices.find(v => v.lang === this.story.voiceLang && v.localService) || null;
      if (u.voice) u.lang = u.voice.lang; else if (this.story.voiceLang) u.lang = this.story.voiceLang;
      u.rate = this.rate || 1; this.utterance = u;
      u.onstart = () => { if (token === this.token) this.callbacks.state?.('Playing'); };
      u.onboundary = e => { if (token === this.token) this.boundary = e.charIndex || 0; };
      u.onend = () => {
        if (token !== this.token) return;
        this.offset += chunk.length;
        if (this.offset >= this.story.text.length) { this.state = 'finished'; this.callbacks.state?.('Finished'); }
        else this.speakChunk();
      };
      u.onerror = e => {
        if (token !== this.token || ['canceled', 'interrupted'].includes(e.error)) return;
        this.state = 'stopped';
        this.callbacks.error?.(new Error(e.error === 'not-allowed' ? 'Press Play to start the written story.' : 'This device voice could not speak. Choose another voice, or use a recording or MP3.'));
      };
      speechSynthesis.speak(u);
    }
    pause() {
      if (this.state !== 'playing') return;
      // Resuming from a word boundary also works on devices with unreliable synth.pause().
      this.offset += this.boundary; this.token++; speechSynthesis.cancel();
      this.state = 'paused'; this.callbacks.state?.('Paused');
    }
    resume() {
      if (!this.story) return;
      if (this.state === 'finished') this.offset = 0;
      this.state = 'playing'; this.speakChunk();
    }
    setRate(rate) { this.rate = rate; if (this.state === 'playing') { this.pause(); this.resume(); } }
  }
  window.StorySpeech = { supported, Player };
})();
