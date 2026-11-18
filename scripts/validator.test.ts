import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VALIDATOR_PATH, validatorSource } from "./validator/generate";

const lf = (text: string): string => text.replace(/\r\n/g, "\n");

describe("预编译的清单校验函数（7.2）", () => {
  it("与 spec/manifest.schema.json 同步：重新生成的内容与已提交的文件一致", async () => {
    expect(lf(await readFile(VALIDATOR_PATH, "utf8"))).toBe(await validatorSource());
  });

  it("不依赖任何包，也不含 eval 类的调用", async () => {
    const source = await validatorSource();
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/\bnew Function\b|\beval\(/);
    expect([...source.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1])).toEqual(["./schemaRuntime"]);
  });
});
