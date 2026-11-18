import { defaultAspectRatio, generateManifest, type AspectRatio, type Manifest, type MediaInput } from "@qyplayer/core";
import { writePackage, type PackageFile } from "@qyplayer/qyp";

/** 已导入、可以放进影片的图片或视频。图片已重新编码为 JPEG，视频是原文件。 */
export interface MediaEntry {
  /** 原文件名，用于排序的次级键和界面显示 */
  fileName: string;
  type: "image" | "video";
  blob: Blob;
  width: number;
  height: number;
  /** 视频必需，秒 */
  duration?: number;
  hasAudio?: boolean;
  /** 拍摄时间；网页取文件的修改时间，ISO 8601 */
  capturedAt?: string;
}

export interface MusicEntry {
  blob: Blob;
  /** ".mp3" 或 ".m4a" */
  extension: string;
  duration: number;
  title?: string;
  license?: string;
}

export interface BuildOptions {
  /** 按列表顺序使用，不再按拍摄时间重排 */
  media: readonly MediaEntry[];
  music?: MusicEntry;
  /** 缺省时按素材方向自动选择 */
  aspectRatio?: AspectRatio;
  templateId: string;
  seed: number;
  /** 缺省或空白时用生成器的默认标题 */
  title?: string;
}

export interface BuiltPackage {
  blob: Blob;
  manifest: Manifest;
}

function idFor(index: number): string {
  return `m${String(index + 1).padStart(3, "0")}`;
}

function extensionFor(entry: MediaEntry): string {
  return entry.type === "image" ? ".jpg" : ".mp4";
}

/** 按列表顺序生成清单并打成 .qyp。素材统一重命名为 media/m001.jpg 这样的包内路径，不把用户的文件名带进路径。 */
export async function buildPackage(options: BuildOptions): Promise<BuiltPackage> {
  const files: PackageFile[] = [];
  const media: MediaInput[] = options.media.map((entry, index) => {
    const id = idFor(index);
    const src = `media/${id}${extensionFor(entry)}`;
    files.push({ path: src, data: entry.blob });
    return {
      id,
      type: entry.type,
      src,
      fileName: entry.fileName,
      width: entry.width,
      height: entry.height,
      ...(entry.duration !== undefined && { duration: entry.duration }),
      ...(entry.hasAudio !== undefined && { hasAudio: entry.hasAudio }),
      ...(entry.capturedAt !== undefined && { capturedAt: entry.capturedAt }),
    };
  });

  let music;
  if (options.music) {
    const src = `audio/bgm${options.music.extension}`;
    files.push({ path: src, data: options.music.blob });
    music = {
      id: "bgm",
      src,
      duration: options.music.duration,
      ...(options.music.title !== undefined && { title: options.music.title }),
      ...(options.music.license !== undefined && { license: options.music.license }),
    };
  }

  const title = options.title?.trim();
  const manifest = generateManifest({
    media,
    aspectRatio: options.aspectRatio ?? defaultAspectRatio(media),
    templateId: options.templateId,
    seed: options.seed,
    keepOrder: true,
    ...(title && { title }),
    ...(music && { music }),
    generator: { name: "qyPlayer web", version: "0.0.0" },
  });
  return { blob: await writePackage(manifest, files), manifest };
}
