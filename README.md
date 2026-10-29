# StoryTouch — A little tap. A whole story.

Version 1.1.0 · 29 October 2026

Extract the complete ZIP. **`index.html` is directly at its root**, beside the scripts, manifest and folders. There is no build step or API key. Deploy the extracted folder to HTTPS or use the local preview below. Open `README.html` for the web version of this guide.

## Three ways to add a story

Choose **Add a story**, then a large method button:

1. **Type a story:** enter a name and the words, choose a device voice and pace, listen to a preview, then choose **Save story**. These stories save as text and voice preferences and use basic device text-to-speech each time. They are not converted to an MP3. Play, pause/resume, restart and Stop are available. Seeking is hidden because device speech has no audio timeline.
2. **Record my voice:** allow the microphone, record, stop, preview, and save. Up to 30 minutes and 100 MB. Keep the page open and device awake while recording; calls and browser suspension can interrupt capture.
3. **Add an MP3:** select an audio file, preview, and save. MP3, WAV, M4A, OGG, AAC, FLAC and WebM are accepted up to 100 MB, subject to browser decoding support. Importing does not convert codecs. MP3 is useful when moving between devices.

The unfinished form saves its text and completed audio draft to this browser. An active recording cannot survive closing the page before you stop it. **Clear draft** removes the unfinished form. Drafts are separate from the saved library and are not exported in backups.

Every story, including a starter, has **Rename / edit**. Change its name, picture, transcript, or a written story’s words/voice, then choose **Save details**. The same menu downloads audio/text or deletes the story and its local tag links.

