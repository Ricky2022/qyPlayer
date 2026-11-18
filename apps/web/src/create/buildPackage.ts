import { defaultAspectRatio, generateManifest, type AspectRatio, type AssetSource, type Manifest, type MediaInput } from "@qyplayer/core";
import { writePackage } from "@qyplayer/qyp";
import { extensionForMimeType } from "./mediaType";

/** 写进清单 generator.version 的应用版本；测试环境没有构建时注入的常量，用 0.0.0 */
const APP_VERSION = typeof __APP_VERSION__ === "undefined" ? "0.0.0" : __APP_VERSION__;

/** 已导入、可以放进影片的图片或视频：播放文件是原始文件的原样字节，或转码后的结果（见 source） */
export interface MediaEntry {
  /** 原文件名，用于排序的次级键和界面显示 */
  fileName: string;
  type: "image" | "video";
  blob: Blob;
  /** blob 的类型，写法见 docs/dev-0.3.0.md 4.3（含编码信息） */
  mimeType: string;
  /** 用户选的原始文件的类型，以及 blob 是否由它转码得到 */
  source: AssetSource;
  width: number;
  height: number;
  /** 视频必需，秒 */
  duration?: number;
  hasAudio?: boolean;
  /** 拍摄时间，UTC 的 ISO 8601 */
  capturedAt?: string;
  /** 拍摄时间其实是文件的修改时间（读不到 EXIF 或容器时间），界面要标注 */
  capturedAtFromModified?: boolean;
  /** 原始文件的大小（字节）；手机的素材总量限制按它累计。缺省时用 blob 的大小 */
  originalBytes?: number;
}

export interface MusicEntry {
  blob: Blob;
  /** blob 的类型，如 audio/mpeg、audio/mp4; codecs="mp4a.40.2" */
  mimeType: string;
  /** 缺省表示原样使用（transcoded 为 false） */
  source?: AssetSource;
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
  /** 默认标题里“日期 + 词”的词，界面按语言传入 */
  defaultTitleWord?: string;
}

/** 要放进包里的一个文件 */
export interface BlobFile {
  path: string;
  data: Blob;
}

export interface BuiltPackage {
  blob: Blob;
  manifest: Manifest;
}

function idFor(index: number): string {
  return `m${String(index + 1).padStart(3, "0")}`;
}

/** 包内扩展名按 4.3 的表取；表外的类型（只可能来自别的程序生成的包）退回该类型的通用扩展名，播放器以 mimeType 为准 */
function extensionFor(entry: MediaEntry): string {
  return extensionForMimeType(entry.mimeType) ?? (entry.type === "image" ? ".jpg" : ".mp4");
}

/** 按列表顺序生成清单，并列出要放进包里的文件。素材统一重命名为 media/m001.jpg 这样的包内路径，不把用户的文件名带进路径。 */
export function planPackage(options: BuildOptions): { manifest: Manifest; files: BlobFile[] } {
  const files: BlobFile[] = [];
  const media: MediaInput[] = options.media.map((entry, index) => {
    const id = idFor(index);
    const src = `media/${id}${extensionFor(entry)}`;
    files.push({ path: src, data: entry.blob });
    return {
      id,
      type: entry.type,
      src,
      mimeType: entry.mimeType,
      source: entry.source,
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
    const src = `audio/bgm${extensionForMimeType(options.music.mimeType) ?? ".mp3"}`;
    files.push({ path: src, data: options.music.blob });
    music = {
      id: "bgm",
      src,
      mimeType: options.music.mimeType,
      source: options.music.source ?? { mimeType: options.music.mimeType, transcoded: false },
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
    ...(options.defaultTitleWord && { defaultTitleWord: options.defaultTitleWord }),
    ...(music && { music }),
    generator: { name: "qyPlayer web", version: APP_VERSION },
  });
  return { manifest, files };
}

/** 按列表顺序生成清单并打成 .qyp */
export async function buildPackage(options: BuildOptions): Promise<BuiltPackage> {
  const { manifest, files } = planPackage(options);
  return { blob: await writePackage(manifest, files), manifest };
}
