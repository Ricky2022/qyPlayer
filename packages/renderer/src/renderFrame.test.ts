import type { Manifest } from "@qyplayer/core";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BACKGROUND, PLACEHOLDER_TEXT_COLOR, placeholderFontSize, renderFrame } from "./renderFrame";

describe("placeholderFontSize", () => {
  it("取格子短边的 8%", () => {
    expect(placeholderFontSize(1080, 200, 1000)).toBeCloseTo(86.4, 6);
  });

  it("文字过宽时等比缩小", () => {
    expect(placeholderFontSize(1080, 2000, 1000)).toBeCloseTo(43.2, 6);
  });

  it("不小于 12 像素", () => {
    expect(placeholderFontSize(50, 100, 100)).toBe(12);
    expect(placeholderFontSize(1080, 100000, 100)).toBe(12);
  });
});

/** 记录绘制调用的假画布上下文，足够检查占位分支 */
function fakeContext(width: number, height: number) {
  const calls: string[] = [];
  const log = (name: string) => (...args: unknown[]) => {
    calls.push(`${name}(${args.join(",")})`);
  };
  let fillStyle = "";
  const ctx = {
    canvas: { width, height },
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    save: log("save"),
    restore: log("restore"),
    beginPath: log("beginPath"),
    rect: log("rect"),
    clip: log("clip"),
    drawImage: log("drawImage"),
    fillRect: (...args: unknown[]) => calls.push(`fillRect:${fillStyle}(${args.join(",")})`),
    fillText: (...args: unknown[]) => calls.push(`fillText:${fillStyle}(${args.join(",")})`),
    measureText: (text: string) => ({ width: text.length * 10 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const manifest = {
  formatVersion: "0.2",
  title: "t",
  duration: 4,
  canvas: { aspectRatio: "2:1", width: 1000, height: 500, background: "#000000" },
  assets: [{ id: "a1", type: "image", src: "media/a1.heic", mimeType: "image/heic", source: { mimeType: "image/heic", transcoded: false } }],
  pages: [
    {
      id: "p1",
      start: 0,
      duration: 4,
      transitionIn: { type: "none", duration: 0 },
      items: [{ assetId: "a1", frame: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover" }],
    },
  ],
} as unknown as Manifest;

describe("renderFrame 占位画面", () => {
  it("在格子里画底色和居中文字，不调用 drawImage", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    renderFrame(ctx, manifest, 2, () => ({ placeholder: true }), { placeholderText: "本设备无法播放" });
    expect(calls).toContain(`fillRect:${PLACEHOLDER_BACKGROUND}(0,0,1000,500)`);
    expect(calls).toContain(`fillText:${PLACEHOLDER_TEXT_COLOR}(本设备无法播放,500,250)`);
    expect(calls.some((c) => c.startsWith("drawImage"))).toBe(false);
  });

  it("没有传文字时只画底色", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    renderFrame(ctx, manifest, 2, () => ({ placeholder: true }));
    expect(calls).toContain(`fillRect:${PLACEHOLDER_BACKGROUND}(0,0,1000,500)`);
    expect(calls.some((c) => c.startsWith("fillText"))).toBe(false);
  });
});
