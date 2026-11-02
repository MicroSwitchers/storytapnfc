# StoryTouch 2.1.0 verification

## Release checks

103 Node tests and 6 Python tests passed (109 total).

    node --test tests/app.test.cjs tests/recording.test.cjs tests/child-mode.test.cjs tests/pwa.test.cjs tests/media.test.cjs tests/sw.test.cjs tests/story-picture.test.cjs
    python -B -m unittest discover -s tests -p "test_*.py"

All application and browser-fixture JavaScript passed syntax checks. Python helpers were parsed without creating bytecode. FILES.sha256 covers the release files.

## Browser verification

Verified on 2 November 2026 in a fresh, isolated desktop Chrome 156 headless profile on localhost. The test server applied the production Content-Security-Policy, with frame-ancestors changed to self only to permit the same-origin fixture frames. A direct page render also used the unmodified policy. No uncaught browser errors were reported by the completed fixtures.

- tests/child-mode.html: all 12 stages passed. These cover adding audio and a picture, linking, unsupported/denied NFC recovery, default black screen, compact labelled Parents button with a 44px touch target, larger optional Stop, screen-touch pause, repeat-tag resume, hold/tap exits, Now playing content, responsive controls, and backup/restore of picture/audio bytes, tag links and settings. Its additional real Fullscreen API check passed: leaving browser fullscreen does not unlock child mode.
- tests/mobile.html: all parent panels passed at 320, 390, 768 and 1200px, with no horizontal overflow and a usable Add story target.
- tests/pwa.html: all online and offline stages passed. Complete app/four-MP3 caching, detection and repair of a deleted cached file, native media metadata, saved private audio, tag links and draft were checked. The HTTP listener and its existing connections were closed, and browser networking was also disabled. The app reloaded, preserved its data, played private audio, served MP3 byte ranges and showed the recovery page for an uncached navigation. An independent HTTP probe confirmed the server refused connections.
- tests/browser.html: all stages passed using the real MediaRecorder encoder at 192 kbps. A synthetic 440 Hz stream retained its expected level and peak, recorded its final chunk, released its tracks, saved, survived reload and played. All four MP3s decoded; starter migration/rename, denied-microphone recovery and cached ranges passed.
- tests/upgrade.html: the actual public 2.0.2 snapshot was downloaded/checked against its Git blob hashes, then switched to 2.1.0 on the same origin. Both normal navigation and the ?apply=1 in-app update path passed. An active old tab kept playing while the new worker completed. Update app refused to interrupt playback, then saved an immediately edited pending draft before reloading. Private audio bytes, tag links and drafts survived both paths without clearing site data. All picture-free story/player icons remained books and the dark theme applied.
- A parent walkthrough covered first run, upload with a picture, linking, cancel, a failed scan, testing, a wrong tag, an unknown tag, the dark screen, hold exit, Now playing and devices without NFC, at phone and desktop sizes.

The previously reported 448–470 Hz recording failure was a measurement artifact: counting every zero crossing includes tiny codec-padding fluctuations. Analysis of the recorded steady signal measured 439.996 Hz and a spectral peak at 440 Hz. The fixture now uses a Schmitt trigger at 10% of the known test amplitude; its original 5 Hz tolerance and full-buffer RMS/peak limits are unchanged. Recording code required no change.

The upgrade fixture accepts ?from=VERSION (default 2.0.2) and ?apply=1 for the explicit update path. Its server ignores conditional timestamp headers so a freshly downloaded old snapshot cannot conceal changed release bytes behind a false 304. On Windows, use a short Chrome profile path; long paths can break CacheStorage.

## Preserved data and limitations

Manifest identity, scope, start URL, origin and IndexedDB schema remain unchanged. Personal audio, story IDs and tag links are retained. Pictures are optional local Blobs and are included in version-2 backups. Old picture-free backups remain valid. A complete new service worker activates without forcing active recording/child pages to navigate.

NFC events in desktop tests used a stand-in NDEFReader. Physical tags, real scan timing, phone installation/fullscreen, screen-reader output, microphone sound quality, speech voices and wake-lock/battery behavior still require the intended hardware. Synthetic encoding checks do not certify a phone microphone.

A PWA cannot disable Home, system gestures, app switching or browser security UI. A parent gesture does not identify an adult. Device locking requires parent-enabled Android app pinning or iPhone Guided Access. No WCAG certification or Lighthouse score is claimed.
