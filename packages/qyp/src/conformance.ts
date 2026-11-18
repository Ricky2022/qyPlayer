import example from "../../../spec/examples/example.manifest.json";
import { referencedPaths, type Manifest } from "@qyplayer/core";
import type { QypErrorCode } from "./open";
import { writeZip, type PackageFile } from "./write";

/**
 * 格式一致性测试包（PRD N-TEST-02）：任何播放器实现都可以用它们自测。
 * 素材内容是占位字节（本模块只检验包结构和清单，不检验解码），所以体积极小。
 */
export interface ConformanceCase {
  /** 文件名（不含扩展名） */
  name: string;
  description: string;
  /** ok 表示应当能打开；否则必须以该错误类别拒绝 */
  expect: { ok: true; warnings?: string[] } | { ok: false; code: QypErrorCode };
  build(): Promise<Blob>;
}

const base = example as unknown as Manifest;

function variant(change: (m: any) => void): any {
  const copy = JSON.parse(JSON.stringify(base));
  change(copy);
  return copy;
}

const bytes = (text: string) => new TextEncoder().encode(text);

function placeholderFiles(manifest: Manifest, skip: readonly string[] = []): PackageFile[] {
  return referencedPaths(manifest)
    .filter((p) => !skip.includes(p))
    .map((path) => ({ path, data: bytes(`placeholder for ${path}`) }));
}

function manifestFile(manifest: unknown): PackageFile {
  return { path: "manifest.json", data: bytes(JSON.stringify(manifest, null, 2)) };
}

/** 清单合法时的完整包 */
const validPackage = (manifest: any, skip: readonly string[] = []) => () =>
  writeZip([manifestFile(manifest), ...placeholderFiles(manifest as Manifest, skip)]);

export const CONFORMANCE_CASES: readonly ConformanceCase[] = [
  {
    name: "valid-basic",
    description: "PRD 7.7 的完整示例：4 页、背景音乐、原片",
    expect: { ok: true },
    build: validPackage(base),
  },
  {
    name: "valid-unknown-types",
    description: "含未知的转场和入场类型：必须能打开并完整播放（降级为 fade / none）",
    expect: { ok: true, warnings: ["unknown-transition-type", "unknown-enter-type"] },
    build: validPackage(
      variant((m) => {
        m.pages[0].transitionIn.type = "cube3d";
        m.pages[1].items[0].enter.type = "sparkle";
      }),
    ),
  },
  {
    name: "valid-unknown-fields",
    description: "含未知字段：必须忽略",
    expect: { ok: true },
    build: validPackage(variant((m) => (m.futureField = { anything: true }))),
  },
  {
    name: "invalid-not-a-zip",
    description: "文件内容不是 ZIP",
    expect: { ok: false, code: "not-a-zip" },
    build: async () => new Blob([bytes("this is definitely not a zip archive")]),
  },
  {
    name: "invalid-missing-manifest",
    description: "根目录没有 manifest.json",
    expect: { ok: false, code: "missing-manifest" },
    build: () => writeZip(placeholderFiles(base)),
  },
  {
    name: "invalid-json",
    description: "manifest.json 不是合法 JSON",
    expect: { ok: false, code: "invalid-json" },
    build: () => writeZip([{ path: "manifest.json", data: bytes("{ not json") }, ...placeholderFiles(base)]),
  },
  {
    name: "invalid-manifest-schema",
    description: "清单缺少必需字段 pages",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant((m) => delete m.pages)),
  },
  {
    name: "invalid-manifest-timeline",
    description: "页的时间不连续",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant((m) => (m.pages[2].start = 12))),
  },
  {
    name: "invalid-version-too-high",
    description: "格式版本高于播放器支持的版本",
    expect: { ok: false, code: "unsupported-version" },
    build: validPackage(variant((m) => (m.formatVersion = "0.2"))),
  },
  {
    name: "invalid-missing-file",
    description: "清单引用的 media/m003.jpg 不在包内",
    expect: { ok: false, code: "missing-file" },
    build: validPackage(base, ["media/m003.jpg"]),
  },
  {
    name: "invalid-path-escape-manifest",
    description: "清单中的素材路径含 ../",
    expect: { ok: false, code: "unsafe-path" },
    build: validPackage(variant((m) => (m.assets[0].src = "../evil.jpg")), ["../evil.jpg"]),
  },
  {
    name: "invalid-path-escape-entry",
    description: "清单合法，但压缩包里有一个名为 ../evil.jpg 的条目",
    expect: { ok: false, code: "unsafe-entry" },
    build: () => writeZip([manifestFile(base), ...placeholderFiles(base), { path: "../evil.jpg", data: bytes("x") }]),
  },
  {
    name: "invalid-remote-reference",
    description: "清单引用远程地址",
    expect: { ok: false, code: "remote-reference" },
    build: validPackage(variant((m) => (m.assets[0].src = "https://example.com/a.jpg")), ["https://example.com/a.jpg"]),
  },
];
