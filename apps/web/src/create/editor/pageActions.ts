// 页面条和“本页”面板发出的操作：一个操作对应编辑状态上的一步（docs/dev-0.4.1.md 7）。
import type {Crop, KenBurns, PagePlan} from "@qyplayer/core";
import {
    MAX_PAGE_SECONDS,
    MIN_PAGE_SECONDS,
    PAGE_SECONDS_STEP,
    mergeWithNext,
    moveItemInPage,
    movePage,
    movePhoto,
    splitPhoto,
    updateItem,
    updatePage,
    type EditorPage,
} from "./pages";
import {editPages, removePage, type EditorState} from "./state";

export type PageAction =
    | {
        kind: "movePage";
        from: number;
        to: number;
    }
    | {
        kind: "removePage";
        index: number;
    }
  /** seconds 为 undefined 表示时长恢复自动；at 是此刻的毫秒时间戳，用于合并滑块的连续调整 */
    | {
        kind: "duration";
        index: number;
        seconds: number | undefined;
        at: number;
    }
    | {
        kind: "transition";
        index: number;
        transition: PagePlan["transition"];
    }
    | {
        kind: "layout";
        index: number;
        layout: string | undefined;
    }
    | {
        kind: "fit";
        index: number;
        item: number;
        fit: "cover" | "contain" | undefined;
    }
    | {
        kind: "moveItem";
        index: number;
        from: number;
        to: number;
    }
    | {
        kind: "movePhoto";
        index: number;
        item: number;
        direction: -1 | 1;
    }
    | {
        kind: "split";
        index: number;
        item: number;
    }
    | {
        kind: "merge";
        index: number;
    }
  /** 取景对话框的结果：crop 为 undefined 表示不取景。有取景时显示方式恢复自动（取景只在“铺满”下生效） */
    | {
        kind: "framing";
        index: number;
        item: number;
        crop: Crop | undefined;
        kenBurns: KenBurns | undefined;
    }
  /** 视频页的片段：起点和长度（秒）。调用方已按素材时长限制；at 同 duration，用于合并滑块的连续调整 */
    | {
        kind: "clip";
        index: number;
        start: number;
        length: number;
        at: number;
    };

export interface ActionResult {
    state: EditorState;
    /** 操作后应选中的页（缺省表示选中不变） */
    select?: number;
}

/** 页时长限制在范围内并取整到步长 */
export const clampPageSeconds = function clampPageSeconds(seconds: number): number {
    const stepped = Math.round(seconds / PAGE_SECONDS_STEP) * PAGE_SECONDS_STEP;
    return Math.min(MAX_PAGE_SECONDS, Math.max(MIN_PAGE_SECONDS, stepped));
};

const pagesOf = (state: EditorState): readonly EditorPage[] | null => state.present.doc.pages;

/** 素材 key 现在在第几页 */
const pageOfKey = function pageOfKey(state: EditorState, key: number): number | undefined {
    const index = pagesOf(state)?.findIndex((page) => page.items.some((item) => item.key === key));
    return index === undefined || index < 0 ? undefined : index;
};

/** 执行一个页操作；不允许或没有变化时状态不变 */
export const applyPageAction = function applyPageAction(state: EditorState, action: PageAction): ActionResult {
    switch (action.kind) {
        case "movePage": {
            const next = editPages(state, (pages) => movePage(pages, action.from, action.to));
            return next === state ? {state} : {state: next, select: action.to};
        }
        case "removePage": {
            const next = removePage(state, action.index);
            if (next === state) {
                return {state};
            }
            const left = pagesOf(next)?.length;
            return left === undefined ? {state: next} : {state: next, select: Math.min(action.index, left - 1)};
        }
        case "duration":
            return {
                state: editPages(
                    state,
                    // eslint-disable-next-line @stylistic/max-len
                    (pages) => updatePage(pages, action.index, {duration: action.seconds === undefined ? undefined : clampPageSeconds(action.seconds)}),
                    {key: `duration:${action.index}`, at: action.at},
                ),
            };
        case "transition":
            return {state: editPages(state, (pages) => updatePage(pages, action.index, {transition: action.transition}))};
        case "layout":
            return {state: editPages(state, (pages) => updatePage(pages, action.index, {layout: action.layout}))};
        case "fit":
            return {state: editPages(state, (pages) => updateItem(pages, action.index, action.item, {fit: action.fit}))};
        case "moveItem":
            return {state: editPages(state, (pages) => moveItemInPage(pages, action.index, action.from, action.to))};
        case "movePhoto":
        case "split": {
            // 记下被操作的照片，操作后选中它所在的页（自动编排的第一次修改要从生成的编排里认）
            let key: number | undefined;
            const next = editPages(state, (pages, ctx) => {
                key = pages[action.index]?.items[action.item]?.key;
                return action.kind === "movePhoto" ? movePhoto(pages, ctx, action.index, action.item, action.direction) : splitPhoto(pages, ctx, action.index, action.item);
            });
            if (next === state) {
                return {state};
            }
            const select = key === undefined ? undefined : pageOfKey(next, key);
            return select === undefined ? {state: next} : {state: next, select};
        }
        case "framing":
            return {
                state: editPages(state, (pages) =>
                    // eslint-disable-next-line @stylistic/max-len
                    updateItem(pages, action.index, action.item, {crop: action.crop, kenBurns: action.kenBurns, ...action.crop && {fit: undefined}})),
            };
        case "clip":
            return {
                state: editPages(
                    state,
                    (pages) => {
                        const withLength = updatePage(pages, action.index, {duration: action.length});
                        return withLength && updateItem(withLength, action.index, 0, {clipStart: action.start});
                    },
                    {key: `clip:${action.index}`, at: action.at},
                ),
            };
        case "merge": {
            const next = editPages(state, (pages, ctx) => mergeWithNext(pages, ctx, action.index));
            return next === state ? {state} : {state: next, select: action.index};
        }
    }
};
