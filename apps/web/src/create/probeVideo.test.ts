import { existsSync, readFileSync } from "node:fs";
import { openPackage } from "@qyplayer/qyp";
import { beforeAll, describe, expect, it } from "vitest";
import { probeVideo } from "./probeVideo";

// 用示例包里的真实 H.264 + AAC 的 MP4 做样本；MOV 样本是把它的 ftyp 品牌改成 "qt  "
const SAMPLE_PACKAGE = "fixtures/build/sample-video-sound-16x9.qyp";
// 示例包由 pnpm fixtures:build 生成、不入库；没有它（例如 CI）时跳过
const hasSample = existsSync(SAMPLE_PACKAGE);
let mp4: Blob;
let mov: Blob;

beforeAll(async () => {
  if (!hasSample) return;
  const opened = await openPackage(new Blob([readFileSync(SAMPLE_PACKAGE)]));
  mp4 = await opened.readBlob("media/m005.mp4");
  const bytes = new Uint8Array(await mp4.arrayBuffer());
  const ftyp = new TextDecoder().decode(bytes.subarray(4, 8));
  expect(ftyp).toBe("ftyp");
  bytes.set(new TextEncoder().encode("qt  "), 8);
  mov = new Blob([bytes]);
});

describe.skipIf(!hasSample)("probeVideo", () => {
  it("读出尺寸、时长、音轨和带编码的 video/mp4 类型", async () => {
    const info = await probeVideo(mp4, "a.mp4");
    expect(info.width).toBe(1080);
    expect(info.height).toBe(608);
    expect(info.duration).toBeGreaterThan(12);
    expect(info.duration).toBeLessThan(12.5);
    expect(info.hasAudio).toBe(true);
    expect(info.mimeType).toMatch(/^video\/mp4; codecs="avc1\.[0-9a-f]{6}, mp4a\.40\.2"$/);
  });

  it("ftyp 品牌为 qt 的写 video/quicktime", async () => {
    const info = await probeVideo(mov, "a.mov");
    expect(info.mimeType).toMatch(/^video\/quicktime; codecs="avc1\./);
    expect(info.width).toBe(1080);
  });

  it("不是视频的文件抛出 unreadable", async () => {
    await expect(probeVideo(new Blob(["not a video file at all"]), "x.mp4")).rejects.toMatchObject({ name: "MediaFormatError", code: "unreadable" });
  });

  it("损坏（截断到文件头之后）的文件抛出 MediaFormatError，不是别的错误", async () => {
    await expect(probeVideo(mp4.slice(0, 64), "cut.mp4")).rejects.toMatchObject({ name: "MediaFormatError" });
  });
});
