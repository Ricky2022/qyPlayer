// 打开已有 .qyp 时，把包还原成可编辑的内容（规则见 docs/dev-0.3.0.md 3A.5）。
import { KNOWN_LOOKS, TEMPLATES, TRANSITION_CHOICES, type Asset, type Manifest } from "@qyplayer/core";
import { mimeForPath, type OpenedPackage } from "@qyplayer/qyp";
import type { MusicEntry } from "../buildPackage";
import { BUILTIN_TRACKS, type BuiltinTrack } from "../builtinMusicInfo";
import type { EditorContent, EditorMediaInput, MusicChoice } from "./state";

/** 本工具生成的包在清单里写的生成器名字 */
export const GENERATOR_NAME = "qyPlayer web";

export type RestoreErrorCode = "too-large";

/** 还原失败。界面按 code 翻译 */
export class RestoreError extends Error {
  constructor(readonly code: RestoreErrorCode) {
    super(`restore failed: ${code}`);
    this.name = "RestoreError";
  }
}

export interface RestoreOptions {
  /** 生成“照片 1”“视频 2”这样的序号名；序号按类型分别从 1 开始 */
  serialName: (type: "image" | "video", index: number) => string;
  /** 素材总大小上限（字节），超过则抛出 RestoreError("too-large")；手机环境使用 */
  maxTotalBytes?: number;
  /** 没有 `generator.seed` 时用的种子 */
  fallbackSeed: number;
  builtinTracks?: readonly BuiltinTrack[];
}

export interface RestoredPackage {
  content: EditorContent;
  /** 包不是由本工具生成，重新生成后的排版可能与原影片不同，界面要提示 */
  layoutMayDiffer: boolean;
}

/** 素材在页里首次出现的顺序（先按页，页内按 items 顺序）；同一素材只算一次，未被引用的忽略 */
export function assetsInFirstAppearanceOrder(manifest: Manifest): Asset[] {
  const byId = new Map(manifest.assets.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const ordered: Asset[] = [];
  for (const page of manifest.pages) {
    for (const item of page.items) {
      const asset = byId.get(item.assetId);
      if (!asset || seen.has(asset.id) || (asset.type !== "image" && asset.type !== "video")) continue;
      seen.add(asset.id);
      ordered.push(asset);
    }
  }
  return ordered;
}

function isCc0(license: string | undefined): boolean {
  return license?.replace(/[^a-z0-9]/gi, "").toLowerCase() === "cc010";
}

async function restoreMusic(opened: OpenedPackage, tracks: readonly BuiltinTrack[]): Promise<MusicChoice> {
  const manifest = opened.manifest;
  if (!manifest.bgm) return { kind: "none" };
  const asset = manifest.assets.find((a) => a.id === manifest.bgm?.assetId);
  if (!asset) return { kind: "none" };
  const builtin = isCc0(asset.license) && tracks.find((track) => track.titleEn === asset.title || track.title === asset.title);
  if (builtin) return { kind: "builtin", trackId: builtin.id };
  const blob = await opened.readBlob(asset.src);
  const entry: MusicEntry = {
    blob,
    mimeType: asset.mimeType ?? mimeForPath(asset.src),
    ...(asset.source !== undefined && { source: asset.source }),
    duration: asset.duration ?? 0,
    ...(asset.title !== undefined && { title: asset.title }),
    ...(asset.license !== undefined && { license: asset.license }),
  };
  return { kind: "custom", entry };
}

/** 读出包里的素材并还原设置。页的版式、转场、时长不还原，由生成器重新生成 */
export async function restorePackage(opened: OpenedPackage, options: RestoreOptions): Promise<RestoredPackage> {
  const manifest = opened.manifest;
  const counters = { image: 0, video: 0 };
  const media: EditorMediaInput[] = [];
  let totalBytes = 0;

  for (const asset of assetsInFirstAppearanceOrder(manifest)) {
    const type = asset.type as "image" | "video";
    const blob = await opened.readBlob(asset.src);
    totalBytes += blob.size;
    if (options.maxTotalBytes !== undefined && totalBytes > options.maxTotalBytes) throw new RestoreError("too-large");
    counters[type] += 1;
    // 0.2 的包带 mimeType 和 source；0.1 的包由扩展名推断，并视为最终文件（本来就是基准格式）
    const mimeType = asset.mimeType ?? mimeForPath(asset.src);
    const source = asset.source ?? { mimeType, transcoded: false };
    media.push({
      fileName: options.serialName(type, counters[type]),
      type,
      blob,
      mimeType,
      source,
      final: asset.source === undefined || asset.source.transcoded,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      ...(asset.duration !== undefined && { duration: asset.duration }),
      ...(asset.hasAudio !== undefined && { hasAudio: asset.hasAudio }),
      ...(asset.capturedAt !== undefined && { capturedAt: asset.capturedAt }),
    });
  }

  const generator = manifest.generator;
  const templateId = TEMPLATES.some((t) => t.id === generator?.templateId) ? (generator?.templateId as string) : TEMPLATES[0]!.id;
  const seed = Number.isInteger(generator?.seed) ? (generator?.seed as number) : options.fallbackSeed;

  return {
    content: {
      media,
      title: manifest.title,
      aspect: manifest.canvas.aspectRatio,
      templateId,
      transition: TRANSITION_CHOICES.find((choice) => choice === generator?.transition) ?? "auto",
      subtitle: manifest.subtitle ?? "",
      showTitle: manifest.titleCard !== undefined,
      look: KNOWN_LOOKS.find((look) => look === manifest.look) ?? "original",
      seed,
      music: await restoreMusic(opened, options.builtinTracks ?? BUILTIN_TRACKS),
    },
    layoutMayDiffer: generator?.name !== GENERATOR_NAME || !Number.isInteger(generator?.seed),
  };
}
