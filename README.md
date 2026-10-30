# StoryTouch — A little tap. A whole story.

Version 1.4.1 · 29 October 2026

Extract the complete ZIP. **`index.html` is directly at its root**, beside the scripts, manifest and folders. There is no build step or API key. Deploy the extracted folder to HTTPS or use the local preview below. Open `README.html` for the web version of this guide.

Every story uses the same simple book icon. The interface always uses dark mode; optional black child mode keeps the screen completely black.

## Three ways to add a story

Choose **Add a story**, then a large method button:

1. **Type a story:** enter a name and the words, choose a device voice and pace, listen to a preview, then choose **Save story**. These stories save as text and voice preferences and use basic device text-to-speech each time. They are not converted to an MP3. Play, pause/resume, restart and Stop are available. Seeking is hidden because device speech has no audio timeline.
2. **Record my voice:** allow the microphone, record, stop, preview, and save. Up to 30 minutes and 100 MB. Keep the page open and device awake while recording; calls and browser suspension can interrupt capture. Record in a quiet spot with the microphone about a hand’s width away. The live level meter warns when sound is very quiet or too loud. Leave **Reduce background noise** off for music and natural sounds; try it for speech in a noisy room. Recording requests 48 kHz mono and 192 kbps where supported, with automatic gain and echo cancellation off. The browser can use its nearest supported settings. Audio is captured directly without amplification or re-encoding; these improvements apply to new recordings. The meter does not play your microphone through the speakers. Elapsed time is visual so screen readers do not announce every timer tick.
3. **Add an MP3:** select an audio file, preview, and save. MP3, WAV, M4A, OGG, AAC, FLAC and WebM are accepted up to 100 MB, subject to browser decoding support. Importing does not convert codecs. MP3 is useful when moving between devices.

The unfinished form saves its text and completed audio draft to this browser. An active recording cannot survive closing the page before you stop it. **Clear draft** removes the unfinished form. Drafts are separate from the saved library and are not exported in backups.

Every story, including a starter, has **Rename / edit**. Change its name, transcript, or a written story’s words/voice, then choose **Save details**. The same menu downloads audio/text or deletes the story and its local tag links.

