import {BlobReader, Reader, ZipReader, type Entry, type FileEntry} from "@zip.js/zip.js";
import {checkPackagePath, referencedPaths, validateManifest, type Manifest, type ValidationIssue} from "@qyplayer/core";

export const PACKAGE_LIMITS = {
    /** 解压后总体积上限（PRD T-09，暂定 2 GB） */
    maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
    /** manifest.json 本身的体积上限，防止巨型 JSON 拖垮解析 */
    maxManifestBytes: 8 * 1024 * 1024,
} as const;

/**
 * 可以按偏移读取的来源。
 * 桌面和手机壳里的文件走这个接口：包不必整个读进内存，打开时只读中央目录和清单。
 */
export interface ByteSource {
    readonly size: number;
    read: (offset: number, length: number) => Promise<Uint8Array>;
}

/** 打开包的来源：内存里的 Blob（网页、测试），或壳按偏移读的 ByteSource */
export type PackageSource = Blob | ByteSource;

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
    readBlob: (path: string) => Promise<Blob>;
    close: () => Promise<void>;
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

export const mimeForPath = function mimeForPath(path: string): string {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
};

const isFile = function isFile(entry: Entry): entry is FileEntry {
    return !entry.directory;
};

const isByteSource = function isByteSource(source: PackageSource): source is ByteSource {
    return typeof (source as Partial<ByteSource>).read === "function";
};

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const LOCAL_HEADER_BYTES = 30;
const DATA_DESCRIPTOR_BYTES = 16;
/** ZIP64 或未知大小的占位值，不参与比较 */
const UNKNOWN_SIZE = 0xffffffff;
/** 从 ByteSource 取一段内容时每次读的字节数，避免一次申请过大的内存 */
const SLICE_CHUNK_BYTES = 32 * 1024 * 1024;

/**
 * 按偏移读一个来源。来源是 Blob 时用 slice（浏览器里不复制内存）；
 * 是 ByteSource 时每次都按范围读，所以打开包和读单个素材都不需要整个文件。
 */
interface PackageReader {
    readonly size: number;
    read: (offset: number, length: number) => Promise<Uint8Array>;
    /** 取 [start, end) 这一段作为 Blob。知道类型的用途（图片、视频）由这个 Blob 带上 MIME */
    slice: (start: number, end: number, type: string) => Promise<Blob>;
}

/** 从 ByteSource 读恰好 want 字节；读不满说明来源和它声明的大小不一致 */
const readExactly = async function readExactly(source: ByteSource, offset: number, length: number): Promise<Uint8Array> {
    const want = Math.max(0, Math.min(length, source.size - offset));
    if (want === 0) {
        return new Uint8Array(0);
    }
    const bytes = await source.read(offset, want);
    if (bytes.byteLength !== want) {
        throw new QypError("size-mismatch", `the source returned ${bytes.byteLength} bytes instead of ${want} at offset ${offset}`);
    }
    return bytes;
};

const readerFor = function readerFor(source: PackageSource): PackageReader {
    if (isByteSource(source)) {
        return {
            size: source.size,
            read: async (offset, length) => readExactly(source, offset, length),
            async slice(start, end, type) {
                const chunks: Uint8Array[] = [];
                for (let at = start; at < end; at += SLICE_CHUNK_BYTES) {
                    chunks.push(await readExactly(source, at, Math.min(SLICE_CHUNK_BYTES, end - at)));
                }
                return new Blob(chunks as BlobPart[], {type});
            },
        };
    }

    const blob = source;
    return {
        size: blob.size,
        read: async (offset, length) => new Uint8Array(await blob.slice(offset, Math.min(offset + length, blob.size)).arrayBuffer()),
        slice: async (start, end, type) => Promise.resolve(blob.slice(start, end, type)),
    };
};

/** 让 zip.js 按偏移读来源：ZIP 的中央目录在文件末尾，随机访问是必须的 */
class ByteSourceReader extends Reader<ByteSource> {
    constructor(private readonly source: ByteSource) {
        super(source);
        this.size = source.size;
    }

