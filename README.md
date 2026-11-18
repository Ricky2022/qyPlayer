# qyPlayer

[English](./README.en.md) | 中文

qyPlayer 是一个开源、跨平台、本地优先的“回忆影片”播放器，以及配套的 `.qyp` 影片包格式。效果类似苹果照片 App 的“回忆”：把一组照片和视频，配上音乐，自动编排成带转场和入场动画的影片。

**所有处理都在你的浏览器里完成，文件不会上传到任何服务器。没有账号，没有后端。**

## 在线试用

- 播放器：<https://ricky2022.github.io/qyPlayer/>，打开或拖入 `.qyp` 文件，也可以直接试看内置示例。
- 制作页：<https://ricky2022.github.io/qyPlayer/create.html>，选照片和视频，选模板和配乐，生成 `.qyp` 并下载。

## 当前状态

处于**阶段 0（技术预研）**：只做了 Web 版，用来验证技术路线。桌面端和手机端、MP4 导出、AI 编排都还没有开始。

已经可用：

- 播放：转场（淡入淡出、滑动、缩放）、1 到 4 张图的版式和依次入场、视频页、背景音乐（以音频为主时钟）、拖动进度、全屏。
- 制作：导入照片和视频，手动调整顺序或删除，选画面比例（横屏 16:9 或竖屏 9:16）、风格模板、标题和配乐，页内预览，“换一版”，下载 `.qyp`。
- `.qyp` 格式：一个 ZIP，内含 `manifest.json` 和素材。打开时严格校验，拒绝越界路径、远程引用、超限体积。规范见 [`spec/manifest.schema.json`](./spec/manifest.schema.json) 和 [PRD 第 7 节](./docs/PRD.md#7-包格式规范v01)。

已知限制（详见 [阶段 0 报告](./docs/phase0-report.md)）：

- 视频只支持 H.264 编码的 MP4，并且**原样打包**，不转码、不裁剪，所以包的体积等于原视频大小。
- 照片在制作页里重新编码为 JPEG（长边不超过 2560 像素）。浏览器解码不了的格式（例如 Chromium 里的 HEIC）会被跳过并提示。
- 配乐支持内置 CC0 曲目，或导入 MP3 和 M4A（AAC）。
- 只在 Chromium 内核浏览器（Chrome、Edge）里实测过。Firefox、Safari 和手机浏览器**没有测过**。

## 技术栈

TypeScript（严格模式）、React 19、react-jss、Vite、Vitest、pnpm workspace。Canvas 2D 渲染，zip.js 读写包，Ajv 校验清单，music-metadata 检查音视频格式。

## 目录结构

| 目录 | 内容 |
| --- | --- |
| `packages/core` | 清单类型与校验、时间线引擎 `stateAt`、规则式生成器 |
| `packages/renderer` | 把时间线状态画到 Canvas 2D 的渲染器 |
| `packages/qyp` | `.qyp` 的读写、安全校验、一致性测试包、音视频格式检查 |
| `apps/web` | 网页：播放器（`index.html`）和制作页（`create.html`） |
| `spec` | 清单的 JSON Schema 和示例 |
| `fixtures` | 示例素材的来源记录、一致性测试包 |
| `scripts` | 下载示例素材、检查许可、构建示例包 |
| `docs` | [PRD（中文）](./docs/PRD.md)、[PRD (English)](./docs/PRD.en.md)、[阶段 0 报告](./docs/phase0-report.md) |

## 本地运行

需要 Node.js 20 或更新版本（开发时用的是 22）和 pnpm 10。

```bash
pnpm install
pnpm --filter @qyplayer/web dev    # 打开 http://localhost:5173/
pnpm test                          # 单元测试
pnpm typecheck                     # 类型检查
pnpm build                         # 构建网页到 apps/web/dist
```

试看示例和制作页的内置配乐需要示例文件。本地从公开素材重新生成：

```bash
pnpm fixtures:fetch    # 下载 CC0 和公有领域素材到 fixtures/downloads（不入库）
pnpm fixtures:build    # 构建示例包，并复制到 apps/web/public/samples（不入库）
```

线上站点的示例文件放在 GitHub Release `samples-v1` 的附件里，部署时下载到站点中。

## 示例素材与许可

仓库本身使用 [Apache-2.0](./LICENSE)。示例照片、视频和音乐都只收 CC0 或公有领域的作品，每一个的作者、来源和许可见 [`fixtures/SOURCES.md`](./fixtures/SOURCES.md)；`pnpm fixtures:check` 会检查下载目录里没有未记录的文件。

## 参与

欢迎提 Issue 和 PR。较大的改动请先对照 [PRD](./docs/PRD.md) 里的范围和待定项（第 14.2 节）。
