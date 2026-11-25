import {describe, expect, it} from "vitest";
import {MAX_TITLE_LINES, TITLE_FONT_RATIO, layoutTitleCard, wrapText} from "./titleCard";

/** 每个字符宽 10 像素，便于手算 */
const tenPerChar = (text: string): number => text.length * 10;

describe("wrapText", () => {
    it("放得下就是一行；空文字没有行", () => {
        expect(wrapText("Hello world", tenPerChar, 200, 2)).toEqual(["Hello world"]);
        expect(wrapText("   ", tenPerChar, 200, 2)).toEqual([]);
    });

    it("英文在空格处换行，行首不留空格", () => {
        expect(wrapText("one two three four", tenPerChar, 100, 3)).toEqual(["one two", "three four"]);
    });

    it("汉字逐字排，到宽度就换行", () => {
        expect(wrapText("一二三四五六七八", tenPerChar, 50, 2)).toEqual(["一二三四五", "六七八"]);
    });

    it("超过最大行数的部分用省略号结尾，且不超过宽度", () => {
        const lines = wrapText("一二三四五六七八九十", tenPerChar, 50, 1);
        expect(lines).toEqual(["一二三四…"]);
        expect(tenPerChar(lines[0]!)).toBeLessThanOrEqual(50);
    });

    it("比一整行还长的单词按字符拆开", () => {
        expect(wrapText("abcdefghij", tenPerChar, 50, 3)).toEqual(["abcde", "fghij"]);
    });

    it("恰好填满最后一行时不加省略号", () => {
        expect(wrapText("一二三四五六七八九十", tenPerChar, 50, 2)).toEqual(["一二三四五", "六七八九十"]);
    });
});

describe("layoutTitleCard", () => {
    const request = {title: "2026-03-01 回忆", subtitle: "春游", width: 1920, height: 1080};

    it("字号取短边的 6% 和 3.5%，副标题在最下面，标题在它上面，都靠左", () => {
        const {lines} = layoutTitleCard(request, tenPerChar);
        expect(lines.map((l) => l.text)).toEqual(["2026-03-01 回忆", "春游"]);
        expect(lines[0]!.fontPx).toBe(Math.round(1080 * TITLE_FONT_RATIO));
        expect(lines[1]!.fontPx).toBe(Math.round(1080 * 0.035));
        expect(lines[0]!.y).toBeLessThan(lines[1]!.y);
        expect(lines[1]!.y).toBeLessThanOrEqual(1080 - Math.round(1080 * 0.06));
        expect(new Set(lines.map((l) => l.x))).toEqual(new Set([Math.round(1080 * 0.06)]));
    });

    it("副标题为空时只有标题；标题长时最多两行", () => {
        expect(layoutTitleCard({...request, subtitle: ""}, tenPerChar).lines).toHaveLength(1);
        const long = layoutTitleCard({...request, title: "字".repeat(300), subtitle: ""}, (t) => t.length * 40).lines;
        expect(long).toHaveLength(MAX_TITLE_LINES);
        expect(long[1]!.text.endsWith("…")).toBe(true);
    });

    it("没有任何文字时不画渐变", () => {
        expect(layoutTitleCard({...request, title: "", subtitle: ""}, tenPerChar)).toMatchObject({lines: [], shadeAlpha: 0});
    });

    it("所有文字都在画布内", () => {
        for (const [width, height] of [[1920, 1080], [1080, 1920], [1440, 1080], [1080, 1080]] as const) {
            for (const line of layoutTitleCard({title: "标题".repeat(20), subtitle: "副标题".repeat(20), width, height}, (t, px) => t.length * px).lines) {
                expect(line.y).toBeGreaterThan(0);
                expect(line.y).toBeLessThan(height);
                expect(line.x + (line.text.length * line.fontPx)).toBeLessThanOrEqual(width);
            }
        }
    });
});
