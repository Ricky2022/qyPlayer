// 浏览器里的转码实现（docs/dev-0.3.0.md 5.5）：图片用画布编码为 JPEG，视频和 WAV 用 mediabunny（WebCodecs）。
import {ALL_FORMATS, BlobSource, BufferTarget, Conversion, ConversionCanceledError, Input, Mp4OutputFormat, Output, type ConversionOptions} from "mediabunny";
import {convertToJpeg} from "../importers";
import {probeVideo} from "../probeVideo";
import {abortError, type TranscodeWorkers} from "./run";
import {patchAvcLevel} from "./avcLevel";
import {fitVideoSize, VIDEO_BITRATE, VIDEO_MAX_FPS} from "./size";

const AUDIO_BITRATE = 192_000;
const AUDIO_SAMPLE_RATE = 48_000;
const AAC_MIME_TYPE = "audio/mp4; codecs=\"mp4a.40.2\"";

/** 这些原因表示素材里有轨道无法解码或编码；静默丢掉会让影片缺画面或缺声音，必须当作失败 */
const FATAL_DISCARD_REASONS = new Set(["undecodable_source_codec", "unknown_source_codec", "no_encodable_target_codec"]);

/** 用 mediabunny 转成 MP4，返回文件内容。signal 中止时取消并抛出 AbortError */
const convertToMp4 = async function convertToMp4(
    blob: Blob,
    options: Pick<ConversionOptions, "trim" | "video" | "audio">,
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
): Promise<Blob> {
    const input = new Input({source: new BlobSource(blob), formats: ALL_FORMATS});
    const target = new BufferTarget();
    const output = new Output({format: new Mp4OutputFormat({fastStart: "in-memory"}), target});
    try {
    // 一律重新编码：需要裁剪片段，不能无损裁剪（5.5）
        const conversion = await Conversion.init({input, output, copy: false, showWarnings: false, ...options});
        const lost = conversion.discardedTracks.find((d) => FATAL_DISCARD_REASONS.has(d.reason));
        if (!conversion.isValid || lost) {
            throw new Error(`transcode: ${lost?.reason ?? "conversion is not valid"}`);
        }
        conversion.onProgress = onProgress;
        // eslint-disable-next-line no-void
        const cancel = (): void => void conversion.cancel();
        signal.addEventListener("abort", cancel);
        if (signal.aborted) {
            cancel();
        }
        try {
            await conversion.execute();
        } catch (error) {
            throw error instanceof ConversionCanceledError ? abortError() : error;
        } finally {
            signal.removeEventListener("abort", cancel);
        }
        if (!target.buffer) {
            throw new Error("transcode: no output");
        }
        return new Blob([target.buffer], {type: "video/mp4"});
    } finally {
        input.dispose();
    }
};

export const browserWorkers: TranscodeWorkers = {
    async image(blob, mimeType, signal) {
        if (signal.aborted) {
            throw abortError();
        }
        const jpeg = await convertToJpeg(blob, mimeType);
        return {...jpeg, mimeType: "image/jpeg"};
    },

    async video(blob, entry, range, onProgress, signal) {
        const end = Math.min(range.end, entry.duration ?? range.end);
        const out = await convertToMp4(
            blob,
            {
                trim: {start: range.start, end},
                video: async (track) => {
                    // eslint-disable-next-line @stylistic/max-len
                    const [width, height, stats] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight(), track.computePacketStats(120)]);
                    const fitted = fitVideoSize(width, height);
                    return {
                        codec: "avc",
                        bitrate: VIDEO_BITRATE,
                        // 只限制上限：源视频帧率低于 30 时保持原样
                        ...stats.averagePacketRate > VIDEO_MAX_FPS + 0.5 && {frameRate: VIDEO_MAX_FPS},
                        ...fitted && {...fitted, fit: "fill" as const},
                    };
                },
                audio: {codec: "aac", bitrate: AUDIO_BITRATE, sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: 2},
            },
            onProgress,
            signal,
        );
        // 编码器把级别写成 5.0 时改回码流实际需要的级别，清单里的 mimeType 随之是新级别
        const patched = await patchAvcLevel(out, {fps: VIDEO_MAX_FPS, bitrate: VIDEO_BITRATE});
        const info = await probeVideo(patched.blob, entry.fileName);
        return {blob: patched.blob, mimeType: info.mimeType, width: info.width, height: info.height, duration: end - range.start};
    },

    async audio(blob, onProgress, signal) {
        const out = await convertToMp4(blob, {audio: {codec: "aac", bitrate: AUDIO_BITRATE, sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: 2}}, onProgress, signal);
        return {blob: new Blob([out], {type: "audio/mp4"}), mimeType: AAC_MIME_TYPE};
    },
};
