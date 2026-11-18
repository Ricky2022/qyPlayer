// 素材类型（mimeType）的写法和包内扩展名（docs/dev-0.3.0.md 4.3）。纯逻辑，不依赖浏览器。

/** 4.3 规定的写法：类型/子类型，可带一个 codecs 参数，全部小写 */
export const MIME_TYPE_PATTERN = /^(image|video|audio)\/[a-z0-9.+-]+(; ?codecs="[a-z0-9.,+ -]+")?$/;

/** 主类型 → 包内扩展名。表里没有的类型，制作器在导入时就拒绝 */
const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
};

/** 去掉 codecs 等参数后的主类型 */
export function baseMimeType(mimeType: string): string {
  return (mimeType.split(";")[0] ?? "").trim().toLowerCase();
}

/** 按主类型取包内扩展名；不在表里返回 undefined */
export function extensionForMimeType(mimeType: string): string | undefined {
  return EXTENSIONS[baseMimeType(mimeType)];
}

/** 主类型加上编码字符串，编码一律转小写；没有编码时只返回主类型 */
export function withCodecs(base: string, codecs: readonly (string | null | undefined)[]): string {
  const list = codecs.filter((c): c is string => typeof c === "string" && c !== "").map((c) => c.toLowerCase());
  return list.length > 0 ? `${base}; codecs="${list.join(", ")}"` : base;
}

const IMAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** 图片文件的类型：优先看扩展名（HEIC 在很多系统里 file.type 是空的），其次看浏览器给的类型。能原样放入包的才返回，否则 undefined */
export function imageMimeType(fileName: string, browserType: string): string | undefined {
  return IMAGE_BY_EXTENSION[extensionOf(fileName)] ?? (browserType in EXTENSIONS ? browserType : undefined);
}

/** 音乐文件的类型。M4A 按 AAC-LC 写 codecs；MP3 和 WAV 不写 */
export function audioMimeType(fileName: string): string | undefined {
  switch (extensionOf(fileName)) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return withCodecs("audio/mp4", ["mp4a.40.2"]);
    case "wav":
      return "audio/wav";
    default:
      return undefined;
  }
}