    override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
        return readExactly(this.source, index, length);
    }
}

const zipReaderFor = function zipReaderFor(source: PackageSource): ZipReader<unknown> {
    return isByteSource(source) ? new ZipReader<unknown>(new ByteSourceReader(source)) : new ZipReader<unknown>(new BlobReader(source));
};

const readBytes = async function readBytes(reader: PackageReader, start: number, length: number): Promise<DataView> {
    const bytes = await reader.read(start, length);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
};

const sizeMismatch = function sizeMismatch(path: string, detail: string): QypError {
    return new QypError("size-mismatch", `"${path}" does not match its recorded size: ${detail}`);
};

/**
 * 读取一个条目的内容（docs/dev-0.3.0.md 6.4、7.1）。
 * - 未压缩的条目不解压，按本地文件头给出的位置直接切片，浏览器按需读文件，不占用同样大小的内存。
 *   位置取自本地文件头（偏移 + 30 + 文件名长度 + 额外字段长度），长度取自中央目录，二者的大小记录必须一致。
 *   不重新计算 CRC32：对几百 MB 的视频逐字节计算会在手机上卡很久，这是有意的取舍。
 * - 压缩的条目解压，边写边计数，超过声明的大小立即中止，结束时必须恰好等于声明的大小。
 * 声明的大小与实际不符一律抛出 size-mismatch。
 */
const errorChain = function errorChain(error: unknown): string {
    const messages: string[] = [];
    for (let e: unknown = error, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
        messages.push(e.message);
    }
    return messages.join(": ");
};
const readCompressed = async function readCompressed(entry: FileEntry, type: string): Promise<Blob> {
    const declared = entry.uncompressedSize;
    const chunks: Uint8Array[] = [];
    let written = 0;
    const writable = new WritableStream<Uint8Array>({
        write(chunk) {
            written += chunk.byteLength;
            if (written > declared) {
                throw sizeMismatch(entry.filename, `more than the declared ${declared} bytes`);
            }
            chunks.push(chunk);
        },
    });
    try {
        await entry.getData({writable}, {checkSignature: true});
    } catch (cause) {
        if (cause instanceof QypError) {
            throw cause;
        }
        if (written > declared) {
            throw sizeMismatch(entry.filename, `more than the declared ${declared} bytes`);
        }
        // zip.js 和解压器自己也会核对声明的大小（“Invalid uncompressed size”“incorrect length check”），归为同一个类别
        const reason = errorChain(cause);
        if (/size|length/i.test(reason)) {
            throw sizeMismatch(entry.filename, reason);
        }
        throw cause;
    }
    if (written !== declared) {
        throw sizeMismatch(entry.filename, `${written} bytes instead of the declared ${declared}`);
    }
    return new Blob(chunks as BlobPart[], {type});
};
const readEntry = async function readEntry(reader: PackageReader, entry: FileEntry, type: string): Promise<Blob> {
    const path = entry.filename;
    const declared = entry.uncompressedSize;
    const header = await readBytes(reader, entry.offset, LOCAL_HEADER_BYTES);
    if (header.byteLength < LOCAL_HEADER_BYTES || header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
        throw new QypError("not-a-zip", `"${path}" has no valid local file header`);
    }
    const flags = header.getUint16(6, true);
    const method = header.getUint16(8, true);

    if (method !== 0 || entry.encrypted) {
        return readCompressed(entry, type);
    }

    if (entry.compressedSize !== declared) {
        throw sizeMismatch(path, "stored entry with different compressed and uncompressed sizes");
    }
    const hasDescriptor = (flags & 0x8) !== 0;
    if (!hasDescriptor) {
        for (const local of [header.getUint32(18, true), header.getUint32(22, true)]) {
            if (local !== UNKNOWN_SIZE && local !== declared) {
                throw sizeMismatch(path, `local header says ${local}, directory says ${declared}`);
            }
        }
    }
    const start = entry.offset + LOCAL_HEADER_BYTES + header.getUint16(26, true) + header.getUint16(28, true);
    const end = start + declared;
    if (end > reader.size) {
        throw sizeMismatch(path, "the data runs past the end of the file");
    }

    if (hasDescriptor && !entry.zip64) {
    // 本地文件头里的大小是 0，真实大小只在数据后面的数据描述符里：它必须紧跟在声明的数据之后，且大小相符
        const descriptor = await readBytes(reader, end, DATA_DESCRIPTOR_BYTES);
        const signed = descriptor.byteLength >= 4 && descriptor.getUint32(0, true) === DATA_DESCRIPTOR_SIGNATURE;
        if (!signed || descriptor.byteLength < DATA_DESCRIPTOR_BYTES) {
            throw sizeMismatch(path, "no data descriptor after the declared data");
        }
        if (descriptor.getUint32(8, true) !== declared || descriptor.getUint32(12, true) !== declared) {
            throw sizeMismatch(path, "the data descriptor disagrees with the directory");
        }
    }
    return reader.slice(start, end, type);
};

