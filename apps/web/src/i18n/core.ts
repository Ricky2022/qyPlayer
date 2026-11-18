import { en, zh, type MessageKey } from "./messages";

export type Lang = "zh" | "en";

export const LANG_STORAGE_KEY = "qyplayer.lang";

export type Params = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, params?: Params) => string;

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { zh, en };

export function isLang(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}

/** 先看用户保存过的选择，没有就看系统首选语言：中文用中文，其他用英文 */
export function detectLang(saved: string | null | undefined, systemLanguages: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  const first = systemLanguages.find((language) => language !== "")?.toLowerCase() ?? "";
  return first.startsWith("zh") ? "zh" : "en";
}

/** 把 {name} 占位换成参数；参数缺失时原样保留占位，方便发现遗漏 */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function createTranslate(lang: Lang): Translate {
  const messages = MESSAGES[lang];
  return (key, params) => format(messages[key], params);
}

export const otherLang = (lang: Lang): Lang => (lang === "zh" ? "en" : "zh");

/** 语言自己的名字，切换按钮上显示的是“另一种”语言的名字 */
export const LANG_NAMES: Record<Lang, string> = { zh: "中文", en: "English" };
