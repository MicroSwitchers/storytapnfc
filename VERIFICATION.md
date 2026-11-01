# StoryTouch 2.0.2 verification

## Release checks

98 Node tests and 6 Python tests passed (104 total).

    node --test tests/app.test.cjs tests/recording.test.cjs tests/child-mode.test.cjs tests/pwa.test.cjs tests/media.test.cjs tests/sw.test.cjs tests/story-picture.test.cjs
    python -B -m unittest discover -s tests -p "test_*.py"

Coverage includes recording final chunks and cleanup; tag decoding and persistent reading; dark-screen defaults; unsupported/denied NFC returning to adult setup; tag-only child markup; now-playing content; optional Stop; two-to-five-second holds and three-to-five-tap exits; gesture cancellation/reset; touch pause and same-object resume; fullscreen fallback/ownership; story-picture backup validation; existing-library compatibility; offline shell/audio integrity, ranges and repair; update deferral and draft preservation; manifest identity/icons; and unique HTML IDs/local asset references.

All release JavaScript/Python syntax and checksums are checked before publishing. GitHub tree blob hashes are compared against the local release files before moving main.

## Child control refinement

The parent exit is a labelled, bordered 104 by 44px button with the existing hold/tap gestures. The optional red Stop is 112 by 112px with a stop symbol and label. Phone previews match these controls. Spoken interface guidance has been removed from the UI, preference normalization and runtime; old saved guidance preferences are ignored. Written-story speech playback and screen-reader status semantics remain available. Automated checks cover legacy preference normalization and media playback.

## Icon refinement

The app logo and inline book icons share symmetric cubic geometry with rounded ends and consistent spacing. The SVG and all four PNG exports were regenerated; the actual rendered PNGs and outlines were visually inspected at multiple sizes. Versioned icon URLs are cached alongside the stable asset URLs to refresh browser icon caches while preserving offline use.

## Browser verification limits

The 2.0 redesign has not completed interactive visual/browser verification. The previous turn’s controller could not determine the browser URL confidently and stopped. The user subsequently explicitly requested deployment. This report does not carry forward the 1.5 release’s browser-pass count as a 2.0 result.

Updated isolated-localhost fixtures are included for the simplified add/link/listen flow, picture/audio backup and restore, dark and now-playing views, optional red Stop, hold/tap exits, fullscreen, responsive layout and real offline MP3 playback. They are not presented as passed in this release.

After publishing, deployment completion and public HTTP release assets are verified. This confirms the bytes served by GitHub Pages, rather than a simulated deployment or a claim about every already-open browser tab.

## Preserved data and limitations

Manifest identity, scope, start URL, origin and IndexedDB schema remain unchanged. Personal audio, story IDs and tag links are retained. Pictures are optional local Blobs and are included in version-2 backups. Old picture-free backups remain valid. A complete new service worker activates without forcing old active recording/child pages to navigate.

A PWA cannot disable Home, system gestures, app switching or browser security UI. A parent gesture does not identify an adult. Device locking requires parent-enabled Android app pinning or iPhone Guided Access. Physical NFC, phone fullscreen/installation, screen-reader output, microphone quality, speech voices and wake-lock/battery behavior still need checks on intended hardware. No WCAG certification or Lighthouse score is claimed.
