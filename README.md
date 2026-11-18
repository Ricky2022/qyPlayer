# 青云播放器 qyPlayer

<img src="./assets/icons/qyplayer.svg" alt="青云播放器" width="96"> <img src="./assets/icons/qymaker.svg" alt="青云制作器" width="96">

[English](./README.en.md) | 中文

青云播放器（英文名 qyPlayer）是一个开源、跨平台、本地优先的“回忆影片”播放器，以及配套的 `.qyp` 影片包格式。效果类似苹果照片 App 的“回忆”：把一组照片和视频，配上音乐，自动编排成带转场和入场动画的影片。

**所有处理都在你的浏览器里完成，文件不会上传到任何服务器。没有账号，没有后端。**

## 在线试用

- 播放器：<https://ricky2022.github.io/qyPlayer/>，打开或拖入 `.qyp` 文件，也可以直接试看内置示例。
- 制作页：<https://ricky2022.github.io/qyPlayer/create.html>，选照片和视频，选模板和配乐，生成 `.qyp` 并下载。

界面有中文和英文两种：默认跟随系统语言，右上角可以切换，选择会被记住。

## 下载 Windows 版

播放器（青云播放器 / qyPlayer）和制作器（青云制作器 / qyMaker）是两个独立的程序，都只在本机运行。需要 Windows 10 / 11（64 位）。

| 程序 | 安装包 | 免安装版 |
| --- | --- | --- |
| 播放器 | [qyPlayer-Setup-x64.exe](https://github.com/Ricky2022/qyPlayer/releases/latest/download/qyPlayer-Setup-x64.exe) | [qyPlayer-x64-portable.zip](https://github.com/Ricky2022/qyPlayer/releases/latest/download/qyPlayer-x64-portable.zip) |
| 制作器 | [qyMaker-Setup-x64.exe](https://github.com/Ricky2022/qyPlayer/releases/latest/download/qyMaker-Setup-x64.exe) | [qyMaker-x64-portable.zip](https://github.com/Ricky2022/qyPlayer/releases/latest/download/qyMaker-x64-portable.zip) |

所有版本见 [Releases](https://github.com/Ricky2022/qyPlayer/releases)。

- 安装包不需要管理员权限，安装语言跟随系统（中文或英文），可以选择安装目录、是否建桌面快捷方式、装完是否立即运行；重复运行会直接覆盖升级。装好后在资源管理器里双击 `.qyp` 文件就会用播放器打开，文件图标也是青云的。
- 卸载在“设置 > 应用”里，也可以用开始菜单里的“卸载”快捷方式。卸载会清掉快捷方式、注册表和 `.qyp` 关联，勾选“删除应用程序数据”还会删除程序的缓存数据；你自己的 `.qyp` 文件不会被动。
- 播放器不再带内置配乐，体积更小；内置配乐只在制作器里。
- 从 0.1.0 升级：播放器的安装包直接覆盖即可。0.1.0 的制作器叫“qyPlayer 制作器”，新版叫“qyMaker”，不会被识别为升级，请先在“设置 > 应用”里卸载旧版。
- 免安装版解压后直接运行 `qyPlayer.exe` 或 `qyMaker.exe`；需要系统已有 WebView2（Windows 10 / 11 一般自带）。安装包会在缺少时自动安装。
- 程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”：点“更多信息”，再点“仍要运行”。
- 桌面版就是把网页版装进系统自带的 WebView2 窗口里，功能和限制与网页版一致。

## 当前状态

处于**阶段 0（技术预研）**：做了 Web 版和一个 Windows 桌面壳，用来验证技术路线。macOS、手机端、MP4 导出、AI 编排都还没有开始。

0.2.0 的变化：播放器改成沉浸式界面（控制条自动隐藏、大播放按钮、快捷键）；中英双语界面；新增“关于”页；全新的 Q + 云图标（播放器带播放三角，制作器带铅笔），`.qyp` 文件也有专用图标；Windows 安装包重做（见上）。

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

TypeScript（严格模式）、React 19、react-jss、Vite、Vitest、pnpm workspace。Canvas 2D 渲染，zip.js 读写包，Ajv 校验清单，music-metadata 检查音视频格式。Windows 桌面版用 Tauri 2（Rust）。

## 目录结构

| 目录 | 内容 |
| --- | --- |
| `packages/core` | 清单类型与校验、时间线引擎 `stateAt`、规则式生成器 |
| `packages/renderer` | 把时间线状态画到 Canvas 2D 的渲染器 |
| `packages/qyp` | `.qyp` 的读写、安全校验、一致性测试包、音视频格式检查 |
| `apps/web` | 网页：播放器（`index.html`）和制作页（`create.html`） |
| `apps/desktop-player`、`apps/desktop-maker` | Windows 桌面版的 Tauri 工程：播放器和制作器，共用 `apps/web` 的构建产物 |
| `apps/desktop-common` | 两个桌面程序共用的 Rust 代码，以及安装包的 NSIS 模板 |
| `assets` | 图标源文件（SVG）和生成脚本、安装向导图片的生成脚本 |
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

Windows 桌面版由 GitHub Actions 构建：推送 `v*` 标签（如 `v0.2.0`，要与两个 `tauri.conf.json` 里的版本号一致）会自动发布 Release；也可以在 Actions 页手动运行 “Release Windows apps” 只构建、不发布。本地构建需要 Rust 工具链和 MSVC 生成工具：先 `pnpm --filter @qyplayer/web build:player`，再 `pnpm --filter @qyplayer/desktop-player bundle`；制作器用 `build:maker` 和 `@qyplayer/desktop-maker`（播放器的构建不含内置配乐，制作器的含）。

## 示例素材与许可

仓库本身使用 [Apache-2.0](./LICENSE)。示例照片、视频和音乐都只收 CC0 或公有领域的作品，每一个的作者、来源和许可见 [`fixtures/SOURCES.md`](./fixtures/SOURCES.md)；`pnpm fixtures:check` 会检查下载目录里没有未记录的文件。

## 参与

欢迎提 Issue 和 PR。较大的改动请先对照 [PRD](./docs/PRD.md) 里的范围和待定项（第 14.2 节）。
