// 仅开发使用：阶段 0 实测。检测编解码能力，并对一个 .qyp 包测量播放帧率与拖动定位耗时。
//   /bench.html                                 手动选择文件后点“运行”
//   /bench.html?pkg=<地址>&autorun               开发服务器上直接测某个包
// 结果写入 window.__bench，便于自动化读取，也方便在其他浏览器和设备上重复同样的测量。
import {openPackage} from "@qyplayer/qyp";
import {PlaybackController} from "../player/PlaybackController";

interface Capability {
    name: string;
    result: string;
}

interface Stats {
    count: number;
    p50: number;
    p95: number;
    max: number;
}

interface BenchResult {
    environment: Record<string, string | number>;
    capabilities: Capability[];
    playback?: {
        seconds: number;
        frames: number;
        fps: number;
        intervalMs: Stats;
        droppedOver25ms: number;
        drawMs: Stats;
    };
    seek?: {
        imagePage: Stats;
        videoPage: Stats;
        note: string;
    };
    jsHeapMB?: number;
}

const sleep = async (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const round = (n: number): number => Math.round(n * 100) / 100;

const stats = function stats(values: number[]): Stats {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return {count: sorted.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted[sorted.length - 1] ?? 0)};
};

const supported = async function supported(test: () => Promise<{supported?: boolean} | undefined> | undefined): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return (await test())?.supported ? "支持" : "不支持";
    } catch (error) {
        return `出错：${error instanceof Error ? error.message : String(error)}`;
    }
};

const detectCapabilities = async function detectCapabilities(): Promise<Capability[]> {
    const g = globalThis as unknown as Record<string, any>; // 这里要探测可能不存在的全局接口
    const has = (name: string): string => name in g ? "有" : "无";
    const list: Capability[] = [];
    // eslint-disable-next-line no-void
    const add = async (name: string, test: () => Promise<string> | string): Promise<void> => void list.push({name, result: await test()});

    for (const api of ["VideoDecoder", "VideoEncoder", "AudioDecoder", "AudioEncoder", "ImageDecoder", "OffscreenCanvas", "createImageBitmap"]) {
        await add(`接口 ${api}`, () => has(api));
    }
    await add("接口 requestVideoFrameCallback", () => "requestVideoFrameCallback" in HTMLVideoElement.prototype ? "有" : "无");
    await add("全屏 API", () => "requestFullscreen" in document.documentElement ? "有" : "无");

    const video = {codedWidth: 1920, codedHeight: 1080};
    const encode = {width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30};
    const videoCodecs: [string, string][] = [
        ["H.264", "avc1.640028"],
        ["HEVC", "hvc1.1.6.L120.B0"],
        ["VP9", "vp09.00.10.08"],
        ["AV1", "av01.0.08M.08"],
    ];
    if ("VideoDecoder" in g) {
        for (const [label, codec] of videoCodecs) {
            await add(`WebCodecs 解码 ${label}`, async () => supported(() => g.VideoDecoder.isConfigSupported({codec, ...video})));
        }
    }
    if ("VideoEncoder" in g) {
        for (const [label, codec] of videoCodecs) {
            await add(`WebCodecs 编码 ${label}`, async () => supported(() => g.VideoEncoder.isConfigSupported({codec, ...encode})));
        }
    }
    if ("AudioDecoder" in g) {
        await add("WebCodecs 解码 AAC", async () => supported(() => g.AudioDecoder.isConfigSupported({codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2})));
        await add("WebCodecs 解码 MP3", async () => supported(() => g.AudioDecoder.isConfigSupported({codec: "mp3", sampleRate: 48000, numberOfChannels: 2})));
    }
    if ("AudioEncoder" in g) {
        await add("WebCodecs 编码 AAC", async () => supported(() => g.AudioEncoder.isConfigSupported({codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000})));
    }
    if ("ImageDecoder" in g) {
        for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"]) {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            await add(`ImageDecoder ${type}`, async () => (await g.ImageDecoder.isTypeSupported(type)) ? "支持" : "不支持");
        }
    }
    const media = document.createElement("video");
    const play = async (label: string, type: string): Promise<void> => add(`canPlayType ${label}`, () => media.canPlayType(type) || "不支持");
    await play("H.264 + AAC（mp4）", "video/mp4; codecs=\"avc1.640028, mp4a.40.2\"");
    await play("HEVC（mp4）", "video/mp4; codecs=\"hvc1.1.6.L120.B0\"");
    await play("VP9（webm）", "video/webm; codecs=\"vp09.00.10.08\"");
    await play("AV1（mp4）", "video/mp4; codecs=\"av01.0.08M.08\"");
    await play("MP3", "audio/mpeg");
    await play("AAC（m4a）", "audio/mp4; codecs=\"mp4a.40.2\"");
    return list;
};

