// 读取视频和音频的基本信息，并确认格式符合 PRD 7.4 的播放版本要求：
// 视频 H.264 + AAC 的 MP4，音乐 MP3 或 AAC。示例素材脚本和网页制作页共用这一份规则。
// 单独作为子路径导出（@qyplayer/qyp/inspect），避免把 music-metadata 带进只需要打开包的播放器页。
import { parseBlob } from "music-metadata";

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

/** 素材格式不符合要求。message 面向用户，已包含文件名 */
export class MediaFormatError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MediaFormatError";
  }
}

async function parse(blob: Blob, name: string) {
  try {
    return await parseBlob(blob);
  } catch (error) {
    throw new MediaFormatError(`${name}：无法读取，文件可能已损坏或不是支持的格式`, { cause: error });
  }
}

export async function inspectVideo(blob: Blob, name: string): Promise<VideoInfo> {
  const { format } = await parse(blob, name);
  const duration = format.duration;
  if (!duration || duration <= 0) throw new MediaFormatError(`${name}：读不到时长`);

  const video = format.trackInfo?.find((t) => t.video);
  const { pixelWidth, pixelHeight } = video?.video ?? {};
  if (!pixelWidth || !pixelHeight) throw new MediaFormatError(`${name}：找不到视频轨`);
  if (video?.codecId !== "avc1") {
    throw new MediaFormatError(`${name}：视频编码是 ${video?.codecId ?? "未知"}，目前只支持 H.264（avc1）的 MP4`);
  }
  const audio = format.trackInfo?.find((t) => t.audio);
  if (audio && !/aac/i.test(audio.codecName ?? "")) {
    throw new MediaFormatError(`${name}：视频的声音编码是 ${audio.codecName ?? "未知"}，目前只支持 AAC`);
  }
  return { width: pixelWidth, height: pixelHeight, duration, hasAudio: audio !== undefined };
}

export async function inspectAudio(blob: Blob, name: string): Promise<AudioInfo> {
  const { format } = await parse(blob, name);
  const duration = format.duration;
  if (!duration || duration <= 0) throw new MediaFormatError(`${name}：读不到时长`);
  const codec = format.codec ?? "";
  if (!/mpeg 1 layer 3|aac/i.test(codec)) {
    throw new MediaFormatError(`${name}：音乐编码是 ${codec || "未知"}，目前只支持 MP3 或 AAC（M4A）`);
  }
  return { duration };
}
