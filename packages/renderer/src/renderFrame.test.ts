import type { Manifest } from "@qyplayer/core";
import { describe, expect, it } from "vitest";
import { BACKDROP_DIM, blurredBackdrop, type ScratchCanvas } from "./backdrop";
import { LOOK_PASSES, knownLook } from "./looks";
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
    set globalCompositeOperation(value: string) {
      calls.push(`op:${value}`);
    },
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
    translate: log("translate"),
    rotate: log("rotate"),
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

/** 记录每次创建的离屏画布，和画布上的 drawImage 调用，检查模糊背景的绘制步骤 */
function fakeCanvasFactory() {
  const created: { width: number; height: number; calls: string[] }[] = [];
  const create = (width: number, height: number): ScratchCanvas => {
    const calls: string[] = [];
    const record = { width, height, calls };
    created.push(record);
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: (...args: unknown[]) => calls.push(`drawImage(${args.slice(1).join(",")})`),
      clearRect: (...args: unknown[]) => calls.push(`clearRect(${args.join(",")})`),
    };
    return { width, height, getContext: () => ctx as unknown as OffscreenCanvasRenderingContext2D };
  };
  return { create, created };
}

describe("blurredBackdrop", () => {
  const photo = { source: {} as CanvasImageSource, width: 4000, height: 3000 };

  it("经过 中间尺寸 → 很小 → 放大回中间尺寸 三步，结果是中间尺寸的画布", () => {
    const { create, created } = fakeCanvasFactory();
    const result = blurredBackdrop(photo, 16 / 9, create);
    expect(created.map((c) => [c.width, c.height])).toEqual([
      [192, 108],
      [48, 27],
    ]);
    expect(result.width).toBe(192);
    expect(result.height).toBe(108);
    // 4:3 的素材铺满 16:9：上下各裁掉一部分
    expect(created[0]!.calls[0]).toBe("drawImage(0,375,4000,2250,0,0,192,108)");
    expect(created[1]!.calls).toEqual(["drawImage(0,0,192,108,0,0,48,27)"]);
    expect(created[0]!.calls.slice(1)).toEqual(["clearRect(0,0,192,108)", "drawImage(0,0,48,27,0,0,192,108)"]);
  });

  it("竖向画布的尺寸互换", () => {
    const { create, created } = fakeCanvasFactory();
    blurredBackdrop(photo, 9 / 16, create);
    expect(created.map((c) => [c.width, c.height])).toEqual([
      [108, 192],
      [27, 48],
    ]);
  });

  it("静态图片的结果被缓存，视频帧每次重算", () => {
    const { create, created } = fakeCanvasFactory();
    const still = { ...photo, source: {} as CanvasImageSource, still: true };
    expect(blurredBackdrop(still, 16 / 9, create)).toBe(blurredBackdrop(still, 16 / 9, create));
    expect(created).toHaveLength(2);
    const moving = { ...photo, source: {} as CanvasImageSource };
    blurredBackdrop(moving, 16 / 9, create);
    blurredBackdrop(moving, 16 / 9, create);
    expect(created).toHaveLength(6);
  });
});

describe("renderFrame 模糊背景", () => {
  const blurManifest = {
    ...manifest,
    canvas: { ...manifest.canvas, backdrop: "blur" },
    assets: [{ id: "a1", type: "image", src: "media/a1.jpg" }],
    pages: [
      {
        id: "p1",
        start: 0,
        duration: 4,
        transitionIn: { type: "none", duration: 0 },
        items: [
          { assetId: "a1", frame: { x: 0.1, y: 0.1, w: 0.4, h: 0.8 }, fit: "contain" },
          { assetId: "a1", frame: { x: 0.5, y: 0.1, w: 0.4, h: 0.8 }, fit: "contain" },
        ],
      },
    ],
  } as unknown as Manifest;
  const photo = { source: {} as CanvasImageSource, width: 400, height: 300, still: true };

  it("先画模糊小图铺满整个画布，再盖黑，然后才画素材", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    const { create } = fakeCanvasFactory();
    renderFrame(ctx, blurManifest, 2, () => photo, { createCanvas: create });
    const draws = calls.filter((c) => c.startsWith("drawImage"));
    expect(draws).toHaveLength(3);
    expect(draws[0]).toBe("drawImage([object Object],0,0,192,96,0,0,1000,500)");
    expect(calls).toContain(`fillRect:rgba(0, 0, 0, ${BACKDROP_DIM})(0,0,1000,500)`);
    const dimAt = calls.findIndex((c) => c.startsWith("fillRect:rgba(0, 0, 0,"));
    expect(calls.findIndex((c) => c.startsWith("drawImage") && c !== draws[0])).toBeGreaterThan(dimAt);
  });

  it("素材无法播放时不画背景", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    const { create, created } = fakeCanvasFactory();
    renderFrame(ctx, blurManifest, 2, () => ({ placeholder: true }), { createCanvas: create });
    expect(created).toHaveLength(0);
    expect(calls.some((c) => c.startsWith("drawImage"))).toBe(false);
  });
});

