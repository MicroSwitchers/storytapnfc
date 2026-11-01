/* Child-mode preferences, deliberate exits, and a screen wake lock. No background NFC workaround. */
(function (root) {
  'use strict';
  function preferences(saved = {}) {
    return { sounds: saved?.sounds !== false,
      playbackRate: [.75,.9,1,1.25,1.5].includes(saved?.playbackRate) ? saved.playbackRate : 1,
      childScreen: saved?.childScreen === 'now-playing' ? 'now-playing' : 'black',
      exitMethod: saved?.exitMethod === 'taps' ? 'taps' : 'hold',
      exitHoldSeconds: [2,3,4,5].includes(saved?.exitHoldSeconds) ? saved.exitHoldSeconds : 3,
      exitTapCount: [3,4,5].includes(saved?.exitTapCount) ? saved.exitTapCount : 4,
      showStop: saved?.showStop === true,
      childLock: true, keepAwake: saved?.keepAwake !== false, touchToPause: saved?.touchToPause !== false,
      tapToPause: saved?.tapToPause === true };
  }
  class Immersive {
    constructor(status = () => {}) { this.status = status; this.wanted = false; }
    async setEnabled(enabled) {
      this.wanted = enabled;
      if (!enabled) { if (this.owns) await this.leave(); else this.status('off'); return; }
      const doc = root.document, element = doc.documentElement;
      if (doc.fullscreenElement || doc.webkitFullscreenElement || root.matchMedia?.('(display-mode: fullscreen)').matches) { this.status('active'); return; }
      if (this.pending || doc.hidden || root.navigator.userActivation?.isActive === false) return;
      const request = element?.requestFullscreen || element?.webkitRequestFullscreen;
      if (!request) { this.status('unavailable'); return; }
      this.pending = true;
      try {
        await (element.requestFullscreen ? request.call(element, { navigationUI: 'hide' }) : request.call(element)); this.owns = true;
        if (!this.wanted) await this.leave(); else this.status('active');
      } catch (_) { this.status('unavailable'); }
      finally { this.pending = false; }
    }
    async leave() {
      this.owns = false;
      const doc = root.document, exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit && (doc.fullscreenElement || doc.webkitFullscreenElement)) { try { await exit.call(doc); } catch (_) {} }
      this.status('off');
    }
  }
  class TouchPause {
    constructor({ enabled, playing, pause }) {
      root.document.addEventListener('pointerdown', event => {
        this.blocked = null;
        if (!enabled() || !playing() || event.button !== 0) return;
        pause();
        // The parent hold and drawer handle still work. Other controls must not turn
        // this same touch into a resume, restart, or a different story after pausing.
        if (event.target.closest?.('#child-exit, #player-drawer-toggle, #child-stop-audio')) return;
        this.blocked = { time: root.performance.now() };
        event.preventDefault();
      }, { capture: true, passive: false });
      root.document.addEventListener('click', event => {
        const blocked = this.blocked; this.blocked = null;
        if (!blocked || event.detail === 0 || root.performance.now() - blocked.time > 1500) return;
        event.preventDefault(); event.stopImmediatePropagation();
      }, true);
      root.document.addEventListener('pointercancel', () => { this.blocked = null; }, true);
    }
  }
  class HoldExit {
    constructor(button, { required, exit, progress, settings = () => ({ method: 'hold', seconds: 3, taps: 4 }) }) {
      this.button = button; this.required = required; this.exit = exit; this.progress = progress; this.settings = settings;
      const pointerEnd = e => { if (this.active?.kind === 'pointer' && e.pointerId === this.active.id) this.end(e.type === 'pointerup'); };
      button.addEventListener('pointerdown', e => {
        if (!this.required() || this.settings().method === 'taps' || e.button !== 0 || e.isPrimary === false) return;
        e.preventDefault(); this.start('pointer', e.pointerId);
        try { button.setPointerCapture(e.pointerId); } catch (_) {}
      });
      button.addEventListener('pointermove', e => {
        if (this.active?.kind !== 'pointer' || this.active.id !== e.pointerId) return;
        const r = button.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.cancel();
      });
      ['pointerup','pointercancel','lostpointercapture'].forEach(name => button.addEventListener(name, pointerEnd));
      button.addEventListener('pointerleave', () => { if (this.active?.kind === 'pointer') this.cancel(); });
      button.addEventListener('keydown', e => {
        if (!this.required() || ![' ', 'Enter'].includes(e.key)) return;
        if (this.settings().method === 'taps') { if (e.repeat) e.preventDefault(); return; }
        e.preventDefault(); if (!e.repeat) this.start('key', e.key);
      });
      button.addEventListener('keyup', e => { if (this.active?.kind === 'key' && this.active.id === e.key) { e.preventDefault(); this.end(true); } });
      button.addEventListener('blur', () => this.cancel());
      button.addEventListener('contextmenu', e => e.preventDefault());
      button.addEventListener('click', e => {
        e.preventDefault();
        if (!this.required()) { this.exit(); return; }
        if (this.settings().method !== 'taps') { this.progress(0); return; }
        const now = root.performance.now(), taps = this.settings().taps;
        if (!this.active || this.active.kind !== 'taps' || now - this.active.last > 1000) this.active = { kind: 'taps', count: 0, last: now };
        this.active.count++; this.active.last = now;
        if (this.active.count >= taps) { this.cancel(); this.exit(); return; }
        this.progress(taps - this.active.count, 'taps');
        if (!this.timer) this.timer = root.setInterval(() => { if (this.active && root.performance.now() - this.active.last > 1000) this.cancel(); }, 100);
      });
      root.addEventListener('blur', () => this.cancel());
    }
    start(kind, id) {
      if (this.active) return;
      this.active = { kind, id, started: root.performance.now() };
      this.duration = Math.min(5, Math.max(2, this.settings().seconds || 3)) * 1000;
      this.progress(this.duration / 1000, 'hold');
      this.timer = root.setInterval(() => {
        if (!this.active) return;
        const remaining = this.duration - (root.performance.now() - this.active.started);
        if (remaining <= 0) { this.cancel(); this.exit(); }
        else this.progress(Math.ceil(remaining / 1000), 'hold');
      }, 100);
    }
    end(complete) {
      const finished = complete && this.active && root.performance.now() - this.active.started >= this.duration;
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
  const api = { preferences, HoldExit, WakeKeeper, Immersive, TouchPause };
  root.StoryChild = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
