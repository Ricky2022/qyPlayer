// 预览用的内存包：与保存的包使用同一份清单生成逻辑，但不打 ZIP，素材直接取自编辑状态（3A.10）。
import type { Manifest } from "@qyplayer/core";
import { QypError, type OpenedPackage } from "@qyplayer/qyp";
import { planPackage, type BlobFile, type BuildOptions, type MusicEntry } from "../buildPackage";
import type { EditorDoc } from "./state";

export interface PreviewOptions {
  /** 已读出的配乐文件；内置曲目由调用方先加载好再传入 */
  music?: MusicEntry;
  /** 默认标题里“日期 + 词”的词，按界面语言传入 */
  defaultTitleWord?: string;
}

export interface PreviewPackage {
  opened: OpenedPackage;
  manifest: Manifest;
}

/** 把清单和文件放在内存里，当作已打开的包使用（预览和测试都用它） */
export function memoryPackage(manifest: Manifest, files: readonly BlobFile[]): OpenedPackage {
  const blobs = new Map(files.map((file) => [file.path, file.data]));
  return {
    manifest,
    warnings: [],
    readBlob: async (path) => {
      const blob = blobs.get(path);
      if (!blob) throw new QypError("missing-file", `memory package has no file ${path}`, [], [path]);
      return blob;
    },
    close: async () => {},
  };
}

/** 编辑内容对应的生成选项（不含配乐和默认标题的词，由调用方按需补上）。预览、保存、导出共用，保证三者一致 */
export function buildOptionsOf(doc: EditorDoc): BuildOptions {
  return {
    media: doc.media,
    ...(doc.aspect !== "auto" && { aspectRatio: doc.aspect }),
    templateId: doc.templateId,
    seed: doc.seed,
    title: doc.title,
    ...(doc.transition !== "auto" && { transition: doc.transition }),
    ...(doc.look !== "original" && { look: doc.look }),
  };
}

/** 按当前编辑内容生成清单并包装成可以直接交给播放器的 OpenedPackage。没有素材时抛出 GenerateError("no-media") */
export function createPreviewPackage(doc: EditorDoc, options: PreviewOptions = {}): PreviewPackage {
  const { manifest, files } = planPackage({
    ...buildOptionsOf(doc),
    ...(options.music && { music: options.music }),
    ...(options.defaultTitleWord && { defaultTitleWord: options.defaultTitleWord }),
  });
  return { opened: memoryPackage(manifest, files), manifest };
}
