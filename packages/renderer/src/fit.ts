export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitResult {
  /** 素材上要取的区域（像素） */
  source: Box;
  /** 画布上要画到的区域（像素） */
  dest: Box;
}

/**
 * 把宽 assetW、高 assetH 的素材按 fit 放进 target 矩形（PRD 7.5 items.fit）。
 * - cover：居中裁切，填满 target
 * - contain：完整显示，居中，其余留空（露出画布背景色）
 * 纯函数，不依赖 DOM。
 */
export function computeFit(fit: "cover" | "contain", assetW: number, assetH: number, target: Box): FitResult {
  if (assetW <= 0 || assetH <= 0 || target.w <= 0 || target.h <= 0) {
    return { source: { x: 0, y: 0, w: 0, h: 0 }, dest: { x: target.x, y: target.y, w: 0, h: 0 } };
  }
  const scaleX = target.w / assetW;
  const scaleY = target.h / assetH;

  if (fit === "contain") {
    const scale = Math.min(scaleX, scaleY);
    const dw = assetW * scale;
    const dh = assetH * scale;
    return {
      source: { x: 0, y: 0, w: assetW, h: assetH },
      dest: { x: target.x + (target.w - dw) / 2, y: target.y + (target.h - dh) / 2, w: dw, h: dh },
    };
  }

  const scale = Math.max(scaleX, scaleY);
  const sw = target.w / scale;
  const sh = target.h / scale;
  return {
    source: { x: (assetW - sw) / 2, y: (assetH - sh) / 2, w: sw, h: sh },
    dest: { ...target },
  };
}

/** cover 裁切会丢掉素材画面的比例（0..1），供生成器判断是否改用 contain（PRD F-GEN-04）。 */
export function coverCropLoss(assetW: number, assetH: number, cellAspect: number): number {
  const assetAspect = assetW / assetH;
  if (assetAspect <= 0 || cellAspect <= 0) return 0;
  const ratio = assetAspect > cellAspect ? cellAspect / assetAspect : assetAspect / cellAspect;
  return 1 - ratio;
}
