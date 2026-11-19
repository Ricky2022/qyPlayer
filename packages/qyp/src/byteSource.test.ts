import { describe, expect, it } from "vitest";
import type { Manifest } from "@qyplayer/core";
import example from "../../../spec/examples/example.manifest.json";
import { QypError, openPackage, peekPackage, writePackage, type ByteSource } from "./index";

const manifest = example as unknown as Manifest;

/** 包里用到的文件；内容各不相同，便于比较两种来源读出来的是不是同一份 */
const files = [
  { path: "media/m001.jpg", data: new Uint8Array([1, 2, 3, 4]) },
  ...["media/m002.jpg", "media/m003.jpg", "media/m004.mp4", "media/m005.jpg", "media/m006.jpg", "media/m007.jpg", "audio/bgm.m4a", "cover.jpg", "originals/IMG_0001.HEIC"].map((path) => ({
    path,
    data: new TextEncoder().encode(path),
  })),
];

/**
 * 把内存里的包包装成壳那样的“按偏移读”来源。
 * calls 记下每次要的范围，用来确认打开包时没有把整个文件读一遍。
 */
function asByteSource(blob: Blob, calls: [number, number][] = []): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      calls.push([offset, length]);
      return new Uint8Array(await blob.slice(offset, Math.min(offset + length, blob.size)).arrayBuffer());
    },
  };
}

async function errorOf(promise: Promise<unknown>): Promise<QypError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof QypError) return e;
    throw e;
  }
  throw new Error("expected the package source to be rejected");
}

describe("按偏移读取的包来源（桌面和手机壳）", () => {
  it("同一个包用 Blob 和 ByteSource 打开，清单和素材内容一致", async () => {
    const blob = await writePackage(manifest, files);
    const viaBlob = await openPackage(blob);
    const viaSource = await openPackage(asByteSource(blob));

    expect(viaSource.manifest).toEqual(viaBlob.manifest);
    for (const { path } of files) {
      const [a, b] = await Promise.all([viaBlob.readBlob(path), viaSource.readBlob(path)]);
      expect(a.type).toBe(b.type);
      expect(new Uint8Array(await b.arrayBuffer())).toEqual(new Uint8Array(await a.arrayBuffer()));
    }
    await Promise.all([viaBlob.close(), viaSource.close()]);
  });

  it("打开时不读整个包：只要了中央目录、清单和封面，且每次都在范围内", async () => {
    // 塞一个 2 MB 的素材，整个读进内存会明显超过打开时实际读的字节数
    const big = files.map((file) => (file.path === "media/m001.jpg" ? { path: file.path, data: new Uint8Array(2 * 1024 * 1024) } : file));
    const blob = await writePackage(manifest, big);
    const calls: [number, number][] = [];
    const summary = await peekPackage(asByteSource(blob, calls));

    expect(summary.totalBytes).toBe(blob.size);
    expect(calls.length).toBeGreaterThan(0);
    for (const [offset, length] of calls) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset + length).toBeLessThanOrEqual(blob.size);
    }
    // 打开（以及读封面）只碰文件的一小部分，素材本身没有读
    const read = calls.reduce((sum, [, length]) => sum + length, 0);
    expect(read).toBeLessThan(blob.size * 0.75);
  });

  it("peekPackage 对两种来源给出相同的概要", async () => {
    const blob = await writePackage(manifest, files);
    const [viaBlob, viaSource] = await Promise.all([peekPackage(blob), peekPackage(asByteSource(blob))]);
    expect({ ...viaSource, cover: viaSource.cover?.size }).toEqual({ ...viaBlob, cover: viaBlob.cover?.size });
  });

  it("来源给的字节比声明的少时报 size-mismatch，而不是当成损坏的 ZIP", async () => {
    const blob = await writePackage(manifest, files);
    const broken: ByteSource = { size: blob.size, read: async () => new Uint8Array(0) };
    expect((await errorOf(openPackage(broken))).code).toBe("size-mismatch");
  });
});
