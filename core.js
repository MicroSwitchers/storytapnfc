/* StoryTouch 1.1.0 — validation and tag handling. */
(function (root) {
  'use strict';
  const MAX_AUDIO = 100 * 1024 * 1024;
  const MAX_IMAGE = 5 * 1024 * 1024;
  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  const SYMBOLS = { bear: '🧸', moon: '🌙', leaf: '🌿', star: '⭐', heart: '❤', book: '📖' };
  const BOOK_ICON = "<svg class=\"book-icon\" viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M24 12 C19.2 8.3 12.7 7.4 7.3 9.2 C6.5 9.5 6 10.2 6 11.1 V36.5 C6 37.5 7.1 38.2 8.1 37.9 C13.6 36.2 19.5 37.3 24 40 C28.5 37.3 34.4 36.2 39.9 37.9 C40.9 38.2 42 37.5 42 36.5 V11.1 C42 10.2 41.5 9.5 40.7 9.2 C35.3 7.4 28.8 8.3 24 12 Z\"/><path d=\"M24 12 V40\"/><path d=\"M11.5 17 C14.5 16.6 17.7 17.2 20 18.4 M11.5 23.5 C14.5 23.1 17.7 23.7 20 24.9 M28 18.4 C30.3 17.2 33.5 16.6 36.5 17 M28 24.9 C30.3 23.7 33.5 23.1 36.5 23.5\"/></svg>";
  // Kept only to resolve tag references in older version-1 backups.
  const DEMOS = [{ id: 'demo-hello' }, { id: 'demo-chimes' }, { id: 'demo-rain' }];
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
    if (!data || data.format !== 'storytouch-backup' || ![1,2].includes(data.version) || !Array.isArray(data.stories) || !Array.isArray(data.links)) throw new Error('This is not a supported StoryTouch backup.');
    if (data.stories.length > 2000 || data.links.length > 5000) throw new Error('This backup contains too many entries.');
    const ids = new Set(), linkKeys = new Set();
    for (const s of data.stories) {
      if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id) || (data.version === 1 && s.id.startsWith('demo-')) || ids.has(s.id)) throw new Error('The backup has an invalid or duplicate story ID.');
      ids.add(s.id);
      if (s.image !== undefined && (!s.image || !IMAGE_MIMES.includes(s.image.mime) || typeof s.image.data !== 'string' || !s.image.data || s.image.data.length > Math.ceil(MAX_IMAGE / 3) * 4 || s.image.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.image.data))) throw new Error('The backup has an invalid story picture.');
      if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 100 || !Object.hasOwn(SYMBOLS, s.symbol) || typeof s.transcript !== 'string' || s.transcript.length > 20000) throw new Error('The backup contains invalid story details.');
      if (data.version === 2 && !['audio','text'].includes(s.kind)) throw new Error('The backup has an invalid story type.');
      if (s.kind === 'text') {
        if (typeof s.text !== 'string' || !s.text.trim() || s.text.length > 20000 || typeof s.voiceURI !== 'string' || s.voiceURI.length > 500 || typeof s.voiceLang !== 'string' || s.voiceLang.length > 50 || !Number.isFinite(s.rate) || s.rate < .5 || s.rate > 2) throw new Error('The backup contains invalid written story details.');
      } else {
        if (typeof s.audio !== 'string' || !s.audio || s.audio.length > Math.ceil(MAX_AUDIO / 3) * 4 || s.audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.audio)) throw new Error('The backup contains invalid or oversized audio.');
        if (typeof s.mime !== 'string' || !/^audio\/[a-zA-Z0-9.+_-]+(?:\s*;[^\r\n]*)?$/.test(s.mime) || s.mime.length > 150) throw new Error('The backup has an invalid audio type.');
      }
      if (!Number.isFinite(s.duration) || s.duration < 0 || s.duration > 86400) throw new Error('The backup has an invalid audio duration.');
    }
    if (data.removedExamples !== undefined && (!Array.isArray(data.removedExamples) || data.removedExamples.length > 5000 || data.removedExamples.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)))) throw new Error('The backup has an invalid starter-story list.');
    const known = new Set(data.version === 1 ? [...ids, ...DEMOS.map(s => s.id)] : ids);
    for (const l of data.links) {
      if (!l || typeof l.key !== 'string' || !/^(code:[A-Z0-9-]{1,48}|uid:[a-z0-9:-]{1,150})$/.test(l.key) || linkKeys.has(l.key) || !known.has(l.storyId)) throw new Error('The backup contains an invalid or missing tag link.');
      linkKeys.add(l.key);
    }
    return data;
  }
  const api = { MAX_AUDIO, MAX_IMAGE, IMAGE_MIMES, SYMBOLS, BOOK_ICON, DEMOS, code, uidKey, formatTime, escape, tagKeys, validateBackup };
  root.StoryCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
