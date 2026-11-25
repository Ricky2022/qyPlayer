// 制作页的纯逻辑：文件分类、尺寸计算、文件名清理、列表调整。不依赖 DOM，便于单元测试。

/** 图片统一缩到长边不超过此值（PRD T-07，暂定 2560） */
export const IMAGE_MAX_SIDE = 2560;

export type FileKind = "image" | "video" | "audio";

/** 不支持的原因代码；界面按代码翻译成当前语言 */
export type UnsupportedReason = "video-format" | "audio-format" | "unsupported";

export type Classification = {kind: FileKind} | {
    kind: "unsupported";
    reason: UnsupportedReason;
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"];
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov"];
const AUDIO_EXTENSIONS = ["mp3", "m4a", "wav"];
const OTHER_VIDEO_EXTENSIONS = ["mkv", "webm", "avi", "wmv", "flv", "3gp", "mpg", "mpeg"];
const OTHER_AUDIO_EXTENSIONS = ["flac", "ogg", "opus", "aac", "wma", "aiff"];

const extensionOf = function extensionOf(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/** 按扩展名和 MIME 判断文件类别。图片只看是否像图片，能否解码由导入时决定。 */
export const classifyFile = function classifyFile(name: string, mime: string): Classification {
    const ext = extensionOf(name);
    if (IMAGE_EXTENSIONS.includes(ext) || mime.startsWith("image/")) {
        return {kind: "image"};
    }
    if (VIDEO_EXTENSIONS.includes(ext)) {
        return {kind: "video"};
    }
    if (AUDIO_EXTENSIONS.includes(ext)) {
        return {kind: "audio"};
    }
    if (OTHER_VIDEO_EXTENSIONS.includes(ext) || mime.startsWith("video/")) {
        return {kind: "unsupported", reason: "video-format"};
    }
    if (OTHER_AUDIO_EXTENSIONS.includes(ext) || mime.startsWith("audio/")) {
        return {kind: "unsupported", reason: "audio-format"};
    }
    return {kind: "unsupported", reason: "unsupported"};
};

/** 等比缩小到长边不超过 maxSide；本来就够小则原样返回，不放大 */
export const fitWithin = function fitWithin(width: number, height: number, maxSide: number = IMAGE_MAX_SIDE): {
    width: number;
    height: number;
} {
    const longest = Math.max(width, height);
    if (longest <= maxSide) {
        return {width, height};
    }
    const ratio = maxSide / longest;
    return {width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio))};
};

const MAX_FILE_NAME_LENGTH = 100;

/**
 * 把标题变成可用的文件名（PRD F-PKG-08）：替换不能用于文件名的字符，不留空，不以点或空格结尾。
 * fallback 是标题清理后为空时用的名字，由界面按语言传入。
 */
export const safeFileName = function safeFileName(title: string, fallback = "回忆", extension = ".qyp"): string {
    const cleaned = title
    // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, MAX_FILE_NAME_LENGTH);
    const stem = cleaned === "" ? fallback : cleaned;
    // Windows 的保留设备名不能当文件名
    const safeStem = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem) ? `_${stem}` : stem;
    return safeStem + extension;
};

/** 返回把 index 处元素移动 delta 位后的新数组；越界时原样返回（同一个数组） */
export const moveItem = function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
    const target = index + delta;
    if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
        return [...list];
    }
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item as T);
    return next;
};

export const removeItem = function removeItem<T>(list: readonly T[], index: number): T[] {
    return list.filter((_, i) => i !== index);
};

export interface SortKey {
    capturedAt?: string;
    fileName: string;
}

/** 按拍摄时间升序、同时刻按文件名排序；缺少时间的排最后（与生成器的排序规则一致） */
export const sortByCapturedAt = function sortByCapturedAt<T>(list: readonly T[], keyOf: (item: T) => SortKey): T[] {
    const time = (item: T): number => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const t = keyOf(item).capturedAt ? Date.parse(keyOf(item).capturedAt!) : NaN;
        return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    return [...list].sort((a, b) => {
        const ta = time(a);
        const tb = time(b);
        if (ta !== tb) {
            return ta < tb ? -1 : 1;
        }
        const na = keyOf(a).fileName;
        const nb = keyOf(b).fileName;
        return na < nb ? -1 : na > nb ? 1 : 0;
    });
};

export const formatBytes = function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export const formatDuration = function formatDuration(seconds: number): string {
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
