## 青云播放器 0.5.0 / qyPlayer 0.5.0

### 中文

0.5.0 新增 **Android 播放器**，并把“壳打开文件”改成按需读取，Windows 版同时受益。内容包含 0.4.1 的全部内容（单页编辑、可选缩略图条）。

- Android 播放器：Android 10 及以上、arm64，APK 直接下载安装，不上应用商店。
- 用其他应用打开：文件管理器、微信里选“用其他应用打开”就能播放 `.qyp`；注册范围覆盖未知二进制、ZIP 和 `.qyp` 自己的类型，不是 `.qyp` 的文件会给出提示。应用已经打开时再打开一个文件，会换成新的一部。
- 按需读取：打开包时只读清单和封面，素材用到才读；几百 MB 的包不用整个载入内存。桌面版和手机版走同一条路，Windows 上的双击打开也变快了。
- 手机上的播放行为：方向跟随手机旋转；全屏隐藏系统栏；播放时屏幕常亮；返回键依次退出全屏、退出播放、回到首页，首页再按退出应用。
- 发布：Windows 与 Android 在同一个标签、同一个 Release；任一平台构建失败就不发布。
- 已知问题：部分机型的帧率可能达不到 30 帧（手机上的 Canvas 绘制还没有针对性优化）；只提供 arm64 包，32 位设备装不上；手机版只有播放器，制作影片请用 Windows 版或网页版。
- **已知问题（Android 播放界面）**：系统的 Android System WebView 版本较旧时（实测 Android 11 自带 Chrome 83），播放界面可能黑屏。原因是不支持新版 CSS 特性（`inset` 简写、`aspect-ratio`、flex `gap`），本版已改为兼容写法，但未在该机型上完成验证。遇到黑屏请先尝试更新系统的 Android System WebView。

### English

0.5.0 adds the **Android player** and changes how the shell opens a file to on-demand reading, which the Windows builds benefit from too. It includes everything from 0.4.1 (single-page editing, optional thumbnail strip).

- Android player: Android 10 and later, arm64, APK installed directly and not distributed through app stores.
- Open with: play a `.qyp` from a file manager or WeChat via "Open with"; the registration covers unknown binaries, ZIP and the `.qyp` type itself, and a file that is not a `.qyp` gets a clear message. Opening another file while the app is running switches to the new film.
- On-demand reading: opening a package reads only the manifest and the cover, media is read when it is needed, so a several-hundred-MB package does not have to be loaded into memory. Desktop and mobile share this path, so double-clicking a file on Windows is faster too.
- Phone behaviour: rotation follows the phone, fullscreen hides the system bars, the screen stays on while playing, and the back button leaves fullscreen, then the player, then the home screen; pressing it on the home screen exits the app.
- Release: Windows and Android ship under one tag and one Release; if either platform fails to build, nothing is published.
- Known issues: some phones may not reach 30 fps (Canvas drawing on mobile has not been tuned yet); only an arm64 build is provided, so 32-bit devices cannot install it; the mobile build is player-only, so use the Windows or web version to create films.
- **Known issue (Android player screen)**: when the system Android System WebView is old (Chrome 83 is what Android 11 ships in some regions), the playback screen may stay black because newer CSS features (`inset` shorthand, `aspect-ratio`, flex `gap`) are unsupported. This release switches to compatible CSS, but it has not been verified on that device yet. If you see a black screen, try updating Android System WebView first.

## 下载 / Downloads

| 文件 / File | 说明 / Description |
| --- | --- |
| `qyPlayer-0.5.0-Setup-x64.exe` | 播放器安装包，装好后双击 .qyp 文件即可播放 / Player installer |
| `qyPlayer-0.5.0-x64-portable.zip` | 播放器免安装版，解压后运行 `qyPlayer.exe` / Player, portable |
| `qyMaker-0.5.0-Setup-x64.exe` | 制作器安装包 / Creator installer |
| `qyMaker-0.5.0-x64-portable.zip` | 制作器免安装版，解压后运行 `qyMaker.exe` / Creator, portable |
| `qyPlayer-0.5.0-android-arm64.apk` | Android 播放器，Android 10 及以上、arm64 / Android player, Android 10+ on arm64 |

系统要求：Windows 10 / 11（64 位）；Android 10 及以上（arm64）。安装包会在系统缺少 WebView2 时自动安装；免安装版需要系统已有 WebView2（Windows 10 / 11 一般自带）。
Requires Windows 10 / 11 (64-bit), or Android 10 and later on arm64. The installers install WebView2 when it is missing; the portable zips need it already present.

Android 首次安装要允许“安装未知来源应用”：在文件管理器里点开 APK，按提示在系统设置里为这个来源打开权限。
On Android, the first install has to allow "install unknown apps": open the APK in your file manager and allow that source in the system settings when prompted.

这些程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”，点“更多信息”，再点“仍要运行”即可。所有处理都在本机完成，不会上传任何文件。
The programs are not code-signed: if SmartScreen warns about an unknown publisher, click "More info", then "Run anyway". Everything is processed locally; no file is uploaded.