/** 把校验问题归为一个对用户最有意义的类别：版本 > 远程引用 > 越界路径 > 其他 */
const classify = function classify(issues: ValidationIssue[]): QypErrorCode {
    const has = (code: string): boolean => issues.some((i) => i.code === code);
    if (has("unsupported-version")) {
        return "unsupported-version";
    }
    if (has("remote-reference")) {
        return "remote-reference";
    }
    if (has("path-escapes-root") || has("absolute-path") || has("invalid-character") || has("empty")) {
        return "unsafe-path";
    }
    return "invalid-manifest";
};

/** 读出 ZIP 的中央目录（只读文件尾部）。不是 ZIP 或条目名不安全时抛 QypError */
const listEntries = async function listEntries(reader: ZipReader<unknown>): Promise<Entry[]> {
    try {
        return await reader.getEntries();
    } catch (cause) {
    // 来源自己报的错（例如读不满声明的大小）原样抛出，其余的归为“不是 ZIP”
        if (cause instanceof QypError) {
            throw cause;
        }
        // zip.js 自己也会拒绝 ../ 之类的条目名，这是第二层防线；按消息归类，不认识的一律当作不是 ZIP
        const unsafe = cause instanceof Error && /unsafe filename/i.test(cause.message);
        throw new QypError(unsafe ? "unsafe-entry" : "not-a-zip", `cannot read ZIP: ${String(cause)}`);
    }
};

/** 读出并校验 manifest.json（openPackage 和 peekPackage 共用） */
const readManifest = async function readManifest(reader: PackageReader, files: Map<string, FileEntry>): Promise<{
    manifest: Manifest;
    warnings: ValidationIssue[];
}> {
    const manifestEntry = files.get("manifest.json");
    if (!manifestEntry) {
        throw new QypError("missing-manifest", "manifest.json not found at the package root");
    }
    if (manifestEntry.uncompressedSize > PACKAGE_LIMITS.maxManifestBytes) {
        throw new QypError("invalid-manifest", "manifest.json is too large");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(await (await readEntry(reader, manifestEntry, "application/json")).text());
    } catch (cause) {
        if (cause instanceof QypError) {
            throw cause;
        }
        throw new QypError("invalid-json", `manifest.json is not valid JSON: ${String(cause)}`);
    }

    const result = validateManifest(parsed);
    if (!result.ok || !result.manifest) {
        throw new QypError(classify(result.errors), `manifest rejected: ${result.errors[0]?.message ?? "invalid"}`, result.errors);
    }
    return {manifest: result.manifest, warnings: result.warnings};
};

/**
 * 打开 .qyp 包并完成全部校验（PRD F-PKG-05、F-PKG-06）。
 * 只读取 ZIP 的中央目录和 manifest.json，素材在 readBlob 被调用时才读取（PRD N-PERF-04）。
 * 来源可以是 Blob（网页），也可以是壳按偏移读的 ByteSource（桌面和手机，整个包不进内存）。
 * 任何一步失败都抛出 QypError，不会写入包外的任何位置，也不会发起网络请求。
 */
