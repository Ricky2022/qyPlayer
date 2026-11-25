import type {AspectRatio, Frame} from "./manifest";

/** 画布参考分辨率（PRD T-06） */
export const CANVAS_SIZE: Record<AspectRatio, {
    width: number;
    height: number;
}> = {
    "16:9": {width: 1920, height: 1080},
    "9:16": {width: 1080, height: 1920},
};

/** 多图版式的格子间距，占画布短边的比例（0.4.0 起为卡片式：PRD T-15 原为 1%） */
export const LAYOUT_GAP_RATIO = 0.02;
/** 多图版式整组格子四周的外边距，占画布短边的比例（卡片式，露出背景） */
export const LAYOUT_MARGIN_RATIO = 0.04;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** 每种张数可选的版式编号（docs/dev-0.4.1.md 3）；大格子永远是第 1 张 */
export const LAYOUTS: Record<1 | 2 | 3 | 4, readonly string[]> = {
    1: ["full"],
    2: ["side", "stack"],
    3: ["big-left", "big-right", "big-top", "big-bottom"],
    4: ["grid", "big-left", "big-top"],
};

/** 自动编排用的版式：2 张横屏左右、竖屏上下；3 张横屏左大、竖屏上大；4 张田字 */
export const defaultLayout = function defaultLayout(count: 1 | 2 | 3 | 4, aspectRatio: AspectRatio): string {
    const landscape = aspectRatio === "16:9";
    switch (count) {
        case 1:
            return "full";
        case 2:
            return landscape ? "side" : "stack";
        case 3:
            return landscape ? "big-left" : "big-top";
        case 4:
            return "grid";
    }
};

/**
 * 1~4 张图的版式（PRD 8.2），返回画布归一化坐标下的格子。layout 缺省或对该张数无效时用 defaultLayout；
 * 各版式见 LAYOUTS：2 张 side（左右）、stack（上下）；3 张和 4 张的 big-* 是第 1 张占大半边、其余排在另一边；4 张 grid 是 2×2。
 * 单张铺满；2~4 张整组四周留 LAYOUT_MARGIN_RATIO 的外边距，格子之间留 LAYOUT_GAP_RATIO 的间隙。
 */
export const layoutFrames = function layoutFrames(count: 1 | 2 | 3 | 4, aspectRatio: AspectRatio, layout?: string): Frame[] {
    const {width, height} = CANVAS_SIZE[aspectRatio];
    const short = Math.min(width, height);
    const gx = (short * LAYOUT_GAP_RATIO) / width;
    const gy = (short * LAYOUT_GAP_RATIO) / height;
    const mx = (short * LAYOUT_MARGIN_RATIO) / width;
    const my = (short * LAYOUT_MARGIN_RATIO) / height;
    // 内框：外边距之内的区域，格子都排在里面
    const iw = 1 - (2 * mx);
    const ih = 1 - (2 * my);
    const halfW = (iw - gx) / 2;
    const halfH = (ih - gy) / 2;
    const f = (x: number, y: number, w: number, h: number): Frame => ({
        x: round4(mx + x),
        y: round4(my + y),
        w: round4(w),
        h: round4(h),
    });
    const name = layout !== undefined && LAYOUTS[count].includes(layout) ? layout : defaultLayout(count, aspectRatio);

    switch (count) {
        case 1:
            return [{x: 0, y: 0, w: 1, h: 1}];
        case 2:
            return name === "side" ? [f(0, 0, halfW, ih), f(halfW + gx, 0, halfW, ih)] : [f(0, 0, iw, halfH), f(0, halfH + gy, iw, halfH)];
        case 3:
            switch (name) {
                case "big-right":
                    return [f(halfW + gx, 0, halfW, ih), f(0, 0, halfW, halfH), f(0, halfH + gy, halfW, halfH)];
                case "big-top":
                    return [f(0, 0, iw, halfH), f(0, halfH + gy, halfW, halfH), f(halfW + gx, halfH + gy, halfW, halfH)];
                case "big-bottom":
                    return [f(0, halfH + gy, iw, halfH), f(0, 0, halfW, halfH), f(halfW + gx, 0, halfW, halfH)];
                default:
                    return [f(0, 0, halfW, ih), f(halfW + gx, 0, halfW, halfH), f(halfW + gx, halfH + gy, halfW, halfH)];
            }
        case 4: {
            if (name === "big-left") {
                const t = (ih - (2 * gy)) / 3;
                return [f(0, 0, halfW, ih), ...[0, 1, 2].map((k) => f(halfW + gx, k * (t + gy), halfW, t))];
            }
            if (name === "big-top") {
                const u = (iw - (2 * gx)) / 3;
                return [f(0, 0, iw, halfH), ...[0, 1, 2].map((k) => f(k * (u + gx), halfH + gy, u, halfH))];
            }
            // eslint-disable-next-line @stylistic/max-len
            return [f(0, 0, halfW, halfH), f(halfW + gx, 0, halfW, halfH), f(0, halfH + gy, halfW, halfH), f(halfW + gx, halfH + gy, halfW, halfH)];
        }
    }
};

/** 格子在画布像素下的宽高比 */
export const cellAspect = function cellAspect(frame: Frame, aspectRatio: AspectRatio): number {
    const {width, height} = CANVAS_SIZE[aspectRatio];
    return (frame.w * width) / (frame.h * height);
};

/** cover 裁切会丢掉素材画面的比例（0..1），用于判断是否改用 contain（PRD F-GEN-04、T-20）。 */
export const coverCropLoss = function coverCropLoss(assetW: number, assetH: number, cellAspectRatio: number): number {
    const assetAspect = assetW / assetH;
    if (!(assetAspect > 0) || !(cellAspectRatio > 0)) {
        return 0;
    }
    const ratio = assetAspect > cellAspectRatio ? cellAspectRatio / assetAspect : assetAspect / cellAspectRatio;
    return 1 - ratio;
};
