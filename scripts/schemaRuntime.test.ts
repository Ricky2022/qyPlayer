import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isDateTime, ucs2length } from "../packages/core/src/schemaRuntime";

// 对照 Ajv 自带的实现（开发依赖）：预编译的校验函数不能和 Ajv 的行为有差别
// ajv 是 packages/core 的开发依赖，从 core 的位置解析
const require = createRequire(fileURLToPath(new URL("../packages/core/package.json", import.meta.url)));
const ajvUcs2length = (require("ajv/dist/runtime/ucs2length") as { default: (s: string) => number }).default;
const ajvDateTime = (require("ajv-formats/dist/formats") as { fullFormats: Record<string, { validate: (s: string) => boolean }> }).fullFormats["date-time"]!.validate;

const DATE_TIMES = [
  "2026-10-08T20:30:00+08:00",
  "2026-10-08T20:30:00Z",
  "2026-10-08t20:30:00z",
  "2026-10-08 20:30:00Z",
  "2026-10-08T20:30:00.123456Z",
  "2026-10-08T20:30:00+0800",
  "2026-10-08T20:30:00+08",
  "2026-10-08T20:30:00",
  "2026-10-08",
  "20:30:00Z",
  "2026-13-08T20:30:00Z",
  "2026-00-08T20:30:00Z",
  "2026-02-29T20:30:00Z",
  "2024-02-29T20:30:00Z",
  "2100-02-29T20:30:00Z",
  "2026-04-31T20:30:00Z",
  "2026-10-08T24:00:00Z",
  "2026-10-08T23:60:00Z",
  "2026-10-08T23:59:60Z",
  "2026-10-08T23:59:61Z",
  "2026-10-08T15:59:60-08:00",
  "2026-10-08T07:59:60+08:00",
  "2026-10-08T12:00:60Z",
  "2026-10-08T20:30:00+24:00",
  "2026-10-08T20:30:00+08:60",
  "2026-10-08T20:30:00+08:00 ",
  "T20:30:00Z",
  "2026-10-08TT20:30:00Z",
  "",
  "yesterday",
  "2026-1-8T20:30:00Z",
];

describe("预编译校验函数的运行时辅助", () => {
  it("date-time 与 ajv-formats 的判断一致", () => {
    for (const text of DATE_TIMES) expect(isDateTime(text), JSON.stringify(text)).toBe(ajvDateTime(text));
  });

  it("date-time：常见的合法和非法写法", () => {
    expect(isDateTime("2026-10-08T20:30:00+08:00")).toBe(true);
    expect(isDateTime("2026-10-08T20:30:00")).toBe(false); // 必须带时区
    expect(isDateTime("2026-02-29T00:00:00Z")).toBe(false);
  });

  it("字符串长度按码点计，与 Ajv 一致", () => {
    for (const text of ["", "abc", "中文", "😀", "a😀b", "\ud83d", "\ude00\ud83d", "😀".repeat(100)]) {
      expect(ucs2length(text), JSON.stringify(text)).toBe(ajvUcs2length(text));
    }
    expect(ucs2length("a😀b")).toBe(3);
  });
});
