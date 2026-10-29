/* StoryTouch 1.1.0 — validation and tag handling. */
(function (root) {
  'use strict';
  const MAX_AUDIO = 100 * 1024 * 1024;
  const SYMBOLS = { bear: '🧸', moon: '🌙', leaf: '🌿', star: '⭐', heart: '❤', book: '📖' };
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
  const api = { MAX_AUDIO, SYMBOLS, DEMOS, code, uidKey, formatTime, escape, tagKeys, validateBackup };
  root.StoryCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
