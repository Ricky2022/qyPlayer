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

/**
 * 按图层取得可绘制的素材。返回 undefined 表示素材尚未就绪，该图层跳过。
 * 传入 layer 是为了让视频实现能按 layer.videoTime 定位。
 */
export type AssetResolver = (assetId: string, layer: Layer) => DrawableAsset | undefined;

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
