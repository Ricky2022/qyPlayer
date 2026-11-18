// 制作器的布局分界（docs/dev-0.3.0.md 3A.2）：按窗口宽度，不按设备类型。

/** 宽度（CSS 像素）不小于此值用三栏布局，小于则用手机布局 */
export const DESKTOP_MIN_WIDTH = 1000;

export type LayoutMode = "desktop" | "mobile";

export const layoutFor = (width: number): LayoutMode => (width >= DESKTOP_MIN_WIDTH ? "desktop" : "mobile");

/** 与 layoutFor 一致的媒体查询，供样式和 matchMedia 共用 */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;
