import { describe, expect, it } from "vitest";
import { needsMusicRightsConfirm } from "./music";

describe("needsMusicRightsConfirm", () => {
  it("只有导入的音乐需要确认使用权", () => {
    expect(needsMusicRightsConfirm({ kind: "none" })).toBe(false);
    expect(needsMusicRightsConfirm({ kind: "builtin", trackId: "goldberg-aria" })).toBe(false);
    expect(needsMusicRightsConfirm({ kind: "custom", entry: { blob: new Blob(), mimeType: "audio/wav", duration: 3 } })).toBe(true);
  });
});
