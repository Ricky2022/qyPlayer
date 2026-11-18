// 素材的拍摄时间（docs/dev-0.3.0.md 5.3）：照片取 EXIF，视频取容器的创建时间，都没有时用文件修改时间。
// 统一写成 UTC 的 ISO 8601，形如 2026-05-01T08:30:00Z。纯逻辑部分不依赖浏览器，便于测试。

/** 拍摄时间从哪里来；“modified”要在界面上标注“修改时间” */
export type CapturedAtSource = "exif" | "container" | "modified";

export interface CapturedAt {
  /** UTC 的 ISO 8601，不带毫秒 */
  iso: string;
  source: CapturedAtSource;
}

/** 视频容器的创建时间早于这一年、或晚于明天，视为没有写（MP4 的零值是 1904 年） */
const MIN_PLAUSIBLE_YEAR = 1990;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toUtcIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** EXIF 的时间没有时区时，按制作设备的本地时区解释。默认用本机时区；测试里可以传入固定的实现 */
export type LocalToDate = (year: number, month: number, day: number, hour: number, minute: number, second: number) => Date;

const localToDate: LocalToDate = (year, month, day, hour, minute, second) => new Date(year, month - 1, day, hour, minute, second);

/**
 * 解释 EXIF 的时间字符串（“2026:05:01 08:30:00”）。offset 是 EXIF 的 OffsetTime* 字段（“+08:00”）：
 * 有就按它换算，没有就按本地时区。无法解析或日期不存在时返回 undefined。
 */
export function parseExifTime(raw: unknown, offset?: unknown, local: LocalToDate = localToDate): string | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [number, number, number, number, number, number];
  if (year < MIN_PLAUSIBLE_YEAR || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return undefined;

  const offsetMinutes = parseOffset(offset);
  const date =
    offsetMinutes === undefined ? local(year, month, day, hour, minute, second) : new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000);
  if (Number.isNaN(date.getTime())) return undefined;
  // 2 月 30 日这类不存在的日期会被 Date 悄悄进位，这里拒绝
  if (offsetMinutes !== undefined && new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return undefined;
  return toUtcIso(date);
}

/** “+08:00”“-0530”“Z” → 相对 UTC 的分钟数；其他返回 undefined */
function parseOffset(offset: unknown): number | undefined {
  if (typeof offset !== "string") return undefined;
  const text = offset.trim();
  if (text.toUpperCase() === "Z") return 0;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(text);
  if (!match) return undefined;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export interface ExifTimeTags {
  DateTimeOriginal?: unknown;
  CreateDate?: unknown;
  OffsetTimeOriginal?: unknown;
}

/** 照片的拍摄时间：先 DateTimeOriginal，其次 CreateDate；有 OffsetTimeOriginal 就用它换算 */
export function exifCapturedAt(tags: ExifTimeTags | undefined, local?: LocalToDate): string | undefined {
  if (!tags) return undefined;
  return parseExifTime(tags.DateTimeOriginal, tags.OffsetTimeOriginal, local) ?? parseExifTime(tags.CreateDate, tags.OffsetTimeOriginal, local);
}

/** 视频容器的创建时间（本身就是 UTC）；不可信的值返回 undefined */
export function containerCapturedAt(date: Date | null | undefined, now: Date = new Date()): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  if (date.getUTCFullYear() < MIN_PLAUSIBLE_YEAR || date.getTime() > now.getTime() + DAY_MS) return undefined;
  return toUtcIso(date);
}

/** 按优先级定拍摄时间：EXIF 或容器时间 → 文件修改时间；都没有返回 undefined */
export function chooseCapturedAt(found: { iso: string; source: "exif" | "container" } | undefined, lastModified: number): CapturedAt | undefined {
  if (found) return found;
  return lastModified > 0 ? { iso: toUtcIso(new Date(lastModified)), source: "modified" } : undefined;
}

/** 读照片的 EXIF 拍摄时间（需要浏览器环境）。读不到返回 undefined，不抛错 */
export async function readPhotoExifTime(file: Blob): Promise<string | undefined> {
  try {
    const { default: exifr } = await import("exifr");
    const tags = (await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal"], reviveValues: false })) as ExifTimeTags | undefined;
    return exifCapturedAt(tags);
  } catch {
    return undefined;
  }
}
