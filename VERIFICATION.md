# StoryTouch 1.1.0 — Verification

29 October 2026. Browser: isolated Chromium 149.0.7827.55.

**20 browser verification groups passed**, plus the starter-folder catalog check. There were no uncaught JavaScript exceptions or remote application asset/audio requests in these flows. The browser suite served the app with its production Content Security Policy.

NFC and speech output were simulated. Recording used the browser's real MediaRecorder with a fake test microphone; actual MP3/WAV audio was decoded and played. The user-facing preview also detected installed Windows speech voices, but audible device speech was not certified by the automated fixture.

## Browser checks

1. New release loads, all examples are editable local audio, manifest and offline shell are valid.
2. Written story drafts, voice and pace survive a browser reload.
3. Basic TTS preview, saving, pause/resume/restart and exclusive playback work through a speech fixture.
4. Parents can rename written stories, edit their words and retain changes after reload.
5. Microphone recording stops its tracks, retains an audio draft after reload and saves playable audio.
6. MP3 import previews, saves and plays actual MP3 bytes.
7. A selected audio folder supplies persistent starter stories and repeated imports avoid duplicates.
8. Starter stories can be renamed or removed without returning on the next load.
9. Guided NFC linking advances through tap and test states and plays a written story.
10. NFC cancellation, permission errors, serial linking and URL writes remain usable.
11. Backup includes text, audio, renamed examples, links and removed-example preferences.
12. Fresh-browser restore preserves written stories, audio and removed examples; malformed backups do not write.
13. Direct tag URLs require Play, and child buttons and manual codes support written stories.
14. Offline reload retains renamed/removed examples and custom audio; cached MP3/range and speech fixture playback work.
15. The v1 database upgrades in place without losing recordings or old demo-tag links.
16. Version 1 backups still restore.
17. Keyboard navigation, labelled inputs and responsive layouts work at 320, 390, 768 and 1280 pixels.
18. Subfolder manifest and offline example seeding work.
19. Unsupported speech/NFC and denied microphones have fallbacks.
20. No uncaught JavaScript exceptions or remote application asset/audio requests.

## Folder and package checks

The folder-helper check adds an MP3 in a new subfolder with a paired transcript, regenerates the catalog, and verifies the stable story ID, title, transcript and changed offline cache revision. Repeating the helper preserves the same ID. The final starter set includes a real welcome MP3 and the two synthesised WAV test sounds.

JavaScript syntax and Python compilation checks passed. Desktop and phone-width layouts were visually inspected. The responsive suite checks all parent panels and child mode at 320, 390, 768 and 1280 pixels with a populated library and player. This is structural/functional accessibility testing, not formal WCAG certification.

The release package is checked for a root-level index.html, valid manifest JSON, resolving local HTML references, correct PNG icon dimensions, complete service-worker shell/catalog audio, readable WAVs, ZIP CRC integrity, and identical extracted file hashes. FILES.sha256 records the packaged file hashes except itself. A final browser smoke check runs against the files extracted from the actual release ZIP.

## Checks for the intended phone

1. Deploy the folder to HTTPS and open it in the intended browser/profile. Play a starter sound, wait for offline readiness, and test your device's voice with a short written story.
2. Make a real microphone recording, save it, reload, and play it. Import an MP3. Confirm volume and speaker/headphone output.
3. On an NFC-enabled Android phone in Chrome, choose a story, link a real NDEF tag, and use Test the tag. Check permission denial, cancellation, relinking and the optional URL-writing route on a spare writable tag. Tag hardware/serial support varies.
4. Install where the browser offers it, close/reopen, disconnect, and play stored audio. Test written speech offline with the intended installed voice. Written text remains readable without a voice.
5. Try the listener's screen reader, switch/keyboard input, zoom and orientation. Add transcripts for personal audio.
6. Export a backup, restore it on the second device/browser and verify that both audio and written stories resolve through the intended tags there.

Physical NFC reads/writes, device speech output, microphone quality, screen-reader announcements and operating-system installation were not certified here. No production hosting account was changed. Browser memory remains subject to origin/profile boundaries and browser/device storage cleanup; keep backups.
