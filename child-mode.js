/* Child-mode preferences, deliberate exits, and a screen wake lock. No background NFC workaround. */
(function (root) {
  'use strict';
  function preferences(saved = {}) {
    return { spoken: saved?.spoken === true, sounds: saved?.sounds !== false,
      playbackRate: [.75,.9,1,1.25,1.5].includes(saved?.playbackRate) ? saved.playbackRate : 1,
      childScreen: saved?.childScreen === 'black' ? 'black' : 'stories',
      childLock: saved?.childLock !== false, keepAwake: saved?.keepAwake !== false,
      tapToPause: saved?.tapToPause === true };
  }
  class HoldExit {
    constructor(button, { required, exit, progress }) {
      this.button = button; this.required = required; this.exit = exit; this.progress = progress;
      const pointerEnd = e => { if (this.active?.kind === 'pointer' && e.pointerId === this.active.id) this.end(e.type === 'pointerup'); };
      button.addEventListener('pointerdown', e => {
        if (!this.required() || e.button !== 0 || e.isPrimary === false) return;
        e.preventDefault(); this.start('pointer', e.pointerId);
        try { button.setPointerCapture(e.pointerId); } catch (_) {}
      });
      button.addEventListener('pointermove', e => {
        if (this.active?.kind !== 'pointer' || this.active.id !== e.pointerId) return;
        const r = button.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.cancel();
      });
      ['pointerup','pointercancel','lostpointercapture'].forEach(name => button.addEventListener(name, pointerEnd));
      button.addEventListener('pointerleave', () => this.cancel());
      button.addEventListener('keydown', e => {
        if (!this.required() || ![' ', 'Enter'].includes(e.key)) return;
        e.preventDefault(); if (!e.repeat) this.start('key', e.key);
      });
      button.addEventListener('keyup', e => { if (this.active?.kind === 'key' && this.active.id === e.key) { e.preventDefault(); this.end(true); } });
      button.addEventListener('blur', () => this.cancel());
      button.addEventListener('contextmenu', e => e.preventDefault());
      button.addEventListener('click', e => { e.preventDefault(); if (this.required()) this.progress(0); else this.exit(); });
      root.addEventListener('blur', () => this.cancel());
    }
    start(kind, id) {
      if (this.active) return;
      this.active = { kind, id, started: root.performance.now() };
      this.progress(3);
      this.timer = root.setInterval(() => {
        if (!this.active) return;
        const remaining = 3000 - (root.performance.now() - this.active.started);
        if (remaining <= 0) { this.cancel(); this.exit(); }
        else this.progress(Math.ceil(remaining / 1000));
      }, 100);
    }
    end(complete) {
      const finished = complete && this.active && root.performance.now() - this.active.started >= 3000;
      this.cancel(); if (finished) this.exit();
    }
    cancel() { root.clearInterval(this.timer); this.timer = null; this.active = null; this.progress(0); }
  }
  class WakeKeeper {
    constructor(status = () => {}) { this.status = status; this.wanted = false; this.generation = 0; }
    setEnabled(enabled) {
      if (this.wanted !== enabled) this.generation++;
      this.wanted = enabled;
      if (!enabled || root.document.hidden) {
        const lock = this.lock; this.lock = null;
        if (lock) lock.release().catch(() => {});
        if (!enabled) this.status('off');
        return;
      }
      return this.acquire();
    }
    async acquire() {
      if (this.lock || this.pending || !this.wanted || root.document.hidden) return;
      if (!root.navigator.wakeLock?.request) { this.status('unavailable'); return; }
      this.pending = true; const generation = this.generation;
      try {
        const lock = await root.navigator.wakeLock.request('screen');
        if (!this.wanted || root.document.hidden || generation !== this.generation) { await lock.release(); return; }
        this.lock = lock; this.status('active');
        lock.addEventListener('release', () => { if (this.lock === lock) { this.lock = null; this.status('released'); } });
      } catch (_) { if (this.wanted && generation === this.generation) this.status('unavailable'); }
      finally {
        this.pending = false;
        if (this.wanted && generation !== this.generation && !root.document.hidden) this.acquire();
      }
    }
  }
  const api = { preferences, HoldExit, WakeKeeper };
  root.StoryChild = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
