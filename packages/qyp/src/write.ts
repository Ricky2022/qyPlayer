import { BlobReader, BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import type { Manifest } from "@qyplayer/core";

export interface PackageFile {
  /** 包内路径，使用 `/` 分隔 */
  path: string;
  data: Blob | Uint8Array;
}

/** 固定的修改时间，让相同内容打出的包逐字节相同，便于测试和复现 */
const FIXED_DATE = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

/**
 * 写出标准 ZIP（PRD 7.1）。素材本身已压缩，所以一律只存储不压缩（level 0）。
 * 这里不检查路径安全：构造不合法的测试包需要写入任意名字。读取时由 openPackage 负责拦截。
 */
export async function writeZip(files: readonly PackageFile[]): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"), { level: 0, lastModDate: FIXED_DATE });
  for (const file of files) {
    const reader = file.data instanceof Blob ? new BlobReader(file.data) : new Uint8ArrayReader(file.data);
    await writer.add(file.path, reader, { level: 0, lastModDate: FIXED_DATE });
  }
  return writer.close();
}

/** 把清单和素材写成 .qyp 包（PRD 第 7 章）。manifest.json 放在根目录。 */
export async function writePackage(manifest: Manifest, files: readonly PackageFile[]): Promise<Blob> {
  const json = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");
  return writeZip([{ path: "manifest.json", data: json }, ...files]);
}
