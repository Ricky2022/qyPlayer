import type { FrameState, Layer, Manifest } from "@qyplayer/core";
import { stateAt } from "@qyplayer/core";
import { computeFit } from "./fit";

/** 渲染器能画的素材：已解码的图片、当前帧的视频、或任意 Canvas */
export interface DrawableAsset {
  source: CanvasImageSource;
  /** 素材的像素宽高（视频用 videoWidth/videoHeight） */
  width: number;
  height: number;
}

/** 本设备无法播放的素材：不带画面，渲染器在它的格子里画占位画面 */
export interface PlaceholderAsset {
  placeholder: true;
}

/** 占位画面的底色、文字颜色，字号取格子短边的 8%，过宽时缩小，最小 12 像素 */
export const PLACEHOLDER_BACKGROUND = "#2a2a2a";
export const PLACEHOLDER_TEXT_COLOR = "#9aa0a6";
const PLACEHOLDER_FONT_RATIO = 0.08;
const PLACEHOLDER_MIN_FONT_PX = 12;

/**
 * 按图层取得可绘制的素材。返回 undefined 表示素材尚未就绪，该图层跳过；
 * 返回 PlaceholderAsset 表示素材无法播放，画占位画面。
 * 传入 layer 是为了让视频实现能按 layer.videoTime 定位。
 */
export type AssetResolver = (assetId: string, layer: Layer) => DrawableAsset | PlaceholderAsset | undefined;

export interface RenderOptions {
  /** 占位画面上的文字。渲染器不知道界面语言，由调用方传入；缺省时只画底色 */
  placeholderText?: string;
}

function isPlaceholder(asset: DrawableAsset | PlaceholderAsset): asset is PlaceholderAsset {
  return "placeholder" in asset;
}

/**
 * 占位文字的字号：自然字号为格子短边的 8%；文字比可用宽度宽时等比缩小，但不小于 12 像素。
 * naturalWidth 是文字在自然字号下的宽度。
 */
export function placeholderFontSize(cellShortSide: number, naturalWidth: number, maxWidth: number): number {
  const natural = Math.max(cellShortSide * PLACEHOLDER_FONT_RATIO, PLACEHOLDER_MIN_FONT_PX);
  const fitted = naturalWidth > maxWidth && naturalWidth > 0 ? (natural * maxWidth) / naturalWidth : natural;
  return Math.max(fitted, PLACEHOLDER_MIN_FONT_PX);
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * 在 ctx 上画出影片在时间 t（或已算好的 state）的一帧。
 * 画布像素尺寸取自 ctx.canvas，清单里的坐标是 0..1 的归一化坐标，因此与分辨率无关。
 * 预览和将来的 MP4 导出共用这个函数。
 */
export function renderFrame(
  ctx: Ctx,
  manifest: Manifest,
  timeOrState: number | FrameState,
  resolve: AssetResolver,
  options: RenderOptions = {},
): FrameState {
  const state = typeof timeOrState === "number" ? stateAt(manifest, timeOrState) : timeOrState;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = manifest.canvas.background;
  ctx.fillRect(0, 0, width, height);

  for (const layer of state.layers) {
    if (layer.opacity <= 0) continue;
    const asset = resolve(layer.assetId, layer);
    if (!asset) continue;

    const clip = layer.clip;
    const rect = layer.rect;
    const target = { x: rect.x * width, y: rect.y * height, w: rect.w * width, h: rect.h * height };
    if (isPlaceholder(asset)) {
      drawPlaceholder(ctx, target, clip, width, height, Math.min(1, layer.opacity), options.placeholderText);
      continue;
    }
    const { source, dest } = computeFit(layer.fit, asset.width, asset.height, target);
    if (dest.w <= 0 || dest.h <= 0) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x * width, clip.y * height, clip.w * width, clip.h * height);
    ctx.clip();
    ctx.globalAlpha = Math.min(1, layer.opacity);
    ctx.drawImage(asset.source, source.x, source.y, source.w, source.h, dest.x, dest.y, dest.w, dest.h);
    ctx.restore();
  }

  ctx.restore();
  return state;
}

function drawPlaceholder(
  ctx: Ctx,
  target: { x: number; y: number; w: number; h: number },
  clip: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
  opacity: number,
  text: string | undefined,
): void {
  if (target.w <= 0 || target.h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x * width, clip.y * height, clip.w * width, clip.h * height);
  ctx.clip();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = PLACEHOLDER_BACKGROUND;
  ctx.fillRect(target.x, target.y, target.w, target.h);
  if (text) {
    const shortSide = Math.min(target.w, target.h);
    const family = "sans-serif";
    const natural = Math.max(shortSide * PLACEHOLDER_FONT_RATIO, PLACEHOLDER_MIN_FONT_PX);
    ctx.font = `${natural}px ${family}`;
    const size = placeholderFontSize(shortSide, ctx.measureText(text).width, target.w * 0.9);
    ctx.font = `${size}px ${family}`;
    ctx.fillStyle = PLACEHOLDER_TEXT_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, target.x + target.w / 2, target.y + target.h / 2);
  }
  ctx.restore();
}
