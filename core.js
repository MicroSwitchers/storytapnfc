/* StoryTouch 1.0.0 — framework-free shared validation and tag handling. */
(function (root) {
  'use strict';
  const MAX_AUDIO = 100 * 1024 * 1024;
  const SYMBOLS = { bear: '🧸', moon: '🌙', leaf: '🌿', star: '⭐', heart: '❤', book: '📖' };
  const DEMOS = [
    { id: 'demo-hello', title: 'A little hello', symbol: 'bear', duration: 14, url: './assets/audio/hello.wav', demo: true, transcript: 'Hello, little listener. Welcome to StoryTouch. A familiar voice can take you anywhere. Find a comfortable spot, take a slow breath, and let a little story begin.' },
    { id: 'demo-chimes', title: 'A pocketful of stars', symbol: 'moon', duration: 7, url: './assets/audio/chimes.wav', demo: true, transcript: '[A gentle sequence of bell-like musical notes. Test sound; no speech.]' },
    { id: 'demo-rain', title: 'Rain in the garden', symbol: 'leaf', duration: 10, url: './assets/audio/rain.wav', demo: true, transcript: '[Soft simulated rain, fading in and out. Test sound; no speech.]' }
  ];
  function code(value) {
    const c = String(value || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,48}$/.test(c)) throw new Error('Use a tag code of 1–48 letters, numbers, or hyphens.');
    return c;
  }
  function formatTime(seconds) {
    const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function uidKey(value) { return 'uid:' + String(value).trim().toLowerCase(); }
  function tagKeys(event, baseURL) {
    const keys = [];
    for (const record of event.message?.records || []) {
      try {
        if (record.recordType !== 'text' && record.recordType !== 'url') continue;
        const text = new TextDecoder(record.encoding || 'utf-8').decode(record.data).trim();
        if (record.recordType === 'url') {
          const u = new URL(text), base = new URL(baseURL);
          // Only our own app's URL records are interpreted. Tags never navigate the page.
          if (u.origin !== base.origin || u.pathname !== base.pathname) continue;
          const raw = new URLSearchParams(u.hash.slice(1)).get('tag');
          if (raw) keys.push('code:' + code(raw));
        } else {
          keys.push('code:' + code(text.replace(/^storytouch:/i, '')));
        }
      } catch (_) { /* Non-text, malformed, and unrelated records are ignored. */ }
    }
    if (event.serialNumber) keys.push(uidKey(event.serialNumber));
    return [...new Set(keys)];
  }
  function validateBackup(data) {
    if (!data || data.format !== 'storytouch-backup' || data.version !== 1 || !Array.isArray(data.stories) || !Array.isArray(data.links)) throw new Error('This is not a supported StoryTouch backup (version 1).');
    if (data.stories.length > 2000 || data.links.length > 5000) throw new Error('This backup contains too many entries.');
    const ids = new Set(), linkKeys = new Set();
    for (const s of data.stories) {
      if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id) || s.id.startsWith('demo-') || ids.has(s.id)) throw new Error('The backup has an invalid or duplicate story ID.');
      ids.add(s.id);
      if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 100 || !Object.hasOwn(SYMBOLS, s.symbol) || typeof s.transcript !== 'string' || s.transcript.length > 20000) throw new Error('The backup contains invalid story details.');
      if (typeof s.audio !== 'string' || !s.audio || s.audio.length > Math.ceil(MAX_AUDIO / 3) * 4 || s.audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.audio)) throw new Error('The backup contains invalid or oversized audio.');
      if (typeof s.mime !== 'string' || !/^audio\/[a-zA-Z0-9.+_-]+(?:\s*;[^\r\n]*)?$/.test(s.mime) || s.mime.length > 150) throw new Error('The backup has an invalid audio type.');
      if (!Number.isFinite(s.duration) || s.duration < 0 || s.duration > 86400) throw new Error('The backup has an invalid audio duration.');
    }
    const known = new Set([...ids, ...DEMOS.map(s => s.id)]);
    for (const l of data.links) {
      if (!l || typeof l.key !== 'string' || !/^(code:[A-Z0-9-]{1,48}|uid:[a-z0-9:-]{1,150})$/.test(l.key) || linkKeys.has(l.key) || !known.has(l.storyId)) throw new Error('The backup contains an invalid or missing tag link.');
      linkKeys.add(l.key);
    }
    return data;
  }
  const api = { MAX_AUDIO, SYMBOLS, DEMOS, code, uidKey, formatTime, escape, tagKeys, validateBackup };
  root.StoryCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
