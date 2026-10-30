# StoryTouch 1.5.0 verification

30 October 2026. The release uses the existing MicroSwitchers/storytapnfc main-branch GitHub Pages pipeline.

## Automated checks

88 Node checks and 6 Python checks passed (94 total).

    node --test tests/app.test.cjs tests/recording.test.cjs tests/child-mode.test.cjs tests/pwa.test.cjs tests/media.test.cjs tests/sw.test.cjs
    python -B -m unittest discover -s tests -p "test_*.py"

New coverage includes forced hold-only exits for legacy unlocked preferences; fullscreen requests with hidden navigation UI; denied/unsupported/non-gesture fallback; late fullscreen grants after leaving; fullscreen ownership; default-on screen-touch pause; opt-out and adult-mode isolation; both audio and written-story pause; preserving NFC while pausing; suppression of the same gesture's media click; exit/drawer exceptions; pointer cancellation and keyboard activation; drawer hiding/inert state; and scoped long-press menu suppression. Existing recording, NFC, backup, speech, offline caching/ranges, update persistence, install identity and media-session checks remain passing.

## Browser checks

25 groups passed in actual desktop Chrome on an isolated localhost test origin:

- Child-mode fixture: 12 groups. Single Start and unsupported NFC; denied NFC fallback; pure-black view with only the held exit and inert hidden controls; persistent simulated NFC and repeat-tag behavior; black-screen touch pause without stopping NFC; incomplete-hold rejection; three-second exit/reader cleanup; drawer open/tuck/focus/playback; suppression of the pause touch's restart; child drawer fit at 320/390/768/1200px; mandatory hold in story-button mode; persisted touch-pause opt-out.
- Actual Fullscreen API: 1 group, started through a native browser click. Chrome's browser controls disappeared. Leaving fullscreen did not unlock child mode, and the three-second parent hold remained required.
- Parent mobile layout: 4 groups covering all panels at 320/390/768/1200px, without horizontal overflow and with a primary Start target at least 44 by 44 pixels.
- PWA fixture: 8 groups. Complete shell and all four MP3s; deliberate cache damage/repair; real stored MP3 playback and native metadata; saved audio/link/draft; full app reload with the local server stopped; stored audio playback without that server; bundled MP3 ranges; offline recovery navigation.

The child suite simulates NFC and audio events, while the PWA suite plays real stored MP3 audio. The fullscreen check uses the real browser API and user activation, not a fullscreen mock. The network adapter was not disabled; the offline stage stopped the loopback HTTP server. Fixtures only add test data to localhost storage and do not clear a family library. Temporary preview servers and owned test tabs are stopped after checking.

## Deployment and limits

Manifest identity, scope, start URL, origin and IndexedDB schema stay unchanged. The manifest requests fullscreen with a standalone fallback. Child mode also requests fullscreen on entry and retains its hold lock after the browser exits fullscreen. Updates save a pending draft and defer page reload during active child mode, recording, playback or import. The service worker activates complete releases without closing other tabs.

A PWA cannot disable Home, system navigation gestures, app switching or browser security UI, and a three-second hold does not identify an adult. A device-level lock requires Android app pinning with its PIN option or iPhone Guided Access, enabled by the parent. Platform behavior can vary. Installed-phone fullscreen, physical NFC, microphone quality, system media buttons, screen-reader output and wake-lock/battery behavior still require checks on the intended hardware. No formal WCAG certification or Lighthouse score is claimed. Web NFC still requires an unlocked, awake device with the app visible; black child mode does not turn the physical screen off.
