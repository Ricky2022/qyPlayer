import type {Manifest} from "@qyplayer/core";
import {describe, expect, it} from "vitest";
import {nextPageTime, pageIndexAt, pageSeekTime, previousPageTime} from "./pages";

/** 三页：0–3、3–7、7–10，转场各 0.6 秒 */
const manifest = {
    duration: 10,
    pages: [
        {id: "p1", start: 0, duration: 3, transitionIn: {type: "fade", duration: 0.6}, items: []},
        {id: "p2", start: 3, duration: 4, transitionIn: {type: "slide", direction: "left", duration: 0.6}, items: []},
        {id: "p3", start: 7, duration: 3, transitionIn: {type: "none", duration: 0}, items: []},
    ],
} as unknown as Manifest;

describe("pageIndexAt", () => {
    it("交界时刻算后一页，影片结束算最后一页", () => {
        expect([0, 2.99, 3, 6.9, 7, 9.99, 10, 99].map((t) => pageIndexAt(manifest, t))).toEqual([0, 0, 1, 1, 2, 2, 2, 2]);
    });
});

describe("pageSeekTime", () => {
    it("第一页从 0 开始，其余页定位到转场结束的时刻", () => {
        expect([0, 1, 2].map((i) => pageSeekTime(manifest, i))).toEqual([0, 3.6, 7]);
    });

    it("下标越界时限制在有效范围内", () => {
        expect(pageSeekTime(manifest, -1)).toBe(0);
        expect(pageSeekTime(manifest, 9)).toBe(7);
    });
});

describe("nextPageTime", () => {
    it("下一页的转场结束时刻；最后一页没有下一页", () => {
        expect(nextPageTime(manifest, 0)).toBe(3.6);
        expect(nextPageTime(manifest, 5)).toBe(7);
        expect(nextPageTime(manifest, 8)).toBeUndefined();
    });
});

describe("previousPageTime", () => {
    it("本页刚开始（1 秒内）回到上一页；播放了一阵回到本页开头", () => {
        expect(previousPageTime(manifest, 4)).toBe(0);
        expect(previousPageTime(manifest, 5)).toBe(3.6);
        expect(previousPageTime(manifest, 7.2)).toBe(3.6);
        expect(previousPageTime(manifest, 9)).toBe(7);
    });

    it("第一页总是回到 0", () => {
        expect(previousPageTime(manifest, 0.3)).toBe(0);
        expect(previousPageTime(manifest, 2)).toBe(0);
    });
});
