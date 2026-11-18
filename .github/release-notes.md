## 青云播放器 0.3.0 / qyPlayer 0.3.0

### 中文

- 制作器全新界面：菜单栏、三栏布局（手机上是三个标签页）、自动更新的预览、撤销和重做、打开已有的 `.qyp` 继续编辑。
- 制作器支持 HEIC 照片（内置解码器转成 JPEG）；保存时可以把视频裁剪并转成 H.264 + AAC，包更小、更通用；手机上有素材总量提示和上限。
- 配乐：5 首内置 CC0 曲目（可试听），也可以导入 MP3、M4A、WAV；导入的音乐保存和导出前要确认使用权。
- 导出 MP4（电脑上）：1920×1080（竖屏 1080×1920）、30 帧每秒、H.264 + AAC。
- 包格式 0.2：记录素材类型和转码来源、封面；打开时校验实际体积。旧的 0.1 包仍可以打开，0.2 包不能被 0.2.x 及更早的播放器打开。
- 播放器打开时预检素材，本机解不了的素材显示占位画面并提示；视频原声每页淡入淡出。

这是**预览版**：内容安全策略、许可说明页和真机验收还没有完成，详见 README 的“0.3.0 预览版”一节。

### English

- A new creator interface: menu bar, three-column layout (three tabs on phones), auto-updating preview, undo and redo, and opening an existing `.qyp` to keep editing.
- The creator supports HEIC photos (converted to JPEG with a built-in decoder); on save, videos can be trimmed and converted to H.264 + AAC for smaller, more compatible packages; phones get a total-size warning and a limit.
- Music: 5 built-in CC0 tracks (with preview), plus imported MP3, M4A and WAV; imported music asks you to confirm the rights before saving or exporting.
- MP4 export (on computers): 1920x1080 (1080x1920 for portrait), 30 fps, H.264 + AAC.
- Package format 0.2: records each asset's type and transcoding origin, and a cover; the real size is checked on open. Old 0.1 packages still open; 0.2 packages cannot be opened by players 0.2.x and earlier.
- The player checks the media on open and shows a placeholder with a message for media this device cannot decode; video sound fades in and out on each page.

This is a **preview**: the Content Security Policy, the license notices page and real-device testing are not finished yet; see the "0.3.0 preview" section of the README.

## Windows 版 / Windows downloads

| 文件 / File | 说明 / Description |
| --- | --- |
| `qyPlayer-0.3.0-Setup-x64.exe` | 播放器安装包，装好后双击 .qyp 文件即可播放 / Player installer |
| `qyPlayer-0.3.0-x64-portable.zip` | 播放器免安装版，解压后运行 `qyPlayer.exe` / Player, portable |
| `qyMaker-0.3.0-Setup-x64.exe` | 制作器安装包 / Creator installer |
| `qyMaker-0.3.0-x64-portable.zip` | 制作器免安装版，解压后运行 `qyMaker.exe` / Creator, portable |

系统要求：Windows 10 / 11（64 位）。安装包会在系统缺少 WebView2 时自动安装；免安装版需要系统已有 WebView2（Windows 10 / 11 一般自带）。
Requires Windows 10 / 11 (64-bit). The installers install WebView2 when it is missing; the portable zips need it already present.

这些程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”，点“更多信息”，再点“仍要运行”即可。所有处理都在本机完成，不会上传任何文件。
The programs are not code-signed: if SmartScreen warns about an unknown publisher, click "More info", then "Run anyway". Everything is processed locally; no file is uploaded.
