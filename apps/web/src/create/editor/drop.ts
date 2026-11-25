// 把文件拖进窗口时该做什么（docs/dev-0.3.0.md 3A.5）。

export type DropAction<T> =
/** 没有文件 */
    | {kind: "none"}
  /** 只有一个 .qyp：打开它 */
    | {
        kind: "open";
        file: T;
    }
  /** 添加照片和视频；ignoredQyp 为真时提示“已忽略 .qyp 文件” */
    | {
        kind: "add";
        files: T[];
        ignoredQyp: boolean;
    }
  /** 同时拖入多个 .qyp：什么都不做，提示一次只能打开一个 */
    | {kind: "multiple-qyp"};

export const isQypFile = (file: {name: string}): boolean => file.name.toLowerCase().endsWith(".qyp");

export const classifyDrop = function classifyDrop<T extends {name: string}>(files: readonly T[]): DropAction<T> {
    if (files.length === 0) {
        return {kind: "none"};
    }
    const qyp = files.filter(isQypFile);
    const others = files.filter((file) => !isQypFile(file));
    if (qyp.length > 1) {
        return {kind: "multiple-qyp"};
    }
    if (qyp.length === 1 && others.length === 0) {
        return {kind: "open", file: qyp[0]!};
    }
    return {kind: "add", files: others, ignoredQyp: qyp.length > 0};
};
