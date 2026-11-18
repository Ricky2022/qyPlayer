import { imageSize } from "image-size";
import { inspectAudio, inspectVideo } from "@qyplayer/qyp/inspect";
import type { SourceRecord } from "./records";

export interface MediaInfo {
  width?: number;
  height?: number;
  duration?: number;
  hasAudio?: boolean;
}

/**
 * 读取素材的尺寸、时长和是否有音轨，并确认格式符合 PRD 7.4 的播放版本要求：
 * 照片 JPEG、视频 H.264 + AAC、音乐 MP3 或 AAC。不符合就报错，避免把播放不了的素材打进示例包。
 * 视频和音乐的规则在 @qyplayer/qyp/inspect，与网页制作页共用。
 */
export async function inspectMedia(record: SourceRecord, bytes: Uint8Array): Promise<MediaInfo> {
  if (record.kind === "image") {
    const { width, height, type } = imageSize(bytes);
    if (type !== "jpg") throw new Error(`${record.file}：示例包只收 JPEG，实际是 ${type}`);
    return { width, height };
  }

  const blob = new Blob([bytes as BlobPart]);
  return record.kind === "audio" ? inspectAudio(blob, record.file) : inspectVideo(blob, record.file);
}
