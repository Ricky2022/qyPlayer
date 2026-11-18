// 制作页的素材导入（需要浏览器环境）：图片重新编码为 JPEG，视频和音乐只检查格式、原样使用。
import { inspectAudio, inspectVideo } from "@qyplayer/qyp/inspect";
import { classifyFile, fitWithin, IMAGE_MAX_SIDE } from "./files";
import type { MediaEntry, MusicEntry } from "./buildPackage";

const JPEG_QUALITY = 0.85;

/** 导入失败，message 可直接显示给用户 */
export class ImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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
    throw new ImportError("浏览器无法解码这张图片（HEIC 等格式请先转成 JPEG 或 PNG）", { cause: error });
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, IMAGE_MAX_SIDE);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImportError("浏览器不支持 Canvas 2D，无法处理图片");
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

/** 导入一个图片或视频文件。不支持或读取失败时抛出 ImportError（或带用户可读说明的 MediaFormatError） */
export async function importMedia(file: File): Promise<MediaEntry> {
  const classification = classifyFile(file.name, file.type);
  if (classification.kind === "unsupported") throw new ImportError(classification.reason);
  if (classification.kind === "audio") throw new ImportError("音乐请在“配乐”里选择，不能放进素材列表");
  return classification.kind === "image" ? importImage(file) : importVideo(file);
}

/** 导入配乐文件（MP3 或 M4A） */
export async function importMusic(file: File): Promise<MusicEntry> {
  const classification = classifyFile(file.name, file.type);
  if (classification.kind === "unsupported") throw new ImportError(classification.reason);
  if (classification.kind !== "audio") throw new ImportError("请选择 MP3 或 M4A 音乐文件");
  const info = await inspectAudio(file, file.name);
  return { blob: file, extension: file.name.toLowerCase().endsWith(".m4a") ? ".m4a" : ".mp3", duration: info.duration, title: file.name };
}
