import example from "../../../spec/examples/example.manifest.json";
import example01 from "../../../spec/examples/example-0.1.manifest.json";
import example03 from "../../../spec/examples/example-0.3.manifest.json";
import { referencedPaths, type Manifest } from "@qyplayer/core";
import type { QypErrorCode } from "./open";
import { writeZip, type PackageFile } from "./write";
import { patchEntry } from "./zipPatch";

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

/** 格式 0.1 的示例：下面沿用的全部用例都以它为基础，保证 0.1 的包仍能打开 */
const base = example01 as unknown as Manifest;
/** 格式 0.2 的示例：新增的 v02 用例以它为基础 */
const base02 = example as unknown as Manifest;
/** 格式 0.3 的示例：新增的 v03 用例以它为基础 */
const base03 = example03 as unknown as Manifest;

function copyOf(manifest: Manifest, change: (m: any) => void): any {
  const copy = JSON.parse(JSON.stringify(manifest));
  change(copy);
  return copy;
}
const variant = (change: (m: any) => void) => copyOf(base, change);
const variant02 = (change: (m: any) => void) => copyOf(base02, change);
const variant03 = (change: (m: any) => void) => copyOf(base03, change);

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
    build: validPackage(variant((m) => (m.formatVersion = "0.4"))),
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
  {
    name: "valid-v02-basic",
    description: "格式 0.2 的完整示例：每个素材都有 mimeType 和 source，第一张图由 HEIC 转码为 JPEG",
    expect: { ok: true },
    build: validPackage(base02),
  },
  {
    name: "valid-v02-heic-mov",
    description: "格式 0.2：未转码的 HEIC 图片和 iPhone 的 MOV 视频（素材内容是占位字节）",
    expect: { ok: true },
    build: validPackage(
      variant02((m) => {
        const heic = "image/heic";
        const mov = 'video/quicktime; codecs="hvc1.2.4.l120.b0, mp4a.40.2"';
        Object.assign(m.assets[0], { src: "media/m001.heic", mimeType: heic, source: { mimeType: heic, transcoded: false } });
        Object.assign(m.assets[3], { src: "media/m004.mov", mimeType: mov, source: { mimeType: mov, transcoded: false } });
      }),
    ),
  },
  {
    name: "valid-v02-transcoded",
    description: "格式 0.2：视频由 MOV 转码为 MP4，两个 mimeType 不同且 transcoded 为 true",
    expect: { ok: true },
    build: validPackage(
      variant02((m) => {
        m.assets[3].source = { mimeType: 'video/quicktime; codecs="hvc1.2.4.l120.b0, mp4a.40.2"', transcoded: true };
      }),
    ),
  },
  {
    name: "invalid-v02-missing-mimetype",
    description: "格式 0.2：素材缺少 mimeType",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant02((m) => delete m.assets[0].mimeType)),
  },
  {
    name: "invalid-v02-missing-source",
    description: "格式 0.2：素材缺少 source",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant02((m) => delete m.assets[0].source)),
  },
  {
    name: "invalid-v02-mimetype-type-mismatch",
    description: "格式 0.2：图片素材的 mimeType 是 video/mp4",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(
      variant02((m) => {
        m.assets[1].mimeType = "video/mp4";
        m.assets[1].source.mimeType = "video/mp4";
      }),
    ),
  },
  {
    name: "invalid-v02-mimetype-bad-chars",
    description: "格式 0.2：mimeType 含大写字母和非法字符",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(
      variant02((m) => {
        m.assets[1].mimeType = "image/JPEG<x>";
        m.assets[1].source.mimeType = "image/JPEG<x>";
      }),
    ),
  },
  {
    name: "invalid-v02-not-transcoded-mismatch",
    description: "格式 0.2：source.transcoded 为 false，但两个 mimeType 不同",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant02((m) => (m.assets[1].source = { mimeType: "image/heic", transcoded: false }))),
  },
  {
    name: "valid-v03-basic",
    description: "格式 0.3 的完整示例：模糊背景、Ken Burns、旋转转场、整片滤镜、副标题和片头标题图片",
    expect: { ok: true },
    build: validPackage(base03),
  },
  {
    name: "valid-v03-unknown-values",
    description: "格式 0.3：不认识的 backdrop 和 look 取值：必须能打开并按缺省处理（只用背景色、原片）",
    expect: { ok: true },
    build: validPackage(
      variant03((m) => {
        m.canvas.backdrop = "future-backdrop";
        m.look = "future-look";
      }),
    ),
  },
  {
    name: "invalid-v03-title-card-not-image",
    description: "格式 0.3：titleCard 引用的是视频素材",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant03((m) => (m.titleCard.assetId = "m004"))),
  },
  {
    name: "invalid-v03-title-card-out-of-range",
    description: "格式 0.3：titleCard 的显示时间超出影片时长",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant03((m) => (m.titleCard.duration = 30))),
  },
  {
    name: "invalid-v03-motion-scale-zero",
    description: "格式 0.3：motion 的 scale 为 0",
    expect: { ok: false, code: "invalid-manifest" },
    build: validPackage(variant03((m) => (m.pages[0].items[0].motion.to.scale = 0))),
  },
  {
    name: "invalid-size-mismatch",
    description: "manifest.json 在中央目录里记录的大小比实际多 1 字节（声明体积与实际不符）",
    expect: { ok: false, code: "size-mismatch" },
    build: async () => {
      const zip = new Uint8Array(await (await validPackage(base02)()).arrayBuffer());
      const size = bytes(JSON.stringify(base02, null, 2)).length;
      patchEntry(zip, "manifest.json", { directory: { compressedSize: size + 1, uncompressedSize: size + 1 } });
      return new Blob([zip]);
    },
  },
];
