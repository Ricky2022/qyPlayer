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

Current version: [v0.2.1](https://github.com/Ricky2022/qyPlayer/releases/tag/v0.2.1).

| Program | Installer | Portable |
| --- | --- | --- |
| Player | [qyPlayer-0.2.1-Setup-x64.exe](https://github.com/Ricky2022/qyPlayer/releases/download/v0.2.1/qyPlayer-0.2.1-Setup-x64.exe) | [qyPlayer-0.2.1-x64-portable.zip](https://github.com/Ricky2022/qyPlayer/releases/download/v0.2.1/qyPlayer-0.2.1-x64-portable.zip) |
| Creator | [qyMaker-0.2.1-Setup-x64.exe](https://github.com/Ricky2022/qyPlayer/releases/download/v0.2.1/qyMaker-0.2.1-Setup-x64.exe) | [qyMaker-0.2.1-x64-portable.zip](https://github.com/Ricky2022/qyPlayer/releases/download/v0.2.1/qyMaker-0.2.1-x64-portable.zip) |

All versions are on the [Releases](https://github.com/Ricky2022/qyPlayer/releases) page.

- The installers do not need administrator rights. The installer language follows the system (Chinese or English). You can pick the install folder, whether to create a desktop shortcut, and whether to launch after installing; running a newer installer upgrades in place. After installing, double-clicking a `.qyp` file in Explorer opens it in the player, with its own file icon.
- Uninstall from Settings > Apps, or use the Start menu shortcut. It removes shortcuts, registry entries and the `.qyp` association; tick "Delete the application data" to remove cached program data too. Your own `.qyp` files are never touched.
- The player no longer bundles music, so it is smaller; the built-in music is only in the creator.
- Upgrading from 0.1.0: just run the new player installer over it. The 0.1.0 creator was named "qyPlayer 制作器" and the new one is "qyMaker", so it is not treated as an upgrade; please uninstall the old one from Settings > Apps first.
- For the portable zips, unzip and run `qyPlayer.exe` or `qyMaker.exe`. WebView2 must already be installed (Windows 10 / 11 usually ship with it); the installers install it when it is missing.
- The programs are not code-signed, so Windows SmartScreen may warn about an "unknown publisher" on first run: click "More info", then "Run anyway".
- The desktop apps are the web app inside the system WebView2, so features and limitations are the same as the web version.

## Status

This is **Phase 0 (technical research)**: the Web version and a Windows desktop shell exist, to validate the technical approach. macOS, mobile apps, MP4 export and AI-assisted editing have not been started.

New in 0.2.0: an immersive player (auto-hiding controls, a big play button, keyboard shortcuts); a bilingual Chinese / English interface; an About page; new Q + cloud icons (a play triangle for the player, a pencil for the creator) and a dedicated `.qyp` file icon; a reworked Windows installer (see above).

What works today:

- Playback: transitions (fade, slide, zoom), layouts of 1 to 4 images with staggered entrances, video pages, background music (audio is the master clock), seeking, fullscreen.
- Creating: import photos and videos, reorder or remove them by hand, choose the aspect ratio (landscape 16:9 or portrait 9:16), a style template, a title and music, preview in the page, "another version", and download the `.qyp`.
- The `.qyp` format: a ZIP containing `manifest.json` and the media. Packages are validated strictly on open; paths that escape the package, remote references and oversized packages are rejected. See [`spec/manifest.schema.json`](./spec/manifest.schema.json) and section 7 of the [PRD](./docs/PRD.en.md).

Known limitations (details in the [Phase 0 report](./docs/phase0-report.md), in Chinese):

- Videos must be H.264 MP4 and are packaged **as they are**, with no transcoding or trimming, so the package is as large as the original video.
- Photos are re-encoded to JPEG in the creator (longest side at most 2560 px). Formats the browser cannot decode (for example HEIC in Chromium) are skipped with a message.
- Music is either the built-in CC0 track or an imported MP3 or M4A (AAC) file.
- Tested only in Chromium-based browsers (Chrome, Edge). Firefox, Safari and mobile browsers have **not been tested**.

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

The Windows apps are built by GitHub Actions: pushing a `v*` tag (such as `v0.2.1`, which must match the version in both `tauri.conf.json` files) publishes a Release automatically. When releasing, update the version and download links in both READMEs and in `.github/release-notes.md` too; `pnpm test` checks them. You can also run "Release Windows apps" by hand on the Actions page to build without publishing. Building locally needs the Rust toolchain and the MSVC build tools: run `pnpm --filter @qyplayer/web build:player`, then `pnpm --filter @qyplayer/desktop-player bundle`; for the creator use `build:maker` and `@qyplayer/desktop-maker` (the player build omits the built-in music, the creator build includes it).

## Sample media and licenses

The repository itself is licensed under [Apache-2.0](./LICENSE). The sample photos, video and music are all CC0 or public domain; the author, source and license of each are listed in [`fixtures/SOURCES.md`](./fixtures/SOURCES.md), and `pnpm fixtures:check` verifies that the download directory contains no unrecorded files.

## Contributing

Issues and pull requests are welcome. For larger changes, please check the scope and open items (section 14.2) of the [PRD](./docs/PRD.en.md) first.
