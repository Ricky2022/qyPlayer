import { describe, expect, it } from "vitest";
import type { MediaEntry } from "../buildPackage";
import { editorMediaFromImport } from "./fromImport";

const base = { fileName: "a", blob: new Blob(["a"]), width: 10, height: 10 };

describe("导入素材转为编辑项", () => {
  it("图片：已重新编码为 JPEG，记录原类型，视为最终文件", () => {
    const entry: MediaEntry = { ...base, type: "image" };
    expect(editorMediaFromImport(entry, "image/png")).toMatchObject({ mimeType: "image/jpeg", source: { mimeType: "image/png", transcoded: true }, final: true });
  });

  it("视频：原样使用，类型取自原文件，没有类型时按 mp4", () => {
    const entry: MediaEntry = { ...base, type: "video", duration: 3 };
    expect(editorMediaFromImport(entry, "video/mp4")).toMatchObject({ mimeType: "video/mp4", source: { mimeType: "video/mp4", transcoded: false }, final: false });
    expect(editorMediaFromImport(entry, "").source.mimeType).toBe("video/mp4");
  });
});