Device voice availability varies. Voices labelled **online** may need a connection and may use a platform speech service. Missing saved voices fall back to a matching local language or device default. For offline speech, install a suitable device voice; use a recording/MP3 when you need stored sound. [Speech synthesis reference](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

## Starter stories and your audio folder

**A few to try** includes the supplied MP3 stories **Giraffe’s New Friend**, **Music Box**, **Snowy Day**, and **Teddy Bear**. Link them to a toy, object, tactile card, or braille symbol that makes sense to your child. Play, rename, link or delete them. Names and removals stay changed after reloads and app updates. **Restore removed starter stories** brings back these four bundled choices without overwriting renamed stories already on the shelf. The old welcome, chimes and rain examples and their tag links are retired when this version loads, including after restoring an older backup. Personal recordings and folder imports stay saved.

Add your own examples in either of two ways:

- **Inside the app:** choose **Add audio folder** and select a folder. Supported audio is copied into this browser as starter stories. Duplicate selections are skipped. The stories can be renamed/deleted and are included in backups. Selecting a folder is an import, not ongoing background access. Select it again to import files added later.
- **Inside the package:** add audio to **`example-stories/`**, including subfolders if wanted. Double-click **UPDATE-EXAMPLES.cmd** (Python 3 required), or run `python prepare_examples.py`. Then deploy the complete app folder. The local launcher refreshes this catalog automatically. Optional: a `.txt` file with the same base name supplies a transcript, such as `owl.mp3` and `owl.txt`.

A static host cannot automatically list a directory for the browser. The helper generates `example-stories/stories.json` and changes the offline cache revision so new files can be offered after deployment. No JavaScript editing is needed. Close old app tabs to apply that update. Removing a file from the package stops new browsers receiving it; a copy already saved in an existing browser stays until its parent removes it. Use a new filename to offer a replacement as a new story. Per-file limit: 100 MB; catalog limit: 2,000 files. Keep the folder small enough for the intended phones to cache.

## Link a tag: choose → tap → test

Choose **Link tag** on a story card. The visual guide has three steps:

1. **Story:** check the story name.
2. **Tap tag:** choose **Link this tag**, then hold an NDEF NFC tag near the back of the phone. The phone illustration changes while listening. The app reads a code or same-app URL record, falling back to a serial number where provided.
3. **Ready:** a green check names the linked story. Choose **Test the tag** and tap it again. The story plays and the guide confirms the test. Then use **Start child mode** at the top of the page.

The main linking route does not overwrite a tag. Reassigning an existing link asks for confirmation. Tags with no readable record/usable serial need the URL-writing option: open **Use a code or write a URL tag**, save a code, then choose **Write URL to NFC tag** beside its link. Confirm replacement and hold a writable tag nearby. This overwrites its current message. **Copy tag URL** works with another NFC-writing tool. Unlinking does not erase the physical tag.

In-app NFC needs Android Chrome, NFC hardware enabled, permission, HTTPS, an unlocked screen and the app visible. Entering child mode starts a continuous reader after permission is allowed. It stays listening between taps. When the page is hidden, Chrome suspends that reader and resumes it when the page is visible again. Linking/writing sessions stop when hidden; leaving child mode stops its reader. Web NFC handles NDEF, not generic RFID or background scanning. [Chrome NFC documentation](https://developer.chrome.com/docs/capabilities/nfc).

Other browsers can use story buttons or codes. A compatible phone’s normal tag handling may open a URL such as `https://your-site.example/index.html#tag=TEDDY-1`; the app opens the story and waits for **Play**. Scans in an active session attempt playback, but browsers may still require Play. A tag contains a code/URL, not audio. Each device/browser needs matching stories and links, normally supplied by restoring a backup.

## Child mode: choose a screen, then hand over the phone

There is one **Start child mode** button at the top of the app. It stays available while you scroll through adult settings. It becomes ready after the library loads; extra presses do not restart listening or playback.

Use **Child mode settings** at the top of the app, or open **Tags & settings**. Choices save automatically and travel with exported backup preferences.

- **Story buttons:** large play buttons, Stop story, and NFC listening. Entering this mode starts tag listening automatically on a supported phone. If permission is declined, story buttons still work and **Start tag listening** retries.
- **Black screen:** the page is black with just one quiet **Hold 3 seconds for adult controls** button. NFC tags play the stories. Black mode opens after NFC listening starts successfully. If NFC is unavailable or permission is declined, child mode stays open with story buttons and visible instructions to retry. Your saved black-screen preference is kept for supported phones. If the browser needs a Play gesture, story controls temporarily appear; choosing Play returns to the black screen.
- **Lock the exit button:** a continuous three-second press is required to return to adult controls. Releasing early, moving away, changing tabs, or losing focus cancels it. Space and Enter also work. Black screen always requires the hold, even with this setting off. This is an accidental-exit guard, not a PIN or an operating-system lock. Phone Home/Back buttons and browser navigation still work. For that restriction use the device's app-pinning or guided-access feature.
- **Keep screen awake:** requests a screen wake lock during child mode and releases it on exit. It tries again when you return to the visible app. Device power-saving rules may decline or release it; the app reports this. Black mode keeps the actual display on with black content. It does not turn the display off. Install the app for fewer browser controls.
- **Tap the same tag to pause:** optional and off by default. Lift the tag away, then tap it again to pause that story. The next tap continues from the same position; a different tag starts its story. Finished stories restart. Works for audio and written stories. Rapid duplicate reads are ignored to prevent an immediate unintended pause. With the setting off, repeat taps restart the story as before.

NFC cannot scan while the physical screen is off, the device is locked, or this web app is hidden. Keeping it nominally in focus does not remove those browser restrictions. The practical web-app combination is **Black screen + Keep screen awake** with an unlocked phone. [Chrome's NFC visibility requirements](https://developer.chrome.com/docs/capabilities/nfc) and [screen wake-lock behavior](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

Reloading an active child-mode tab restores child mode. If NFC permission is already granted it restarts listening; otherwise the child view offers the start-listening button without silently prompting for permission.

## Persistent memory and backups

Saved stories, audio, names, written words, voice/pace, links, starter removals and drafts use local browser storage. Preferences are saved too. The app upgrades the StoryTouch 1.0 database in place. Use the same site origin, browser and profile to keep that experience; do not clear storage to update.

Browser memory is not permanent cloud storage. Clearing site data, private browsing, device cleanup, or switching address/browser/profile/port can make stories unavailable. **Export backup** downloads saved text/audio, links, starter-removal choices and preferences as `.storytouch.json`. Keep it safe: it includes unencrypted personal recordings. **Ask browser to keep local storage** requests persistence where supported, but is not a backup.

**Restore backup** merges other stories and replaces matching IDs/codes after confirmation. Version-1 StoryTouch 1.0 backups remain supported; new version-2 backups require StoryTouch 1.1 or later. Removed-starter preferences also remove those matching bundled stories on the target browser. Malformed backups are rejected before an atomic write. Single JSON backups support up to 200 MB of audio / 285 MB file size, subject to device memory. Larger libraries can download individual audio/text and keep a separate list of tag codes. There is no automatic cloud synchronisation.

## Install and use offline

Open **Tags & settings, then App & offline**. The app verifies that its interface, guide, icons and all four bundled MP3 stories are cached before showing **Ready for offline stories**. Personal audio remains in IndexedDB. **Check offline files** verifies the cache; if files are missing, **Download offline files** repairs this release without deleting your library. If a newer release is deployed, check for updates first so app files from different versions are not mixed.

Use **Install StoryTouch** when your browser offers its install prompt. Otherwise **How to install** gives device-appropriate instructions. On iPhone/iPad use the browser's Share menu and Add to Home Screen; enable Open as Web App if offered. Installed mode is detected, and the manifest retains the same app identity, icons, start URL and storage origin. Supported launchers offer shortcuts to Stories, Add a story and Child mode. The child shortcut does not silently request a new NFC permission. [Installation guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Test once with the server or internet unavailable: reopen the app, play saved audio and a bundled story, and check your tag links. Missing uncached pages show a recovery page with **Open your stories**. Written stories need an installed offline device voice. Installation alone does not prove offline readiness, and cached app files are not a backup of personal audio.

**Check for updates** looks for a new release. A complete new release becomes available even when other StoryTouch tabs are open. An untouched adult launch can refresh automatically after saving its draft. After interaction, or during child mode, playback, recording or importing, the current page keeps running. Finish the activity and choose **Update app**, or refresh/reopen to load the ready release. Drafts, preferences, stories and tag links stay saved; other app windows can stay open. When coming from version 1.3.1 or earlier, allow the download to finish online, then refresh once to show this release. Never clear site data to update. [Service-worker update behavior](https://web.dev/articles/service-worker-lifecycle).

Where supported, headphones and the phone's media panel show the story title and provide Play, Pause, Stop and audio seeking. Written stories do not advertise a seek timeline. These controls do not make NFC work with the physical screen off; the existing NFC visibility restriction still applies. Phone safe-area padding accommodates system bars without disabling zoom or forcing an orientation.

For future app-code changes, bump the version in `sw.js`; the folder helper updates its own example revision. Preserve database/store names, manifest identity and hosting origin to retain local stories. No personal recordings are uploaded during installation, offline download, repair or updates.

## Deploy to GitHub Pages

The production repository is [MicroSwitchers/storytapnfc](https://github.com/MicroSwitchers/storytapnfc), published at [StoryTouch](https://microswitchers.github.io/storytapnfc/).

Push the complete app to `main`. The existing Pages deployment publishes the repository root. Keep `.nojekyll` so these already-built static files are served directly, including the offline setup guide. No build command or API key is needed. Wait for the Pages deployment to succeed before testing the new release. GitHub Pages does not apply Netlify's `_headers` file; the app's relative URLs, install manifest, service worker and local story storage work without it.

Keep this address unchanged to retain browser storage and existing URL tags. A complete release activates in the background; refresh or reopen to load it. The adult Update app control saves a pending draft before refreshing.

## Deploy to Netlify

1. Extract the ZIP. Check `index.html` is directly in the folder. Add any starter files and run the folder helper first.
2. Use manual deployment / Netlify Drop to upload the **extracted folder**, not the ZIP or an extra enclosing folder. For Git deployment, use the directory with `index.html` as publish directory and leave the build command empty. `netlify.toml` sets publish to `.`. [Netlify deployment guide](https://docs.netlify.com/deploy/create-deploys/).
3. Open the HTTPS URL on the intended phone. Play a starter, wait for offline readiness, record a short story, save it, reload and play it again.
4. Choose the final address before writing URL tags. Export before changing address/browser/device; restore at the new address and rewrite URL tags. Apply updates to the same project.

Other static HTTPS hosts and subfolder deployments also work. The manifest link is `./manifest.webmanifest`; all app/install paths are relative. Serve it as `application/manifest+json` if needed. `_headers` supplies headers on hosts that support it. Hosting availability/limits depend on the provider, so keep this package and backups. Public hosting exposes app code and starter files; recorded/imported personal audio is not uploaded by StoryTouch. Platform speech services may handle online voices.

## Local preview

With Python 3, double-click **START-LOCAL.cmd** on Windows, or run `python serve.py` / `python3 serve.py`. The helper refreshes examples, opens [http://localhost:8080/](http://localhost:8080/), and serves only this folder to this computer. Keep it running; Ctrl+C stops it.

Opening `index.html` as `file://` is not the supported way to run recording, storage, installation or offline caching. Localhost is secure on the same computer. A plain HTTP computer LAN address on a phone is not HTTPS; use your deployed address for NFC testing.

## Accessibility and troubleshooting

Child mode has large story buttons, Stop, optional codes and story text. Parent tabs support arrow/Home/End keys. Controls have labels, visible focus and status announcements, with reduced-motion/forced-colour support. Add transcripts for audio. Spoken guidance/feedback sounds are optional. Child mode offers an exit hold to prevent accidental taps; it does not lock operating-system or browser controls.

- **Written story silent:** choose another voice/install an offline voice, or use recorded audio.
- **No NFC:** use Android Chrome on an NFC phone over HTTPS, or use buttons/codes.
- **Tag has no story:** relink the chosen story or restore the correct library in this browser/origin.
- **Starter missing:** run the folder helper and deploy its catalog/audio together. Removed choices stay removed until deliberately restored.
- **Microphone denied:** allow this site’s microphone in browser settings or import audio.
- **Scratchy new recording:** watch for the “Too loud” warning and move the microphone farther away. Try leaving background noise reduction off, especially for music. Existing distorted recordings need to be recorded again; the app cannot restore missing sound.
- **Save failed:** check free space/site-storage permissions. An error means the change was not safely saved.
- **Netlify 404:** deploy the folder directly containing `index.html`.
- **Old version still shown:** connect, open App & offline and choose Check for updates. Wait for the download, then finish the current activity and refresh or choose Update app. Confirm version 1.4.1 in the footer. Keep site data.

## Included files and verification

The complete app is in `index.html`, `styles.css`, `app.js`, `core.js`, `storage.js`, `speech.js`, `recording.js`, `child-mode.js`, `pwa.js` and `media.js`. `example-stories/` supplies starter audio and its generated catalog. Folder helpers, installation/offline files, icons, guides, hosting settings and the optional local preview are included. The app itself requires no external libraries/fonts/audio services.

**VERIFICATION.md** records tests and limits. Software tests use simulated NFC/speech output and a fake microphone. Real phone NFC, device voices, microphone quality, screen readers and operating-system installation need checks on the intended device. No production hosting account was changed.
