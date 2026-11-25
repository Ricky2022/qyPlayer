import {describe, expect, it} from "vitest";
import {Clock, distance} from "./timing";

describe("Clock", () => {
    it("stands still while paused", () => {
        const c = new Clock(10);
        expect(c.time(5000)).toBe(0);
        expect(c.playing).toBe(false);
    });

    it("advances with real time once playing", () => {
        const c = new Clock(10);
        c.play(1000);
        expect(c.playing).toBe(true);
        expect(c.time(3500)).toBeCloseTo(2.5);
    });

    it("keeps the position across pause and resume", () => {
        const c = new Clock(10);
        c.play(0);
        c.pause(2000);
        expect(c.time(9999)).toBeCloseTo(2);
        c.play(10000);
        expect(c.time(11000)).toBeCloseTo(3);
    });

    it("ignores a second play call", () => {
        const c = new Clock(10);
        c.play(0);
        c.play(5000);
        expect(c.time(6000)).toBeCloseTo(6);
    });

    it("seeks while paused and while playing", () => {
        const c = new Clock(10);
        c.seek(4, 100);
        expect(c.time(100)).toBe(4);
        c.play(200);
        c.seek(7, 1200);
        expect(c.time(1200)).toBe(7);
        expect(c.time(2200)).toBeCloseTo(8);
    });

    it("clamps to [0, duration]", () => {
        const c = new Clock(10);
        c.seek(-3, 0);
        expect(c.time(0)).toBe(0);
        c.seek(99, 0);
        expect(c.time(0)).toBe(10);
        c.play(0);
        expect(c.time(60_000)).toBe(10);
    });
});

describe("distance", () => {
    it("is the absolute difference without a period", () => {
        expect(distance(1, 4)).toBe(3);
        expect(distance(4, 1)).toBe(3);
    });

    it("wraps around for looping audio", () => {
        expect(distance(0.1, 29.9, 30)).toBeCloseTo(0.2);
        expect(distance(29.9, 0.1, 30)).toBeCloseTo(0.2);
        expect(distance(10, 20, 30)).toBe(10);
    });
});
