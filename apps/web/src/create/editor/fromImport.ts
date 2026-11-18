import type { MediaEntry } from "../buildPackage";
import type { EditorMediaInput } from "./state";

/**
 * 把导入得到的素材变成编辑列表里的一项。sourceMime 是用户选的原文件的类型。
 * 现在的导入会把图片重新编码成 JPEG（视为已转码的最终文件），视频原样使用；转码开关接入后这里会随之调整。
 */
export function editorMediaFromImport(entry: MediaEntry, sourceMime: string): EditorMediaInput {
  if (entry.type === "image") {
    return { ...entry, mimeType: "image/jpeg", source: { mimeType: sourceMime || "image/jpeg", transcoded: true }, final: true };
  }
  return { ...entry, mimeType: "video/mp4", source: { mimeType: sourceMime || "video/mp4", transcoded: false }, final: false };
}
