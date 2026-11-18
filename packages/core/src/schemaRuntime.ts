// 预编译校验函数（schemaValidator.generated.js）运行时需要的两个小函数。
// 校验函数由 `pnpm schema:build` 用 Ajv 的 standalone 模式生成，不依赖 Ajv，也不用 eval。
// 行为与 Ajv 自带的实现保持一致，对照测试见 schemaRuntime.test.ts。

/** 字符串长度，按 Unicode 码点计（JSON Schema 的 maxLength 的算法） */
export function ucs2length(text: string): number {
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    length++;
    const high = text.charCodeAt(i);
    if (high >= 0xd800 && high <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++;
  }
  return length;
}

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(z|([+-])(\d{2})(?::?(\d{2}))?)?$/i;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month]!);
}

/** RFC 3339 的时间部分；必须带时区，允许闰秒 */
function isTimeWithZone(text: string): boolean {
  const match = TIME.exec(text);
  if (!match || !match[4]) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  const zoneSign = match[5] === "-" ? -1 : 1;
  const zoneHour = Number(match[6] ?? 0);
  const zoneMinute = Number(match[7] ?? 0);
  if (zoneHour > 23 || zoneMinute > 59) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;
  // 闰秒：换算成 UTC 后必须是 23:59:60
  const utcMinute = minute - zoneMinute * zoneSign;
  const utcHour = hour - zoneHour * zoneSign - (utcMinute < 0 ? 1 : 0);
  return (utcHour === 23 || utcHour === -1) && (utcMinute === 59 || utcMinute === -1) && second < 61;
}

/** RFC 3339 的 date-time，日期和时间之间可以是 T、t 或空白 */
export function isDateTime(text: string): boolean {
  const parts = text.split(/t|\s/i);
  return parts.length === 2 && isDate(parts[0]!) && isTimeWithZone(parts[1]!);
}

/** 生成的校验函数里引用的格式表 */
export const formats = { "date-time": { validate: isDateTime } };
