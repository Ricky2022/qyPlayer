import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectAudio } from "@qyplayer/qyp/inspect";
import { BUILTIN_TRACKS } from "../apps/web/src/create/builtinMusicInfo";
import { DOWNLOADS_DIR, loadRecords, problemsOf } from "./fixtures/records";

/** 每首内置曲目的文件大小上限（docs/dev-0.3.0.md 第 8 节） */
const MAX_TRACK_BYTES = 6 * 1024 * 1024;

describe("内置曲目", () => {
  it("正好 5 首，编号和文件各不相同", () => {
    expect(BUILTIN_TRACKS).toHaveLength(5);
    expect(new Set(BUILTIN_TRACKS.map((t) => t.id)).size).toBe(5);
    expect(new Set(BUILTIN_TRACKS.map((t) => t.path)).size).toBe(5);
  });

  it("每首都有来源和许可记录，许可是 CC0（F-BGM-02）", async () => {
    const records = await loadRecords();
    for (const track of BUILTIN_TRACKS) {
      const record = records.find((r) => r.file === basename(track.path));
      expect(record, `${track.path} 没有来源记录`).toBeDefined();
      expect(problemsOf(record!)).toEqual([]);
      expect(record!.kind).toBe("audio");
      expect(record!.license).toMatch(/^CC0/);
    }
  });

  // 真实文件由 pnpm fixtures:fetch 下载，不入库；没下载时跳过
  describe.skipIf(!BUILTIN_TRACKS.every((t) => existsSync(resolve(DOWNLOADS_DIR, basename(t.path)))))("真实文件", () => {
    it.each(BUILTIN_TRACKS.map((t) => [t.id, t] as const))("%s：不超过 6 MB，时长与列表里写的一致", async (_id, track) => {
      const data = await readFile(resolve(DOWNLOADS_DIR, basename(track.path)));
      expect(data.length).toBeLessThanOrEqual(MAX_TRACK_BYTES);
      const { duration } = await inspectAudio(new Blob([data]), track.path);
      expect(Math.abs(duration - track.duration)).toBeLessThanOrEqual(1);
    });
  });
});
