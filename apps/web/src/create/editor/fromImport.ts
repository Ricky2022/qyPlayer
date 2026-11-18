import type { MediaEntry } from "../buildPackage";
import type { EditorMediaInput } from "./state";

/** 把导入得到的素材变成编辑列表里的一项。已经转码过的素材是最终文件，保存时不再转码 */
export function editorMediaFromImport(entry: MediaEntry): EditorMediaInput {
  return { ...entry, final: entry.source.transcoded };
}
