import type { Direction, Fit, Frame, Manifest, Page } from "./manifest";

/** 画布归一化坐标下的矩形：与 Frame 同义，坐标和尺寸都是画布宽高的比例 */
export type Rect = Frame;

export interface Layer {
  /** 特殊图层：backdrop 是页的模糊背景（铺满画面，由渲染器模糊并压暗），缺省为普通素材层 */
  role?: "backdrop";
  pageId: string;
  assetId: string;
  kind: "image" | "video";
  fit: Fit;
  /** 裁切区域：整页变换后的格子范围。内容只在此范围内可见 */
  clip: Rect;
  /** 内容矩形：格子经入场动画和整页变换后的位置与大小。素材按 fit 填入此矩形 */
  rect: Rect;
  opacity: number;
  /** 仅视频：应显示的素材时间点（秒） */
  videoTime?: number;
}

export interface FrameState {
  /** 已限制在 [0, duration] 内的时间 */
  time: number;
  pageIndex: number;
  /** 绘制顺序：先画的在下。转场期间上一页在下，当前页在上 */
  layers: Layer[];
}

/** 统一的缓入缓出曲线（PRD 7.5：v0.1 所有动画共用，不可配置） */
export function easeInOut(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const ZOOM_FROM = 0.9; // 新页 / 入场 scale 的起始比例
const ZOOM_OUT_TO = 1.1; // zoom 转场中上一页放大到的比例

interface PageTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

const IDENTITY: PageTransform = { scale: 1, offsetX: 0, offsetY: 0, opacity: 1 };

function directionVector(direction: string | undefined): { dx: number; dy: number } {
  switch (direction as Direction | undefined) {
    case "right":
      return { dx: 1, dy: 0 };
    case "up":
      return { dx: 0, dy: -1 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
    default: // 缺省或未知方向按 left 处理
      return { dx: -1, dy: 0 };
  }
}

/**
 * 转场期间新页与上一页的整页变换（PRD 8.1）。p 是已缓动的进度 0..1。
 * 未知的转场类型按 fade 处理（PRD 7.6）。
 * 上一页按字面“淡出”：不透明度 1-p；因此 fade/zoom 的中点会略暗于纯交叉淡化。
 */
function transitionTransforms(
  type: string,
  direction: string | undefined,
  p: number,
): { incoming: PageTransform; outgoing: PageTransform } {
  switch (type) {
    case "none":
      return { incoming: IDENTITY, outgoing: { ...IDENTITY, opacity: 0 } };
    case "slide": {
      const { dx, dy } = directionVector(direction);
      // 新页沿 direction 移动：从相反一侧进入，把上一页推出画面
      return {
        incoming: { scale: 1, offsetX: -dx * (1 - p), offsetY: -dy * (1 - p), opacity: 1 },
        outgoing: { scale: 1, offsetX: dx * p, offsetY: dy * p, opacity: 1 },
      };
    }
    case "zoom":
      return {
        incoming: { scale: ZOOM_FROM + (1 - ZOOM_FROM) * p, offsetX: 0, offsetY: 0, opacity: p },
        outgoing: { scale: 1 + (ZOOM_OUT_TO - 1) * p, offsetX: 0, offsetY: 0, opacity: 1 - p },
      };
    case "fade":
    default:
      return {
        incoming: { ...IDENTITY, opacity: p },
        outgoing: { ...IDENTITY, opacity: 1 - p },
      };
  }
}

interface EnterState {
  opacity: number;
  scale: number;
  offsetX: number; // 单位：格子宽度
  offsetY: number; // 单位：格子高度
}

/** 单个素材的入场动画状态（PRD 8.3）。未知类型按 none 处理，即随页面直接出现。 */
function enterState(enter: NonNullable<Page["items"][number]["enter"]>, pageTime: number): EnterState {
  const shown: EnterState = { opacity: 1, scale: 1, offsetX: 0, offsetY: 0 };
  if (enter.type !== "fade" && enter.type !== "slide" && enter.type !== "scale") return shown;

  const local = pageTime - (enter.delay ?? 0);
  const raw = enter.duration > 0 ? local / enter.duration : local >= 0 ? 1 : 0;
  if (local < 0) return { opacity: 0, scale: enter.type === "scale" ? ZOOM_FROM : 1, offsetX: 0, offsetY: 0 };
  const p = easeInOut(raw);

  switch (enter.type) {
    case "fade":
      return { ...shown, opacity: p };
    case "scale":
      return { ...shown, opacity: p, scale: ZOOM_FROM + (1 - ZOOM_FROM) * p };
    case "slide": {
      // 素材沿 direction 移动：从格子外相反一侧滑入，裁切在格子内，所以视觉上是从格子边缘划入
      const { dx, dy } = directionVector(enter.direction);
      return { ...shown, offsetX: -dx * (1 - p), offsetY: -dy * (1 - p) };
    }
  }
}

function transformRect(r: Rect, t: PageTransform): Rect {
  return {
    x: 0.5 + (r.x - 0.5) * t.scale + t.offsetX,
    y: 0.5 + (r.y - 0.5) * t.scale + t.offsetY,
    w: r.w * t.scale,
    h: r.h * t.scale,
  };
}

const FULL_CANVAS: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** 页是否会露出画布背景：多于一个素材（拼图），或有完整显示（contain）的素材 */
function pageNeedsBackdrop(page: Page): boolean {
  return page.items.length > 1 || page.items.some((item) => item.fit === "contain");
}

function pageLayers(
  manifest: Manifest,
  page: Page,
  pageTime: number,
  pageTransform: PageTransform,
): Layer[] {
  const layers: Layer[] = [];
  for (const item of page.items) {
    const asset = manifest.assets.find((a) => a.id === item.assetId);
    if (!asset || (asset.type !== "image" && asset.type !== "video")) continue;

    const enter = item.enter ? enterState(item.enter, pageTime) : { opacity: 1, scale: 1, offsetX: 0, offsetY: 0 };
    const f = item.frame;
    const cell: Rect = f;
    const content: Rect = {
      x: f.x + f.w / 2 + enter.offsetX * f.w - (f.w * enter.scale) / 2,
      y: f.y + f.h / 2 + enter.offsetY * f.h - (f.h * enter.scale) / 2,
      w: f.w * enter.scale,
      h: f.h * enter.scale,
    };

    const layer: Layer = {
      pageId: page.id,
      assetId: item.assetId,
      kind: asset.type,
      fit: item.fit ?? "cover",
      clip: transformRect(cell, pageTransform),
      rect: transformRect(content, pageTransform),
      opacity: pageTransform.opacity * enter.opacity,
    };
    if (asset.type === "video") {
      // 素材不够长时停在最后一帧
      const wanted = (item.clipStart ?? 0) + Math.max(0, pageTime);
      layer.videoTime = asset.duration === undefined ? wanted : Math.min(wanted, asset.duration);
    }
    layers.push(layer);
  }

  // 格式 0.3：留空处画模糊背景。取页里第一个素材，铺满画面，跟随整页变换，画在所有素材层下面
  const first = layers[0];
  if (manifest.canvas.backdrop === "blur" && first && pageNeedsBackdrop(page)) {
    const backdrop: Layer = {
      role: "backdrop",
      pageId: page.id,
      assetId: first.assetId,
      kind: first.kind,
      fit: "cover",
      clip: transformRect(FULL_CANVAS, pageTransform),
      rect: transformRect(FULL_CANVAS, pageTransform),
      opacity: pageTransform.opacity,
    };
    if (first.videoTime !== undefined) backdrop.videoTime = first.videoTime;
    layers.unshift(backdrop);
  }
  return layers;
}

/**
 * 时间线引擎的核心纯函数：给定清单和时间 t，返回这一刻需要绘制的全部图层。
 * 预览和将来的 MP4 导出共用它，渲染器只负责按结果绘制。
 */
export function stateAt(manifest: Manifest, t: number): FrameState {
  const pages = manifest.pages;
  const time = Math.min(Math.max(t, 0), manifest.duration);

  let pageIndex = pages.length - 1;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    if (time < p.start + p.duration) {
      pageIndex = i;
      break;
    }
  }
  const page = pages[pageIndex]!;
  const pageTime = time - page.start;

  const tr = page.transitionIn;
  const inTransition = tr !== undefined && tr.duration > 0 && pageTime < tr.duration;

  if (!inTransition) {
    return { time, pageIndex, layers: pageLayers(manifest, page, pageTime, IDENTITY) };
  }

  const p = easeInOut(pageTime / tr.duration);
  const { incoming, outgoing } = transitionTransforms(tr.type, tr.direction, p);
  const layers: Layer[] = [];
  const previous = pages[pageIndex - 1];
  if (previous) {
    // 上一页停在它最后一刻：入场动画已完成，视频停在末帧
    layers.push(...pageLayers(manifest, previous, previous.duration, outgoing));
  }
  layers.push(...pageLayers(manifest, page, pageTime, incoming));
  return { time, pageIndex, layers };
}

/**
 * 背景音乐在影片时间 t 的音量（PRD 第 9 节 A-03）：开头淡入、影片结尾淡出。
 * 没有背景音乐时返回 0。
 */
export function bgmGainAt(manifest: Manifest, t: number): number {
  const bgm = manifest.bgm;
  if (!bgm) return 0;
  const time = Math.min(Math.max(t, 0), manifest.duration);
  const volume = bgm.volume ?? 1;
  const fadeIn = bgm.fadeIn ?? 0;
  const fadeOut = bgm.fadeOut ?? 0;
  const inGain = fadeIn > 0 ? Math.min(1, time / fadeIn) : 1;
  const outGain = fadeOut > 0 ? Math.min(1, (manifest.duration - time) / fadeOut) : 1;
  return volume * inGain * outGain;
}

/** 背景音乐在影片时间 t 应处的音频位置（秒）。循环时对音频时长取模；不循环且音频已播完返回 null。 */
export function bgmPositionAt(manifest: Manifest, t: number): number | null {
  const bgm = manifest.bgm;
  if (!bgm) return null;
  const asset = manifest.assets.find((a) => a.id === bgm.assetId);
  if (!asset || asset.duration === undefined) return null;
  const time = Math.min(Math.max(t, 0), manifest.duration);
  if (bgm.loop) return time % asset.duration;
  return time < asset.duration ? time : null;
}

/** 视频原声每页开头淡入、结尾淡出的时长（秒，docs/dev-0.3.0.md T-21） */
export const VIDEO_AUDIO_FADE_SECONDS = 0.1;

/**
 * 没有背景音乐时，视频页原声的增益系数（A-05）：页开头 FADE 秒内线性淡入，结尾 FADE 秒内线性淡出。
 * `localTime` 是相对该页开始的秒数；结果在 0 到 1 之间。预览和导出共用。
 */
export function videoAudioGain(localTime: number, pageDuration: number): number {
  const fade = VIDEO_AUDIO_FADE_SECONDS;
  const gain = Math.min(1, localTime / fade) * Math.min(1, (pageDuration - localTime) / fade);
  return Math.min(1, Math.max(0, gain));
}
