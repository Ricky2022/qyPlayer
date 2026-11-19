import type { Look } from "@qyplayer/core";

/**
 * 一遍叠色：用 globalCompositeOperation 的混合模式把一整块颜色盖到已画好的画面上。
 * 不用 ctx.filter：Safari 不支持。数值是首版的调色结果，docs/dev-0.4.0.md 第 5 节。
 */
export interface LookPass {
  op: GlobalCompositeOperation;
  color: string;
  alpha: number;
}

export const LOOK_PASSES: Record<Look, readonly LookPass[]> = {
  // saturation：保留亮度，取中灰的饱和度（0），即去色
  mono: [{ op: "saturation", color: "#808080", alpha: 1 }],
  warm: [{ op: "overlay", color: "#ff9a3c", alpha: 0.3 }],
  cool: [{ op: "overlay", color: "#3c8cff", alpha: 0.3 }],
  // 降一部分饱和度、叠暖黄、把纯黑抬成深棕
  vintage: [
    { op: "saturation", color: "#808080", alpha: 0.35 },
    { op: "multiply", color: "#f2dcb0", alpha: 0.45 },
    { op: "lighten", color: "#1e1a16", alpha: 1 },
  ],
};

/** 清单里的 look 是不是本实现认识的滤镜；缺省或不认识的值都按原片 */
export function knownLook(look: string | undefined): Look | undefined {
  return look !== undefined && Object.prototype.hasOwnProperty.call(LOOK_PASSES, look) ? (look as Look) : undefined;
}

/** 把滤镜盖到整个画布上 */
export function applyLook(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, look: Look, width: number, height: number): void {
  ctx.save();
  for (const pass of LOOK_PASSES[look]) {
    ctx.globalCompositeOperation = pass.op;
    ctx.globalAlpha = pass.alpha;
    ctx.fillStyle = pass.color;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}
