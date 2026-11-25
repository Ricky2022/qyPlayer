// 导出 MP4 的编码主循环（docs/dev-0.3.0.md 10.3、10.4、10.6）。
// 视频逐帧用 stateAt + renderFrame 画到画布再编码；音频分段混音后编码。两路同时进行，互相等对方跟上。
import {stateAt, type Manifest} from "@qyplayer/core";
import {renderFrame} from "@qyplayer/renderer";
import {AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output} from "mediabunny";
import {patchAvcLevel} from "../transcode/avcLevel";
import {abortError} from "../transcode/run";
import {createAudioMixer} from "./audio";
import {createFrameProvider} from "./frames";
import {
    EXPORT_AUDIO_BITRATE,
    EXPORT_FPS,
    EXPORT_KEY_FRAME_INTERVAL,
    EXPORT_VIDEO_BITRATE,
    EXPORT_VIDEO_CODEC,
    exportSize,
    frameCount,
    remainingSeconds,
} from "./spec";

export interface ExportProgress {
    /** 0 到 1，已渲染帧数占总帧数的比例 */
    fraction: number;
    /** 预计剩余秒数；刚开始、推算不可靠时没有 */
    remainingSeconds?: number;
}

export interface ExportRequest {
    manifest: Manifest;
    readBlob: (path: string) => Promise<Blob>;
    signal: AbortSignal;
    onProgress?: (progress: ExportProgress) => void;
}

/** 进度回调的最短间隔（毫秒），避免每一帧都刷新界面 */
const PROGRESS_INTERVAL_MS = 250;

/**
 * 把影片导出成 MP4，返回文件内容。取消（signal 中止）时抛出 AbortError，不产生任何结果；
 * 其他失败抛出原始错误，由调用方显示。
 */
export const exportMp4 = async function exportMp4(request: ExportRequest): Promise<Blob> {
    const {manifest, readBlob, signal, onProgress} = request;
    if (signal.aborted) {
        throw abortError();
    }
    const {width, height} = exportSize(manifest.canvas.aspectRatio);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("export: canvas is not available");
    }

    const target = new BufferTarget();
    const output = new Output({format: new Mp4OutputFormat({fastStart: "in-memory"}), target});
    const videoSource = new CanvasSource(canvas, {
        codec: "avc",
        bitrate: EXPORT_VIDEO_BITRATE,
        keyFrameInterval: EXPORT_KEY_FRAME_INTERVAL,
        fullCodecString: EXPORT_VIDEO_CODEC,
    });
    const audioSource = new AudioBufferSource({codec: "aac", bitrate: EXPORT_AUDIO_BITRATE});
    output.addVideoTrack(videoSource, {frameRate: EXPORT_FPS});
    output.addAudioTrack(audioSource);

    const frames = createFrameProvider(manifest, readBlob);
    const mixer = createAudioMixer(manifest, readBlob);
    // 任一路出错或外部取消，另一路也要尽快停下
    const stop = new AbortController();
    const onAbort = (): void => stop.abort();
    signal.addEventListener("abort", onAbort);

    const total = frameCount(manifest.duration);
    const started = performance.now();
    let reportedAt = 0;

    const videoLoop = async (): Promise<void> => {
        for (let i = 0; i < total; i++) {
            if (stop.signal.aborted) {
                throw abortError();
            }
            const state = stateAt(manifest, i / EXPORT_FPS);
            await frames.prepare(state);
            renderFrame(ctx, manifest, state, frames.resolve);
            await videoSource.add(i / EXPORT_FPS, 1 / EXPORT_FPS);
            const now = performance.now();
            const fraction = (i + 1) / total;
            if (onProgress && (now - reportedAt >= PROGRESS_INTERVAL_MS || i + 1 === total)) {
                reportedAt = now;
                const remaining = remainingSeconds(now - started, fraction);
                onProgress({fraction, ...remaining !== undefined && {remainingSeconds: remaining}});
            }
        }
    };

    const audioLoop = async (): Promise<void> => {
        for (let k = 0; k < mixer.windowCount; k++) {
            if (stop.signal.aborted) {
                throw abortError();
            }
            await audioSource.add(await mixer.render(k));
        }
    };

    const guarded = async (loop: () => Promise<void>): Promise<void> => {
        try {
            await loop();
        } catch (error) {
            stop.abort();
            throw error;
        }
    };

    try {
        await output.start();
        await Promise.all([guarded(videoLoop), guarded(audioLoop)]);
        if (signal.aborted) {
            throw abortError();
        }
        await output.finalize();
        if (!target.buffer) {
            throw new Error("export: no output");
        }
        const raw = new Blob([target.buffer], {type: "video/mp4"});
        const patched = await patchAvcLevel(raw, {fps: EXPORT_FPS, bitrate: EXPORT_VIDEO_BITRATE});
        return patched.blob;
    } catch (error) {
        await output.cancel().catch(() => undefined);
        throw signal.aborted ? abortError() : error;
    } finally {
        signal.removeEventListener("abort", onAbort);
        frames.dispose();
        mixer.dispose();
    }
};
