# S0 技术验证报告（0.3.0）

日期：2026-11-18。对象：[mediabunny](https://github.com/Vanilagy/mediabunny) 1.66.0，对照 [dev-0.3.0.md](dev-0.3.0.md) 9.1 的 6 项条件。

## 结论

**采用 mediabunny，不启用 `mp4box.js` + `mp4-muxer` 备选。** 6 项条件全部满足，但第 1 项缺少 iPhone 真机样本，只做了等价验证（见“未验证”）。

## 测试环境和样本

| 项目 | 内容 |
| --- | --- |
| 浏览器 | Chrome 157（Windows 10，独立配置目录）和 Cursor 内置浏览器（Chrome 150 内核），两者结果一致 |
| 编解码支持 | `VideoEncoder`/`VideoDecoder`：H.264、HEVC、VP9 全部支持；`AudioEncoder`/`AudioDecoder`：AAC-LC 支持 |
| 视频 1 | 用户提供，H.264 `avc1.64001f`，540×960 竖屏，0.67 秒，AAC 44.1 kHz 立体声 |
| 视频 2 | 仓库已有 `artemis2-rollout.mp4`，H.264 `avc1.4d401f`，1080×608，12.2 秒，AAC 48 kHz（音轨解码后峰值为 0） |
| 音频 | 维基共享资源 [Piano-phrase.wav](https://commons.wikimedia.org/wiki/File:Piano-phrase.wav)（CC BY 3.0），PCM 16 位，44.1 kHz 单声道，3.85 秒。仅本地测试，不进仓库 |
| HEVC 替代样本 | 用 Chrome 的 HEVC 编码器生成 MOV：`hvc1.1.2.L120.90`，编码尺寸 540×960，旋转 90°，创建时间 2026-03-04 |

样本放在 `fixtures/downloads/s0/`（已被 `.gitignore` 忽略）。验证页面是临时的，验证后已删除，没有进仓库。

## 逐项结果

| # | 条件 | 结果 | 依据 |
| --- | --- | --- | --- |
| 1 | 读取容器、编码字符串、音频编码、显示尺寸（含旋转）、时长、创建时间 | 满足（HEVC 为替代样本） | 读出 `MP4`/`QuickTime File Format`/`WAVE`；视频编码字符串 `avc1.64001f`、`hvc1.1.2.L120.90`；音频 `mp4a.40.2`、`pcm-s16`；HEVC 样本显示 960×540、编码 540×960、`rotation` 为 90；创建时间 `getMetadataTags().creationTime` 正确读出 |
| 2 | 裁剪 `[a, b]` 并转 H.264 + AAC 的 MP4，Chrome 可播放 | 满足 | 视频 2 裁 `[3, 6]`：输出 3.008 秒，`avc1.640032` + `mp4a.40.2` 48 kHz 立体声，`<video>` 可播放且时间推进；用户竖屏视频转后仍是 540×960；旋转 HEVC 转后为 H.264，旋转信息保留；WAV 转 AAC 后解码回读峰值 0.52，声音正常 |
| 3 | 逐帧取画面和解码音频 | 满足 | `CanvasSink` 取 `[4, 5)` 得 30 帧（`HTMLCanvasElement`，内容非黑）；`AudioBufferSink` 对 AAC 和 WAV 都能得到 `AudioBuffer`（WAV 3.846 秒，AAC 回读 3.861 秒） |
| 4 | 用画布帧和 `AudioBuffer` 编码封装 MP4 | 满足 | `CanvasSource` 60 帧 + `AudioBufferSource` 2 秒正弦波，输出 MP4 2.005 秒，H.264 + AAC，可播放 |
| 5 | 取消并释放资源 | 满足，接口不同 | mediabunny 没有 `AbortSignal` 参数，用 `Conversion.cancel()`；监听 `AbortSignal` 的 `abort` 事件后调用即可。取消后 `execute()` 以 `ConversionCanceledError` 拒绝，`conversion.state` 和 `output.state` 都是 `canceled`；我包装了 `VideoEncoder`/`VideoDecoder`/`AudioEncoder`/`AudioDecoder`，取消后仍未关闭的实例数为 0 |
| 6 | 许可证 | 满足 | npm 包和 `LICENSE` 文件均为 MPL-2.0 |

性能参考（本机，仅作量级）：1080×608 视频裁 3 秒并转码约 0.5 秒。

## 对后续步骤的影响

1. **规格里的接口名要改**：取消用 `Conversion.cancel()`；缩放要同时给 `width`、`height`、`fit`，或只给其中一个，不给 `fit` 会抛 `TypeError`。
2. **目标尺寸自行计算**：横屏不超过 1920×1080，竖屏不超过 1080×1920，不放大，取偶数。直接把 1920×1080 当固定尺寸会把竖屏视频放进横屏画布（验证时踩到）。
3. **旋转不会被烘焙**：转码后仍以元数据保存旋转，浏览器播放时自动应用。这与 3A 节“显示尺寸含旋转”的假设一致。
4. **转码后的创建时间是当前时间**：拍摄时间必须在转码前从源文件读出并写入清单（编辑状态里已有 `capturedAt`），不能依赖输出文件。
5. **HEVC 转码依赖浏览器的 HEVC 解码**：本机支持，但没装 HEVC 视频扩展的 Windows、部分 Linux 的 Chrome 会不支持。S5 要先用 `track.canDecode()` 判断，不支持时走“无法转码”提示，不能直接失败。
6. **体积**：把本验证用到的功能打成一个包约 615 KB，gzip 后约 157 KB（含全部输入格式）。制作器按需动态加载即可，播放器不加载。
7. **NOTICE**：需要登记 mediabunny 1.66.0、MPL-2.0、源码地址，未修改。

## 未验证

- **iPhone 的 HEIC 照片和 HEVC MOV**：没有真机样本。HEVC 用 Chrome 编码器生成的 MOV 替代，覆盖了编码字符串、旋转和创建时间，但没有覆盖 iPhone 常见的 HDR（`hvc1.2.4.L…`，Dolby Vision）和多个音轨等情况。HEIC 解码属于 libheif-js，不在 S0 范围，S5 再验证。
- **WebView2 和 Safari**：桌面制作器用 WebView2（本机 155 版），没能用 Edge 启动调试，只测了同内核的 Chrome 157 和 Chromium 150。Safari 和手机浏览器没测。
- **后台标签页**：第一次在被遮挡的 Chrome 窗口里运行时，转码步骤没有完成（加了不降频参数后正常）。没有定位是转码本身暂停，还是验证页的 `<video>` 播放在隐藏页面里不推进。S5 做转码时需要单独验证，必要时提示“转码期间请保持页面在前台”。
- **长视频和大文件**：最长只测了 12 秒。
