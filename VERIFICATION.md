# StoryTouch 1.4.0 verification

29 October 2026. Release checks completed locally. Production deployment uses the existing main-branch GitHub Pages pipeline at MicroSwitchers/storytapnfc. Deployment status is recorded by GitHub Actions.

## Automated checks

**76 Node checks and 6 Python checks passed (82 total).**

```text
node --test tests/app.test.cjs tests/recording.test.cjs tests/child-mode.test.cjs tests/pwa.test.cjs tests/media.test.cjs tests/sw.test.cjs
python -B -m unittest discover -s tests -p "test_*.py"
```

Coverage includes recording constraints, encoder fallback, final chunks and microphone cleanup; child-mode locks, startup and NFC fallbacks; repeat-tag pause/resume; launch shortcuts; installation prompts; verified offline readiness; failed cache installation cleanup; bypassing stale HTTP-cached assets during release installation; cached navigation and audio ranges; missing-file repair; refusing mixed-release repair; update guards, pending saves and one-time reload; automatic activation after a complete download; active-version detection, untouched-launch refresh, activity/interaction deferral and draft-save failures; native media metadata/timeline/actions; manifest identity/icons, script references and zoom support; and the starter catalog. JavaScript/Python syntax, local references, shell completeness and release checksums are checked too.

The worker tests evaluate the actual production service-worker source with isolated Cache/Fetch/client fixtures. App tests execute the actual app/helper functions with isolated DOM, microphone, speech and NFC fixtures. No real family library was used.

## Browser verification

**25 browser groups passed for this release.** This release uses actual desktop Chrome and isolated localhost storage. The new `tests/upgrade.html` fixture begins with a saved, genuinely cached 1.3.1 release at the same origin, switches the server to 1.4.0, and exercises the real worker lifecycle.

- Cached release upgrade: 6 groups passed. Cached 1.3.1 plays a private test MP3; the complete new worker activates with the old tab still open and its audio continuing; normal navigation opens 1.4.0 without clearing data; private audio bytes, tag link and draft remain; all starter/legacy icons are books and the computed theme is dark; preserved private audio plays in the new release with the book player icon.
- `tests/mobile.html`: 4 groups passed across all parent panels at 320, 390, 768 and 1200 CSS pixels. No horizontal page overflow; Start remains at least 44 x 44 pixels. The 390px App & offline panel was visually inspected in the dark theme.
- `tests/child-mode.html`: 7 groups passed. Single Start button with unsupported-NFC fallback; denied permission fallback; pure-black screen with one exit button and hidden/inert player; continuous reading and repeat-tag pause/resume; short-hold rejection; three-second keyboard exit and reader cleanup; normal buttons with optional unlocked exit. NFC and playback in this suite are simulated.

The prior 1.3.1 release also passed the full PWA fixture, including offline reload/MP3 playback with its local server stopped, cached ranges, cache repair and a user-approved update preserving a draft/audio/link. For 1.4.0, `tests/pwa.html` passed its 8 cache/repair and server-stopped offline groups again: complete shell/audio verification, missing-file repair, native metadata, test-data persistence, full offline reload, private MP3 playback, bundled audio ranges and the recovery page. The upgrade is covered by the cached 1.3.1 migration above and runtime/worker unit tests.

## Remaining device checks

Physical phone NFC, operating-system PWA installation, actual headset buttons, phone wake-lock/battery behavior, safe areas on notched devices and screen-reader output still need testing on intended hardware. No formal WCAG certification or Lighthouse score is claimed. The older audio-recording browser suite remains available at `tests/browser.html` but was not rerun in this update; physical microphone sound quality was not certified.

Run browser fixtures only on an isolated localhost test origin. They create test stories, links and preferences there. The PWA fixture deliberately removes one cached app asset and uses a stopped/restarted local server plus a new worker version. It never clears IndexedDB or a real family library. Local preview servers and owned test tabs are stopped after verification.

Keep the hosting origin and manifest identity unchanged when deploying an update. Complete releases now activate with old tabs open and never navigate those tabs from the worker. An untouched adult launch can save its draft and refresh to a newer active release. After interaction or during recording/playback/importing/child mode, the page keeps running until the adult chooses Update app or reopens. Other windows do not need to close; IndexedDB is never cleared. Version 1.3.1 and earlier pages need one normal refresh after the new worker finishes downloading because their running code cannot perform the new activity-aware refresh. NFC still cannot read with the physical screen off or locked.
