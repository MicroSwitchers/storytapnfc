# StoryTouch 1.3.1 verification

29 October 2026. Release checks completed locally. Production deployment uses the existing main-branch GitHub Pages pipeline at MicroSwitchers/storytapnfc. Deployment status is recorded by GitHub Actions.

## Automated checks

**71 Node checks and 6 Python checks passed (77 total).**

```text
node --test tests/app.test.cjs tests/recording.test.cjs tests/child-mode.test.cjs tests/pwa.test.cjs tests/media.test.cjs tests/sw.test.cjs
python -B -m unittest discover -s tests -p "test_*.py"
```

Coverage includes recording constraints, encoder fallback, final chunks and microphone cleanup; child-mode locks, startup and NFC fallbacks; repeat-tag pause/resume; launch shortcuts; installation prompts; verified offline readiness; failed cache installation cleanup; bypassing stale HTTP-cached assets during release installation; cached navigation and audio ranges; missing-file repair; refusing mixed-release repair; update guards, pending saves and one-time reload; multiple-window protection; native media metadata/timeline/actions; manifest identity/icons, script references and zoom support; and the starter catalog. JavaScript/Python syntax, local references, shell completeness and release checksums are checked too.

The worker tests evaluate the actual production service-worker source with isolated Cache/Fetch/client fixtures. App tests execute the actual app/helper functions with isolated DOM, microphone, speech and NFC fixtures. No real family library was used.

## Browser verification

**21 browser groups passed in desktop Chrome.**

- `tests/pwa.html`: 10 groups. Complete-cache verification; repairing a deliberately missing app file; actual saved-MP3 playback and native metadata; persistence of test audio/link/draft; full app reload with the local HTTP server stopped; actual saved-audio playback with that server stopped; cached MP3 range responses; the offline recovery page; a waiting update that does not reload without consent; and an approved 1.3.0 to 1.3.1 worker update preserving a pending draft, personal MP3 and tag link.
- `tests/mobile.html`: 4 groups covering all parent panels and the primary Start control at 320, 390, 768 and 1200 CSS pixels. No horizontal page overflow was found and Start remained at least 44 x 44 pixels. The App & offline panel was visually inspected in the 390px preview.
- `tests/child-mode.html`: 7 groups. Single Start button with unsupported-NFC fallback; denied permission fallback; pure-black screen with one exit button and hidden/inert player; continuous reading and repeat-tag pause/resume; short-hold rejection; three-second keyboard exit and reader cleanup; normal buttons with optional unlocked exit. NFC and playback in this suite are simulated.

The offline browser stage stopped the loopback test server while the browser retained the fixture. It reloaded the real app and played real stored audio through the actual service worker, rather than merely changing an online/offline badge. The network adapter itself was not disabled. The update stage restarted that server with the next release and exercised the real waiting-worker/controllerchange lifecycle.

## Remaining device checks

Physical phone NFC, operating-system PWA installation, actual headset buttons, phone wake-lock/battery behavior, safe areas on notched devices and screen-reader output still need testing on intended hardware. No formal WCAG certification or Lighthouse score is claimed. The older audio-recording browser suite remains available at `tests/browser.html` but was not rerun in this update; physical microphone sound quality was not certified.

Run browser fixtures only on an isolated localhost test origin. They create test stories, links and preferences there. The PWA fixture deliberately removes one cached app asset and uses a stopped/restarted local server plus a new worker version. It never clears IndexedDB or a real family library. Local preview servers and owned test tabs are stopped after verification.

Keep the hosting origin and manifest identity unchanged when deploying an update. New updates wait for the adult, save a pending draft first, reject active recording/playback/importing and require other app windows to close. Existing releases without the Update app control need their windows closed once. NFC still cannot read with the physical screen off or locked.
