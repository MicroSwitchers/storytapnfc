# StoryTouch 2.0.1

An object becomes a story. Personal audio and pictures stay in this browser.

## Add → link → listen

1. Choose **Add story**, then Record, Upload, or Write. Give it a name. A picture or accompanying words are optional.
2. **Save & link** goes straight to that story’s tag screen. Choose **Read tag** and tap the object’s NFC tag. Choose Done.
3. Choose **Start listening** and hand over the phone. Tags choose the stories; there is no child story shelf.

The four included stories can be linked immediately. Use a story’s Listen button for an adult preview, Link object to connect its tag, or the pencil to edit its details.

## The child’s screen

**Dark screen** is the default: pure black and a small parent handle at the bottom. Settings can add a red Stop button; it stops media while NFC keeps listening.

**Now playing** shows only the tagged story, its picture and accompanying words if provided, and playback controls. It never presents a book selector.

In Settings, set the parent handle to a **2–5 second hold** or **3–5 consecutive taps**. A pause of more than one second resets a tap sequence; an incomplete hold cancels. Keyboard Space/Enter can hold the handle. The default is a three-second hold. A gesture is an accidental-exit guard, not adult authentication.

Touch screen to pause is on by default and can be disabled under Listening preferences. Retapping the same object resumes a paused story. Tap the same tag to pause is a separate option, off by default; without it, retapping a playing story restarts it. Stop resets playback.

## Phone setup

In-app tag reading requires an NFC-enabled Android phone with Chrome, HTTPS, NFC permission, and an unlocked, awake phone with the app visible. Unsupported or denied NFC leaves adults in setup rather than exposing child story buttons. An incoming same-app URL tag can select its own story.

The PWA requests fullscreen launch with a standalone fallback. Start listening also requests fullscreen where allowed. A PWA cannot disable Home, system gestures, app switching, or browser security UI. For a device lock, a parent can enable Android app pinning with its PIN option or iPhone Guided Access.

- [Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc)
- [Android app pinning](https://support.google.com/android/answer/9455138?hl=en)
- [iPhone Guided Access](https://support.apple.com/111795)

A physical screen that is off or locked cannot scan tags. Keep screen awake is on by default. Dark mode keeps the actual screen on with black content. Device battery rules may release a wake lock.

## Recording, words and pictures

Record in a quiet place about a hand’s width from the microphone. Recording options includes optional noise reduction; leave it off for music and natural sounds. The level meter warns about very quiet or clipped sound. Stop, listen to the draft, then save.

Audio: up to 100 MB, with MP3/WAV preferred for portability. Recordings are limited to 30 minutes. Written stories use the device’s text-to-speech and are not converted to MP3; voices and offline availability vary.

Pictures are optional JPG, PNG, WebP, GIF or AVIF files up to 5 MB and 32 million decoded pixels. They are saved locally with the story, shown in Now playing, and included in backups. Every picture-free story uses the same book symbol.

## Settings and backups

Settings holds screen choices, parent-handle gestures and the optional Stop button. Listening preferences, linked objects, backup tools and app installation/offline controls are tucked into disclosure rows.

Export a backup before changing browser, device or site address, and before clearing site data. A backup includes audio, optional pictures, words, tag links and preferences. Restore merges stories and replaces matching IDs/tag codes after confirmation. The current restore-file limit is 285 MB. StoryTouch does not upload personal recordings or pictures. Device speech services may process online voices.

Keep the same hosting origin and browser profile to retain local storage. The IndexedDB name/version and manifest identity are unchanged. Existing libraries and picture-free backups remain supported. Legacy story-button display preferences become the new dark-screen default.

## Installation and updates

Use Install app when offered, or your browser’s Add to Home Screen / Install option. On iPhone/iPad, use the Share menu and Add to Home Screen; Web NFC is still unavailable there.

The app verifies its shell and all four bundled MP3s before reporting offline readiness. Complete releases become available even when other tabs are open. An untouched adult launch can save its draft and reload to the newer active release. After interaction or during recording, listening or importing, choose Update app when finished, or reopen the app. Older cached releases may need one normal refresh after the new worker downloads. Do not clear site data to update.

## Deploy or preview

Repository: https://github.com/MicroSwitchers/storytapnfc
Live: https://microswitchers.github.io/storytapnfc/

Publish the complete directory to the existing main-branch GitHub Pages source. Keep .nojekyll. There is no build command, account backend, API key, or external runtime dependency. For Netlify, publish the directory containing index.html; netlify.toml and _headers are included.

For a local preview with Python 3, run START-LOCAL.cmd or python serve.py, then use http://localhost:8080/. Stop the preview with Ctrl+C. Use the deployed HTTPS address for phone NFC testing; a plain LAN HTTP address is not sufficient.

To change bundled examples, add audio to example-stories and run UPDATE-EXAMPLES.cmd or python prepare_examples.py before publishing. This regenerates the catalog and audio cache revision. Keep existing filenames to retain IDs; use a new filename for a new story.

See VERIFICATION.md for this release’s checks and device limitations. Browser fixtures under tests/ add fixture data and should only run on an isolated localhost origin.
