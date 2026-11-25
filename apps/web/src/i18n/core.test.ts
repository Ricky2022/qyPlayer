import {describe, expect, it} from "vitest";
import {createTranslate, detectLang, format} from "./core";
import {en, zh, type MessageKey} from "./messages";

describe("detectLang", () => {
    it("uses the saved choice first", () => {
        expect(detectLang("en", ["zh-CN"])).toBe("en");
        expect(detectLang("zh", ["en-US"])).toBe("zh");
    });
    it("ignores a saved value that is not a language we have", () => {
        expect(detectLang("fr", ["zh-TW"])).toBe("zh");
    });
    it("follows the first system language: Chinese variants give Chinese, everything else English", () => {
        expect(detectLang(null, ["zh-CN", "en"])).toBe("zh");
        expect(detectLang(null, ["zh-Hant-TW"])).toBe("zh");
        expect(detectLang(null, ["en-US", "zh-CN"])).toBe("en");
        expect(detectLang(null, ["ja"])).toBe("en");
        expect(detectLang(undefined, [])).toBe("en");
    });
});

describe("format", () => {
    it("fills placeholders, numbers included", () => {
        expect(format("{a} / {b}", {a: 1, b: "x"})).toBe("1 / x");
    });
    it("keeps a placeholder when its parameter is missing", () => {
        expect(format("hello {name}", {})).toBe("hello {name}");
        expect(format("hello {name}")).toBe("hello {name}");
    });
});

describe("messages", () => {
    const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

    it("uses exactly the same placeholders in both languages", () => {
        for (const key of Object.keys(zh) as MessageKey[]) {
            expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]));
        }
    });
    it("has no empty message", () => {
        for (const key of Object.keys(zh) as MessageKey[]) {
            expect(zh[key].length, `zh ${key}`).toBeGreaterThan(0);
            expect(en[key].length, `en ${key}`).toBeGreaterThan(0);
        }
    });
    it("translates with parameters", () => {
        expect(createTranslate("zh")("makerCount", {count: 3, max: 100, size: "2 MB"})).toBe("3 / 100 个 · 2 MB");
        expect(createTranslate("en")("makerCount", {count: 3, max: 100, size: "2 MB"})).toBe("3 / 100 items · 2 MB");
        expect(createTranslate("zh")("appName")).toBe("青云播放器");
        expect(createTranslate("en")("appName")).toBe("qyPlayer");
    });
});
