import {imageSize} from "image-size";
import {inspectAudio, inspectVideo} from "@qyplayer/qyp/inspect";
import {probeVideo} from "../../apps/web/src/create/probeVideo";
import type {SourceRecord} from "./records";

export interface MediaInfo {
    width?: number;
    height?: number;
    duration?: number;
    hasAudio?: boolean;
    /** 格式 0.2 的 mimeType（docs/dev-0.3.0.md 4.3）；视频带编码字符串 */
    mimeType: string;
}

/**
 * 读取素材的尺寸、时长和是否有音轨，并确认格式符合 PRD 7.4 的播放版本要求：
 * 照片 JPEG、视频 H.264 + AAC、音乐 MP3 或 AAC。不符合就报错，避免把播放不了的素材打进示例包。
 * 视频和音乐的规则在 @qyplayer/qyp/inspect，与网页制作页共用。
 */
export const inspectMedia = async function inspectMedia(record: SourceRecord, bytes: Uint8Array): Promise<MediaInfo> {
    if (record.kind === "image") {
        const {width, height, type} = imageSize(bytes);
        if (type !== "jpg") {
            throw new Error(`${record.file}：示例包只收 JPEG，实际是 ${type}`);
        }
        return {width, height, mimeType: "image/jpeg"};
    }

    const blob = new Blob([bytes as BlobPart]);
    if (record.kind === "audio") {
        const {duration} = await inspectAudio(blob, record.file);
        return {duration, mimeType: record.file.toLowerCase().endsWith(".m4a") ? "audio/mp4; codecs=\"mp4a.40.2\"" : "audio/mpeg"};
    }
    // inspectVideo 确认是 H.264 + AAC；类型和编码字符串用与制作页相同的 probeVideo 读取
    await inspectVideo(blob, record.file);
    const probe = await probeVideo(blob, record.file);
    return {width: probe.width, height: probe.height, duration: probe.duration, hasAudio: probe.hasAudio, mimeType: probe.mimeType};
};
