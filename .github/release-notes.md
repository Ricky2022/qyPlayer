## 青云播放器 0.5.1 / qyPlayer 0.5.1

### 中文

0.5.1 修掉 Android 上播放界面黑屏的问题，并改善手机上看影片的观感。其余功能与 0.5.0 相同（Android 播放器、按需读取、用其他应用打开、返回键逐级返回、播放时常亮）。

- 黑屏修复：手机用的是系统自带 WebView，版本可能很旧（实测 Android 11 自带 Chrome 83）。播放界面原来用了 `inset` 简写、`aspect-ratio`、flex `gap` 等新 CSS，旧 WebView 不支持，播放区域被算成 0×0；现在改成兼容写法，画布尺寸由脚本按可用空间计算。
- 竖屏看横屏影片不再四周死黑：把当前画面模糊、压暗后铺满背景，影片本身做成带圆角和投影的卡片，观感接近 Apple 影集的播放界面。
- 播放时不再叠片头标题（第一页左下角的片名）。制作时勾选「显示标题」的话，预览和导出的 MP4 仍会带上。
- 安卓上的视频原声：视频常常在按下播放很久以后才出现，系统原来只允许在那一次点击里出声，所以画面在走、没有声音。现在可以稍后出声。
- 已知问题：部分机型的帧率可能达不到 30 帧；只提供 arm64 包，32 位设备装不上；手机版只有播放器，制作影片请用 Windows 版或网页版。没有背景音乐时，照片页本来就没有声音，只有带音轨的视频页才出声。

### English

0.5.1 fixes the black playback screen on Android and improves how a film looks on a phone. Everything else is the same as 0.5.0 (Android player, on-demand reading, "Open with", step-by-step back button, screen kept on while playing).

- Black screen fix: phones use the system WebView, which can be old (Chrome 83 ships on some Android 11 devices). The player used newer CSS (`inset` shorthand, `aspect-ratio`, flex `gap`) that the old WebView does not support, so the playback area collapsed to 0×0. It now uses compatible CSS and sizes the canvas in script.
- A landscape film in portrait no longer sits in a sea of black: the current frame is blurred and dimmed to fill the background, and the film itself is a rounded card with a soft shadow, close to the Apple Memories player.
- Playback no longer draws the opening title in the lower left of the first page. The creator preview and an exported MP4 still include it when "Show title" is on.
- Video sound on Android: a clip often starts long after play is pressed, and the system used to allow sound only during that tap, so the picture moved without audio. Sound can now start later.
- Known issues: some phones may not reach 30 fps; only an arm64 build is provided, so 32-bit devices cannot install it; the mobile build is player-only, so use the Windows or web version to create films. With no background music, photo pages are silent; only a video page with an audio track makes sound.

## 下载 / Downloads

| 文件 / File | 说明 / Description |
| --- | --- |
| `qyPlayer-0.5.1-Setup-x64.exe` | 播放器安装包，装好后双击 .qyp 文件即可播放 / Player installer |
| `qyPlayer-0.5.1-x64-portable.zip` | 播放器免安装版，解压后运行 `qyPlayer.exe` / Player, portable |
| `qyMaker-0.5.1-Setup-x64.exe` | 制作器安装包 / Creator installer |
| `qyMaker-0.5.1-x64-portable.zip` | 制作器免安装版，解压后运行 `qyMaker.exe` / Creator, portable |
| `qyPlayer-0.5.1-android-arm64.apk` | Android 播放器，Android 10 及以上、arm64 / Android player, Android 10+ on arm64 |

系统要求：Windows 10 / 11（64 位）；Android 10 及以上（arm64），系统的 Android System WebView 80 及以上。
Requires Windows 10 / 11 (64-bit), or Android 10 and later on arm64 with Android System WebView 80 or later.

Android 首次安装要允许“安装未知来源应用”：在文件管理器里点开 APK，按提示在系统设置里为这个来源打开权限。
On Android, the first install has to allow "install unknown apps": open the APK in your file manager and allow that source in the system settings when prompted.

这些程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”，点“更多信息”，再点“仍要运行”即可。所有处理都在本机完成，不会上传任何文件。
The programs are not code-signed: if SmartScreen warns about an unknown publisher, click "More info", then "Run anyway". Everything is processed locally; no file is uploaded.
