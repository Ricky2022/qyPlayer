# qyPlayer

English | [中文](./README.md)

qyPlayer is an open-source, cross-platform, local-first "memory film" player, together with the `.qyp` package format. It works much like the Memories feature in Apple Photos: it arranges a set of photos and videos, plus music, into a film with transitions and entrance animations.

**Everything is processed in your browser. Files are never uploaded to a server. There are no accounts and no backend.**

## Try it online

- Player: <https://ricky2022.github.io/qyPlayer/>. Open or drop a `.qyp` file, or try the built-in samples.
- Creator: <https://ricky2022.github.io/qyPlayer/create.html>. Pick photos and videos, choose a template and music, then generate and download a `.qyp`.

The user interface is currently in Chinese only.

## Status

This is **Phase 0 (technical research)**: only the Web version exists, to validate the technical approach. Desktop and mobile apps, MP4 export and AI-assisted editing have not been started.

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

TypeScript (strict), React 19, react-jss, Vite, Vitest, pnpm workspace. Canvas 2D rendering, zip.js for packages, Ajv for manifest validation, music-metadata for checking audio and video formats.

## Repository layout

| Directory | Contents |
| --- | --- |
| `packages/core` | Manifest types and validation, the timeline engine `stateAt`, the rule-based generator |
| `packages/renderer` | Canvas 2D renderer that draws a timeline state |
| `packages/qyp` | Reading and writing `.qyp`, safety checks, conformance packages, audio and video format checks |
| `apps/web` | The web app: player (`index.html`) and creator (`create.html`) |
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

## Sample media and licenses

The repository itself is licensed under [Apache-2.0](./LICENSE). The sample photos, video and music are all CC0 or public domain; the author, source and license of each are listed in [`fixtures/SOURCES.md`](./fixtures/SOURCES.md), and `pnpm fixtures:check` verifies that the download directory contains no unrecorded files.

## Contributing

Issues and pull requests are welcome. For larger changes, please check the scope and open items (section 14.2) of the [PRD](./docs/PRD.en.md) first.
