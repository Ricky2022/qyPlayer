// 把转码结果写回清单和文件列表（docs/dev-0.3.0.md 5.5）。纯逻辑。
// 不重新生成清单：版式、转场和页时长保持预览时的样子，只改素材自己的字段。
import type { GeneratorInfo, Manifest, PagePlan } from "@qyplayer/core";
import type { BlobFile } from "../buildPackage";
import { extensionForMimeType } from "../mediaType";

/** 一个素材转码后的文件和它的新属性 */
export interface TranscodedAsset {
  blob: Blob;
  /** 新文件的类型，写法见 4.3 */
  mimeType: string;
  width?: number;
  height?: number;
  /** 视频：片段时长（秒） */
  duration?: number;
}

const FALLBACK_EXTENSION = { image: ".jpg", video: ".mp4", audio: ".m4a" } as const;

/** generator.plan 里已裁剪的视频素材：clipStart 改为 0（plan 不是预期的外形时原样保留） */
function withTrimmedPlan(generator: GeneratorInfo, results: ReadonlyMap<string, TranscodedAsset>): GeneratorInfo {
  const plan = generator.plan;
  if (!Array.isArray(plan)) return generator;
  const trimmed = (plan as PagePlan[]).map((page) => ({
    ...page,
    items: page.items.map((item) => (results.has(item.assetId) && item.clipStart !== undefined ? { ...item, clipStart: 0 } : item)),
  }));
  return { ...generator, plan: trimmed };
}

/**
 * 用转码结果替换素材：新的文件内容、类型和包内路径（扩展名可能变，例如 .mov → .mp4、.heic → .jpg），
 * `source.transcoded` 改为 true，`source.mimeType` 保持原始类型。视频的片段已裁好，所以条目的 clipStart 改为 0。
 * 没有结果的素材原样保留。
 */
export function applyTranscoded(
  manifest: Manifest,
  files: readonly BlobFile[],
  results: ReadonlyMap<string, TranscodedAsset>,
): { manifest: Manifest; files: BlobFile[] } {
  const renamed = new Map<string, string>();
  const assets = manifest.assets.map((asset) => {
    const result = results.get(asset.id);
    if (!result) return asset;
    const extension = extensionForMimeType(result.mimeType) ?? FALLBACK_EXTENSION[asset.type];
    const src = asset.src.replace(/\.[^./]+$/, "") + extension;
    renamed.set(asset.src, src);
    return {
      ...asset,
      src,
      mimeType: result.mimeType,
      source: { mimeType: asset.source?.mimeType ?? result.mimeType, transcoded: true },
      ...(result.width !== undefined && { width: result.width }),
      ...(result.height !== undefined && { height: result.height }),
      ...(asset.type === "video" && result.duration !== undefined && { duration: result.duration }),
    };
  });

  const pages = manifest.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => (results.has(item.assetId) && item.clipStart !== undefined ? { ...item, clipStart: 0 } : item)),
  }));

  // 手动编排（generator.plan）里同一素材的片段起点也改为 0，重新打开时与清单一致
  const generator = manifest.generator && withTrimmedPlan(manifest.generator, results);

  const nextFiles = files.map((file) => {
    const asset = manifest.assets.find((a) => a.src === file.path);
    const result = asset && results.get(asset.id);
    return result ? { path: renamed.get(file.path) ?? file.path, data: result.blob } : file;
  });
  return { manifest: { ...manifest, ...(generator && { generator }), assets, pages }, files: nextFiles };
}
