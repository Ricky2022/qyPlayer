import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

/** 只声明用到的那一小部分 Ajv 接口：ajv 不在根目录的依赖里，没有类型可引 */
interface AjvInstance {
    compile: (schema: object) => unknown;
}
interface AjvModule {
    default?: AjvConstructor;
    _: (strings: TemplateStringsArray) => unknown;
}
type AjvConstructor = new (options: Record<string, unknown>) => AjvInstance;

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const SCHEMA_PATH = resolve(ROOT, "spec/manifest.schema.json");
export const VALIDATOR_PATH = resolve(ROOT, "packages/core/src/schemaValidator.generated.js");

const HEADER = `// 本文件由 \`pnpm schema:build\` 根据 spec/manifest.schema.json 生成，请勿手工修改。
// 用 Ajv 的 standalone 模式预编译，运行时不依赖 Ajv，也不使用 eval，可以在禁止 unsafe-eval 的内容安全策略下运行。
import { formats, ucs2length } from "./schemaRuntime";
`;

/**
 * ajv 只是 packages/core 的开发依赖，根目录的脚本从 core 的位置解析它。
 * 生成的代码引用 ./schemaRuntime 里的 formats 和 ucs2length，不再 require 任何包。
 */
export const validatorSource = async function validatorSource(): Promise<string> {
    const require = createRequire(resolve(ROOT, "packages/core/package.json"));
    const ajvModule = require("ajv") as AjvModule & AjvConstructor;
    const Ajv = ajvModule.default ?? ajvModule;
    const standalone = (require("ajv/dist/standalone") as {default: (ajv: AjvInstance, validate: unknown) => string}).default;

    const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8")) as object;
    // if/then 分支只写 required，属性定义在外层，因此关闭 strictRequired；其余严格检查保留
    const ajv = new Ajv({
        allErrors: true,
        strict: true,
        strictRequired: false,
        code: {source: true, esm: true, formats: ajvModule._`formats`},
        formats: {"date-time": {validate: () => true}},
    });
    const code = standalone(ajv, ajv.compile(schema));

    // 生成的代码只剩下一处对外部包的引用：maxLength 用的字符串长度函数
    const source = code
        .replace(/^"use strict";/, "")
        .replace("require(\"ajv/dist/runtime/ucs2length\").default", "ucs2length");
    if (/\brequire\(/.test(source)) {
        throw new Error("生成的校验函数仍然引用了外部包，请检查 scripts/validator/generate.ts");
    }
    return `${HEADER}${source}\n`;
};
