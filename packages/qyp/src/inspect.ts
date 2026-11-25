// 读取视频和音频的基本信息，并确认格式符合 PRD 7.4 的播放版本要求：
// 视频 H.264 + AAC 的 MP4，音乐 MP3 或 AAC。示例素材脚本和网页制作页共用这一份规则。
// 单独作为子路径导出（@qyplayer/qyp/inspect），避免把 music-metadata 带进只需要打开包的播放器页。
import {parseBlob} from "music-metadata";

export interface VideoInfo {
    width: number;
    height: number;
    /** 秒 */
    duration: number;
    hasAudio: boolean;
}

export interface AudioInfo {
    /** 秒 */
    duration: number;
}

export type MediaFormatErrorCode = "unreadable" | "no-duration" | "no-video-track" | "video-codec" | "video-audio-codec" | "audio-codec";

/** 素材格式不符合要求。message 是带文件名的英文说明（日志和脚本用）；界面按 code 和 params 自行翻译。 */
export class MediaFormatError extends Error {
    constructor(
        readonly code: MediaFormatErrorCode,
        message: string,
        /** name 是文件名；codec 是检测到的编码，读不到时缺省 */
        readonly params: {
            name: string;
            codec?: string;
        },
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "MediaFormatError";
    }
}

const parse = async function parse(blob: Blob, name: string) {
    try {
        return await parseBlob(blob);
    } catch (error) {
        throw new MediaFormatError("unreadable", `${name}: cannot be read; the file may be damaged or in an unsupported format`, {name}, {cause: error});
    }
};

const noDuration = function noDuration(name: string): MediaFormatError {
    return new MediaFormatError("no-duration", `${name}: duration cannot be determined`, {name});
};

export const inspectVideo = async function inspectVideo(blob: Blob, name: string): Promise<VideoInfo> {
    const {format} = await parse(blob, name);
    const duration = format.duration;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!duration || duration <= 0) {
        throw noDuration(name);
    }

    const video = format.trackInfo?.find((t) => t.video);
    const {pixelWidth, pixelHeight} = video?.video ?? {};
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!pixelWidth || !pixelHeight) {
        throw new MediaFormatError("no-video-track", `${name}: no video track found`, {name});
    }
    if (video?.codecId !== "avc1") {
        const codec = video?.codecId;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        throw new MediaFormatError("video-codec", `${name}: video codec is ${codec ?? "unknown"}; only H.264 (avc1) MP4 is supported`, {name, ...codec && {codec}});
    }
    const audio = format.trackInfo?.find((t) => t.audio);
    if (audio && !/aac/i.test(audio.codecName ?? "")) {
        const codec = audio.codecName;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        throw new MediaFormatError("video-audio-codec", `${name}: the video's audio codec is ${codec ?? "unknown"}; only AAC is supported`, {name, ...codec && {codec}});
    }
    return {width: pixelWidth, height: pixelHeight, duration, hasAudio: audio !== undefined};
};

export const inspectAudio = async function inspectAudio(blob: Blob, name: string): Promise<AudioInfo> {
    const {format} = await parse(blob, name);
    const duration = format.duration;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!duration || duration <= 0) {
        throw noDuration(name);
    }
    const codec = format.codec ?? "";
    if (!/mpeg 1 layer 3|aac/i.test(codec)) {
        throw new MediaFormatError("audio-codec", `${name}: music codec is ${codec || "unknown"}; only MP3 or AAC (M4A) is supported`, {name, ...codec && {codec}});
    }
    return {duration};
};
