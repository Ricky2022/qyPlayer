import {BlobReader, BlobWriter, Uint8ArrayReader, ZipWriter} from "@zip.js/zip.js";
import type {Manifest} from "@qyplayer/core";

export interface PackageFile {
    /** 包内路径，使用 `/` 分隔 */
    path: string;
    data: Blob | Uint8Array;
}

/**
 * 固定的修改时间，让相同内容打出的包逐字节相同，便于测试和复现。
 * ZIP 的 DOS 时间字段按本地时区的时分秒写入，所以这里用本地时间构造；再关掉带 UTC 时间戳的扩展字段，结果就与运行机器的时区无关。
 */
const FIXED_DATE = new Date(2026, 0, 1, 0, 0, 0);
const ZIP_OPTIONS = {level: 0, lastModDate: FIXED_DATE, extendedTimestamp: false} as const;

/**
 * 写出标准 ZIP（PRD 7.1）。素材本身已压缩，所以一律只存储不压缩（level 0）。
 * 这里不检查路径安全：构造不合法的测试包需要写入任意名字。读取时由 openPackage 负责拦截。
 */
export const writeZip = async function writeZip(files: readonly PackageFile[]): Promise<Blob> {
    const writer = new ZipWriter(new BlobWriter("application/zip"), ZIP_OPTIONS);
    for (const file of files) {
        const reader = file.data instanceof Blob ? new BlobReader(file.data) : new Uint8ArrayReader(file.data);
        await writer.add(file.path, reader, ZIP_OPTIONS);
    }
    return writer.close();
};

/** 把清单和素材写成 .qyp 包（PRD 第 7 章）。manifest.json 放在根目录。 */
export const writePackage = async function writePackage(manifest: Manifest, files: readonly PackageFile[]): Promise<Blob> {
    const json = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");
    return writeZip([{path: "manifest.json", data: json}, ...files]);
};