Device voice availability varies. Voices labelled **online** may need a connection and may use a platform speech service. Missing saved voices fall back to a matching local language or device default. For offline speech, install a suitable device voice; use a recording/MP3 when you need stored sound. [Speech synthesis reference](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

## Starter stories and your audio folder

**A few to try** offers a spoken welcome MP3, musical chimes and rain. Play, rename, link or delete them. Names and removals stay changed after reloads and app updates. **Restore removed starter stories** brings back the bundled choices without overwriting renamed stories already on the shelf.

Add your own examples in either of two ways:

- **Inside the app:** choose **Add audio folder** and select a folder. Supported audio is copied into this browser as starter stories. Duplicate selections are skipped. The stories can be renamed/deleted and are included in backups. Selecting a folder is an import, not ongoing background access. Select it again to import files added later.
- **Inside the package:** add audio to **`example-stories/`**, including subfolders if wanted. Double-click **UPDATE-EXAMPLES.cmd** (Python 3 required), or run `python prepare_examples.py`. Then deploy the complete app folder. The local launcher refreshes this catalog automatically. Optional: a `.txt` file with the same base name supplies a transcript, such as `owl.mp3` and `owl.txt`.

A static host cannot automatically list a directory for the browser. The helper generates `example-stories/stories.json` and changes the offline cache revision so new files can be offered after deployment. No JavaScript editing is needed. Close old app tabs to apply that update. Removing a file from the package stops new browsers receiving it; a copy already saved in an existing browser stays until its parent removes it. Use a new filename to offer a replacement as a new story. Per-file limit: 100 MB; catalog limit: 2,000 files. Keep the folder small enough for the intended phones to cache.

## Link a tag: choose → tap → test

Choose **Link tag** on a story card. The visual guide has three steps:

1. **Story:** check the picture and name.
2. **Tap tag:** choose **Link this tag**, then hold an NDEF NFC tag near the back of the phone. The phone illustration changes while listening. The app reads a code or same-app URL record, falling back to a serial number where provided.
3. **Ready:** a green check names the linked story. Choose **Test the tag** and tap it again. The story plays and the guide confirms the test. Then choose **Open child mode**.

The main linking route does not overwrite a tag. Reassigning an existing link asks for confirmation. Tags with no readable record/usable serial need the URL-writing option: open **Use a code or write a URL tag**, save a code, then choose **Write URL to NFC tag** beside its link. Confirm replacement and hold a writable tag nearby. This overwrites its current message. **Copy tag URL** works with another NFC-writing tool. Unlinking does not erase the physical tag.

In-app NFC needs Android Chrome, NFC hardware enabled, permission, HTTPS, an unlocked screen and the app visible. Scanning stops when hidden or when you change mode/tab. Start it again on return. Web NFC handles NDEF, not generic RFID or background scanning. [Chrome NFC documentation](https://developer.chrome.com/docs/capabilities/nfc).

Other browsers can use story buttons or codes. A compatible phone’s normal tag handling may open a URL such as `https://your-site.example/index.html#tag=TEDDY-1`; the app opens the story and waits for **Play**. Scans in an active session attempt playback, but browsers may still require Play. A tag contains a code/URL, not audio. Each device/browser needs matching stories and links, normally supplied by restoring a backup.

## Persistent memory and backups

Saved stories, audio, names, pictures, written words, voice/pace, links, starter removals and drafts use local browser storage. Preferences are saved too. The app upgrades the StoryTouch 1.0 database in place. Use the same site origin, browser and profile to keep that experience; do not clear storage to update.

Browser memory is not permanent cloud storage. Clearing site data, private browsing, device cleanup, or switching address/browser/profile/port can make stories unavailable. **Export backup** downloads saved text/audio, links, starter-removal choices and preferences as `.storytouch.json`. Keep it safe: it includes unencrypted personal recordings. **Ask browser to keep local storage** requests persistence where supported, but is not a backup.

**Restore backup** merges other stories and replaces matching IDs/codes after confirmation. Version-1 StoryTouch 1.0 backups remain supported; new version-2 backups require StoryTouch 1.1 or later. Removed-starter preferences also remove those matching bundled stories on the target browser. Malformed backups are rejected before an atomic write. Single JSON backups support up to 200 MB of audio / 285 MB file size, subject to device memory. Larger libraries can download individual audio/text and keep a separate list of tag codes. There is no automatic cloud synchronisation.

## Install and use offline

Open online over HTTPS and wait for **Ready for offline stories**. The service worker caches the app, guide, icons, starter catalog and its audio. Stored stories use IndexedDB. Install where offered using **Install StoryTouch**, the browser menu, or Add to Home Screen. On iPhone/iPad Safari this is usually in Share. Installation options vary. [Manifest guidance](https://web.dev/learn/pwa/web-app-manifest).

Disconnect and test a saved recording, MP3 and starter sound. Written stories need an available offline device voice to speak; their text remains readable. Installation alone does not prove offline readiness. New service workers wait until old app tabs close. For future app-code changes, bump the version in `sw.js`; the folder helper updates its own example revision. Preserve the database/store names to retain local stories.

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

Child mode has large story buttons, Stop, optional codes and story text. Parent tabs support arrow/Home/End keys. Controls have labels, visible focus and status announcements, with reduced-motion/forced-colour support. Add transcripts for audio. Spoken guidance/feedback sounds are optional. Child mode simplifies the interface; it is not a security lock.

- **Written story silent:** choose another voice/install an offline voice, or use recorded audio.
- **No NFC:** use Android Chrome on an NFC phone over HTTPS, or use buttons/codes.
- **Tag has no story:** relink the chosen story or restore the correct library in this browser/origin.
- **Starter missing:** run the folder helper and deploy its catalog/audio together. Removed choices stay removed until deliberately restored.
- **Microphone denied:** allow this site’s microphone in browser settings or import audio.
- **Save failed:** check free space/site-storage permissions. An error means the change was not safely saved.
- **Netlify 404:** deploy the folder directly containing `index.html`.
- **Old version still shown:** close all StoryTouch tabs and reopen online; keep local storage.

## Included files and verification

The complete app is in `index.html`, `styles.css`, `app.js`, `core.js`, `storage.js` and `speech.js`. `example-stories/` supplies starter audio and its generated catalog. Folder helpers, installation/offline files, icons, guides, hosting settings and the optional local preview are included. The app itself requires no external libraries/fonts/audio services.

**VERIFICATION.md** records tests and limits. Software tests use simulated NFC/speech output and a fake microphone. Real phone NFC, device voices, microphone quality, screen readers and operating-system installation need checks on the intended device. No production hosting account was changed.
