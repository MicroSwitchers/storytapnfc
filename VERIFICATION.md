# StoryTouch 1.0.0 — Verification

Date: 29 October 2026. Browser: isolated headless Chromium 149.0.7827.55 on Windows.

**Result: 20 automated verification groups passed**, with no uncaught JavaScript errors and no external application asset/audio requests. Tests ran against the static files with the included production Content Security Policy. The recording test used a fake browser microphone. All NFC checks used a software fixture; no physical NFC hardware was accessed.

## Verified in the browser

1. Tag parsing recognises code/text, same-app URL and serial keys; normalises code case; rejects unrelated URLs and malformed backups.
2. Root `index.html` loads. Its manifest link resolves, the browser parses the manifest without errors, icon URLs return successfully, and the service worker completes its shell cache.
3. All three included WAV sounds decode and advance playback. Pause, restart, speed changes and stop work.
4. Imported audio is stored as a Blob in IndexedDB with its transcript, survives reload, and plays afterward.
5. Empty and undecodable files are rejected without adding a story.
6. The browser’s real MediaRecorder captures the fake test microphone, completes a recording, saves it, and plays it back.
7. Editing details persists changes. User-entered angle brackets, ampersands, and quotes render as text. The edit dialog’s tag shortcut selects the right story.
8. Manual code linking and child playback work; unknown codes show a useful message.
9. A simulated linked NFC code read starts its story; cancelling scanning aborts the session.
10. Simulated NFC permission denial resets the controls and offers fallback playback.
11. Simulated serial-number linking resolves to its story; unknown tags show guidance; changing mode cancels scans.
12. NFC URL write requests include explicit overwrite after the app confirmation. Pending writes can be cancelled and simulated successful writes show completion.
13. Exported backups contain byte-identical imported audio plus tag links.
14. A backup restores into a fresh browser context. Invalid tag references are rejected without partial database writes. A direct tag URL opens child mode and waits for Play, respecting autoplay restrictions.
15. Offline reload restores the app and library. Both custom audio and test audio play offline. The guide opens offline. A cached WAV byte-range request returns HTTP 206 with the requested 100 bytes.
16. Deleting a story also deletes its links while leaving other stories and links intact.
17. Parent tabs respond to arrow/Home/End keys. Form controls have labels. Parent library, add, setup and child views have no horizontal page overflow at 320, 390, 768 and 1280 pixels.
18. A nested deployment path resolves the relative manifest, service-worker scope and assets, and reloads offline. Local storage remains shared by same-origin app folders, as expected for IndexedDB.
19. Unsupported NFC disables scan controls with guidance. Microphone denial leaves audio import available.
20. The tested flows produce no uncaught JavaScript exceptions or remote asset/audio fetches.

JavaScript syntax checks passed for all four application scripts and the service worker. The optional Python preview helper passed compilation. Desktop, phone-width and child-mode screenshots were visually inspected. This is a functional and structural accessibility check, not a formal WCAG certification or a screen-reader hardware test.

## Package integrity

The release archive is checked for a root-level `index.html`, valid manifest JSON, existing local HTML/script/style/icon/audio references, complete precached assets, correct PNG dimensions, readable PCM WAVs, and archive CRC integrity. `FILES.sha256` records every packaged file except itself. The archive is extracted and its file hashes are compared with the source before a final browser smoke test of the extracted package.

## Checks to perform on the intended phone

1. Deploy the extracted folder to HTTPS. Open it in the browser/profile you intend to use. Play a test sound and wait for the offline-ready indicator.
2. Make a short microphone recording using the real microphone, save it, reload, and play it. Confirm device volume and speaker/headphone output.
3. On an NFC-enabled Android phone in Chrome, save a code link, write its URL to a spare writable NDEF tag, then scan it in child mode. Confirm that Cancel stops a pending scan/write. Check a real permission denial and recovery through browser site settings.
4. Try an existing tag using Read a physical tag to link. Tag serial availability and NDEF compatibility vary. Generic RFID tags are outside the Web NFC API.
5. Install through the browser where offered. Close/reopen the installed app, disconnect networking, and play both a test sound and your recording. Restore a backup on any second device/browser before expecting its tags to resolve there.
6. Test with the listener’s screen reader, keyboard/switch setup, zoom and preferred device orientation. Add transcripts to real recordings. Verify a parent can reach Stop and the listener can identify each story.

Real NFC reads/writes, real microphone quality, operating-system installation, iPhone/Android-specific browser behaviour, and screen-reader announcements were not certified in this environment. No Netlify or other production deployment was created. The package provides the files and guide needed to deploy it.
