import { BlobReader, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js";
import { checkPackagePath, referencedPaths, validateManifest, type Manifest, type ValidationIssue } from "@qyplayer/core";

export const PACKAGE_LIMITS = {
  /** 解压后总体积上限（PRD T-09，暂定 2 GB） */
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
  /** manifest.json 本身的体积上限，防止巨型 JSON 拖垮解析 */
  maxManifestBytes: 8 * 1024 * 1024,
} as const;

export type QypErrorCode =
  | "not-a-zip"
  | "unsafe-entry"
  | "too-large"
  | "missing-manifest"
  | "invalid-json"
  | "unsupported-version"
  | "remote-reference"
  | "unsafe-path"
  | "invalid-manifest"
  | "missing-file"
  | "size-mismatch";

/** 打开包失败。code 是稳定的类别，界面据此给出用户能看懂的说明；issues 和 missing 用于补充细节。 */
export class QypError extends Error {
  constructor(
    readonly code: QypErrorCode,
    message: string,
    readonly issues: ValidationIssue[] = [],
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = "QypError";
  }
}

export interface OpenedPackage {
  manifest: Manifest;
  /** 不影响播放的提示，例如未知的转场类型 */
  warnings: ValidationIssue[];
  /** 按需读取包内文件。路径必须是清单引用过的或 manifest.json */
  readBlob(path: string): Promise<Blob>;
  close(): Promise<void>;
}

export interface OpenOptions {
  maxUncompressedBytes?: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  json: "application/json",
};

export function mimeForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function isFile(entry: Entry): entry is FileEntry {
  return !entry.directory;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const LOCAL_HEADER_BYTES = 30;
const DATA_DESCRIPTOR_BYTES = 16;
/** ZIP64 或未知大小的占位值，不参与比较 */
const UNKNOWN_SIZE = 0xffffffff;

async function readBytes(source: Blob, start: number, length: number): Promise<DataView> {
  return new DataView(await source.slice(start, start + length).arrayBuffer());
}

function sizeMismatch(path: string, detail: string): QypError {
  return new QypError("size-mismatch", `"${path}" does not match its recorded size: ${detail}`);
}

/**
 * 读取一个条目的内容（docs/dev-0.3.0.md 6.4、7.1）。
 * - 未压缩的条目不解压，按本地文件头给出的位置直接切片，浏览器按需读文件，不占用同样大小的内存。
 *   位置取自本地文件头（偏移 + 30 + 文件名长度 + 额外字段长度），长度取自中央目录，二者的大小记录必须一致。
 *   不重新计算 CRC32：对几百 MB 的视频逐字节计算会在手机上卡很久，这是有意的取舍。
 * - 压缩的条目解压，边写边计数，超过声明的大小立即中止，结束时必须恰好等于声明的大小。
 * 声明的大小与实际不符一律抛出 size-mismatch。
 */
async function readEntry(source: Blob, entry: FileEntry, type: string): Promise<Blob> {
  const path = entry.filename;
  const declared = entry.uncompressedSize;
  const header = await readBytes(source, entry.offset, LOCAL_HEADER_BYTES);
  if (header.byteLength < LOCAL_HEADER_BYTES || header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new QypError("not-a-zip", `"${path}" has no valid local file header`);
  }
  const flags = header.getUint16(6, true);
  const method = header.getUint16(8, true);

  if (method !== 0 || entry.encrypted) return readCompressed(entry, type);

  if (entry.compressedSize !== declared) throw sizeMismatch(path, "stored entry with different compressed and uncompressed sizes");
  const hasDescriptor = (flags & 0x8) !== 0;
  if (!hasDescriptor) {
    for (const local of [header.getUint32(18, true), header.getUint32(22, true)]) {
      if (local !== UNKNOWN_SIZE && local !== declared) throw sizeMismatch(path, `local header says ${local}, directory says ${declared}`);
    }
  }
  const start = entry.offset + LOCAL_HEADER_BYTES + header.getUint16(26, true) + header.getUint16(28, true);
  const end = start + declared;
  if (end > source.size) throw sizeMismatch(path, "the data runs past the end of the file");

  if (hasDescriptor && !entry.zip64) {
    // 本地文件头里的大小是 0，真实大小只在数据后面的数据描述符里：它必须紧跟在声明的数据之后，且大小相符
    const descriptor = await readBytes(source, end, DATA_DESCRIPTOR_BYTES);
    const signed = descriptor.byteLength >= 4 && descriptor.getUint32(0, true) === DATA_DESCRIPTOR_SIGNATURE;
    if (!signed || descriptor.byteLength < DATA_DESCRIPTOR_BYTES) throw sizeMismatch(path, "no data descriptor after the declared data");
    if (descriptor.getUint32(8, true) !== declared || descriptor.getUint32(12, true) !== declared) {
      throw sizeMismatch(path, "the data descriptor disagrees with the directory");
    }
  }
  return source.slice(start, end, type);
}

/** 把错误和它的 cause 链上的消息拼起来，便于按关键字归类 */
function errorChain(error: unknown): string {
  const messages: string[] = [];
  for (let e: unknown = error, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) messages.push(e.message);
  return messages.join(": ");
}

async function readCompressed(entry: FileEntry, type: string): Promise<Blob> {
  const declared = entry.uncompressedSize;
  const chunks: Uint8Array[] = [];
  let written = 0;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      written += chunk.byteLength;
      if (written > declared) throw sizeMismatch(entry.filename, `more than the declared ${declared} bytes`);
      chunks.push(chunk);
    },
  });
  try {
    await entry.getData({ writable }, { checkSignature: true });
  } catch (cause) {
    if (cause instanceof QypError) throw cause;
    if (written > declared) throw sizeMismatch(entry.filename, `more than the declared ${declared} bytes`);
    // zip.js 和解压器自己也会核对声明的大小（“Invalid uncompressed size”“incorrect length check”），归为同一个类别
    const reason = errorChain(cause);
    if (/size|length/i.test(reason)) throw sizeMismatch(entry.filename, reason);
    throw cause;
  }
  if (written !== declared) throw sizeMismatch(entry.filename, `${written} bytes instead of the declared ${declared}`);
  return new Blob(chunks as BlobPart[], { type });
}

