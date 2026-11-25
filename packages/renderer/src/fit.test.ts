import {describe, expect, it} from "vitest";
import {computeFit} from "./fit";

const target16x9 = {x: 0, y: 0, w: 1920, h: 1080};

describe("computeFit cover", () => {
    it("crops the top and bottom of a 3:2 landscape photo in a 16:9 cell", () => {
        const {source, dest} = computeFit("cover", 3000, 2000, target16x9);
        expect(dest).toEqual(target16x9);
        expect(source.x).toBe(0);
        expect(source.w).toBe(3000);
        expect(source.h).toBeCloseTo(3000 * (1080 / 1920), 6);
        expect(source.y).toBeCloseTo((2000 - source.h) / 2, 6);
    });

    it("keeps only a middle band of a portrait photo in a 16:9 cell", () => {
        const {source} = computeFit("cover", 2000, 3000, target16x9);
        // scale = max(1920/2000, 1080/3000) = 0.96：取满宽 2000，高度只取 1080/0.96 = 1125
        expect(source.x).toBe(0);
        expect(source.w).toBeCloseTo(2000, 6);
        expect(source.h).toBeCloseTo(1125, 6);
        expect(source.y).toBeCloseTo((3000 - 1125) / 2, 6);
    });

    it("keeps only a middle band of a landscape photo in a 9:16 cell", () => {
        const {source} = computeFit("cover", 3000, 2000, {x: 0, y: 0, w: 1080, h: 1920});
        // scale = max(1080/3000, 1920/2000) = 0.96：取满高 2000，宽度只取 1080/0.96 = 1125
        expect(source.y).toBe(0);
        expect(source.h).toBeCloseTo(2000, 6);
        expect(source.w).toBeCloseTo(1125, 6);
        expect(source.x).toBeCloseTo((3000 - 1125) / 2, 6);
    });

    it("uses the full asset when aspect ratios match", () => {
        const {source} = computeFit("cover", 3840, 2160, target16x9);
        expect(source).toEqual({x: 0, y: 0, w: 3840, h: 2160});
    });

    it("keeps the cell offset in dest", () => {
        const {dest} = computeFit("cover", 100, 100, {x: 50, y: 20, w: 200, h: 100});
        expect(dest).toEqual({x: 50, y: 20, w: 200, h: 100});
    });
});

describe("computeFit contain", () => {
    it("letterboxes a portrait photo in a 16:9 cell, centred", () => {
        const {source, dest} = computeFit("contain", 2000, 3000, target16x9);
        expect(source).toEqual({x: 0, y: 0, w: 2000, h: 3000});
        expect(dest.h).toBeCloseTo(1080, 6);
        expect(dest.w).toBeCloseTo(720, 6);
        expect(dest.x).toBeCloseTo((1920 - 720) / 2, 6);
        expect(dest.y).toBeCloseTo(0, 6);
    });

    it("pillarboxes a wide photo in a tall cell", () => {
        const {dest} = computeFit("contain", 3000, 1000, {x: 0, y: 0, w: 1080, h: 1920});
        expect(dest.w).toBeCloseTo(1080, 6);
        expect(dest.h).toBeCloseTo(360, 6);
        expect(dest.y).toBeCloseTo((1920 - 360) / 2, 6);
    });
});

describe("computeFit degenerate input", () => {
    it("returns an empty result instead of NaN", () => {
        for (const fit of ["cover", "contain"] as const) {
            const r = computeFit(fit, 0, 100, target16x9);
            expect(r.dest.w).toBe(0);
            expect(Number.isNaN(r.source.w)).toBe(false);
            expect(computeFit(fit, 100, 100, {x: 0, y: 0, w: 0, h: 10}).dest.w).toBe(0);
        }
    });
});
