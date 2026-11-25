// 导出 MP4 的规格和纯计算（docs/dev-0.3.0.md 第 10 节）：输出参数、帧序号、每个视频素材要取的时间点、音量曲线。
import {VIDEO_AUDIO_FADE_SECONDS, bgmDuckAt, bgmDuckKnots, bgmFadeGainAt, stateAt, videoAudioGain, type FrameState, type Layer, type Manifest} from "@qyplayer/core";

export const EXPORT_FPS = 30;
/** H.264 High Profile，Level 4.0 */
export const EXPORT_VIDEO_CODEC = "avc1.640028";
export const EXPORT_VIDEO_BITRATE = 8_000_000;
/** 关键帧间隔（秒） */
export const EXPORT_KEY_FRAME_INTERVAL = 2;
export const EXPORT_AUDIO_BITRATE = 192_000;
export const EXPORT_SAMPLE_RATE = 48_000;
/** 混音按这个长度分段渲染，避免整部影片的音频同时放在内存里 */
export const AUDIO_WINDOW_SECONDS = 10;
/** 影片超过这个长度（秒）时，导出前要用户确认（文件较大、占内存多） */
export const LONG_EXPORT_SECONDS = 600;
/** 做曲线分段采样的步长（秒） */
const GAIN_STEP_SECONDS = 0.05;

export const exportSize = function exportSize(aspectRatio: Manifest["canvas"]["aspectRatio"]): {
    width: number;
    height: number;
} {
    return aspectRatio === "9:16" ? {width: 1080, height: 1920} : {width: 1920, height: 1080};
};

/** 总帧数：时长乘帧率向上取整（容忍浮点误差），至少一帧 */
export const frameCount = function frameCount(duration: number): number {
    return Math.max(1, Math.ceil((duration * EXPORT_FPS) - 1e-6));
};

/** 这一帧里需要从视频取画面的图层（透明度为 0 的图层不会被画出，也就不取） */
export const videoLayers = function videoLayers(state: FrameState): (Layer & {videoTime: number})[] {
    return state.layers.filter((layer): layer is Layer & {videoTime: number} => layer.kind === "video" && layer.role !== "backdrop" && layer.videoTime !== undefined && layer.opacity > 0);
};

/**
 * 按帧的先后顺序，列出每个视频素材要取画面的时间点（素材内的秒数）。
 * 导出时逐帧按同样的顺序取用，所以解码器只需要从头到尾顺序读一遍，不用反复定位。
 */
export const videoTimestamps = function videoTimestamps(manifest: Manifest): Map<string, number[]> {
    const result = new Map<string, number[]>();
    const total = frameCount(manifest.duration);
    for (let i = 0; i < total; i++) {
        for (const layer of videoLayers(stateAt(manifest, i / EXPORT_FPS))) {
            const list = result.get(layer.assetId);
            if (list) {
                list.push(layer.videoTime);
            } else {
                result.set(layer.assetId, [layer.videoTime]);
            }
        }
    }
    return result;
};

export interface GainPoint {
    time: number;
    gain: number;
}

/** 区间 [a, b] 内的折点；a 大于 b 表示两条渐变重叠，增益是二次曲线，这时按步长采样近似 */
const breakpoints = function breakpoints(a: number, b: number): number[] {
    if (a <= b) {
        return [a, b];
    }
    const points: number[] = [];
    for (let t = b; t < a; t += GAIN_STEP_SECONDS) {
        points.push(t);
    }
    points.push(a);
    return points;
};

/**
 * 把一条分段线性的增益曲线在 [from, to] 内取成折线：两端各一点，中间是落在区间内的折点。
 * 把折线交给 AudioParam 的 linearRampToValueAtTime，就和原曲线完全一致。
 */
// eslint-disable-next-line @stylistic/max-len
export const gainPoints = function gainPoints(gainAt: (time: number) => number, knots: readonly number[], from: number, to: number): GainPoint[] {
    const inside = [...new Set(knots)].filter((t) => t > from && t < to).sort((a, b) => a - b);
    return [from, ...inside, to].map((time) => ({time, gain: gainAt(time)}));
};

/** 背景音乐的音量和首尾淡入淡出在影片时间 [from, to] 内的增益折线（不含压低） */
export const bgmGainCurve = function bgmGainCurve(manifest: Manifest, from: number, to: number): GainPoint[] {
    const bgm = manifest.bgm;
    const duration = manifest.duration;
    const knots = bgm ? breakpoints(bgm.fadeIn ?? 0, duration - (bgm.fadeOut ?? 0)) : [];
    return gainPoints((t) => bgmFadeGainAt(manifest, t), knots, from, to);
};

/** 背景音乐的压低在影片时间 [from, to] 内的增益折线。与 bgmGainCurve 相乘就是实际音量 */
export const bgmDuckCurve = function bgmDuckCurve(manifest: Manifest, from: number, to: number): GainPoint[] {
    return gainPoints((t) => bgmDuckAt(manifest, t), bgmDuckKnots(manifest), from, to);
};

/** 视频原声在页内时间 [from, to] 内的增益折线（没有背景音乐时） */
export const pageGainCurve = function pageGainCurve(pageDuration: number, from: number, to: number): GainPoint[] {
    const fade = VIDEO_AUDIO_FADE_SECONDS;
    return gainPoints((t) => videoAudioGain(t, pageDuration), breakpoints(fade, pageDuration - fade), from, to);
};

/** 按已用时间和进度推算剩余秒数；进度太少时推算不可靠，返回 undefined */
export const remainingSeconds = function remainingSeconds(elapsedMs: number, fraction: number): number | undefined {
    if (fraction < 0.02 || fraction >= 1) {
        return undefined;
    }
    return (elapsedMs / 1000) * ((1 - fraction) / fraction);
};