const describeEnvironment = function describeEnvironment(): Record<string, string | number> {
    const env: Record<string, string | number> = {
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        screen: `${screen.width}x${screen.height}`,
        hardwareConcurrency: navigator.hardwareConcurrency,
    };
    const memory = (navigator as unknown as {deviceMemory?: number}).deviceMemory;
    if (memory !== undefined) {
        env.deviceMemoryGB = memory;
    }
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && info) {
        env.gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    return env;
};

/** 从头到尾播放整部影片，记录每帧间隔和每次绘制（stateAt + renderFrame + 同步）的耗时 */
const run = async function run(source: Blob, status: (text: string) => void): Promise<BenchResult> {
    const result: BenchResult = {environment: describeEnvironment(), capabilities: await detectCapabilities()};
    status("正在打开包…");
    const opened = await openPackage(source);
    const {pages} = opened.manifest;
    const videoPage = pages.find((p) => p.items.some((i) => opened.manifest.assets.find((a) => a.id === i.assetId)?.type === "video"));
    // 图片页取离起点最远、图最多的一页：回到 0 秒后它已被释放，跳过去要重新读取并解码
    const imagePage = pages
        .filter((p) => p !== videoPage && p.start > 3)
        .sort((a, b) => b.items.length - a.items.length || b.start - a.start)[0];
    const controller = await PlaybackController.create(opened);
    document.body.append(controller.canvas);
    controller.canvas.style.cssText = "width:480px;display:block;margin-top:8px";

    status("正在测量播放（等于影片时长）…");
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    result.playback = await measurePlayback(controller);
    status("正在测量拖动定位…");
    const imageStart = (imagePage?.start ?? 5) + 1;
    const videoStart = (videoPage?.start ?? 5) + 1;
    result.seek = {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        imagePage: await measureSeek(controller, [imageStart], 8),
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        videoPage: await measureSeek(controller, [videoStart], 8),
        note: "单位毫秒；每次先回到 0 秒再跳转，素材近似冷加载",
    };
    const heap = (performance as unknown as {memory?: {usedJSHeapSize: number}}).memory;
    if (heap) {
        result.jsHeapMB = round(heap.usedJSHeapSize / 1024 / 1024);
    }
    controller.dispose();
    return result;
};
const start = async function start(source: Blob): Promise<void> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const result = await run(source, (text) => statusEl.textContent = text);
        (window as unknown as {__bench: BenchResult}).__bench = result;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        out.textContent = JSON.stringify(result, null, 2);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        statusEl.textContent = "完成";
    } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        out.textContent = `失败：${error instanceof Error ? error.message : String(error)}`;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        statusEl.textContent = "";
    }
};
const measurePlayback = async function measurePlayback(controller: PlaybackController): Promise<NonNullable<BenchResult["playback"]>> {
    const probe = controller as unknown as {draw: (t: number) => void};
    const original = probe.draw.bind(controller);
    const drawTimes: number[] = [];
    probe.draw = (t: number): void => {
        const start = performance.now();
        original(t);
        drawTimes.push(performance.now() - start);
    };

    const intervals: number[] = [];
    let last = 0;
    let measuring = true;
    const loop = (now: number): void => {
        if (last) {
            intervals.push(now - last);
        }
        last = now;
        if (measuring) {
            requestAnimationFrame(loop);
        }
    };

    controller.seek(0);
    drawTimes.length = 0;
    const startedAt = performance.now();
    requestAnimationFrame(loop);
    controller.play();
    while (controller.state === "playing") {
        await sleep(100);
    }
    measuring = false;
    const seconds = (performance.now() - startedAt) / 1000;
    probe.draw = original;
    return {
        seconds: round(seconds),
        frames: intervals.length,
        fps: round(intervals.length / seconds),
        intervalMs: stats(intervals),
        droppedOver25ms: intervals.filter((i) => i > 25).length,
        drawMs: stats(drawTimes),
    };
};

/** 反复跳到指定时间，量从 seek() 到画面就绪（素材已加载、视频已定位）的耗时 */
const measureSeek = async function measureSeek(controller: PlaybackController, targets: number[], rounds: number): Promise<Stats> {
    const latencies: number[] = [];
    for (let round = 0; round < rounds; round++) {
        for (const target of targets) {
            controller.seek(0); // 回到起点，让目标处的素材尽量处于未加载状态
            await sleep(300);
            const start = performance.now();
            controller.seek(target);
            while (!controller.isSettled()) {
                await sleep(1);
            }
            latencies.push(performance.now() - start);
        }
    }
    return stats(latencies);
};

const out = document.getElementById("out") as HTMLPreElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const fileInput = document.getElementById("file") as HTMLInputElement;

document.getElementById("run")!.addEventListener("click", () => {
    const file = fileInput.files?.[0];
    if (file) {
        void start(file);
    } else {
        out.textContent = "请先选择 .qyp 文件";
    }
});

const pkg = new URLSearchParams(location.search).get("pkg");
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
if (pkg && new URLSearchParams(location.search).has("autorun")) {
    void fetch(pkg).then(async (r) => r.blob()).then(start);
}
