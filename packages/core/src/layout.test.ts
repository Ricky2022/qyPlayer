import {describe, expect, it} from "vitest";
import {LAYOUTS, cellAspect, coverCropLoss, defaultLayout, layoutFrames} from "./layout";

describe("layoutFrames", () => {
    it("single item fills the canvas", () => {
        expect(layoutFrames(1, "16:9")).toEqual([{x: 0, y: 0, w: 1, h: 1}]);
        expect(layoutFrames(1, "9:16")).toEqual([{x: 0, y: 0, w: 1, h: 1}]);
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
                // eslint-disable-next-line max-nested-callbacks
                frames.slice(i + 1).forEach((g) => {
                    const overlap = f.x < g.x + g.w - 1e-9 && g.x < f.x + f.w - 1e-9 && f.y < g.y + g.h - 1e-9 && g.y < f.y + f.h - 1e-9;
                    expect(overlap).toBe(false);
                });
            });
        }
    });

    it("16:9 two photos sit side by side, 9:16 stacked", () => {
        const [a, b] = layoutFrames(2, "16:9");
        expect(a!.y).toBe(b!.y);
        expect(b!.x).toBeGreaterThan(a!.x + a!.w);
        const [c, d] = layoutFrames(2, "9:16");
        expect(c!.x).toBe(d!.x);
        expect(d!.y).toBeGreaterThan(c!.y + c!.h);
    });

    it("16:9 three photos: one tall cell on the left, two stacked on the right", () => {
        const [left, topRight, bottomRight] = layoutFrames(3, "16:9");
        expect(left!.h).toBeGreaterThan(topRight!.h);
        expect(topRight!.x).toBe(bottomRight!.x);
        expect(bottomRight!.y).toBeGreaterThan(topRight!.y);
        expect(cellAspect(left!, "16:9")).toBeLessThan(1);
        expect(cellAspect(topRight!, "16:9")).toBeGreaterThan(1);
    });

    it("9:16 three photos: one wide cell on top, two side by side below", () => {
        const [top, bl, br] = layoutFrames(3, "9:16");
        expect(top!.w).toBeGreaterThan(bl!.w);
        expect(bl!.y).toBe(br!.y);
        expect(br!.x).toBeGreaterThan(bl!.x);
    });

    it("gap is 2% of the short edge in pixels, on both axes", () => {
        const [a, b] = layoutFrames(2, "16:9");
        const gapPx = (b!.x - (a!.x + a!.w)) * 1920;
        expect(gapPx).toBeCloseTo(21.6, 0);
        const [c, d] = layoutFrames(2, "9:16");
        const gapPy = (d!.y - (c!.y + c!.h)) * 1920;
        expect(gapPy).toBeCloseTo(21.6, 0);
    });

    it.each([
        ["16:9", 1920, 1080],
        ["9:16", 1080, 1920],
    ] as const)("%s: a group of 2 to 4 leaves a margin of 4%% of the short edge on all four sides", (ratio, width, height) => {
        for (const count of [2, 3, 4] as const) {
            const frames = layoutFrames(count, ratio);
            const left = Math.min(...frames.map((f) => f.x)) * width;
            const top = Math.min(...frames.map((f) => f.y)) * height;
            const right = (1 - Math.max(...frames.map((f) => f.x + f.w))) * width;
            const bottom = (1 - Math.max(...frames.map((f) => f.y + f.h))) * height;
            for (const margin of [left, top, right, bottom]) {
                expect(margin).toBeCloseTo(43.2, 0);
            }
        }
    });
});

describe("版式表", () => {
    const COUNTS = [1, 2, 3, 4] as const;

    it.each(["16:9", "9:16"] as const)("%s: 缺省版式等于 defaultLayout 指定的版式", (ratio) => {
        for (const count of COUNTS) {
            expect(layoutFrames(count, ratio)).toEqual(layoutFrames(count, ratio, defaultLayout(count, ratio)));
        }
    });

    it.each(["16:9", "9:16"] as const)("%s: 每种版式的格子都在画布内、互不重叠、第 1 格最大", (ratio) => {
        for (const count of COUNTS) {
            for (const layout of LAYOUTS[count]) {
                const frames = layoutFrames(count, ratio, layout);
                expect(frames).toHaveLength(count);
                const areas = frames.map((f) => f.w * f.h);
                if (count > 1 && layout !== "grid" && layout !== "side" && layout !== "stack") {
                    expect(areas[0]).toBe(Math.max(...areas));
                }
                frames.forEach((f, i) => {
                    expect(f.x).toBeGreaterThanOrEqual(0);
                    expect(f.y).toBeGreaterThanOrEqual(0);
                    expect(f.x + f.w).toBeLessThanOrEqual(1 + 1e-9);
                    expect(f.y + f.h).toBeLessThanOrEqual(1 + 1e-9);
                    // eslint-disable-next-line max-nested-callbacks
                    frames.slice(i + 1).forEach((g) => {
                        // eslint-disable-next-line @stylistic/max-len
                        const overlap = f.x < g.x + g.w - 1e-9 && g.x < f.x + f.w - 1e-9 && f.y < g.y + g.h - 1e-9 && g.y < f.y + f.h - 1e-9;
                        expect(overlap, `${layout} ${i}`).toBe(false);
                    });
                });
            }
        }
    });

    it("不同版式确实不同；对该张数无效的编号退回缺省", () => {
        expect(layoutFrames(2, "16:9", "stack")).not.toEqual(layoutFrames(2, "16:9", "side"));
        expect(layoutFrames(3, "16:9", "big-right")[0]!.x).toBeGreaterThan(0.4);
        expect(layoutFrames(3, "16:9", "big-bottom")[0]!.y).toBeGreaterThan(0.4);
        expect(layoutFrames(2, "16:9", "grid")).toEqual(layoutFrames(2, "16:9"));
        expect(layoutFrames(4, "9:16", "nope")).toEqual(layoutFrames(4, "9:16"));
    });

    it("4 张的 big-left / big-top：第 1 格占半边，其余三格等大排在另一边", () => {
        const left = layoutFrames(4, "16:9", "big-left");
        expect(left[0]!.h).toBeGreaterThan(left[1]!.h * 2);
        expect(new Set(left.slice(1).map((f) => f.x)).size).toBe(1);
        const top = layoutFrames(4, "9:16", "big-top");
        expect(top[0]!.w).toBeGreaterThan(top[1]!.w * 2);
        expect(new Set(top.slice(1).map((f) => f.y)).size).toBe(1);
    });
});

describe("coverCropLoss", () => {
    it("is 0 for a matching aspect ratio", () => {
        expect(coverCropLoss(1920, 1080, 16 / 9)).toBeCloseTo(0, 10);
    });

    it("is about 0.16 for a 3:2 photo in a 16:9 cell", () => {
        expect(coverCropLoss(3000, 2000, 16 / 9)).toBeCloseTo(1 - (1.5 / (16 / 9)), 6);
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
