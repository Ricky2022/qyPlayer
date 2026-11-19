// 取景（docs/dev-0.4.1.md 4）：把“可见区域中心 + 放大倍数”换算成清单里的 fit 和 motion。
import { GENERATOR_LIMITS } from "./generator/generate";
import type { Crop, KenBurns } from "./generator/plan";
import type { Fit, Motion, MotionState } from "./manifest";

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
/** 去掉 -0，避免写进清单和比较时出现负零 */
const clean = (n: number): number => round4(n) || 0;

/** 取景的几何量：素材宽高比 a，格子宽高比 cell */
function geometry(assetAspect: number, cellAspect: number): { ratio: number; wide: boolean } {
  const wide = assetAspect > cellAspect;
  return { ratio: Math.max(assetAspect / cellAspect, cellAspect / assetAspect), wide };
}

/** 放大倍数 zoom 时，可见区域占素材宽、高的比例 */
export function visibleFraction(assetAspect: number, cellAspect: number, zoom: number): { w: number; h: number } {
  const { ratio, wide } = geometry(assetAspect, cellAspect);
  return wide ? { w: 1 / (ratio * zoom), h: 1 / zoom } : { w: 1 / zoom, h: 1 / (ratio * zoom) };
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 把中心夹到可见区域不超出素材的范围内 */
export function clampCenter(assetAspect: number, cellAspect: number, zoom: number, x: number, y: number): { x: number; y: number } {
  const v = visibleFraction(assetAspect, cellAspect, zoom);
  return { x: clamp(x, v.w / 2, 1 - v.w / 2), y: clamp(y, v.h / 2, 1 - v.h / 2) };
}

/**
 * 取景的一个关键状态对应的 motion 状态：素材按完整显示放好后再放大 S = R·zoom，并平移使可见区域中心落在格子中心。
 * 夹取之后 |x| ≤ (dispW-1)/2、|y| ≤ (dispH-1)/2，所以格子始终被盖满。
 */
export function framedState(assetAspect: number, cellAspect: number, zoom: number, cx: number, cy: number): MotionState {
  const { ratio, wide } = geometry(assetAspect, cellAspect);
  const scale = ratio * zoom;
  const dispW = (wide ? 1 : assetAspect / cellAspect) * scale;
  const dispH = (wide ? cellAspect / assetAspect : 1) * scale;
  const c = clampCenter(assetAspect, cellAspect, zoom, cx, cy);
  return { scale: clean(scale), x: clean(-(c.x - 0.5) * dispW), y: clean(-(c.y - 0.5) * dispH) };
}

export interface FramedItem {
  /** 取景后的素材总是按“完整显示”再放大，所以是 contain */
  fit: Fit;
  motion: Motion;
}

/**
 * 有取景的照片：fit 为 contain 加 motion。kind 是叠加在取景上的 Ken Burns（缺省和 none 不动）：
 * in/out 把放大倍数乘以 1.08（或反过来）；方向类放大 1.08 倍后让可见区域沿方向移动 ±0.035 个格子。
 */
export function framedItem(asset: { width: number; height: number }, cellAspect: number, crop: Crop, kind: KenBurns | undefined): FramedItem {
  const a = asset.width / asset.height;
  const { kenBurnsMaxScale: grow, kenBurnsPanOffset: d } = GENERATOR_LIMITS;
  const at = (zoom: number, x = crop.x, y = crop.y): MotionState => framedState(a, cellAspect, zoom, x, y);
  const still = at(crop.zoom);
  let motion: Motion = { from: still, to: still };
  switch (kind) {
    case "in":
      motion = { from: still, to: at(crop.zoom * grow) };
      break;
    case "out":
      motion = { from: at(crop.zoom * grow), to: still };
      break;
    case "left":
    case "right":
    case "up":
    case "down": {
      const zoom = crop.zoom * grow;
      const v = visibleFraction(a, cellAspect, zoom);
      // 内容向左移 = 可见区域向右移：left 从 -d 到 +d（以格子为单位，可见区域的宽、高各自折算）
      const sign = kind === "left" || kind === "up" ? 1 : -1;
      const horizontal = kind === "left" || kind === "right";
      const shift = (t: number): MotionState =>
        horizontal ? at(zoom, crop.x + sign * t * d * v.w, crop.y) : at(zoom, crop.x, crop.y + sign * t * d * v.h);
      motion = { from: shift(-1), to: shift(1) };
      break;
    }
  }
  return { fit: "contain", motion };
}
