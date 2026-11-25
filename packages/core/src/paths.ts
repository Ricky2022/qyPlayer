export type PathProblem = "empty" | "remote-reference" | "absolute-path" | "path-escapes-root" | "invalid-character";

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * 检查清单或压缩包条目中的路径是否安全（PRD 7.3、F-PKG-06）。
 * 安全返回 null，否则返回问题类别。
 * 规则：必须是相对路径，用 `/` 分隔；不允许协议地址、盘符、`..` 段、反斜杠、控制字符。
 */
export const checkPackagePath = function checkPackagePath(path: string): PathProblem | null {
    if (path.length === 0) {
        return "empty";
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(path) || path.includes("\\")) {
        return "invalid-character";
    }
    if (path.startsWith("//") || SCHEME.test(path)) {
        return "remote-reference";
    }
    if (path.startsWith("/")) {
        return "absolute-path";
    }
    const segments = path.split("/");
    if (segments.some((s) => s === "..")) {
        return "path-escapes-root";
    }
    if (segments.some((s) => s === "")) {
        return "invalid-character";
    }
    return null;
};