/** 把校验问题归为一个对用户最有意义的类别：版本 > 远程引用 > 越界路径 > 其他 */
function classify(issues: ValidationIssue[]): QypErrorCode {
  const has = (code: string): boolean => issues.some((i) => i.code === code);
  if (has("unsupported-version")) return "unsupported-version";
  if (has("remote-reference")) return "remote-reference";
  if (has("path-escapes-root") || has("absolute-path") || has("invalid-character") || has("empty")) return "unsafe-path";
  return "invalid-manifest";
}

/**
 * 打开 .qyp 包并完成全部校验（PRD F-PKG-05、F-PKG-06）。
 * 只读取 ZIP 的中央目录和 manifest.json，素材在 readBlob 被调用时才读取（PRD N-PERF-04）。
 * 任何一步失败都抛出 QypError，不会写入包外的任何位置，也不会发起网络请求。
 */
export async function openPackage(source: Blob, options: OpenOptions = {}): Promise<OpenedPackage> {
  const maxBytes = options.maxUncompressedBytes ?? PACKAGE_LIMITS.maxUncompressedBytes;
  const reader = new ZipReader(new BlobReader(source));

  try {
    let entries: Entry[];
    try {
      entries = await reader.getEntries();
    } catch (cause) {
      // zip.js 自己也会拒绝 ../ 之类的条目名，这是第二层防线；按消息归类，不认识的一律当作不是 ZIP
      const unsafe = cause instanceof Error && /unsafe filename/i.test(cause.message);
      throw new QypError(unsafe ? "unsafe-entry" : "not-a-zip", `cannot read ZIP: ${String(cause)}`);
    }

    const files = new Map<string, FileEntry>();
    let total = 0;
    for (const entry of entries) {
      const name = entry.directory ? entry.filename.replace(/\/$/, "") : entry.filename;
      if (name === "") continue;
      const problem = checkPackagePath(name);
      if (problem) throw new QypError("unsafe-entry", `unsafe entry "${entry.filename}" in package: ${problem}`);
      if (!isFile(entry)) continue;
      if (files.has(entry.filename)) throw new QypError("unsafe-entry", `duplicate entry "${entry.filename}" in package`);
      files.set(entry.filename, entry);
      total += entry.uncompressedSize;
      if (total > maxBytes) throw new QypError("too-large", `uncompressed size exceeds the limit of ${maxBytes} bytes`);
    }

    const manifestEntry = files.get("manifest.json");
    if (!manifestEntry) throw new QypError("missing-manifest", "manifest.json not found at the package root");
    if (manifestEntry.uncompressedSize > PACKAGE_LIMITS.maxManifestBytes) {
      throw new QypError("invalid-manifest", "manifest.json is too large");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await (await readEntry(source, manifestEntry, "application/json")).text());
    } catch (cause) {
      if (cause instanceof QypError) throw cause;
      throw new QypError("invalid-json", `manifest.json is not valid JSON: ${String(cause)}`);
    }

    const result = validateManifest(parsed);
    if (!result.ok || !result.manifest) {
      throw new QypError(classify(result.errors), `manifest rejected: ${result.errors[0]?.message ?? "invalid"}`, result.errors);
    }
    const manifest = result.manifest;

    const missing = referencedPaths(manifest).filter((p) => !files.has(p));
    if (missing.length > 0) {
      throw new QypError("missing-file", `${missing.length} referenced file(s) are missing from the package`, [], missing);
    }

    return {
      manifest,
      warnings: result.warnings,
      async readBlob(path: string): Promise<Blob> {
        const entry = files.get(path);
        if (!entry) throw new QypError("missing-file", `no such file in package: ${path}`, [], [path]);
        return readEntry(source, entry, mimeForPath(path));
      },
      close: () => reader.close(),
    };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}
