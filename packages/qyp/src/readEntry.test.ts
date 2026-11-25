import {BlobWriter, Uint8ArrayReader, ZipWriter} from "@zip.js/zip.js";
import {describe, expect, it} from "vitest";
import example from "../../../spec/examples/example.manifest.json";
import {referencedPaths, type Manifest} from "@qyplayer/core";
import {QypError, openPackage, writePackage} from "./index";
import {patchEntry, type EntryPatch} from "./zipPatch";

const manifest = example as unknown as Manifest;
const TARGET = "media/m001.jpg";
const SIZE = 1000;

type Bytes = Uint8Array<ArrayBuffer>;

const payload = function payload(length: number): Bytes {
    return Uint8Array.from({length}, (_, i) => ((i * 7) + 3) % 251);
};

const otherFiles = () =>
    referencedPaths(manifest)
        .filter((p) => p !== TARGET)
        .map((path) => ({path, data: new TextEncoder().encode(path)}));

/** 全部未压缩（包的标准写法） */
const storedPackage = async function storedPackage(): Promise<Bytes> {
    const blob = await writePackage(manifest, [{path: TARGET, data: payload(SIZE)}, ...otherFiles()]);
    return new Uint8Array(await blob.arrayBuffer());
};

/** 目标条目用 deflate 压缩（只可能出现在旧包里） */
const compressedPackage = async function compressedPackage(data: Bytes = payload(SIZE)): Promise<Bytes> {
    const writer = new ZipWriter(new BlobWriter("application/zip"));
    const json = new TextEncoder().encode(JSON.stringify(manifest));
    await writer.add("manifest.json", new Uint8ArrayReader(json), {level: 0});
    await writer.add(TARGET, new Uint8ArrayReader(data), {level: 9});
    for (const f of otherFiles()) {
        await writer.add(f.path, new Uint8ArrayReader(f.data), {level: 0});
    }
    return new Uint8Array(await (await writer.close()).arrayBuffer());
};

const read = async function read(zip: Bytes, path = TARGET): Promise<Bytes> {
    const pkg = await openPackage(new Blob([zip]));
    try {
        return new Uint8Array(await (await pkg.readBlob(path)).arrayBuffer());
    } finally {
        await pkg.close();
    }
};

const codeOf = async function codeOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (e) {
        if (e instanceof QypError) {
            return e.code;
        }
        throw e;
    }
    return "ok";
};

const patched = (zip: Bytes, patch: EntryPatch, path = TARGET): Bytes => {
    const copy = zip.slice();
    patchEntry(copy, path, patch);
    return copy;
};

describe("readBlob: 读取内容", () => {
    it("未压缩的条目（切片读取）与压缩的条目（解压读取）得到相同的内容", async () => {
        expect(await read(await storedPackage())).toEqual(payload(SIZE));
        expect(await read(await compressedPackage())).toEqual(payload(SIZE));
    });

    it("未压缩的条目读出的是与声明等长的切片，并带正确的 MIME 类型", async () => {
        const pkg = await openPackage(new Blob([await storedPackage()]));
        const blob = await pkg.readBlob(TARGET);
        expect(blob.size).toBe(SIZE);
        expect(blob.type).toBe("image/jpeg");
        await pkg.close();
    });

    it("空文件也能读", async () => {
        const empty = await writePackage(manifest, [{path: TARGET, data: new Uint8Array(0)}, ...otherFiles()]);
        expect(await read(new Uint8Array(await empty.arrayBuffer()))).toEqual(new Uint8Array(0));
    });
});

describe("size-mismatch: 声明的大小与实际不符", () => {
    it("中央目录里的大小比实际大或小，都拒绝", async () => {
        const zip = await storedPackage();
        for (const delta of [-1, 1, 5000, -SIZE]) {
            const size = SIZE + delta;
            const both = patched(zip, {directory: {compressedSize: size, uncompressedSize: size}});
            expect(await codeOf(read(both)), `delta ${delta}`).toBe("size-mismatch");
        }
    });

    it("未压缩条目的压缩后大小与原始大小不同，拒绝", async () => {
        const zip = patched(await storedPackage(), {directory: {compressedSize: SIZE - 1}});
        expect(await codeOf(read(zip))).toBe("size-mismatch");
    });

    it("本地文件头与中央目录的大小不一致，拒绝；一致则通过", async () => {
        const stored = await storedPackage();
        // 清除“数据描述符”标志，让大小直接写在本地文件头里（其他压缩工具常见的写法）
        const withLocalSizes = (compressed: number, uncompressed: number) =>
            patched(stored, {local: {flags: 0, compressedSize: compressed, uncompressedSize: uncompressed}});
        expect(await read(withLocalSizes(SIZE, SIZE))).toEqual(payload(SIZE));
        expect(await codeOf(read(withLocalSizes(SIZE, SIZE + 1)))).toBe("size-mismatch");
        expect(await codeOf(read(withLocalSizes(SIZE + 1, SIZE)))).toBe("size-mismatch");
    });

    it("压缩条目：声明比实际大或小都拒绝，声明过小时不会把全部数据解压出来", async () => {
        const big = payload(64);
        const zero = new Uint8Array(8 * 1024 * 1024); // 压缩后只有几 KB，解压后 8 MB
        const zip = await compressedPackage(zero);
        expect(await read(zip)).toEqual(zero);

        const smaller = patched(zip, {directory: {uncompressedSize: 1024}});
        expect(await codeOf(read(smaller))).toBe("size-mismatch");
        const larger = patched(zip, {directory: {uncompressedSize: zero.length + 1}});
        expect(await codeOf(read(larger))).toBe("size-mismatch");
        expect(await read(await compressedPackage(big))).toEqual(big);
    }, 30_000); // 解压 8 MB 的数据，CI 上的 Windows 机器较慢

    it("manifest.json 的声明大小不符，打开时就拒绝", async () => {
        const zip = await storedPackage();
        const size = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n").length;
        const bad = patched(zip, {directory: {compressedSize: size + 1, uncompressedSize: size + 1}}, "manifest.json");
        expect(await codeOf(openPackage(new Blob([bad])))).toBe("size-mismatch");
    });

    it("文件被截断（数据超出文件末尾）时拒绝", async () => {
        const zip = patched(await storedPackage(), {directory: {compressedSize: 10_000_000, uncompressedSize: 10_000_000}});
        expect(await codeOf(read(zip))).toBe("size-mismatch");
    });
});
