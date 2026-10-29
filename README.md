# StoryTouch — A little tap. A whole story.

Version 1.0.0 · Packaged 29 October 2026

**Start here:** extract the entire ZIP. `index.html` is directly at its root, beside the scripts, manifest, and `assets` folder. There is no build step and no dependency download. Deploy the extracted folder to an HTTPS static host, or use the local preview below. Opening the HTML as a `file://` page is not the supported way to run recording, NFC, installation, or offline storage.

This package was rebuilt from the requested StoryTouch feature list. The referenced conversation exposed no downloadable app attachments or recoverable source, so compatibility with an earlier app’s database or backup format is not claimed. Existing unrelated local projects were not changed.

## Deploy to Netlify

1. Extract the ZIP to a folder named `StoryTouch`. Check that `StoryTouch/index.html` exists. Do not upload a folder containing only the ZIP or an extra enclosing folder.
2. Sign in to [Netlify](https://app.netlify.com/), create a project using manual deployment / Netlify Drop, and drag in the **extracted folder**. Menu wording can vary. See [Netlify’s deployment instructions](https://docs.netlify.com/deploy/create-deploys/).
3. If using a connected Git repository instead, use the directory containing `index.html` as the publish directory. Leave the build command empty. The included `netlify.toml` sets publish to `.`.
4. Open the assigned **HTTPS** URL in the intended browser on the intended phone. Play a test sound. Wait for **Ready for offline stories**, then add a recording and test a reload.
5. Choose the final site address before linking URL tags. When changing the domain, browser, device, or local preview port, export a backup and restore it at the new address. Rewrite URL tags for the new address. Deploy future releases to the same Netlify project.

The complete app is static. No server code, database service, API key, subscription integration, or account system is needed. `_headers` supplies content/security headers on hosts that support that file. Other static HTTPS hosts can serve the same files; configure `.webmanifest` as `application/manifest+json` if needed. Subfolder hosting works because app paths, manifest scope, and start URL are relative.

Hosting availability and plan limits depend on your provider. Keep this ZIP and your separate story backups. A host serves the app’s downloadable code and included test sounds; your recorded/imported audio is kept in your browser, not uploaded by StoryTouch. Anyone allowed to visit a public deployment can download its app code.

## Preview on this computer

On Windows with Python 3 installed, double-click **START-LOCAL.cmd**. On any system with Python 3, run `python serve.py` (or `python3 serve.py`) from the extracted folder. The helper opens [http://localhost:8080/](http://localhost:8080/) and serves only this folder to this computer. Keep the helper running; press Ctrl+C to stop it. You can also use a static server of your choice.

`localhost` is treated as a secure context on the same computer. Opening a computer’s plain HTTP LAN address on an Android phone does **not** supply HTTPS. For phone NFC/microphone testing, use the deployed HTTPS URL. The helper is a development preview, not a permanent hosting service.

## Add your stories

1. Choose **Add a story** and enter a name. Pick a picture.
2. Choose **Start recording**, allow microphone access, speak, and choose **Stop recording**. Or choose an audio file (up to 100 MB). MP3 and WAV are useful interchange formats; actual codec support depends on the browser.
3. Listen to the preview. Add optional story text/transcript, then choose **Save to your library**. A preview is not saved until you press Save. The recording limit is 30 minutes; keep the page open and the device awake while recording. Phone calls, screen locks, and browser suspension can interrupt capture.
4. Play from the library. **Edit & link** opens name, picture, and transcript editing, audio download, and deletion. Use **Tags & setup** to link the story.

Audio is saved as a Blob in IndexedDB. Large files, private browsing, blocked site storage, or a full device can prevent saving. A visible save error means it was not safely saved. Importing does not convert audio codecs. Recordings use the best offered format (often WebM/Opus on Chrome or MP4 on Safari); use MP3/WAV imports when sharing across browsers that do not support each other’s recording format.

## Link and use an NFC tag

For direct scanning/writing, use an NFC-capable **Android phone with Chrome**, NFC enabled, an unlocked screen, and the app open over HTTPS. Web NFC exposes NDEF records; it does not provide generic RFID, low-level tag commands, or background scanning. API detection does not prove the phone has working NFC hardware. [Chrome’s Web NFC documentation](https://developer.chrome.com/docs/capabilities/nfc) describes these requirements.

### Option A: a code plus a URL tag (recommended)

1. In **Tags & setup**, choose a story and enter a code such as `TEDDY-1`. Choose **Save code link**. Codes use 1–48 letters, numbers, or hyphens; case is ignored. Print the code on the card as a fallback.
2. Beside the saved link, choose **Write URL to NFC tag**. Confirm the replacement, then hold a writable NDEF tag near the phone. This overwrites the tag’s existing message; it does not lock the tag. You can use **Copy tag URL** with another NFC-writing tool instead.
3. Choose **Enter child mode**, then **Listen for tags**, allow NFC, and hold the tag near the reader. A linked scan attempts playback. If the browser requires another gesture, press the visible **Play** button.
4. The written URL looks like `https://your-site.example/index.html#tag=TEDDY-1`. When the operating system opens that URL outside an active scan, StoryTouch opens the linked story and waits for **Play**. It never promises background audio or autoplay on page load.

### Option B: link an existing tag without rewriting it

Choose the story, then **Read a physical tag to link**, and scan the tag. StoryTouch links a recognised text/code or app URL record, falling back to the tag’s serial number when provided. Tags without a readable record or usable serial number need Option A. Serial identifiers are not authentication and are not guaranteed for every tag.

Tag links are local. The tag stores a code/URL, not the recording. A different phone needs the app, the audio, and matching links (restore a StoryTouch backup). Identical codes resolve to the story chosen on that device. Unlinking in the app does not erase or rewrite a physical tag. External URL records are not opened by the scanner.

## Child playback and accessibility

Child mode offers large, labelled story buttons, a prominent Stop story button, and optional code entry. NFC is optional. It can be used with keyboard navigation, switch software that sends keyboard input, screen readers, or touch. Controls have visible focus, semantic labels, status announcements, and reduced-motion/forced-colour support. Picture choices also have text names. Add transcripts for a text alternative to your own audio.

The player supports play/pause, stop, restart, seeking, speed, and story text. Only one story plays at a time. **Spoken guidance** and **Gentle feedback sounds** can be changed in setup. Spoken guidance uses the device’s speech system; installed/offline voices vary. Child mode simplifies the interface; it is not a parental security lock. The Parent mode button remains available.

NFC is unavailable in this app on desktop browsers and iPhone/iPad Safari. Story buttons and codes still work. Compatible phones may open a URL written to a tag using their normal system NFC handling, followed by a Play tap; this is separate from in-app Web NFC support.

## Install and use offline

The root HTML links to **`./manifest.webmanifest`**. The manifest supplies relative start URL/scope, standalone display, and included 192/512-pixel PNG icons plus a maskable icon. [Web app manifest guidance](https://web.dev/learn/pwa/web-app-manifest) explains how browsers use it.

1. Open online over HTTPS. Wait for **Ready for offline stories**. The service worker caches the app shell, guide, icons, and all three test sounds. Saved custom audio lives separately in IndexedDB.
2. Where offered, choose **Install StoryTouch**, the browser’s install icon, or **Install app / Add to Home Screen**. iPhone/iPad Safari usually offers Share → Add to Home Screen. The browser decides whether and how installation is offered.
3. Test: disconnect from the network, reopen at the same address, play a bundled sound and a saved recording. Offline use needs a successfully completed first cache. Installation alone does not prove offline readiness.

The screen must be unlocked and the app visible for NFC. Scanning stops when the page is hidden, the mode/tab changes, or you press Stop listening. Start it again on return. Local audio playback and recording can work offline after setup, subject to device/browser support. Browser or operating-system storage cleanup can still remove offline files and recordings.

For a future release, change the version in `sw.js` when changing any cached asset. A replacement worker waits for existing app tabs to close, then takes over on reopening, preserving a consistent set of files. Do not rename the database or store names if you want to retain this version’s local stories. Updating files at the same origin does not intentionally erase recordings.

## Back up, restore, or move phones

Choose **Tags & setup → Export backup**. Keep the downloaded `.storytouch.json` somewhere safe. It contains all saved custom audio, names, transcripts, tag links, and preferences. Bundled demo audio is already in every package. Backups contain unencrypted private recordings; only share them intentionally.

On the target device and final app address, choose **Restore backup**, select the file, review the message, and confirm. Restore merges other existing stories, replacing matching story IDs and tag codes. Restore validates the backup before an atomic database transaction; a malformed backup is rejected without partial writes. This format is specific to StoryTouch 1.0.0 and does not import unknown older app formats.

Browser JSON backups support up to 200 MB of custom audio in total and backup files up to 285 MB. Individual audio files are limited to 100 MB. Larger libraries should download individual recordings from each story’s Edit menu and keep a separate list of tag codes; large-file backup also depends on available browser memory. **Ask browser to keep local storage** requests persistent storage where supported, but is not a replacement for backups. There is no automatic cloud synchronisation.

## Included sounds and files

- `assets/audio/hello.wav`: an included spoken welcome, made with a system speech voice. Its transcript is available in the player.
- `assets/audio/chimes.wav`: a short synthesised musical sequence.
- `assets/audio/rain.wav`: synthesised rain-like noise, with a gentle fade.
- `index.html`, `styles.css`, `app.js`, `core.js`, `storage.js`: complete application source.
- `manifest.webmanifest`, `sw.js`, `assets/icons/`: installation and offline assets.
- `README.html`, `README.md`: this guide in web and text form.
- `_headers`, `netlify.toml`: optional static-host configuration.
- `serve.py`, `START-LOCAL.cmd`: optional local preview helper.
- `VERIFICATION.md`: release verification and remaining device checks.

No external fonts, JavaScript libraries, image services, or remote audio are required. All graphics are bundled SVG/PNG or system emoji.

## If something does not work

- **Netlify 404:** deploy the extracted folder that directly contains `index.html`. Check the publish directory.
- **No NFC button support:** use Android Chrome over HTTPS on an NFC-enabled phone; otherwise use story buttons/codes. No browser app can make unsupported NFC hardware available.
- **Tag reads but no story:** use the same app address/browser where the story was saved, link the code or serial there, or restore your backup. Keep the tag still near the reader. URL tags must point at your final address.
- **Audio waits for Play:** tap Play. This is the browser’s playback policy.
- **Microphone denied:** allow microphone for this site in the browser settings, then try again; or import audio.
- **Sound cannot play:** check device volume and output. Try a bundled WAV test sound, then an MP3/WAV import. Try the original recording browser for WebM/MP4 recordings.
- **Offline setup incomplete:** reconnect, reload, and wait for the ready indicator. Check the host serves every cached asset successfully. Browser storage must be available.
- **Stories disappeared:** check the exact browser, profile, site address, and port. Storage is separate for each. Restore your backup if site data was cleared.
- **An update waits:** close all tabs/windows of StoryTouch and reopen online. Do not clear site storage unless your stories are backed up.

## Verification limits

See `VERIFICATION.md` for the actual release checks. Physical NFC reception/writing, microphone hardware quality, phone-specific permission UI, screen readers, and operating-system installation require checks on the target devices. Automated NFC events and a fake test microphone can verify software paths but do not certify real hardware. No production host was created for this package.
