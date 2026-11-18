import { imageSize } from "image-size";
import { parseBuffer } from "music-metadata";
import type { SourceRecord } from "./records";

export interface MediaInfo {
  width?: number;
  height?: number;
  duration?: number;
  hasAudio?: boolean;
}

/**
 * 读取素材的尺寸、时长和是否有音轨，并确认格式符合 PRD 7.2 的播放版本要求：
 * 照片 JPEG、视频 H.264 + AAC、音乐 MP3 或 AAC。不符合就报错，避免把播放不了的素材打进示例包。
 */
export async function inspectMedia(record: SourceRecord, bytes: Uint8Array): Promise<MediaInfo> {
  if (record.kind === "image") {
    const { width, height, type } = imageSize(bytes);
    if (type !== "jpg") throw new Error(`${record.file}：示例包只收 JPEG，实际是 ${type}`);
    return { width, height };
  }

  const { format } = await parseBuffer(bytes);
  const duration = format.duration;
  if (!duration || duration <= 0) throw new Error(`${record.file}：读不到时长`);

  if (record.kind === "audio") {
    const codec = format.codec ?? "";
    if (!/mpeg 1 layer 3|aac/i.test(codec)) throw new Error(`${record.file}：音乐必须是 MP3 或 AAC，实际是 ${codec}`);
    return { duration };
  }

  const video = format.trackInfo?.find((t) => t.video);
  if (!video?.video?.pixelWidth || !video.video.pixelHeight) throw new Error(`${record.file}：找不到视频轨`);
  if (video.codecId !== "avc1") throw new Error(`${record.file}：视频必须是 H.264（avc1），实际是 ${video.codecId}`);
  const audio = format.trackInfo?.find((t) => t.audio);
  if (audio && !/aac/i.test(audio.codecName ?? "")) throw new Error(`${record.file}：视频音轨必须是 AAC，实际是 ${audio.codecName}`);
  return { width: video.video.pixelWidth, height: video.video.pixelHeight, duration, hasAudio: audio !== undefined };
}
