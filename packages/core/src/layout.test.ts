import { describe, expect, it } from "vitest";
import { cellAspect, coverCropLoss, layoutFrames } from "./layout";

describe("layoutFrames", () => {
  it("single item fills the canvas", () => {
    expect(layoutFrames(1, "16:9")).toEqual([{ x: 0, y: 0, w: 1, h: 1 }]);
    expect(layoutFrames(1, "9:16")).toEqual([{ x: 0, y: 0, w: 1, h: 1 }]);
  });

  it.each(["16:9", "9:16"] as const)("%s: every layout stays inside the canvas and cells do not overlap", (ratio) => {
    for (const count of [1, 2, 3, 4] as const) {
      const frames = layoutFrames(count, ratio);
      expect(frames).toHaveLength(count);
      frames.forEach((f, i) => {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.x + f.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(f.y + f.h).toBeLessThanOrEqual(1 + 1e-9);
        frames.slice(i + 1).forEach((g) => {
          const overlap = f.x < g.x + g.w - 1e-9 && g.x < f.x + f.w - 1e-9 && f.y < g.y + g.h - 1e-9 && g.y < f.y + f.h - 1e-9;
          expect(overlap).toBe(false);
        });
      });
    }
  });

  it("16:9 two photos sit side by side, 9:16 stacked", () => {
    const [a, b] = layoutFrames(2, "16:9");
    expect(a!.y).toBe(0);
    expect(b!.y).toBe(0);
    expect(b!.x).toBeGreaterThan(a!.x + a!.w);
    const [c, d] = layoutFrames(2, "9:16");
    expect(c!.x).toBe(0);
    expect(d!.x).toBe(0);
    expect(d!.y).toBeGreaterThan(c!.y + c!.h);
  });

  it("16:9 three photos: one tall cell on the left, two stacked on the right", () => {
    const [left, topRight, bottomRight] = layoutFrames(3, "16:9");
    expect(left!.h).toBe(1);
    expect(topRight!.x).toBe(bottomRight!.x);
    expect(bottomRight!.y).toBeGreaterThan(topRight!.y);
    expect(cellAspect(left!, "16:9")).toBeLessThan(1);
    expect(cellAspect(topRight!, "16:9")).toBeGreaterThan(1);
  });

  it("9:16 three photos: one wide cell on top, two side by side below", () => {
    const [top, bl, br] = layoutFrames(3, "9:16");
    expect(top!.w).toBe(1);
    expect(bl!.y).toBe(br!.y);
    expect(br!.x).toBeGreaterThan(bl!.x);
  });

  it("gap is 1% of the short edge in pixels, on both axes", () => {
    const [a, b] = layoutFrames(2, "16:9");
    const gapPx = (b!.x - (a!.x + a!.w)) * 1920;
    expect(gapPx).toBeCloseTo(10.8, 1);
    const [c, d] = layoutFrames(2, "9:16");
    const gapPy = (d!.y - (c!.y + c!.h)) * 1920;
    expect(gapPy).toBeCloseTo(10.8, 1);
  });
});

describe("coverCropLoss", () => {
  it("is 0 for a matching aspect ratio", () => {
    expect(coverCropLoss(1920, 1080, 16 / 9)).toBeCloseTo(0, 10);
  });

  it("is about 0.16 for a 3:2 photo in a 16:9 cell", () => {
    expect(coverCropLoss(3000, 2000, 16 / 9)).toBeCloseTo(1 - 1.5 / (16 / 9), 6);
  });

  it("exceeds 0.4 for a portrait photo in a 16:9 cell (PRD T-20)", () => {
    expect(coverCropLoss(2000, 3000, 16 / 9)).toBeGreaterThan(0.4);
  });

  it("is symmetric between wider and taller than the cell", () => {
    expect(coverCropLoss(1000, 500, 1)).toBeCloseTo(coverCropLoss(500, 1000, 1), 10);
  });

  it("returns 0 for degenerate input", () => {
    expect(coverCropLoss(0, 100, 1)).toBe(0);
    expect(coverCropLoss(100, 100, 0)).toBe(0);
  });
});
