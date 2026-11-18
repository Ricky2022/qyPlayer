import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** 仓库根目录。脚本固定从这里解析路径，与当前工作目录无关 */
export const ROOT = resolve(import.meta.dirname, "../..");
export const FIXTURES_DIR = resolve(ROOT, "fixtures");
export const DOWNLOADS_DIR = resolve(FIXTURES_DIR, "downloads");
export const BUILD_DIR = resolve(FIXTURES_DIR, "build");
export const CONFORMANCE_DIR = resolve(FIXTURES_DIR, "conformance");
export const SOURCES_JSON = resolve(FIXTURES_DIR, "sources.json");
export const SOURCES_MD = resolve(FIXTURES_DIR, "SOURCES.md");

/** 受检查的素材扩展名：downloads 目录里出现这些文件就必须有来源记录 */
export const MEDIA_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".m4a", ".mp3"] as const;

/** 仅允许可自由再分发的许可（PRD F-BGM-02、15.1） */
const ALLOWED_LICENSE = /^(cc0|public domain)/i;

export type RecordKind = "image" | "video" | "audio";

/** fixtures/sources.json 中的一条记录：素材的来源与许可，是唯一的事实来源 */
export interface SourceRecord {
  /** 相对 fixtures/downloads 的文件名 */
  file: string;
  kind: RecordKind;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** 素材所在的网页，便于核对 */
  sourceUrl: string;
  /** 可直接下载的地址 */
  downloadUrl: string;
  note?: string;
  /** 下载文件的 SHA-256，用于确认重新下载的内容一致 */
  sha256?: string;
  /** 示例包中使用的拍摄时间（人为设定，决定排序），ISO 8601 */
  capturedAt?: string;
}

const REQUIRED_FIELDS = ["file", "kind", "title", "author", "license", "licenseUrl", "sourceUrl", "downloadUrl"] as const;

export async function loadRecords(path: string = SOURCES_JSON): Promise<SourceRecord[]> {
  return JSON.parse(await readFile(path, "utf8")) as SourceRecord[];
}

/** 一条记录自身的问题：缺字段、许可不在白名单、文件名重复由调用方另查 */
export function problemsOf(record: SourceRecord): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.trim() === "") problems.push(`${record.file || "(无文件名)"}：缺少 ${field}`);
  }
  if (record.license && !ALLOWED_LICENSE.test(record.license)) {
    problems.push(`${record.file}：许可 "${record.license}" 不在允许范围（仅 CC0 或 Public Domain）`);
  }
  return problems;
}

/** 在文件名列表中找出没有来源记录的素材文件（只看受检查的素材扩展名） */
export function findUnrecorded(files: readonly string[], records: readonly SourceRecord[]): string[] {
  const recorded = new Set(records.map((r) => r.file));
  return files.filter((f) => MEDIA_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)) && !recorded.has(f));
}

export function findDuplicates(records: readonly SourceRecord[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const { file } of records) (seen.has(file) ? duplicated : seen).add(file);
  return [...duplicated];
}

const KIND_LABEL: Record<RecordKind, string> = { image: "图片", video: "视频", audio: "音乐" };

/** 由 sources.json 生成 SOURCES.md，保证文档与记录一致 */
export function renderSourcesMd(records: readonly SourceRecord[]): string {
  const lines = [
    "# 示例素材来源与许可",
    "",
    "> 本文件由 `pnpm fixtures:docs` 根据 `fixtures/sources.json` 自动生成，请勿手工修改。",
    "",
    "示例包和测试用的所有图片、视频、音乐都来自 CC0 或公有领域作品，可自由再分发。",
    "新增素材必须先在 `sources.json` 登记；`pnpm fixtures:check` 会对没有记录的素材报错。",
    "",
  ];
  for (const kind of ["image", "video", "audio"] as const) {
    const group = records.filter((r) => r.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${KIND_LABEL[kind]}`, "", "| 文件 | 标题 | 作者 | 许可 | 来源 |", "| --- | --- | --- | --- | --- |");
    for (const r of group) {
      const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
      lines.push(`| ${r.file} | ${cell(r.title)} | ${cell(r.author)} | [${cell(r.license)}](${r.licenseUrl}) | [链接](${r.sourceUrl}) |`);
    }
    lines.push("");
    for (const r of group.filter((x) => x.note)) lines.push(`- \`${r.file}\`：${r.note}`);
    if (group.some((x) => x.note)) lines.push("");
  }
  return lines.join("\n");
}
