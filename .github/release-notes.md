## 青云播放器 0.2.0 / qyPlayer 0.2.0

### 中文

**新增与改进**

- 播放器改成沉浸式界面：控制条自动隐藏，中央大播放按钮，进度和音量条，快捷键。
- 中英双语界面：默认跟随系统语言，右上角可切换并记住选择。程序名：青云播放器 / 青云制作器（英文 qyPlayer / qyMaker）。
- 新增“关于”页：版本、许可、作者、源码和下载页。
- 全新图标：Q + 云（播放器带播放三角，制作器带铅笔），`.qyp` 文件也有专用图标。
- 播放器瘦身：内置配乐只放在制作器里，播放器安装包从约 4.8 MB 降到约 1.4 MB。
- 安装包重做：安装语言跟随系统，可选安装目录、桌面快捷方式、装完立即运行，重复运行直接覆盖升级；在“设置 > 应用”里有卸载入口，卸载会清掉快捷方式、注册表和 `.qyp` 关联，并可勾选同时删除应用程序数据。

**从 0.1.0 升级**：播放器直接运行新安装包即可覆盖。0.1.0 的制作器叫“qyPlayer 制作器”，新版叫“qyMaker”，不会被识别为升级，请先在“设置 > 应用”里卸载旧版。

### English

**What's new**

- Immersive player: auto-hiding controls, a big play button, seek and volume sliders, keyboard shortcuts.
- Bilingual Chinese / English interface that follows the system language; switch in the top-right corner and it is remembered. Names: qyPlayer / qyMaker (青云播放器 / 青云制作器).
- New About page: version, license, author, source code and downloads.
- New Q + cloud icons (a play triangle for the player, a pencil for the creator) and a dedicated `.qyp` file icon.
- Slimmer player: the built-in music is now only in the creator; the player installer shrinks from about 4.8 MB to about 1.4 MB.
- Reworked installer: language follows the system, choose the install folder, desktop shortcut and run-after-install, in-place upgrade, an entry in Settings > Apps, and a clean uninstall (shortcuts, registry, `.qyp` association) with an optional "Delete the application data" checkbox.

**Upgrading from 0.1.0**: just run the new player installer. The 0.1.0 creator was called "qyPlayer 制作器" and the new one is "qyMaker", so it is not treated as an upgrade; please uninstall the old one from Settings > Apps first.

## Windows 版 / Windows downloads

| 文件 / File | 说明 / Description |
| --- | --- |
| `qyPlayer-Setup-x64.exe` | 播放器安装包，装好后双击 .qyp 文件即可播放 / Player installer |
| `qyPlayer-x64-portable.zip` | 播放器免安装版，解压后运行 `qyPlayer.exe` / Player, portable |
| `qyMaker-Setup-x64.exe` | 制作器安装包 / Creator installer |
| `qyMaker-x64-portable.zip` | 制作器免安装版，解压后运行 `qyMaker.exe` / Creator, portable |

系统要求：Windows 10 / 11（64 位）。安装包会在系统缺少 WebView2 时自动安装；免安装版需要系统已有 WebView2（Windows 10 / 11 一般自带）。
Requires Windows 10 / 11 (64-bit). The installers install WebView2 when it is missing; the portable zips need it already present.

这些程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”，点“更多信息”，再点“仍要运行”即可。所有处理都在本机完成，不会上传任何文件。
The programs are not code-signed: if SmartScreen warns about an unknown publisher, click "More info", then "Run anyway". Everything is processed locally; no file is uploaded.