export const openPackage = async function openPackage(source: PackageSource, options: OpenOptions = {}): Promise<OpenedPackage> {
    const maxBytes = options.maxUncompressedBytes ?? PACKAGE_LIMITS.maxUncompressedBytes;
    const files = readerFor(source);
    const reader = zipReaderFor(source);

    try {
        const entries = await listEntries(reader);

        const byName = new Map<string, FileEntry>();
        let total = 0;
        for (const entry of entries) {
            const name = entry.directory ? entry.filename.replace(/\/$/, "") : entry.filename;
            if (name === "") {
                continue;
            }
            const problem = checkPackagePath(name);
            if (problem) {
                throw new QypError("unsafe-entry", `unsafe entry "${entry.filename}" in package: ${problem}`);
            }
            if (!isFile(entry)) {
                continue;
            }
            if (byName.has(entry.filename)) {
                throw new QypError("unsafe-entry", `duplicate entry "${entry.filename}" in package`);
            }
            byName.set(entry.filename, entry);
            total += entry.uncompressedSize;
            if (total > maxBytes) {
                throw new QypError("too-large", `uncompressed size exceeds the limit of ${maxBytes} bytes`);
            }
        }

        const {manifest, warnings} = await readManifest(files, byName);

        const missing = referencedPaths(manifest).filter((p) => !byName.has(p));
        if (missing.length > 0) {
            throw new QypError("missing-file", `${missing.length} referenced file(s) are missing from the package`, [], missing);
        }

        return {
            manifest,
            warnings,
            async readBlob(path: string): Promise<Blob> {
                const entry = byName.get(path);
                if (!entry) {
                    throw new QypError("missing-file", `no such file in package: ${path}`, [], [path]);
                }
                return readEntry(files, entry, mimeForPath(path));
            },
            close: async () => reader.close(),
        };
    } catch (error) {
        await reader.close().catch(() => undefined);
        throw error;
    }
};

/** 不打开整个包就能得到的概要信息，字段全部来自清单（docs/dev-0.3.0.md 6.4 的 peekPackage 小节） */
export interface PackageSummary {
    title: string;
    /** 影片时长（秒） */
    duration: number;
    createdAt: string;
    aspectRatio: Manifest["canvas"]["aspectRatio"];
    pageCount: number;
    photoCount: number;
    videoCount: number;
    hasMusic: boolean;
    formatVersion: string;
    /** 包文件本身的字节数 */
    totalBytes: number;
    /** 封面。清单没有声明封面，或包里读不出封面时为 undefined */
    cover?: Blob;
}

/**
 * 快速读取概要信息，用于影片库列表、打开前预览（PRD F-PKG 的“不解压也能预览”）。
 * 只读三小段：文件尾的中央目录、manifest.json、封面。不读素材，不检查素材是否缺失、大小是否一致。
 * 清单本身仍会校验；包不是 ZIP 或清单无效时抛 QypError。想播放请用 openPackage。
 */
export const peekPackage = async function peekPackage(source: PackageSource): Promise<PackageSummary> {
    const reader = zipReaderFor(source);
    const files = readerFor(source);
    try {
        const byName = new Map<string, FileEntry>();
        for (const entry of await listEntries(reader)) {
            if (isFile(entry)) {
                byName.set(entry.filename, entry);
            }
        }
        const {manifest} = await readManifest(files, byName);

        let cover: Blob | undefined;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const coverEntry = manifest.cover ? byName.get(manifest.cover) : undefined;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (manifest.cover && coverEntry) {
            cover = await readEntry(files, coverEntry, mimeForPath(manifest.cover)).catch(() => undefined);
        }

        const count = (type: string): number => manifest.assets.filter((a) => a.type === type).length;
        return {
            title: manifest.title,
            duration: manifest.duration,
            createdAt: manifest.createdAt,
            aspectRatio: manifest.canvas.aspectRatio,
            pageCount: manifest.pages.length,
            photoCount: count("image"),
            videoCount: count("video"),
            hasMusic: manifest.bgm !== undefined,
            formatVersion: manifest.formatVersion,
            totalBytes: files.size,
            cover,
        };
    } finally {
        await reader.close().catch(() => undefined);
    }
};
