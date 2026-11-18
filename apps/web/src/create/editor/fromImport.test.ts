import { describe, expect, it } from "vitest";
import type { MediaEntry } from "../buildPackage";
import { editorMediaFromImport } from "./fromImport";

const base = { fileName: "a", blob: new Blob(["a"]), width: 10, height: 10 };
const original = (mimeType: string) => ({ mimeType, source: { mimeType, transcoded: false } });

describe("导入素材转为编辑项", () => {
  it("已转码的素材是最终文件，保存时不再转码", () => {
    const entry: MediaEntry = { ...base, type: "image", mimeType: "image/jpeg", source: { mimeType: "image/png", transcoded: true } };
    expect(editorMediaFromImport(entry)).toMatchObject({ mimeType: "image/jpeg", source: { mimeType: "image/png", transcoded: true }, final: true });
  });

  it("原样使用的素材不是最终文件，由转码开关决定保存时是否转码", () => {
    const entry: MediaEntry = { ...base, type: "video", duration: 3, ...original("video/quicktime") };
    expect(editorMediaFromImport(entry)).toMatchObject({ mimeType: "video/quicktime", source: { transcoded: false }, final: false });
  });
});
