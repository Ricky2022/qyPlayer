import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CONFORMANCE_CASES } from "@qyplayer/qyp";
import { CONFORMANCE_DIR } from "./records";

/** expected.json 的内容：第三方实现据此判断每个包应当通过还是被拒绝 */
export async function conformanceFiles(): Promise<Map<string, Uint8Array | string>> {
  const files = new Map<string, Uint8Array | string>();
  const expected = [];
  for (const testCase of CONFORMANCE_CASES) {
    files.set(`${testCase.name}.qyp`, new Uint8Array(await (await testCase.build()).arrayBuffer()));
    expected.push({ file: `${testCase.name}.qyp`, description: testCase.description, expect: testCase.expect });
  }
  files.set("expected.json", JSON.stringify(expected, null, 2) + "\n");
  return files;
}

export async function buildConformancePackages(): Promise<void> {
  await mkdir(CONFORMANCE_DIR, { recursive: true });
  for (const [name, content] of await conformanceFiles()) await writeFile(resolve(CONFORMANCE_DIR, name), content);
}
