## 青云播放器 0.4.0 / qyPlayer 0.4.0

### 中文

0.4.0 参照苹果“照片”里的回忆影片，优化画面观感和播放体验，并包含 0.3.0 预览版的全部内容（0.3.0 没有发布正式 Release）。

- 画面：留空处画模糊背景；拼图改成卡片式；单张照片页有缓慢的推拉平移。
- 转场新增“旋转”，制作器里可以单独选择转场；新增 5 款滤镜（原片、黑白、暖色、冷色、怀旧）。
- 片头标题：开头淡入淡出的标题和可选的副标题，制作时画成图片放进包里，可以关闭。
- 影片时长分长、中、短三档；没选用的素材不进包。
- 播放器：上一页、下一页按钮（PageUp、PageDown）和底部缩略图条。
- 包格式 0.3（只增加可选字段）：0.1、0.2、0.3 的包都能打开；0.3.0 预览版打不开 0.3 的包，请升级。
- 来自 0.3.0：全新制作器界面、HEIC 照片、保存时转码、5 首内置 CC0 配乐、导入 MP3 / M4A / WAV、导出 MP4、包格式 0.2、播放前素材预检。
- 安全与构建：桌面程序启用内容安全策略；制作器保存文件先写临时文件再改名；Rust 依赖由 `Cargo.lock` 固定；“关于”页和 `NOTICE` 补上 libheif（LGPL-3.0）、mediabunny（MPL-2.0）等许可说明。

### English

0.4.0 polishes the look and playback after the memory movies in Apple Photos, and includes everything from the 0.3.0 preview (0.3.0 never had an official Release).

- Picture: a blurred backdrop in empty areas; collages are now cards; single-photo pages get a slow push and pan.
- A new "rotate" transition, and the creator can pick the transition; 5 filters (original, black and white, warm, cool, vintage).
- Opening title: a title and an optional subtitle that fade in and out at the start, drawn into a picture inside the package; it can be turned off.
- Three lengths (long, medium, short); media that are not used stay out of the package.
- Player: previous and next page buttons (PageUp, PageDown) and a thumbnail strip at the bottom.
- Package format 0.3 (only optional fields added): packages of 0.1, 0.2 and 0.3 open; the 0.3.0 preview cannot open 0.3 packages, so please upgrade.
- From 0.3.0: a new creator interface, HEIC photos, transcoding on save, 5 built-in CC0 tracks, importing MP3 / M4A / WAV, MP4 export, package format 0.2, and a media check before playback.
- Security and build: the desktop apps run with a Content Security Policy; the creator writes a temporary file and renames it on save; Rust dependencies are pinned by `Cargo.lock`; the About page and `NOTICE` now carry the licenses of libheif (LGPL-3.0), mediabunny (MPL-2.0) and others.

## Windows 版 / Windows downloads

| 文件 / File | 说明 / Description |
| --- | --- |
| `qyPlayer-0.4.0-Setup-x64.exe` | 播放器安装包，装好后双击 .qyp 文件即可播放 / Player installer |
| `qyPlayer-0.4.0-x64-portable.zip` | 播放器免安装版，解压后运行 `qyPlayer.exe` / Player, portable |
| `qyMaker-0.4.0-Setup-x64.exe` | 制作器安装包 / Creator installer |
| `qyMaker-0.4.0-x64-portable.zip` | 制作器免安装版，解压后运行 `qyMaker.exe` / Creator, portable |

系统要求：Windows 10 / 11（64 位）。安装包会在系统缺少 WebView2 时自动安装；免安装版需要系统已有 WebView2（Windows 10 / 11 一般自带）。
Requires Windows 10 / 11 (64-bit). The installers install WebView2 when it is missing; the portable zips need it already present.

这些程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”，点“更多信息”，再点“仍要运行”即可。所有处理都在本机完成，不会上传任何文件。
The programs are not code-signed: if SmartScreen warns about an unknown publisher, click "More info", then "Run anyway". Everything is processed locally; no file is uploaded.
