import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QypError, openPackage } from "@qyplayer/qyp";
import { conformanceFiles } from "./fixtures/conformance";
import { CONFORMANCE_DIR, findDuplicates, findUnrecorded, loadRecords, problemsOf, renderSourcesMd, type SourceRecord } from "./fixtures/records";

const record = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  file: "a.jpg",
  kind: "image",
  title: "A",
  author: "Someone",
  license: "CC0 1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  sourceUrl: "https://example.org/a",
  downloadUrl: "https://example.org/a.jpg",
  ...over,
});

describe("来源记录检查（F-BGM-02）", () => {
  it("完整记录没有问题", () => {
    expect(problemsOf(record())).toEqual([]);
    expect(problemsOf(record({ license: "Public Domain (NASA)" }))).toEqual([]);
  });

  it("缺字段时逐项报告", () => {
    const problems = problemsOf(record({ author: "", sourceUrl: "  " }));
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("author");
    expect(problems.join("\n")).toContain("sourceUrl");
  });

  it("拒绝 CC0 和公有领域以外的许可", () => {
    expect(problemsOf(record({ license: "CC BY 4.0" }))[0]).toContain("不在允许范围");
    expect(problemsOf(record({ license: "All rights reserved" }))).toHaveLength(1);
  });

  it("找出没有记录的素材文件，忽略非素材文件", () => {
    const records = [record({ file: "a.jpg" }), record({ file: "b.mp3", kind: "audio" })];
    expect(findUnrecorded(["a.jpg", "b.mp3", "c.jpg", "D.MP4", "notes.txt", "x.json"], records)).toEqual(["c.jpg", "D.MP4"]);
  });

  it("找出重复记录", () => {
    expect(findDuplicates([record(), record(), record({ file: "b.jpg" })])).toEqual(["a.jpg"]);
  });

  it("生成的 SOURCES.md 覆盖每条记录，并转义表格里的竖线", () => {
    const md = renderSourcesMd([record({ title: "A | B" }), record({ file: "v.mp4", kind: "video", note: "说明" })]);
    expect(md).toContain("| a.jpg | A \\| B |");
    expect(md).toContain("## 图片");
    expect(md).toContain("## 视频");
    expect(md).toContain("- `v.mp4`：说明");
    expect(md).not.toContain("## 音乐");
  });

  it("入库的 sources.json 全部合规", async () => {
    const records = await loadRecords();
    expect(records.length).toBeGreaterThan(0);
    expect(records.flatMap(problemsOf)).toEqual([]);
    expect(findDuplicates(records)).toEqual([]);
  });
});

interface ExpectedEntry {
  file: string;
  description: string;
  expect: { ok: true; warnings?: string[] } | { ok: false; code: string };
}

describe("一致性测试包", () => {
  it("入库的文件与当前代码生成的逐字节相同（过期时运行 pnpm fixtures:conformance）", async () => {
    for (const [name, content] of await conformanceFiles()) {
      const committed = await readFile(resolve(CONFORMANCE_DIR, name));
      const expected = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
      expect(committed.equals(expected), `${name} 已过期`).toBe(true);
    }
  });

  it("只依赖入库的文件：按 expected.json 逐个打开，结果与声明一致", async () => {
    const expected = JSON.parse(await readFile(resolve(CONFORMANCE_DIR, "expected.json"), "utf8")) as ExpectedEntry[];
    expect(expected.length).toBeGreaterThanOrEqual(10);
    for (const entry of expected) {
      const blob = new Blob([await readFile(resolve(CONFORMANCE_DIR, entry.file))]);
      if (entry.expect.ok) {
        const pkg = await openPackage(blob);
        expect(pkg.warnings.map((w) => w.code).sort(), entry.file).toEqual([...(entry.expect.warnings ?? [])].sort());
        await pkg.close();
      } else {
        const error = await openPackage(blob).then(
          () => null,
          (e: unknown) => e,
        );
        expect(error, `${entry.file} 应被拒绝`).toBeInstanceOf(QypError);
        expect((error as QypError).code, entry.file).toBe(entry.expect.code);
      }
    }
  });
});
