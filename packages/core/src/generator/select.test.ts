import {describe, expect, it} from "vitest";
import {LENGTH_CHOICES, selectByLength, targetCount} from "./select";

const at = (minutes: number): string => new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString();
const timed = (minutes: readonly number[]) => minutes.map((m) => ({capturedAt: at(m)}));
const untimed = (n: number) => Array.from({length: n}, () => ({}));

describe("targetCount", () => {
    it("长档和少于 10 个素材时是全部；中、短取 ceil(n × 比例)", () => {
        expect(targetCount(9, "short")).toBe(9);
        expect(targetCount(50, "long")).toBe(50);
        expect(targetCount(10, "medium")).toBe(6);
        expect(targetCount(10, "short")).toBe(3);
        expect(targetCount(11, "medium")).toBe(7);
        expect(targetCount(100, "short")).toBe(30);
    });
});

describe("selectByLength", () => {
    it("长档、素材太少时全部入选", () => {
        expect(selectByLength(timed([0, 1, 2]), "short")).toEqual([0, 1, 2]);
        expect(selectByLength(timed(Array.from({length: 20}, (_, i) => i)), "long")).toHaveLength(20);
        expect(selectByLength([], "short")).toEqual([]);
    });

    it("先去掉间隔最小一对里靠后的那张", () => {
    // 10 张：第 4、5 张只差 1 分钟，其余至少差 60 分钟
        const items = timed([0, 60, 120, 180, 240, 241, 360, 420, 480, 540]);
        const medium = selectByLength(items, "medium");
        expect(medium).toHaveLength(6);
        expect(medium).not.toContain(5);
        expect(medium).toContain(4);
    });

    it("去掉一张后相邻关系重新计算，连拍的几张只留下最前面的", () => {
        const items = timed([0, 1, 2, 3, 600, 1200, 1800, 2400, 3000, 3600]);
        // 依次去掉 1、2、3；之后各相邻间隔都是 600 分钟，并列时去掉靠前一对里靠后的 4
        expect(selectByLength(items, "medium")).toEqual([0, 5, 6, 7, 8, 9]);
    });

    it("没有拍摄时间时按顺序均匀抽取，保留首尾", () => {
        const kept = selectByLength(untimed(10), "short");
        expect(kept).toEqual([0, 5, 9]);
        const kept100 = selectByLength(untimed(100), "short");
        expect(kept100).toHaveLength(30);
        expect(kept100[0]).toBe(0);
        expect(kept100.at(-1)).toBe(99);
    });

    it("时间只有一部分可用时，先按可用的丢，丢到没有可比较的相邻对再均匀抽取", () => {
        const items = [...timed([0, 1]), ...untimed(8)];
        const kept = selectByLength(items, "medium");
        expect(kept).toHaveLength(6);
        expect(kept).not.toContain(1);
        expect(kept[0]).toBe(0);
        expect(kept.at(-1)).toBe(9);
    });

    it("结果升序、不重复、数量等于目标；相同输入结果相同", () => {
        const items = timed(Array.from({length: 37}, (_, i) => (i * i * 7) % 500));
        for (const length of LENGTH_CHOICES) {
            const kept = selectByLength(items, length);
            expect(kept).toHaveLength(targetCount(37, length));
            expect([...kept].sort((a, b) => a - b)).toEqual(kept);
            expect(new Set(kept).size).toBe(kept.length);
            expect(selectByLength(items, length)).toEqual(kept);
        }
    });
});
