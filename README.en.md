# qyPlayer (青云播放器)

<img src="./assets/icons/qyplayer.svg" alt="qyPlayer" width="96"> <img src="./assets/icons/qymaker.svg" alt="qyMaker" width="96">

English | [中文](./README.md)

qyPlayer (青云播放器 in Chinese) is an open-source, cross-platform, local-first "memory film" player, together with the `.qyp` package format. It works much like the Memories feature in Apple Photos: it arranges a set of photos and videos, plus music, into a film with transitions and entrance animations.

**Everything is processed in your browser. Files are never uploaded to a server. There are no accounts and no backend.**

## Try it online

- Player: <https://ricky2022.github.io/qyPlayer/>. Open or drop a `.qyp` file, or try the built-in samples.
- Creator: <https://ricky2022.github.io/qyPlayer/create.html>. Pick photos and videos, choose a template and music, then generate and download a `.qyp`.

The interface is available in Chinese and English. It follows the system language by default; the switch in the top-right corner is remembered.

## Download for Windows

The player (qyPlayer, 青云播放器) and the creator (qyMaker, 青云制作器) are two separate programs. Both run entirely on your machine. Windows 10 / 11 (64-bit) is required.

Current version: [v0.6.1](https://github.com/Ricky2022/qyPlayer/releases/tag/v0.6.1). The previous version is [v0.6.0](https://github.com/Ricky2022/qyPlayer/releases/tag/v0.6.0), and the one before that is [v0.5.1](https://github.com/Ricky2022/qyPlayer/releases/tag/v0.5.1); v0.3.0 was only a preview with no official Release, and everything in it is included in 0.4.0.

| Program | Installer | Portable |
| --- | --- | --- |
| Player | [qyPlayer-0.6.1-Setup-x64.exe](https://github.com/Ricky2022/qyPlayer/releases/download/v0.6.1/qyPlayer-0.6.1-Setup-x64.exe) | [qyPlayer-0.6.1-x64-portable.zip](https://github.com/Ricky2022/qyPlayer/releases/download/v0.6.1/qyPlayer-0.6.1-x64-portable.zip) |
| Creator | [qyMaker-0.6.1-Setup-x64.exe](https://github.com/Ricky2022/qyPlayer/releases/download/v0.6.1/qyMaker-0.6.1-Setup-x64.exe) | [qyMaker-0.6.1-x64-portable.zip](https://github.com/Ricky2022/qyPlayer/releases/download/v0.6.1/qyMaker-0.6.1-x64-portable.zip) |

All versions are on the [Releases](https://github.com/Ricky2022/qyPlayer/releases) page.

- The installers do not need administrator rights. The installer language follows the system (Chinese or English). You can pick the install folder, whether to create a desktop shortcut, and whether to launch after installing; running a newer installer upgrades in place. After installing, double-clicking a `.qyp` file in Explorer opens it in the player, with its own file icon.
- Uninstall from Settings > Apps, or use the Start menu shortcut. It removes shortcuts, registry entries and the `.qyp` association; tick "Delete the application data" to remove cached program data too. Your own `.qyp` files are never touched.
- The player no longer bundles music, so it is smaller; the built-in music is only in the creator.
- Upgrading from 0.1.0: just run the new player installer over it. The 0.1.0 creator was named "qyPlayer 制作器" and the new one is "qyMaker", so it is not treated as an upgrade; please uninstall the old one from Settings > Apps first.
- For the portable zips, unzip and run `qyPlayer.exe` or `qyMaker.exe`. Windows 10 does not always include the WebView2 Runtime: if it is missing, the program asks in Chinese and downloads Microsoft's installer. The setup packages install it during setup as well.
- The programs are not code-signed, so Windows SmartScreen may warn about an "unknown publisher" on first run: click "More info", then "Run anyway".
- The desktop apps are the web app inside the system WebView2, so features and limitations are the same as the web version.

## Download for Android

Since 0.5.0 there is an Android player. Install the APK directly; it is not distributed through app stores. It needs **Android 10 or later** and **arm64** only (most mid-range and high-end phones from 2019 on).

| Program | File |
| --- | --- |
| Player | [qyPlayer-0.6.1-android-arm64.apk](https://github.com/Ricky2022/qyPlayer/releases/download/v0.6.1/qyPlayer-0.6.1-android-arm64.apk) |

- The first install has to allow "install unknown apps": open the downloaded APK in your file manager and allow that source in the system settings when prompted.
- In a file manager, WeChat or another app, choose "Open with" and pick qyPlayer to play a `.qyp`; opening another file while the app is running switches to the new film.
- Packages are read on demand, so a several-hundred-MB package does not have to be loaded into memory first.
- The picture follows the phone's rotation, fullscreen hides the system bars, the screen stays on while playing, and the back button leaves fullscreen, then the player, then the home screen.
- 32-bit devices (armv7, x86) cannot install it. The mobile build is player-only; use the Windows or web version to create films.
- Frame rate on phones has not been tuned yet; see the known issues in the release notes.
- **Known issue**: with an old system Android System WebView (Chrome 83 ships on some Android 11 devices), the playback screen may stay black. This release switches to compatible CSS but has not been verified on that device yet; if you see a black screen, try updating Android System WebView first.

## Status

The web version, the Windows desktop apps (player and creator) and the Android player all work. macOS, an Android creator, Linux and AI-assisted editing have not been started (MP4 export is included since 0.3.0).

### 0.6.1

0.6.1 fixes fullscreen and the page thumbnail strip. After entering fullscreen the picture is measured again, and the strip is drawn above the picture so the whole row stays visible.

### 0.6.0

0.6.0 adds mixing of music and original video sound, automatic draft saving, and a fix for transcoded video that some older phones could not play. The design is in [`docs/dev-0.6.0.md`](./docs/dev-0.6.0.md) (in Chinese). The package format is now 0.4; packages from 0.1 to 0.4 all open. Players from 0.5.1 and earlier say the version is not supported when they open a 0.4 package.

- Mixing: music volume and original video volume are separate. A new film plays the original sound, and the music drops to 30% on a video page that has sound. A single video page can be muted. An older film stays silent the way it was.
- Drafts: on a computer the creator saves two seconds after you stop editing, and offers to restore or discard it next time. Phones do not.
- Transcoding and MP4 export write the lowest H.264 level the picture actually needs, instead of always writing level 5.0. Open an existing film and save it again to repair it.

### 0.5.1

0.5.1 improves how a film looks on a phone and fixes the black playback screen on Android.

- Black screen fix: phones use the system WebView, which can be old (Chrome 83 ships on some Android 11 devices). The player used newer CSS (`inset` shorthand, `aspect-ratio`, flex `gap`) that the old WebView does not support, so the playback area collapsed to 0×0 and the screen stayed black. It now uses compatible CSS and sizes the canvas in script from the available space.
- A landscape film in portrait no longer sits in a sea of black: the current frame is blurred and dimmed to fill the background, and the film itself is shown as a rounded card with a soft shadow, close to the Apple Memories player.
- Fullscreen, rotation, keeping the screen on while playing and the step-by-step back button are unchanged.
- Playback no longer draws the opening title (the name in the lower left of the first page). The creator preview and an exported MP4 still include it when "Show title" is on.
- Video sound on Android: a clip often starts long after play is pressed, and the system used to allow sound only in that same tap, so the picture moved and the sound did not. Playback can now start later, and the video element stays in the page so its audio is heard.

### 0.5.0

0.5.0 adds the **Android player** and switches how the shell opens a file to on-demand reading, which the Windows builds benefit from too. The detailed design is in [`docs/dev-0.5.0.md`](./docs/dev-0.5.0.md) (in Chinese).

0.5.0 adds:

- An Android player (Tauri 2 shell): Android 10 and later, arm64, APK installed directly and not distributed through app stores.
- Open with: play a `.qyp` from a file manager or WeChat via "Open with"; the registration covers unknown binaries, ZIP and the `.qyp` type itself; a file that is not a `.qyp` gets a clear message.
- On-demand reading: opening a package reads only the manifest and the cover, media is read when it is needed, so a several-hundred-MB package does not have to be loaded into memory (desktop uses the same path now).
- Phone behaviour: rotation follows the phone, fullscreen hides the system bars, the screen stays on while playing, and the back button leaves fullscreen, then the player, then the home screen.
- Release: Windows and Android ship under one tag and one Release; if either platform fails to build, nothing is published.
- Known issues: some phones may not reach 30 fps (Canvas drawing on mobile is still being tuned); only an arm64 build is provided, so 32-bit devices cannot install it.

### 0.4.1

0.4.1 adds **single-page editing** to the creator: once the film is generated you can change just one page instead of starting over. The detailed design is in [`docs/dev-0.4.1.md`](./docs/dev-0.4.1.md) (in Chinese).

New in 0.4.1:

- Page strip: a row of page thumbnails under the preview; click one to select it and jump to that page; drag to reorder pages; with a page selected, Alt+←/→ moves it and Delete removes it. On a phone, tap "Edit this page" to open the "This page" tab in Settings.
- "This page" panel: the duration of a page (photo pages), the transition into the page, the layout of a collage (side by side, stacked, four positions of the big photo, grid and so on), and for each photo how it is shown (automatic, fill, show whole) and its order within the page.
- Changing what a page holds: move a photo to the previous or next page, split a photo out of a collage into its own page, merge with the next page, delete a page (its media are removed too).
- Framing: drag a photo to reposition it and zoom up to 3×; a single-photo page can also pick a camera motion (zoom in, zoom out, drift in four directions, or none).
- Video pages: set where the clip starts and how long it is; saving keeps only that part of the video.
- Together with the whole-film settings: after a single-page edit, changing the style, rearranging, changing the film length or sorting the media by hand first warns that the manual edits will be discarded; the title, aspect ratio, filter and music are not affected. Everything can be undone, and "Restore automatic arrangement" is in the Edit menu. The manual edits are saved in the `.qyp` and continue when it is reopened.
- Player: the thumbnail strip at the bottom is now optional and off by default; turn it on with the button at the right of the control bar. The choice is remembered.
- The package format is still 0.3. The record of the manual edits is stored in `generator.plan` (private, players ignore it), so the 0.4.0 player opens packages made by 0.4.1 as usual.

### 0.4.0

0.4.0 polishes the look and the playback experience after the memory movies in Apple Photos, and finishes the security wrap-up and documentation left over from the 0.3.0 preview. The detailed plan is in [`docs/dev-0.4.0.md`](./docs/dev-0.4.0.md) (in Chinese).

New in 0.4.0:

- Picture: empty areas (a photo of a different shape, collages, letterboxing) get a blurred backdrop taken from the current media; collages are now cards with an outer margin and wider gaps; single-photo pages have a slow push and pan (Ken Burns); collages and videos are left alone.
- Transitions: a new "rotate", and the creator can pick the transition (fade, slide, zoom, rotate); the default follows the style template.
- Filters: original, black and white, warm, cool and vintage, applied to the whole film.
- Opening title: a title with an optional subtitle that fades in and out at the start. It is drawn as a transparent picture and stored in the package, so it looks the same on every device; it can be turned off.
- Length: long, medium and short. Medium and short drop the media taken closest together first (media without a capture time are spread evenly). Media that are not used stay out of the package and are greyed out in the media panel.
- Player: previous and next page buttons (PageUp, PageDown), and a thumbnail strip at the bottom; click one to jump to that page.
- Package format 0.3: only optional fields were added; packages of 0.1, 0.2 and 0.3 all open. The 0.3.0 preview cannot open 0.3 packages, so upgrade.
- Security and build: the desktop apps now run with a Content Security Policy (CSP); the desktop creator writes a temporary file and renames it on save, so a failure never leaves half a file; Rust dependencies are pinned by `Cargo.lock` and CI builds with `--locked`; the About page and `NOTICE` now carry the licenses of libheif (LGPL-3.0), mediabunny (MPL-2.0) and other third-party parts.

Available since 0.3.0:

- A new creator interface: menu bar, three-column layout (three tabs on phones), media panel, auto-updating preview, undo and redo, unsaved-changes prompt, opening an existing `.qyp` to keep editing, shortcuts, accessibility.
- Package format 0.2: each asset records its `mimeType` and where it came from before transcoding, and the real size is checked on open; a `cover.jpg` cover; `peekPackage` reads the title, duration, cover and other summary information without unzipping.
- The player checks the media on open, draws a placeholder for media this device cannot decode and tells you, and fades video sound in and out on each page.
- The creator: HEIC photos are converted to JPEG with a built-in decoder; on save, videos can be trimmed and converted to H.264 + AAC and WAV to AAC (with progress, cancel, and as-is fallback with a message for items that fail); phones get a total-size warning and a limit.
- Music: 5 built-in CC0 tracks (with preview), imported MP3, M4A and WAV; imported music asks you to confirm you have the rights before saving or exporting.
- MP4 export: 1920x1080 (1080x1920 for portrait), 30 fps, H.264 + AAC, with progress and cancel; desktop computers only.

To decide, and known issues:

- Whether transcoding should cap the bitrate at the source video's bitrate (a low-bitrate source can currently get larger).
- An exported MP4 is held entirely in memory, so a very long film may run out of memory (a film over 10 minutes asks first). Transcoding and export rewrite the H.264 level down to the lowest one the stream actually fits.
- Filters and the blurred backdrop use canvas blend modes; how they look on Safari is decided on a real device.

New in 0.2.0: an immersive player (auto-hiding controls, a big play button, keyboard shortcuts); a bilingual Chinese / English interface; an About page; new Q + cloud icons (a play triangle for the player, a pencil for the creator) and a dedicated `.qyp` file icon; a reworked Windows installer (see above).

What works today:

- Playback: transitions (fade, slide, zoom), layouts of 1 to 4 images with staggered entrances, video pages, background music (audio is the master clock), seeking, fullscreen.
- Creating: import photos and videos, reorder or remove them by hand, choose the aspect ratio (landscape 16:9 or portrait 9:16), a style template, a title and music, preview in the page, "another version", and download the `.qyp`.
- The `.qyp` format: a ZIP containing `manifest.json` and the media. Packages are validated strictly on open; paths that escape the package, remote references and oversized packages are rejected. See [`spec/manifest.schema.json`](./spec/manifest.schema.json) and section 7 of the [PRD](./docs/PRD.en.md).

Known limitations:

- Videos: with the transcode switch on (the default on computers), they are trimmed and converted to H.264 + AAC on save; with it off they are packaged as they are, so the package is as large as the original video. Phones do not transcode.
- Photos: with transcoding on they are re-encoded to JPEG (longest side at most 2560 px); formats the browser cannot decode (for example HEIC in Chromium) are handled by the creator's built-in decoder.
- Music is a built-in CC0 track or an imported MP3, M4A (AAC) or WAV file.
- Mainly tested in Chromium-based browsers (Chrome, Edge); the real-device results for Safari and phone browsers are in the release notes.

## Tech stack

TypeScript (strict), React 19, react-jss, Vite, Vitest, pnpm workspace. Canvas 2D rendering, zip.js for packages, Ajv for manifest validation, music-metadata for checking audio and video formats. The Windows desktop apps use Tauri 2 (Rust).

## Repository layout

| Directory | Contents |
| --- | --- |
| `packages/core` | Manifest types and validation, the timeline engine `stateAt`, the rule-based generator |
| `packages/renderer` | Canvas 2D renderer that draws a timeline state |
| `packages/qyp` | Reading and writing `.qyp`, safety checks, conformance packages, audio and video format checks |
| `apps/web` | The web app: player (`index.html`) and creator (`create.html`) |
| `apps/desktop-player`, `apps/desktop-maker` | Tauri projects for the Windows apps (player and creator); both reuse the `apps/web` build output |
| `apps/desktop-common` | Rust code shared by both desktop apps, and the NSIS installer template |
| `assets` | Icon sources (SVG) with their generator, and the installer image generator |
| `spec` | JSON Schema of the manifest and an example |
| `fixtures` | Source records of the sample media, conformance packages |
| `scripts` | Download sample media, check licenses, build sample packages |
| `docs` | [PRD (Chinese)](./docs/PRD.md), [PRD (English)](./docs/PRD.en.md), [Phase 0 report](./docs/phase0-report.md) |

## Run locally

Requires Node.js 20 or newer (22 is used for development) and pnpm 10.

```bash
pnpm install
pnpm --filter @qyplayer/web dev    # open http://localhost:5173/
pnpm test                          # unit tests
pnpm typecheck                     # type check
pnpm build                         # build the site into apps/web/dist
```

The sample packages and the creator's built-in music need sample files. Regenerate them locally from public media:

```bash
pnpm fixtures:fetch    # download CC0 and public-domain media to fixtures/downloads (not committed)
pnpm fixtures:build    # build sample packages and copy them to apps/web/public/samples (not committed)
```

On the live site, the sample files are attached to the GitHub Release `samples-v1` and downloaded into the site at deploy time.

The Windows apps are built by GitHub Actions: pushing a `v*` tag (such as `v0.2.1`, which must match the version in both `tauri.conf.json` files) publishes a Release automatically. When releasing, update the version and download links in both READMEs and in `.github/release-notes.md` too; `pnpm test` checks them. You can also run "Release Windows apps" by hand on the Actions page to build without publishing. Building locally needs the Rust toolchain and the MSVC build tools: run `pnpm --filter @qyplayer/web build:player`, then `pnpm --filter @qyplayer/desktop-player bundle`; for the creator use `build:maker` and `@qyplayer/desktop-maker` (the player build omits the built-in music, the creator build includes it). Rust dependencies are pinned by `Cargo.lock` in the repository root and tests and builds use `--locked`; after changing a Rust dependency, run "Release Windows apps" by hand once, then replace `Cargo.lock` with the `cargo-lock` artifact and commit it.

## Sample media and licenses

The repository itself is licensed under [Apache-2.0](./LICENSE). The sample photos, video and music are all CC0 or public domain; the author, source and license of each are listed in [`fixtures/SOURCES.md`](./fixtures/SOURCES.md), and `pnpm fixtures:check` verifies that the download directory contains no unrecorded files.

## Contributing

Issues and pull requests are welcome. For larger changes, please check the scope and open items (section 14.2) of the [PRD](./docs/PRD.en.md) first.
