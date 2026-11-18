## 青云播放器 0.2.1 / qyPlayer 0.2.1

### 中文

- 中文安装时，协议页先显示一段中文说明（以英文原文为准），下面是 Apache License 2.0 的英文原文；英文安装显示英文原文。
- 下载文件名带上版本号，例如 `qyPlayer-0.2.1-Setup-x64.exe`，不会再分不清是哪个版本。

0.2.0 以来没有其他功能变化。从 0.1.0 升级：播放器直接运行新安装包即可覆盖；0.1.0 的制作器叫“qyPlayer 制作器”，新版叫“qyMaker”，不会被识别为升级，请先在“设置 > 应用”里卸载旧版。

### English

- With the Chinese installer, the license page now starts with a short Chinese summary (the English text prevails), followed by the full English text of the Apache License 2.0. The English installer shows the English text only.
- Download file names now include the version, for example `qyPlayer-0.2.1-Setup-x64.exe`.

There are no other functional changes since 0.2.0. Upgrading from 0.1.0: just run the new player installer. The 0.1.0 creator was called "qyPlayer 制作器" and the new one is "qyMaker", so it is not treated as an upgrade; please uninstall the old one from Settings > Apps first.

## Windows 版 / Windows downloads

| 文件 / File | 说明 / Description |
| --- | --- |
| `qyPlayer-0.2.1-Setup-x64.exe` | 播放器安装包，装好后双击 .qyp 文件即可播放 / Player installer |
| `qyPlayer-0.2.1-x64-portable.zip` | 播放器免安装版，解压后运行 `qyPlayer.exe` / Player, portable |
| `qyMaker-0.2.1-Setup-x64.exe` | 制作器安装包 / Creator installer |
| `qyMaker-0.2.1-x64-portable.zip` | 制作器免安装版，解压后运行 `qyMaker.exe` / Creator, portable |

系统要求：Windows 10 / 11（64 位）。安装包会在系统缺少 WebView2 时自动安装；免安装版需要系统已有 WebView2（Windows 10 / 11 一般自带）。
Requires Windows 10 / 11 (64-bit). The installers install WebView2 when it is missing; the portable zips need it already present.

这些程序没有代码签名，第一次运行时 Windows SmartScreen 可能提示“未知发布者”，点“更多信息”，再点“仍要运行”即可。所有处理都在本机完成，不会上传任何文件。
The programs are not code-signed: if SmartScreen warns about an unknown publisher, click "More info", then "Run anyway". Everything is processed locally; no file is uploaded.
