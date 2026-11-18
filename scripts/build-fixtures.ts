// 用下载的素材构建示例包到 fixtures/build（不入库）。
//   pnpm fixtures:build
// 需要先 pnpm fixtures:fetch 下载素材。一致性测试包由 pnpm fixtures:conformance 单独生成。构建用的随机种子、id 和时间都固定，相同素材得到逐字节相同的包。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateManifest, type AspectRatio, type MediaInput, type MusicInput } from "@qyplayer/core";
import { openPackage, writePackage, type PackageFile } from "@qyplayer/qyp";
import { BUILD_DIR, DOWNLOADS_DIR, loadRecords, type SourceRecord } from "./fixtures/records";
import { inspectMedia } from "./fixtures/inspect";

const CREATED_AT = "2026-11-18T00:00:00+08:00";

interface SampleSpec {
  name: string;
  title: string;
  aspectRatio: AspectRatio;
  templateId: string;
  seed: number;
  withMusic: boolean;
}

const SAMPLES: readonly SampleSpec[] = [
  { name: "sample-16x9", title: "qyPlayer 示例（横屏，配乐）", aspectRatio: "16:9", templateId: "lively", seed: 1, withMusic: true },
  { name: "sample-9x16", title: "qyPlayer 示例（竖屏，配乐）", aspectRatio: "9:16", templateId: "clean", seed: 2, withMusic: true },
  // 不带配乐：视频使用自带声音（PRD 第 9 节 A-02）
  { name: "sample-video-sound-16x9", title: "qyPlayer 示例（横屏，视频原声）", aspectRatio: "16:9", templateId: "classic", seed: 3, withMusic: false },
];

interface PreparedMedia {
  input: MediaInput;
  file: PackageFile;
}

async function prepare(records: readonly SourceRecord[]): Promise<{ media: PreparedMedia[]; music: { input: MusicInput; file: PackageFile } }> {
  const media: PreparedMedia[] = [];
  let music: { input: MusicInput; file: PackageFile } | undefined;
  for (const record of records) {
    const bytes = await readFile(resolve(DOWNLOADS_DIR, record.file));
    const info = await inspectMedia(record, bytes);
    const extension = record.file.slice(record.file.lastIndexOf("."));
    if (record.kind === "audio") {
      const src = `audio/bgm${extension}`;
      music = {
        input: { id: "bgm", src, duration: info.duration!, title: record.title, license: record.license },
        file: { path: src, data: bytes },
      };
      continue;
    }
    const id = `m${String(media.length + 1).padStart(3, "0")}`;
    const src = `media/${id}${extension}`;
    media.push({
      input: {
        id,
        type: record.kind,
        src,
        fileName: record.file,
        width: info.width!,
        height: info.height!,
        ...(info.duration !== undefined && { duration: info.duration }),
        ...(info.hasAudio !== undefined && { hasAudio: info.hasAudio }),
        ...(record.capturedAt !== undefined && { capturedAt: record.capturedAt }),
      },
      file: { path: src, data: bytes },
    });
  }
  if (!music) throw new Error("sources.json 中没有音乐记录");
  return { media, music };
}

const records = await loadRecords();
const { media, music } = await prepare(records);
await mkdir(BUILD_DIR, { recursive: true });

for (const spec of SAMPLES) {
  const manifest = generateManifest({
    media: media.map((m) => m.input),
    aspectRatio: spec.aspectRatio,
    templateId: spec.templateId,
    seed: spec.seed,
    title: spec.title,
    id: `qyplayer-${spec.name}`,
    createdAt: CREATED_AT,
    ...(spec.withMusic && { music: music.input }),
  });
  const files = [...media.map((m) => m.file), ...(spec.withMusic ? [music.file] : [])];
  const blob = await writePackage(manifest, files);

  // 构建完立刻按真实读取流程校验一遍：生成器或校验器出问题时在这里就暴露
  const opened = await openPackage(blob);
  await opened.close();

  const path = resolve(BUILD_DIR, `${spec.name}.qyp`);
  await writeFile(path, Buffer.from(await blob.arrayBuffer()));
  console.log(`${spec.name}.qyp  ${(blob.size / 1024 / 1024).toFixed(1)} MB  ${manifest.duration}s  ${manifest.pages.length} 页`);
}
