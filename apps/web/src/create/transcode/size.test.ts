import {describe, expect, it} from "vitest";
import {fitVideoSize} from "./size";

describe("fitVideoSize", () => {
    it("不超过 1080p 的视频保持原样", () => {
        expect(fitVideoSize(1920, 1080)).toBeNull();
        expect(fitVideoSize(1080, 1920)).toBeNull();
        expect(fitVideoSize(540, 960)).toBeNull();
    });

    it("横屏 4K 缩到 1920×1080", () => {
        expect(fitVideoSize(3840, 2160)).toEqual({width: 1920, height: 1080});
    });

    it("竖屏 4K 缩到 1080×1920", () => {
        expect(fitVideoSize(2160, 3840)).toEqual({width: 1080, height: 1920});
    });

    it("保持宽高比，结果为偶数", () => {
        const fitted = fitVideoSize(4032, 3024)!;
        expect(fitted.width % 2).toBe(0);
        expect(fitted.height % 2).toBe(0);
        expect(fitted.height).toBe(1080);
        expect(Math.abs((fitted.width / fitted.height) - (4032 / 3024))).toBeLessThan(0.01);
    });

    it("方形视频缩到高度不超过 1080", () => {
        expect(fitVideoSize(3000, 3000)).toEqual({width: 1080, height: 1080});
    });
});
