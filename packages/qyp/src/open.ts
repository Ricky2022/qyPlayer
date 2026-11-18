import { BlobReader, BlobWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js";
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
  | "missing-file";

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
      const blob = await manifestEntry.getData(new BlobWriter("application/json"), { checkSignature: true });
      parsed = JSON.parse(await blob.text());
    } catch (cause) {
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
        return entry.getData(new BlobWriter(mimeForPath(path)), { checkSignature: true });
      },
      close: () => reader.close(),
    };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}
