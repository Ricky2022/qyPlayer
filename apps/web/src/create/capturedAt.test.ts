import { describe, expect, it } from "vitest";
import { chooseCapturedAt, containerCapturedAt, exifCapturedAt, parseExifTime, toUtcIso, type LocalToDate } from "./capturedAt";

/** 假装制作设备在 UTC+9（日本） */
const tokyo: LocalToDate = (y, mo, d, h, mi, s) => new Date(Date.UTC(y, mo - 1, d, h, mi, s) - 9 * 3600_000);

describe("parseExifTime（5.3 的时间解释规则）", () => {
  it("有 OffsetTimeOriginal 就按它换算成 UTC", () => {
    expect(parseExifTime("2026:05:01 08:30:00", "+08:00", tokyo)).toBe("2026-05-01T00:30:00Z");
    expect(parseExifTime("2026:05:01 08:30:00", "-05:00", tokyo)).toBe("2026-05-01T13:30:00Z");
    expect(parseExifTime("2026:05:01 08:30:00", "+0530", tokyo)).toBe("2026-05-01T03:00:00Z");
    expect(parseExifTime("2026:05:01 08:30:00", "Z", tokyo)).toBe("2026-05-01T08:30:00Z");
  });

  it("没有偏移就按制作设备的本地时区解释", () => {
    expect(parseExifTime("2026:05:01 08:30:00", undefined, tokyo)).toBe("2026-04-30T23:30:00Z");
  });

  it("偏移无法解析时当作没有偏移", () => {
    expect(parseExifTime("2026:05:01 08:30:00", "garbage", tokyo)).toBe("2026-04-30T23:30:00Z");
  });

  it("默认本地时区的结果与 Date 的本地构造一致", () => {
    expect(parseExifTime("2026:05:01 08:30:00")).toBe(toUtcIso(new Date(2026, 4, 1, 8, 30, 0)));
  });

  it("结果不带毫秒，形如 2026-05-01T08:30:00Z", () => {
    expect(parseExifTime("2026:05:01 08:30:00", "+00:00")).toBe("2026-05-01T08:30:00Z");
  });

  it("拒绝格式错误、全零和不存在的日期", () => {
    expect(parseExifTime("0000:00:00 00:00:00", "+08:00")).toBeUndefined();
    expect(parseExifTime("not a date")).toBeUndefined();
    expect(parseExifTime(undefined)).toBeUndefined();
    expect(parseExifTime(12345)).toBeUndefined();
    expect(parseExifTime("2026:02:30 10:00:00", "+08:00")).toBeUndefined();
    expect(parseExifTime("2026:13:01 10:00:00", "+08:00")).toBeUndefined();
  });
});

describe("exifCapturedAt", () => {
  it("优先 DateTimeOriginal，其次 CreateDate", () => {
    expect(exifCapturedAt({ DateTimeOriginal: "2026:05:01 08:30:00", CreateDate: "2026:05:02 09:00:00", OffsetTimeOriginal: "+08:00" })).toBe("2026-05-01T00:30:00Z");
    expect(exifCapturedAt({ CreateDate: "2026:05:02 09:00:00", OffsetTimeOriginal: "+08:00" })).toBe("2026-05-02T01:00:00Z");
  });

  it("DateTimeOriginal 无法解析时退到 CreateDate", () => {
    expect(exifCapturedAt({ DateTimeOriginal: "0000:00:00 00:00:00", CreateDate: "2026:05:02 09:00:00", OffsetTimeOriginal: "+08:00" })).toBe("2026-05-02T01:00:00Z");
  });

  it("没有任何时间标签时返回 undefined", () => {
    expect(exifCapturedAt({})).toBeUndefined();
    expect(exifCapturedAt(undefined)).toBeUndefined();
  });
});

describe("containerCapturedAt（视频按 UTC）", () => {
  const now = new Date("2026-11-18T00:00:00Z");

  it("有效时间转成不带毫秒的 UTC", () => {
    expect(containerCapturedAt(new Date("2026-05-01T08:30:00.123Z"), now)).toBe("2026-05-01T08:30:00Z");
  });

  it("1904 年的零值和未来的时间视为没有", () => {
    expect(containerCapturedAt(new Date("1904-01-01T00:00:00Z"), now)).toBeUndefined();
    expect(containerCapturedAt(new Date("2030-01-01T00:00:00Z"), now)).toBeUndefined();
    expect(containerCapturedAt(null, now)).toBeUndefined();
    expect(containerCapturedAt(new Date(Number.NaN), now)).toBeUndefined();
  });
});

describe("chooseCapturedAt", () => {
  it("有 EXIF 或容器时间就用它", () => {
    expect(chooseCapturedAt({ iso: "2026-05-01T08:30:00Z", source: "exif" }, 1)).toEqual({ iso: "2026-05-01T08:30:00Z", source: "exif" });
  });

  it("都没有时用文件修改时间并标记为 modified", () => {
    expect(chooseCapturedAt(undefined, Date.UTC(2026, 9, 1, 12, 0, 0))).toEqual({ iso: "2026-10-01T12:00:00Z", source: "modified" });
  });

  it("修改时间也没有（0）时返回 undefined", () => {
    expect(chooseCapturedAt(undefined, 0)).toBeUndefined();
  });
});
