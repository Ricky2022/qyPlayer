import {describe, expect, it} from "vitest";
import {classifyFile, fitWithin, formatBytes, formatDuration, moveItem, removeItem, safeFileName, sortByCapturedAt} from "./files";

describe("classifyFile", () => {
    it.each([
        ["IMG_1.JPG", "", "image"],
        ["a.heic", "", "image"],
        ["no-extension", "image/png", "image"],
        ["clip.mp4", "video/mp4", "video"],
        ["song.mp3", "audio/mpeg", "audio"],
        ["song.M4A", "", "audio"],
        ["tone.WAV", "audio/wav", "audio"],
    ])("%s is %s", (name, mime, kind) => {
        expect(classifyFile(name, mime)).toEqual({kind});
    });

    it("gives a reason code for other videos and audio", () => {
        expect(classifyFile("a.mov", "video/quicktime")).toEqual({kind: "video"});
        expect(classifyFile("a.flac", "")).toEqual({kind: "unsupported", reason: "audio-format"});
    });

    it("rejects unknown files", () => {
        expect(classifyFile("notes.txt", "text/plain")).toEqual({kind: "unsupported", reason: "unsupported"});
        expect(classifyFile("archive", "").kind).toBe("unsupported");
    });
});

describe("fitWithin", () => {
    it("keeps small images as they are", () => {
        expect(fitWithin(1600, 1067, 2560)).toEqual({width: 1600, height: 1067});
        expect(fitWithin(2560, 100, 2560)).toEqual({width: 2560, height: 100});
    });

    it("scales the longest side down to the limit, keeping the ratio", () => {
        expect(fitWithin(5120, 2880, 2560)).toEqual({width: 2560, height: 1440});
        expect(fitWithin(3000, 4000, 2560)).toEqual({width: 1920, height: 2560});
    });

    it("never produces a zero side", () => {
        expect(fitWithin(100000, 1, 2560).height).toBe(1);
    });
});

describe("safeFileName", () => {
    it("appends .qyp and keeps normal titles", () => {
        expect(safeFileName("2026-11-18 回忆")).toBe("2026-11-18 回忆.qyp");
    });

    it("replaces characters that cannot be used in file names", () => {
        expect(safeFileName("a/b\\c:d*e?f\"g<h>i|j")).toBe("a_b_c_d_e_f_g_h_i_j.qyp");
        expect(safeFileName("line1\nline2")).toBe("line1_line2.qyp");
    });

    it("falls back for empty or dot-only titles and strips trailing dots and spaces", () => {
        expect(safeFileName("")).toBe("回忆.qyp");
        expect(safeFileName("  ... ")).toBe("回忆.qyp");
        expect(safeFileName("春游. ")).toBe("春游.qyp");
        expect(safeFileName("", "Memories")).toBe("Memories.qyp");
    });

    it("avoids Windows reserved names and limits the length", () => {
        expect(safeFileName("CON")).toBe("_CON.qyp");
        expect(safeFileName("x".repeat(300)).length).toBe(100 + ".qyp".length);
    });
});

describe("list helpers", () => {
    it("moves an item by delta without mutating the input", () => {
        const list = ["a", "b", "c"];
        expect(moveItem(list, 2, -1)).toEqual(["a", "c", "b"]);
        expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c"]);
        expect(list).toEqual(["a", "b", "c"]);
    });

    it("leaves the order unchanged when moving past either end", () => {
        expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
        expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
        expect(moveItem(["a", "b"], 5, 1)).toEqual(["a", "b"]);
    });

    it("removes by index", () => {
        expect(removeItem(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    });

    it("sorts by capture time, then name, with missing times last", () => {
        const sorted = sortByCapturedAt(
            [
                {fileName: "z.jpg"},
                {fileName: "b.jpg", capturedAt: "2026-01-02T00:00:00Z"},
                {fileName: "a.jpg", capturedAt: "2026-01-02T00:00:00Z"},
                {fileName: "c.jpg", capturedAt: "2026-01-01T00:00:00Z"},
            ],
            (item) => item,
        );
        expect(sorted.map((i) => i.fileName)).toEqual(["c.jpg", "a.jpg", "b.jpg", "z.jpg"]);
    });
});

describe("formatting", () => {
    it("formats sizes", () => {
        expect(formatBytes(100)).toBe("1 KB");
        expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
        expect(formatBytes(3 * (1024 ** 3))).toBe("3.00 GB");
    });

    it("formats durations as m:ss", () => {
        expect(formatDuration(0)).toBe("0:00");
        expect(formatDuration(65.4)).toBe("1:05");
    });
});
