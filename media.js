/* Optional native media controls. The app's own player remains the source of truth. */
(function (root) {
  'use strict';
  class Controls {
    constructor(actions) { this.actions = actions; this.key = ''; }
    sync(story, state, audio) {
      const session = root.navigator.mediaSession;
      if (!session) return;
      try {
        const key = story ? story.id + '|' + story.title + '|' + story.kind : '';
        if (key !== this.key) {
          this.key = key;
          session.metadata = story && root.MediaMetadata ? new root.MediaMetadata({ title: story.title, artist: 'StoryTouch', album: 'Your story shelf',
            artwork: [{ src: new URL('./assets/icons/icon-512.png', root.location.href).href, sizes: '512x512', type: 'image/png' }] }) : null;
          for (const action of ['play','pause','stop','seekbackward','seekforward','seekto']) {
            const seek = action.startsWith('seek');
            try { session.setActionHandler(action, story && (!seek || story.kind !== 'text') ? details => this.actions[action]?.(details) : null); } catch (_) {}
          }
        }
        session.playbackState = story ? state : 'none';
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : story?.duration;
        if (story && story.kind !== 'text' && duration > 0 && Number.isFinite(duration)) session.setPositionState?.({ duration,
          playbackRate: audio.playbackRate > 0 ? audio.playbackRate : 1, position: Math.max(0, Math.min(audio.currentTime || 0, duration)) });
        else session.setPositionState?.();
      } catch (_) { /* Browsers may expose only a subset of Media Session. */ }
    }
  }
  root.StoryMedia = { Controls };
})(typeof window === 'undefined' ? globalThis : window);
