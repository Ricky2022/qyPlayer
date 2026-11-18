// 制作页的素材导入（需要浏览器环境）：图片重新编码为 JPEG，视频和音乐只检查格式、原样使用。
import { inspectAudio, inspectVideo } from "@qyplayer/qyp/inspect";
import { classifyFile, fitWithin, IMAGE_MAX_SIDE } from "./files";
import type { MediaEntry, MusicEntry } from "./buildPackage";

const JPEG_QUALITY = 0.85;

export type ImportErrorCode =
  | "decode"
  | "canvas"
  | "audio-in-media"
  | "need-audio"
  | "too-many"
  | "too-large"
  | "video-format"
  | "audio-format"
  | "unsupported"
  | "music-not-picked"
  | "builtin-network"
  | "builtin-http";

/** 导入失败。message 是英文，界面按 code 和 params 翻译（见 describe.ts） */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    readonly params: Readonly<Record<string, string | number>> = {},
    options?: ErrorOptions,
  ) {
    super(`import failed: ${code}`, options);
    this.name = "ImportError";
  }
}

function capturedAtOf(file: File): string | undefined {
  return file.lastModified > 0 ? new Date(file.lastModified).toISOString() : undefined;
}

async function importImage(file: File): Promise<MediaEntry> {
  let bitmap: ImageBitmap;
  try {
    // 默认按图片自带的方向信息旋转
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new ImportError("decode", {}, { cause: error });
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, IMAGE_MAX_SIDE);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImportError("canvas");
    // 透明部分在 JPEG 里会变成黑色，与影片的黑色背景一致
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
    const capturedAt = capturedAtOf(file);
    return { fileName: file.name, type: "image", blob, width, height, ...(capturedAt && { capturedAt }) };
  } finally {
    bitmap.close();
  }
}

async function importVideo(file: File): Promise<MediaEntry> {
  const info = await inspectVideo(file, file.name);
  const capturedAt = capturedAtOf(file);
  return {
    fileName: file.name,
    type: "video",
    blob: file,
    width: info.width,
    height: info.height,
    duration: info.duration,
    hasAudio: info.hasAudio,
    ...(capturedAt && { capturedAt }),
  };
}

/** 导入一个图片或视频文件。不支持或读取失败时抛出 ImportError 或 MediaFormatError */
export async function importMedia(file: File): Promise<MediaEntry> {
  const classification = classifyFile(file.name, file.type);
  if (classification.kind === "unsupported") throw new ImportError(classification.reason);
  if (classification.kind === "audio") throw new ImportError("audio-in-media");
  return classification.kind === "image" ? importImage(file) : importVideo(file);
}

/** 导入配乐文件（MP3 或 M4A） */
export async function importMusic(file: File): Promise<MusicEntry> {
  const classification = classifyFile(file.name, file.type);
  if (classification.kind === "unsupported") throw new ImportError(classification.reason);
  if (classification.kind !== "audio") throw new ImportError("need-audio");
  const info = await inspectAudio(file, file.name);
  return { blob: file, extension: file.name.toLowerCase().endsWith(".m4a") ? ".m4a" : ".mp3", duration: info.duration, title: file.name };
}
