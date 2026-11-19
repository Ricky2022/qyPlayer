import type { AspectRatio, Frame } from "./manifest";

/** 画布参考分辨率（PRD T-06） */
export const CANVAS_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** 多图版式的格子间距，占画布短边的比例（0.4.0 起为卡片式：PRD T-15 原为 1%） */
export const LAYOUT_GAP_RATIO = 0.02;
/** 多图版式整组格子四周的外边距，占画布短边的比例（卡片式，露出背景） */
export const LAYOUT_MARGIN_RATIO = 0.04;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * 1~4 张图的版式（PRD 8.2），返回画布归一化坐标下的格子，顺序为从上到下、从左到右。
 * 16:9：2 张左右并排；3 张左一右二。9:16：2 张上下排列；3 张上一下二。4 张都是 2×2。
 * 单张铺满画布；2~4 张整组四周留 LAYOUT_MARGIN_RATIO 的外边距，格子之间留 LAYOUT_GAP_RATIO 的间隙。
 */
export function layoutFrames(count: 1 | 2 | 3 | 4, aspectRatio: AspectRatio): Frame[] {
  const { width, height } = CANVAS_SIZE[aspectRatio];
  const short = Math.min(width, height);
  const gx = (short * LAYOUT_GAP_RATIO) / width;
  const gy = (short * LAYOUT_GAP_RATIO) / height;
  const mx = (short * LAYOUT_MARGIN_RATIO) / width;
  const my = (short * LAYOUT_MARGIN_RATIO) / height;
  // 内框：外边距之内的区域，格子都排在里面
  const iw = 1 - 2 * mx;
  const ih = 1 - 2 * my;
  const halfW = (iw - gx) / 2;
  const halfH = (ih - gy) / 2;
  const f = (x: number, y: number, w: number, h: number): Frame => ({
    x: round4(mx + x),
    y: round4(my + y),
    w: round4(w),
    h: round4(h),
  });
  const landscape = aspectRatio === "16:9";

  switch (count) {
    case 1:
      return [{ x: 0, y: 0, w: 1, h: 1 }];
    case 2:
      return landscape
        ? [f(0, 0, halfW, ih), f(halfW + gx, 0, halfW, ih)]
        : [f(0, 0, iw, halfH), f(0, halfH + gy, iw, halfH)];
    case 3:
      return landscape
        ? [f(0, 0, halfW, ih), f(halfW + gx, 0, halfW, halfH), f(halfW + gx, halfH + gy, halfW, halfH)]
        : [f(0, 0, iw, halfH), f(0, halfH + gy, halfW, halfH), f(halfW + gx, halfH + gy, halfW, halfH)];
    case 4:
      return [
        f(0, 0, halfW, halfH),
        f(halfW + gx, 0, halfW, halfH),
        f(0, halfH + gy, halfW, halfH),
        f(halfW + gx, halfH + gy, halfW, halfH),
      ];
  }
}

/** 格子在画布像素下的宽高比 */
export function cellAspect(frame: Frame, aspectRatio: AspectRatio): number {
  const { width, height } = CANVAS_SIZE[aspectRatio];
  return (frame.w * width) / (frame.h * height);
}

/** cover 裁切会丢掉素材画面的比例（0..1），用于判断是否改用 contain（PRD F-GEN-04、T-20）。 */
export function coverCropLoss(assetW: number, assetH: number, cellAspectRatio: number): number {
  const assetAspect = assetW / assetH;
  if (!(assetAspect > 0) || !(cellAspectRatio > 0)) return 0;
  const ratio = assetAspect > cellAspectRatio ? cellAspectRatio / assetAspect : assetAspect / cellAspectRatio;
  return 1 - ratio;
}
