// 按 fixtures/sources.json 下载示例素材到 fixtures/downloads（已存在则跳过），并校验 SHA-256。
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DOWNLOADS_DIR, loadRecords, type SourceRecord } from "./fixtures/records";

const USER_AGENT = "qyPlayer-fixtures/0.1 (open-source test fixtures)";
const MAX_ATTEMPTS = 6;

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 下载一个文件；遇到限流（429）和临时错误时按次数递增退避 */
async function download(url: string): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastError = new Error(`HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after")) || 0;
      await sleep(Math.max(retryAfter * 1000, response.status === 429 ? 20_000 * attempt : 2_000 * attempt));
    } catch (error) {
      lastError = error;
      await sleep(2_000 * attempt);
    }
  }
  throw new Error(`下载失败 ${url}：${String(lastError)}`);
}

async function ensure(record: SourceRecord): Promise<void> {
  const path = resolve(DOWNLOADS_DIR, record.file);
  let data = await readFile(path).catch(() => null);
  if (data) {
    console.log(`已存在 ${record.file}`);
  } else {
    console.log(`下载 ${record.file} ...`);
    data = Buffer.from(await download(record.downloadUrl));
    await writeFile(path, data);
  }
  if (record.sha256 && sha256(data) !== record.sha256) {
    throw new Error(`${record.file} 的 SHA-256 与记录不一致：文件可能被上游替换，请人工核对来源和许可`);
  }
}

await mkdir(DOWNLOADS_DIR, { recursive: true });
for (const record of await loadRecords()) {
  await ensure(record);
  await sleep(2_000); // 对公共站点保持礼貌的访问间隔
}
console.log("素材已就绪");
