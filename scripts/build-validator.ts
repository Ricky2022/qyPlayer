// 由 spec/manifest.schema.json 生成预编译的清单校验函数（docs/dev-0.3.0.md 7.2）。
//   pnpm schema:build
import { writeFile } from "node:fs/promises";
import { VALIDATOR_PATH, validatorSource } from "./validator/generate";

await writeFile(VALIDATOR_PATH, await validatorSource());
console.log("已生成", VALIDATOR_PATH);