describe("renderFrame 旋转", () => {
  const rotated = {
    ...manifest,
    pages: [
      {
        id: "p1",
        start: 0,
        duration: 4,
        transitionIn: { type: "rotate", duration: 1 },
        items: [{ assetId: "a1", frame: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover" }],
      },
    ],
  } as unknown as Manifest;

  it("在裁切和绘制之前绕画布中心旋转，画完恢复", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    renderFrame(ctx, rotated, 0.25, () => ({ source: {} as CanvasImageSource, width: 100, height: 50 }));
    const rotateAt = calls.findIndex((c) => c.startsWith("rotate("));
    expect(rotateAt).toBeGreaterThan(-1);
    expect(calls[rotateAt - 1]).toBe("translate(500,250)");
    expect(calls[rotateAt + 1]).toBe("translate(-500,-250)");
    expect(calls.findIndex((c) => c.startsWith("clip"))).toBeGreaterThan(rotateAt);
    expect(calls.findIndex((c) => c.startsWith("drawImage"))).toBeGreaterThan(rotateAt);
  });

  it("没有旋转的图层不调用 rotate", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    renderFrame(ctx, rotated, 2, () => ({ source: {} as CanvasImageSource, width: 100, height: 50 }));
    expect(calls.some((c) => c.startsWith("rotate("))).toBe(false);
  });
});

describe("renderFrame 滤镜", () => {
  const resolve = () => ({ source: {} as CanvasImageSource, width: 100, height: 50 });

  it("素材画完后按顺序叠色，每一遍盖满整个画布", () => {
    const { ctx, calls } = fakeContext(1000, 500);
    renderFrame(ctx, { ...manifest, look: "vintage" }, 2, resolve);
    const lastDraw = calls.map((c) => c.startsWith("drawImage")).lastIndexOf(true);
    const ops = calls.slice(lastDraw).filter((c) => c.startsWith("op:"));
    expect(ops).toEqual(LOOK_PASSES.vintage.map((p) => `op:${p.op}`));
    const fills = calls.slice(lastDraw).filter((c) => c.startsWith("fillRect:"));
    expect(fills).toEqual(LOOK_PASSES.vintage.map((p) => `fillRect:${p.color}(0,0,1000,500)`));
  });

  it("标题图片画在滤镜之后，按透明度铺满画布", () => {
    const titled = { ...manifest, look: "warm", assets: [...manifest.assets, { id: "t1", type: "image", src: "media/title.png" }], titleCard: { assetId: "t1", start: 0, duration: 3, fadeIn: 0, fadeOut: 0 } } as unknown as Manifest;
    const { ctx, calls } = fakeContext(1000, 500);
    renderFrame(ctx, titled, 1, (id) => ({ source: { id } as unknown as CanvasImageSource, width: id === "t1" ? 1920 : 100, height: id === "t1" ? 1080 : 50 }));
    const look = calls.findIndex((c) => c.startsWith("op:overlay"));
    const title = calls.findIndex((c) => c.includes("drawImage") && c.includes("1920,1080,0,0,1000,500"));
    expect(look).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(look);
  });

  it("缺省、不认识的滤镜按原片，不叠色", () => {
    for (const look of [undefined, "future-look", "toString"]) {
      const { ctx, calls } = fakeContext(1000, 500);
      renderFrame(ctx, { ...manifest, ...(look && { look }) }, 2, resolve);
      expect(calls.some((c) => c.startsWith("op:"))).toBe(false);
    }
  });

  it("knownLook 只认四种", () => {
    expect(["mono", "warm", "cool", "vintage"].map(knownLook)).toEqual(["mono", "warm", "cool", "vintage"]);
    expect(knownLook("original")).toBeUndefined();
  });
});
