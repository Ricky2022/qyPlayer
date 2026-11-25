// 片头标题图片（docs/dev-0.4.0.md 4.5）：制作时画成与画布同尺寸的透明 PNG 放进包里，播放器只负责把它盖到画面上。
// 排版是纯函数（layoutTitleCard），便于测试；真正画到画布上、导出 PNG 的部分在 renderTitleCard。

/** 标题、副标题的字号占画布短边的比例 */
export const TITLE_FONT_RATIO = 0.06;
export const SUBTITLE_FONT_RATIO = 0.035;
/** 左右和底部的留白占画布短边的比例 */
export const TITLE_MARGIN_RATIO = 0.06;
/** 标题最多两行，副标题一行，放不下的以省略号结尾 */
export const MAX_TITLE_LINES = 2;
export const MAX_SUBTITLE_LINES = 1;
const LINE_HEIGHT = 1.25;
/** 底部压暗渐变：从画面高度的这个位置开始，到底边的不透明度 */
const SHADE_START = 0.55;
const SHADE_ALPHA = 0.6;
const ELLIPSIS = "…";

/** 包内路径与素材 id */
export const TITLE_ASSET_ID = "t001";
export const TITLE_PATH = "media/title.png";

/** 量出文字在给定字号下的宽度（像素） */
export type MeasureText = (text: string, fontPx: number, bold: boolean) => number;

/** 断行用的最小单位：每个汉字、假名、全角符号各算一个；其余连续的非空白字符算一个词；空白算一个 */
const TOKEN = /[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]+|\s+/gu;

/** 在 maxWidth 内按词、字断行，最多 maxLines 行；放不下的部分用省略号结尾。空文字返回空数组 */
const splitToFit = function splitToFit(token: string, measure: (text: string) => number, maxWidth: number): string[] {
    if (token === " " || measure(token) <= maxWidth) {
        return [token];
    }
    const pieces: string[] = [];
    let piece = "";
    for (const ch of Array.from(token)) {
        if (piece !== "" && measure(piece + ch) > maxWidth) {
            pieces.push(piece);
            piece = "";
        }
        piece += ch;
    }
    if (piece !== "") {
        pieces.push(piece);
    }
    return pieces;
};
const withEllipsis = function withEllipsis(line: string, measure: (text: string) => number, maxWidth: number): string {
    let chars = Array.from(line.trimEnd());
    while (chars.length > 0 && measure(chars.join("") + ELLIPSIS) > maxWidth) {
        chars = chars.slice(0, -1);
    }
    return chars.join("").trimEnd() + ELLIPSIS;
};
export const wrapText = function wrapText(text: string, measure: (text: string) => number, maxWidth: number, maxLines: number): string[] {
    const tokens = (text.replace(/s+/g, " ").trim().match(TOKEN) ?? []).flatMap((token) => splitToFit(token, measure, maxWidth));
    const lines: string[] = [];
    let line = "";
    let truncated = false;
    for (const token of tokens) {
        const blank = token === " ";
        if (line === "" && blank) {
            continue;
        }
        if (line !== "" && measure(line + token) > maxWidth) {
            lines.push(line.trimEnd());
            line = "";
            if (lines.length === maxLines) {
                truncated = true;
                break;
            }
            if (blank) {
                continue;
            }
        }
        line += token;
    }
    if (!truncated && line.trim() !== "") {
        lines.push(line.trimEnd());
    }
    if (truncated) {
        lines[lines.length - 1] = withEllipsis(lines[lines.length - 1]!, measure, maxWidth);
    }
    return lines;
};

export interface TitleCardRequest {
    title: string;
    subtitle: string;
    width: number;
    height: number;
}

export interface TitleLine {
    text: string;
    /** 左对齐的起点和基线位置（像素） */
    x: number;
    y: number;
    fontPx: number;
    bold: boolean;
}

export interface TitleCardLayout {
    /** 渐变从这一行开始，到画布底边，不透明度从 0 渐变到 shadeAlpha */
    shadeTop: number;
    shadeAlpha: number;
    lines: TitleLine[];
}

/** 标题、副标题从画布左下角往上排。标题和副标题都为空时没有任何文字 */
export const layoutTitleCard = function layoutTitleCard(request: TitleCardRequest, measure: MeasureText): TitleCardLayout {
    const {width, height} = request;
    const shortSide = Math.min(width, height);
    const margin = Math.round(shortSide * TITLE_MARGIN_RATIO);
    const maxWidth = width - (margin * 2);
    const titleSize = Math.round(shortSide * TITLE_FONT_RATIO);
    const subtitleSize = Math.round(shortSide * SUBTITLE_FONT_RATIO);

    const subtitleLines = wrapText(request.subtitle, (s) => measure(s, subtitleSize, false), maxWidth, MAX_SUBTITLE_LINES);
    const titleLines = wrapText(request.title, (s) => measure(s, titleSize, true), maxWidth, MAX_TITLE_LINES);

    const lines: TitleLine[] = [];
    // 从底往上：先放副标题，再放标题。lineBottom 是当前行的下沿
    let lineBottom = height - margin;
    for (const text of [...subtitleLines].reverse()) {
        // eslint-disable-next-line @stylistic/max-len
        lines.unshift({text, x: margin, y: Math.round(lineBottom - (subtitleSize * (LINE_HEIGHT - 1) * 0.5)), fontPx: subtitleSize, bold: false});
        lineBottom -= subtitleSize * LINE_HEIGHT;
    }
    if (subtitleLines.length > 0 && titleLines.length > 0) {
        lineBottom -= subtitleSize * 0.3;
    }
    for (const text of [...titleLines].reverse()) {
        lines.unshift({text, x: margin, y: Math.round(lineBottom - (titleSize * (LINE_HEIGHT - 1) * 0.5)), fontPx: titleSize, bold: true});
        lineBottom -= titleSize * LINE_HEIGHT;
    }
    return {shadeTop: Math.round(height * SHADE_START), shadeAlpha: lines.length > 0 ? SHADE_ALPHA : 0, lines};
};

const FONT_FAMILY = "\"PingFang SC\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", system-ui, sans-serif";

const fontOf = (fontPx: number, bold: boolean): string => `${bold ? 600 : 400} ${fontPx}px ${FONT_FAMILY}`;

/** 画出标题图片并导出 PNG。字体取这台电脑上有的字体，所以图片在制作时就定死，播放时不会因设备不同而变样 */
export const renderTitleCard = async function renderTitleCard(request: TitleCardRequest): Promise<Blob> {
    const canvas = new OffscreenCanvas(request.width, request.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas 2D is not available");
    }
    const layout = layoutTitleCard(request, (text, fontPx, bold) => {
        ctx.font = fontOf(fontPx, bold);
        return ctx.measureText(text).width;
    });
    if (layout.shadeAlpha > 0) {
        const shade = ctx.createLinearGradient(0, layout.shadeTop, 0, request.height);
        shade.addColorStop(0, "rgba(0, 0, 0, 0)");
        shade.addColorStop(1, `rgba(0, 0, 0, ${layout.shadeAlpha})`);
        ctx.fillStyle = shade;
        ctx.fillRect(0, layout.shadeTop, request.width, request.height - layout.shadeTop);
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = Math.round(Math.min(request.width, request.height) * 0.006);
    ctx.fillStyle = "#ffffff";
    for (const line of layout.lines) {
        ctx.font = fontOf(line.fontPx, line.bold);
        ctx.fillText(line.text, line.x, line.y);
    }
    return canvas.convertToBlob({type: "image/png"});
};
