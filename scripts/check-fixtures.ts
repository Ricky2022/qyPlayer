// 检查示例素材的来源记录（PRD F-BGM-02）。
//   pnpm fixtures:check   有问题则退出码为 1
//   pnpm fixtures:docs    根据 sources.json 重新生成 SOURCES.md
import {readdir, readFile, writeFile} from "node:fs/promises";
import {DOWNLOADS_DIR, SOURCES_MD, findDuplicates, findUnrecorded, loadRecords, problemsOf, renderSourcesMd} from "./fixtures/records";

const records = await loadRecords();
const expectedMd = renderSourcesMd(records);

if (process.argv.includes("--write")) {
    await writeFile(SOURCES_MD, expectedMd, "utf8");
    console.log(`已生成 ${SOURCES_MD}`);
    process.exit(0);
}

const errors: string[] = records.flatMap(problemsOf);
for (const file of findDuplicates(records)) {
    errors.push(`${file}：sources.json 中有重复记录`);
}

const downloaded = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
for (const file of findUnrecorded(downloaded, records)) {
    errors.push(`${file}：存在于 downloads 目录，但 sources.json 中没有来源记录`);
}

const currentMd = await readFile(SOURCES_MD, "utf8").catch(() => "");
if (currentMd !== expectedMd) {
    errors.push("SOURCES.md 与 sources.json 不一致，请运行 pnpm fixtures:docs");
}

if (errors.length > 0) {
    console.error("素材来源检查失败：\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
}
console.log(`素材来源检查通过：${records.length} 条记录，下载目录 ${downloaded.length} 个文件`);
