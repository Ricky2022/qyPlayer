import { describe, expect, it } from "vitest";
import { clampCenter, framedItem, framedState, visibleFraction } from "./framing";
import type { KenBurns } from "./generator/plan";
import type { MotionState } from "./manifest";

// 素材 contain 放进宽高比 cell 的格子（格子归一化为 1×1），再按 scale 放大、平移 x、y（以格子宽高为单位）
function coveredRect(assetAspect: number, cell: number, s: MotionState): { left: number; right: number; top: number; bottom: number } {
  const wide = assetAspect > cell;
  const w = (wide ? 1 : assetAspect / cell) * s.scale;
  const h = (wide ? cell / assetAspect : 1) * s.scale;
  return { left: 0.5 + s.x - w / 2, right: 0.5 + s.x + w / 2, top: 0.5 + s.y - h / 2, bottom: 0.5 + s.y + h / 2 };
}

const KINDS: (KenBurns | undefined)[] = [undefined, "none", "in", "out", "left", "right", "up", "down"];
const ASPECTS = [3 / 2, 2 / 3, 16 / 9, 9 / 16, 1, 4 / 3];
const CELLS = [16 / 9, 9 / 16, 1, 0.5, 1.2];
const CENTERS = [0, 0.1, 0.5, 0.9, 1];

describe("framedItem", () => {
  it("zoom 1 居中：与完整显示放大到刚好铺满格子一致", () => {
    // 3:2 照片放进 16:9 格子：R = (16/9)/(3/2) 的倒数形式 = max(a/A, A/a)
    const framed = framedItem({ width: 3000, height: 2000 }, 16 / 9, { zoom: 1, x: 0.5, y: 0.5 }, undefined);
    expect(framed.fit).toBe("contain");
    const r = (16 / 9) / (3 / 2);
    expect(framed.motion.from).toEqual(framed.motion.to);
    expect(framed.motion.from.scale).toBeCloseTo(r, 3);
    expect(framed.motion.from.x).toBe(0);
    expect(framed.motion.from.y).toBe(0);
  });

  it("任何宽高比、取景、Ken Burns 下格子都被盖满", () => {
    for (const a of ASPECTS)
      for (const cell of CELLS)
        for (const zoom of [1, 1.7, 3])
          for (const x of CENTERS)
            for (const y of CENTERS)
              for (const kind of KINDS) {
                const { motion } = framedItem({ width: a * 1000, height: 1000 }, cell, { zoom, x, y }, kind);
                for (const s of [motion.from, motion.to]) {
                  const r = coveredRect(a, cell, s);
                  const label = `a=${a} cell=${cell} z=${zoom} c=(${x},${y}) ${kind}`;
                  expect(r.left, label).toBeLessThanOrEqual(1e-3);
                  expect(r.top, label).toBeLessThanOrEqual(1e-3);
                  expect(r.right, label).toBeGreaterThanOrEqual(1 - 1e-3);
                  expect(r.bottom, label).toBeGreaterThanOrEqual(1 - 1e-3);
                }
              }
  });

  it("放大 2 倍并取左上：可见区域在素材左上角，右下被裁掉", () => {
    // 正方形素材放进正方形格子：scale = 2，中心夹到 (0.25, 0.25)，素材左上角对齐格子左上角
    const framed = framedItem({ width: 1000, height: 1000 }, 1, { zoom: 2, x: 0, y: 0 }, undefined);
    const r = coveredRect(1, 1, framed.motion.from);
    expect(r.left).toBeCloseTo(0, 3);
    expect(r.top).toBeCloseTo(0, 3);
    expect(r.right).toBeCloseTo(2, 3);
  });

  it("Ken Burns in 放大 1.08 倍，out 反过来，none 不动", () => {
    const crop = { zoom: 1.5, x: 0.5, y: 0.5 };
    const asset = { width: 1000, height: 1000 };
    const still = framedItem(asset, 1, crop, "none").motion;
    const zoomIn = framedItem(asset, 1, crop, "in").motion;
    const zoomOut = framedItem(asset, 1, crop, "out").motion;
    expect(still.from).toEqual(still.to);
    expect(zoomIn.from).toEqual(still.from);
    expect(zoomIn.to.scale).toBeCloseTo(1.5 * 1.08, 3);
    expect(zoomOut.from).toEqual(zoomIn.to);
    expect(zoomOut.to).toEqual(zoomIn.from);
  });

  it("Ken Burns left：内容向左移，x 从大变小", () => {
    const { motion } = framedItem({ width: 1000, height: 1000 }, 1, { zoom: 2, x: 0.5, y: 0.5 }, "left");
    expect(motion.from.x).toBeGreaterThan(motion.to.x);
    expect(motion.from.y).toBe(motion.to.y);
    const down = framedItem({ width: 1000, height: 1000 }, 1, { zoom: 2, x: 0.5, y: 0.5 }, "down").motion;
    expect(down.from.y).toBeLessThan(down.to.y);
  });
});

describe("clampCenter / visibleFraction", () => {
  it("可见区域不超出素材", () => {
    const v = visibleFraction(3 / 2, 16 / 9, 2);
    const c = clampCenter(3 / 2, 16 / 9, 2, -1, 5);
    expect(c.x).toBeCloseTo(v.w / 2, 10);
    expect(c.y).toBeCloseTo(1 - v.h / 2, 10);
  });

  it("zoom 1 时素材比格子宽：宽方向有余量、高方向铺满", () => {
    const v = visibleFraction(16 / 9, 1, 1);
    expect(v.h).toBe(1);
    expect(v.w).toBeCloseTo(9 / 16, 10);
    expect(framedState(16 / 9, 1, 1, 0.5, 0.5).y).toBe(0);
  });
});
