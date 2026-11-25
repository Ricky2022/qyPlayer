import type {Manifest} from "@qyplayer/core";
import {bgmDuckAt, bgmFadeGainAt, videoAudioGain} from "@qyplayer/core";
import {describe, expect, it} from "vitest";
import example from "../../../../../spec/examples/example.manifest.json";
import example04 from "../../../../../spec/examples/example-0.4.manifest.json";
import {EXPORT_FPS, bgmDuckCurve, bgmGainCurve, exportSize, frameCount, pageGainCurve, remainingSeconds, videoTimestamps} from "./spec";

const manifest = example as unknown as Manifest;

describe("exportSize", () => {
    it("is 1920x1080 for landscape and 1080x1920 for portrait", () => {
        expect(exportSize("16:9")).toEqual({width: 1920, height: 1080});
        expect(exportSize("9:16")).toEqual({width: 1080, height: 1920});
    });
});

describe("frameCount", () => {
    it.each([
        [25.6, 768], // 25.6 * 30 在浮点里略大于 768，不能多出一帧
        [10, 300],
        [10.01, 301],
        [1 / 30, 1],
        [0, 1],
    ])("duration %s gives %s frames", (duration, expected) => {
        expect(frameCount(duration)).toBe(expected);
    });

    it("covers the duration within one frame", () => {
        for (const duration of [3, 7.3, 25.6, 99.99]) {
            const covered = frameCount(duration) / EXPORT_FPS;
            expect(covered).toBeGreaterThanOrEqual(duration - 1e-6);
            expect(covered - duration).toBeLessThan(1 / EXPORT_FPS);
        }
    });
});

describe("videoTimestamps", () => {
    const timestamps = videoTimestamps(manifest);

    it("lists only video assets", () => {
        expect([...timestamps.keys()]).toEqual(["m004"]);
    });

    it("never goes backwards, so the decoder can read the clip once from start to end", () => {
        const list = timestamps.get("m004")!;
        for (let i = 1; i < list.length; i++) {
            expect(list[i]!).toBeGreaterThanOrEqual(list[i - 1]!);
        }
        expect(list[0]).toBeLessThan(0.2); // 入场第一帧透明度为 0，不取画面，所以从第 2 帧开始
        expect(list.at(-1)).toBeLessThanOrEqual(8);
    });

    it("takes one timestamp per frame the clip is on screen", () => {
        const page = manifest.pages[2]!;
        const frames = timestamps.get("m004")!.length;
        // 本页 8 秒是 240 帧；转场里上一页的最后一帧也要画，所以不少于页内帧数
        expect(frames).toBeGreaterThanOrEqual((page.duration * EXPORT_FPS) - 1);
        expect(frames).toBeLessThanOrEqual(((page.duration + (manifest.pages[3]!.transitionIn?.duration ?? 0)) * EXPORT_FPS) + 2);
    });
});

describe("videoTimestamps 与模糊背景", () => {
    it("完整显示的视频页带模糊背景层，背景层不另取视频帧", () => {
        const withBackdrop = JSON.parse(JSON.stringify(manifest)) as Manifest;
        withBackdrop.canvas.backdrop = "blur";
        withBackdrop.pages[2]!.items[0]!.fit = "contain";
        expect(videoTimestamps(withBackdrop)).toEqual(videoTimestamps(manifest));
    });
});

describe("gain curves", () => {
    it("background music fades in and out with straight lines between the knots", () => {
        const curve = bgmGainCurve(manifest, 0, manifest.duration);
        expect(curve.map((p) => p.time)).toEqual([0, 1, manifest.duration - 2, manifest.duration]);
        expect(curve.map((p) => p.gain)).toEqual([0, 1, 1, 0]);
    });

    it("a window inside the steady part is a constant", () => {
        expect(bgmGainCurve(manifest, 10, 20)).toEqual([
            {time: 10, gain: 1},
            {time: 20, gain: 1},
        ]);
    });

    it("a window that starts inside a fade begins at the fade's value", () => {
        const [first, second] = bgmGainCurve(manifest, 0.5, 5);
        expect(first).toEqual({time: 0.5, gain: 0.5});
        expect(second).toEqual({time: 1, gain: 1});
    });

    it("video sound fades in and out over 0.1 seconds on each page", () => {
        const curve = pageGainCurve(3, 0, 3);
        expect(curve.map((p) => p.time)).toEqual([0, 0.1, 2.9, 3]);
        expect(curve.map((p) => p.gain)).toEqual([0, 1, 1, 0]);
    });

    it("the ducking curve follows bgmDuckAt, and the fade curve does not include it", () => {
        const mixed = example04 as unknown as Manifest;
        const fade = bgmGainCurve(mixed, 0, mixed.duration);
        const duck = bgmDuckCurve(mixed, 0, mixed.duration);
        for (const point of fade) {
            expect(point.gain).toBeCloseTo(bgmFadeGainAt(mixed, point.time), 9);
        }
        for (const point of duck) {
            expect(point.gain).toBeCloseTo(bgmDuckAt(mixed, point.time), 9);
        }
        // 有声视频页是 11.2 到 19.2 秒，压低从 10.7 秒开始、到 19.7 秒结束
        expect(duck.map((p) => p.time)).toEqual([0, 10.7, 11.2, 19.2, 19.7, mixed.duration]);
        expect(duck.find((p) => p.time === 11.2)?.gain).toBeCloseTo(0.3, 9);
    });

    it("overlapping fades are sampled so the curve follows the real gain", () => {
        const curve = pageGainCurve(0.15, 0, 0.15);
        expect(curve.length).toBeGreaterThan(3);
        for (const point of curve) {
            expect(point.gain).toBeCloseTo(videoAudioGain(point.time, 0.15), 10);
        }
    });
});

describe("remainingSeconds", () => {
    it("extrapolates from the pace so far", () => {
        expect(remainingSeconds(10_000, 0.25)).toBeCloseTo(30);
    });

    it("gives nothing when there is too little progress or it is done", () => {
        expect(remainingSeconds(500, 0.01)).toBeUndefined();
        expect(remainingSeconds(500, 1)).toBeUndefined();
    });
});
