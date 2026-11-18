// 制作页的素材导入（需要浏览器环境）。导入阶段不重新编码视频，只检查并读取元数据，保留原始文件（docs/dev-0.3.0.md 5.3）：
// 转码开关关闭时图片也原样使用；开启时图片重新编码为 JPEG。GIF、BMP 无论开关都转成 JPEG。
import { inspectAudio } from "@qyplayer/qyp/inspect";
import { chooseCapturedAt, readPhotoExifTime } from "./capturedAt";
import { classifyFile, fitWithin, IMAGE_MAX_SIDE } from "./files";
import { readImageSize } from "./imageInfo";
import { audioMimeType, baseMimeType, imageMimeType } from "./mediaType";
import { probeWavDuration } from "./probeAudio";
import { probeVideo } from "./probeVideo";
import { decodeHeic } from "./transcode/heic";
import type { MediaEntry, MusicEntry } from "./buildPackage";

const JPEG_QUALITY = 0.85;

export type ImportErrorCode =
  | "decode"
  | "canvas"
  | "audio-in-media"
  | "need-audio"
  | "too-many"
  | "too-large"
  | "mobile-limit"
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

export interface ImportOptions {
  /** 转码开关（5.2）。开：图片重新编码为 JPEG；关：图片原样使用。视频导入时都不转码 */
  transcode: boolean;
}

/** 拍摄时间字段：EXIF 或容器时间直接用，退到文件修改时间时打上标记 */
function capturedFields(found: { iso: string; source: "exif" | "container" } | undefined, file: File): Pick<MediaEntry, "capturedAt" | "capturedAtFromModified"> {
  const chosen = chooseCapturedAt(found, file.lastModified);
  if (!chosen) return {};
  return { capturedAt: chosen.iso, ...(chosen.source === "modified" && { capturedAtFromModified: true }) };
}

/** HEIC 和 HEIF：浏览器解不了时由 libheif 解码（5.5） */
const isHeif = (mimeType: string | undefined): boolean => mimeType === "image/heic" || mimeType === "image/heif";

async function decodeWithLibheif(file: Blob): Promise<ImageBitmap> {
  const { data, width, height } = await decodeHeic(file);
  return createImageBitmap(new ImageData(data, width, height));
}

/** 解码后缩放到长边不超过 2560，重新编码为 JPEG；浏览器和 libheif 都解不了时抛出 ImportError("decode") */
export async function convertToJpeg(file: Blob, mimeType?: string): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    // 默认按图片自带的方向信息旋转
    bitmap = await createImageBitmap(file);
  } catch (error) {
    try {
      if (!isHeif(mimeType)) throw error;
      bitmap = await decodeWithLibheif(file);
    } catch (cause) {
      throw new ImportError("decode", {}, { cause });
    }
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, IMAGE_MAX_SIDE);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImportError("canvas");
    // 透明部分在 JPEG 里会变成黑色，与影片的黑色背景一致
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY }), width, height };
  } finally {
    bitmap.close();
  }
}

async function importImage(file: File, options: ImportOptions): Promise<MediaEntry> {
  const original = imageMimeType(file.name, file.type);
  const exifTime = await readPhotoExifTime(file);
  const found = exifTime ? { iso: exifTime, source: "exif" as const } : undefined;
  const common = { fileName: file.name, type: "image" as const, originalBytes: file.size, ...capturedFields(found, file) };

  // GIF、BMP 等不能原样放入包的格式，无论开关都转成 JPEG
  if (original === undefined || options.transcode) {
    try {
      const jpeg = await convertToJpeg(file, original);
      const sourceType = original ?? (baseMimeType(file.type) || "image/jpeg");
      return { ...common, ...jpeg, mimeType: "image/jpeg", source: { mimeType: sourceType, transcoded: true } };
    } catch (error) {
      // 浏览器和 libheif 都解不了的 HEIC、HEIF、AVIF：保留原文件，保存时再试一次，仍失败就原样放入；其他格式解不了就是坏文件
      if (original === undefined || !(error instanceof ImportError) || error.code !== "decode") throw error;
    }
  }
  const size = await readImageSize(file);
  if (!size || original === undefined) throw new ImportError("decode");
  return { ...common, blob: file, ...size, mimeType: original, source: { mimeType: original, transcoded: false } };
}

async function importVideo(file: File): Promise<MediaEntry> {
  const info = await probeVideo(file, file.name);
  const found = info.capturedAt ? { iso: info.capturedAt, source: "container" as const } : undefined;
  return {
    fileName: file.name,
    type: "video",
    blob: file,
    mimeType: info.mimeType,
    source: { mimeType: info.mimeType, transcoded: false },
    width: info.width,
    height: info.height,
    duration: info.duration,
    hasAudio: info.hasAudio,
    originalBytes: file.size,
    ...capturedFields(found, file),
  };
}

/** 导入一个图片或视频文件。不支持或读取失败时抛出 ImportError 或 MediaFormatError */
export async function importMedia(file: File, options: ImportOptions): Promise<MediaEntry> {
  const classification = classifyFile(file.name, file.type);
  if (classification.kind === "unsupported") throw new ImportError(classification.reason);
  if (classification.kind === "audio") throw new ImportError("audio-in-media");
  return classification.kind === "image" ? importImage(file, options) : importVideo(file);
}

/** 导入配乐文件（MP3、M4A 或 WAV）。WAV 在保存时转成 AAC（5.5） */
export async function importMusic(file: File): Promise<MusicEntry> {
  const classification = classifyFile(file.name, file.type);
  if (classification.kind === "unsupported") throw new ImportError(classification.reason);
  if (classification.kind !== "audio") throw new ImportError("need-audio");
  const mimeType = audioMimeType(file.name) ?? "audio/mpeg";
  const duration = mimeType === "audio/wav" ? await probeWavDuration(file, file.name) : (await inspectAudio(file, file.name)).duration;
  return { blob: file, mimeType, duration, title: file.name };
}
