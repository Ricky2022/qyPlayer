import { describe, expect, it } from "vitest";
import example from "../../../spec/examples/example.manifest.json";
import type { Manifest } from "@qyplayer/core";
import { CONFORMANCE_CASES, QypError, openPackage, writePackage, writeZip, mimeForPath } from "./index";

const manifest = example as unknown as Manifest;

async function errorOf(promise: Promise<unknown>): Promise<QypError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof QypError) return e;
    throw e;
  }
  throw new Error("expected openPackage to reject");
}

describe("conformance packages", () => {
  it.each(CONFORMANCE_CASES.map((c) => [c.name, c] as const))("%s", async (_name, testCase) => {
    const blob = await testCase.build();
    if (testCase.expect.ok) {
      const pkg = await openPackage(blob);
      expect(pkg.manifest.formatVersion).toBe("0.1");
      expect(pkg.warnings.map((w) => w.code).sort()).toEqual([...(testCase.expect.warnings ?? [])].sort());
      await pkg.close();
    } else {
      const error = await errorOf(openPackage(blob));
      expect(error.code).toBe(testCase.expect.code);
    }
  });

  it("covers every error category that does not need a huge file", () => {
    const codes = new Set(CONFORMANCE_CASES.flatMap((c) => (c.expect.ok ? [] : [c.expect.code])));
    expect([...codes].sort()).toEqual(
      ["invalid-json", "invalid-manifest", "missing-file", "missing-manifest", "not-a-zip", "remote-reference", "unsafe-entry", "unsafe-path", "unsupported-version"].sort(),
    );
  });
});

describe("openPackage", () => {
  it("reads referenced files on demand with the right bytes and MIME type", async () => {
    const files = [
      { path: "media/m001.jpg", data: new Uint8Array([1, 2, 3, 4]) },
      ...["media/m002.jpg", "media/m003.jpg", "media/m004.mp4", "media/m005.jpg", "media/m006.jpg", "media/m007.jpg", "audio/bgm.m4a", "cover.jpg", "originals/IMG_0001.HEIC"].map((path) => ({
        path,
        data: new TextEncoder().encode(path),
      })),
    ];
    const pkg = await openPackage(await writePackage(manifest, files));
    const blob = await pkg.readBlob("media/m001.jpg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(blob.type).toBe("image/jpeg");
    expect((await pkg.readBlob("audio/bgm.m4a")).type).toBe("audio/mp4");
    expect(await (await pkg.readBlob("media/m004.mp4")).text()).toBe("media/m004.mp4");
    await pkg.close();
  });

  it("rejects reading a file that is not in the package", async () => {
    const pkg = await openPackage(await CONFORMANCE_CASES[0]!.build());
    expect((await errorOf(pkg.readBlob("nope.jpg"))).code).toBe("missing-file");
    await pkg.close();
  });

  it("rejects a package whose uncompressed size exceeds the limit", async () => {
    const blob = await CONFORMANCE_CASES[0]!.build();
    const error = await errorOf(openPackage(blob, { maxUncompressedBytes: 100 }));
    expect(error.code).toBe("too-large");
  });

  it("reports every missing file", async () => {
    const files = [{ path: "media/m001.jpg", data: new Uint8Array([1]) }];
    const error = await errorOf(openPackage(await writePackage(manifest, files)));
    expect(error.code).toBe("missing-file");
    expect(error.missing).toContain("media/m002.jpg");
    expect(error.missing).toContain("audio/bgm.m4a");
    expect(error.missing).not.toContain("media/m001.jpg");
  });

  it("carries validation issues on invalid manifests", async () => {
    const bad = JSON.parse(JSON.stringify(manifest));
    bad.duration = 30;
    const blob = await writeZip([{ path: "manifest.json", data: new TextEncoder().encode(JSON.stringify(bad)) }]);
    const error = await errorOf(openPackage(blob));
    expect(error.code).toBe("invalid-manifest");
    expect(error.issues.map((i) => i.code)).toContain("duration-mismatch");
  });

  it("rejects an empty file and an empty zip", async () => {
    expect((await errorOf(openPackage(new Blob([])))).code).toBe("not-a-zip");
    expect((await errorOf(openPackage(await writeZip([])))).code).toBe("missing-manifest");
  });

  it("rejects duplicate entries and backslash or absolute entry names", async () => {
    const m = new TextEncoder().encode("{}");
    // zip.js 的写入端不允许重名，所以写两个同长度的名字，再把字节改成相同来手工构造重名包
    const zip = new Uint8Array(await (await writeZip([{ path: "manifest.json", data: m }, { path: "manifest.jsox", data: m }])).arrayBuffer());
    const from = new TextEncoder().encode("manifest.jsox");
    const to = new TextEncoder().encode("manifest.json");
    let patched = 0;
    for (let i = 0; i + from.length <= zip.length; i++) {
      if (from.every((byte, k) => zip[i + k] === byte)) {
        zip.set(to, i);
        patched++;
      }
    }
    expect(patched).toBe(2); // 本地文件头 + 中央目录各一处
    expect((await errorOf(openPackage(new Blob([zip])))).code).toBe("unsafe-entry");

    for (const name of ["a\b.jpg", "/abs.jpg", "C:/x.jpg", "a//b.jpg"]) {
      const blob = await writeZip([{ path: "manifest.json", data: m }, { path: name, data: m }]);
      expect((await errorOf(openPackage(blob))).code, name).toBe("unsafe-entry");
    }
  });
});

describe("writePackage", () => {
  it("is reproducible: same input gives byte-identical output", async () => {
    const files = [{ path: "media/m001.jpg", data: new Uint8Array([9, 9, 9]) }];
    const a = new Uint8Array(await (await writePackage(manifest, files)).arrayBuffer());
    const b = new Uint8Array(await (await writePackage(manifest, files)).arrayBuffer());
    expect(a).toEqual(b);
  });

  it("stores media without compression (PRD 7.1)", async () => {
    const payload = new Uint8Array(4096); // 全零，压缩后会明显变小
    const blob = await writeZip([{ path: "media/zeros.bin", data: payload }]);
    expect(blob.size).toBeGreaterThan(4096);
  });
});

describe("mimeForPath", () => {
  it("maps known extensions and falls back to octet-stream", () => {
    expect(mimeForPath("a.JPG")).toBe("image/jpeg");
    expect(mimeForPath("media/x.mp4")).toBe("video/mp4");
    expect(mimeForPath("audio/b.mp3")).toBe("audio/mpeg");
    expect(mimeForPath("originals/IMG.HEIC")).toBe("application/octet-stream");
    expect(mimeForPath("noext")).toBe("application/octet-stream");
  });
});
