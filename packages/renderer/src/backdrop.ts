import { computeFit } from "./fit";

/** 模糊背景上盖的黑色不透明度（docs/dev-0.4.0.md 第 5 节） */
export const BACKDROP_DIM = 0.35;

/** 模糊过程的三级画布长边（像素）：先缩到中间尺寸，再缩到很小，再放大回中间尺寸 */
const MID_SIDE = 192;
const SMALL_SIDE = 48;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 离屏画布：浏览器里是 OffscreenCanvas 或 canvas 元素，测试里可以换成假的 */
export interface ScratchCanvas {
  width: number;
  height: number;
  getContext(id: "2d"): Ctx2D | null;
}

export type CreateCanvas = (width: number, height: number) => ScratchCanvas;

export const defaultCreateCanvas: CreateCanvas = (width, height) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height) as unknown as ScratchCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as ScratchCanvas;
};

/** 静态图片的模糊结果按素材缓存；键是素材的 source 对象，素材释放后自动回收 */
const cache = new WeakMap<object, ScratchCanvas>();

function sizeFor(aspect: number, longSide: number): { w: number; h: number } {
  return aspect >= 1 ? { w: longSide, h: Math.max(1, Math.round(longSide / aspect)) } : { w: Math.max(1, Math.round(longSide * aspect)), h: longSide };
}

function newScratch(create: CreateCanvas, w: number, h: number): { canvas: ScratchCanvas; ctx: Ctx2D } {
  const canvas = create(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

export interface BackdropSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** 画面不随时间变化（静态图片），模糊结果可以缓存 */
  still?: boolean;
}

/**
 * 把素材按画布比例铺满裁切，经“缩到中间尺寸 → 缩到很小 → 放大回中间尺寸”得到一张模糊的小图。
 * 不用 ctx.filter：Safari 默认不支持。aspect 是画布的宽高比。
 */
export function blurredBackdrop(asset: BackdropSource, aspect: number, create: CreateCanvas = defaultCreateCanvas): ScratchCanvas {
  const mid = sizeFor(aspect, MID_SIDE);
  if (asset.still) {
    const cached = cache.get(asset.source);
    if (cached && cached.width === mid.w && cached.height === mid.h) return cached;
  }
  const small = sizeFor(aspect, SMALL_SIDE);

  const first = newScratch(create, mid.w, mid.h);
  const { source, dest } = computeFit("cover", asset.width, asset.height, { x: 0, y: 0, w: mid.w, h: mid.h });
  first.ctx.drawImage(asset.source, source.x, source.y, source.w, source.h, dest.x, dest.y, dest.w, dest.h);

  const tiny = newScratch(create, small.w, small.h);
  tiny.ctx.drawImage(first.canvas as unknown as CanvasImageSource, 0, 0, mid.w, mid.h, 0, 0, small.w, small.h);

  // 复用第一张画布放大回中间尺寸，省一次分配
  first.ctx.clearRect(0, 0, mid.w, mid.h);
  first.ctx.drawImage(tiny.canvas as unknown as CanvasImageSource, 0, 0, small.w, small.h, 0, 0, mid.w, mid.h);

  if (asset.still) cache.set(asset.source, first.canvas);
  return first.canvas;
}
