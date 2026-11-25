// 单页编辑的纯函数（docs/dev-0.4.1.md）：页的编排、页操作、与清单素材 id 的互相转换、增删素材后的对齐。
// 页内素材用 EditorMedia.key 标识；生成清单时按 selectedMedia 的顺序映射成 m001…（见 pagesToPlan）。
import {
    KNOWN_DIRECTIONS,
    LAYOUTS,
    MAX_PAGE_ITEMS,
    defaultAspectRatio,
    type AspectRatio,
    type ItemPlan,
    type PagePlan,
    type TransitionChoice,
} from "@qyplayer/core";
import {idFor, mediaInputOf, planPagesFor, type BuildOptions, type MediaEntry} from "../buildPackage";
import type {AspectChoice, TransitionSetting} from "./state";

/** 页时长的范围和步长（秒） */
export const MIN_PAGE_SECONDS = 1;
export const MAX_PAGE_SECONDS = 15;
export const PAGE_SECONDS_STEP = 0.5;
/** 视频片段长度的范围（秒）；上限同时受素材时长限制 */
export const MIN_CLIP_SECONDS = 1;
export const MAX_CLIP_SECONDS = 60;

/** 页里的一个素材 */
export interface EditorItem extends Omit<ItemPlan, "assetId"> {
    /** EditorMedia.key */
    key: number;
}

/** 手动编排里的一页 */
export interface EditorPage extends Omit<PagePlan, "items"> {
    items: readonly EditorItem[];
}

/** 页操作要知道哪些素材是视频（视频独占一页，没有取景和 Ken Burns） */
export interface PageContext {
    isVideo: (key: number) => boolean;
}

/** 生成编排所需的编辑内容：入选的素材（已按档位筛过）和影响编排的设置 */
export interface PlanningInput {
    media: readonly (MediaEntry & {key: number})[];
    aspect: AspectChoice;
    templateId: string;
    seed: number;
    transition: TransitionSetting;
}

// ---------- 与清单的转换 ----------

/** 编辑用的页 → 生成器的编排；keys 是入选素材的 key（按列表顺序），位置决定清单里的 id */
export const pagesToPlan = function pagesToPlan(pages: readonly EditorPage[], keys: readonly number[]): PagePlan[] {
    const ids = new Map(keys.map((key, index) => [key, idFor(index)]));
    return pages.map(({items, ...page}) => ({
        ...page,
        items: items.map(({key, ...item}) => {
            const assetId = ids.get(key);
            if (assetId === undefined) {
                throw new Error(`page item uses media key ${key}, which is not selected`);
            }
            return {assetId, ...item};
        }),
    }));
};

/** 清单里的素材 id → key；keys 是入选素材的 key（按列表顺序），位置决定 id，与 pagesToPlan 的约定相同 */
export const keysById = function keysById(keys: readonly number[]): Map<string, number> {
    return new Map(keys.map((key, index) => [idFor(index), key]));
};

/** 生成器的编排 → 编辑用的页；素材 id 经 byId 换成 key，找不到的抛错 */
export const pagesFromPlan = function pagesFromPlan(plan: readonly PagePlan[], byId: ReadonlyMap<string, number>): EditorPage[] {
    return plan.map(({items, ...page}) => ({
        ...page,
        items: items.map(({assetId, ...item}) => {
            const key = byId.get(assetId);
            if (key === undefined) {
                throw new Error(`plan uses unknown media ${assetId}`);
            }
            return {key, ...item};
        }),
    }));
};

/** 影响编排的那几项设置，预览、保存和第一次单页修改时用的是同一份 */
export const planningOptions = function planningOptions(input: PlanningInput): Pick<BuildOptions, "media" | "aspectRatio" | "templateId" | "seed" | "transition"> {
    return {
        media: input.media,
        ...input.aspect !== "auto" && {aspectRatio: input.aspect},
        templateId: input.templateId,
        seed: input.seed,
        ...input.transition !== "auto" && {transition: input.transition},
    };
};

/** 当前自动编排的结果（第一次单页修改时存成手动编排，画面不变） */
export const autoPages = function autoPages(input: PlanningInput): EditorPage[] {
    return pagesFromPlan(
        planPagesFor(planningOptions(input)),
        keysById(input.media.map((m) => m.key)),
    );
};

// ---------- 页的小工具 ----------

/** 页里的素材 key 按页序、格子序排成一列 */
export const keysOf = function keysOf(pages: readonly EditorPage[]): number[] {
    return pages.flatMap((page) => page.items.map((item) => item.key));
};

/** 素材个数变了之后整理一页：版式换回默认；单张照片没有 Ken Burns 时补上推近（自动编排的单张页都有） */
const reshaped = function reshaped(page: EditorPage, items: readonly EditorItem[], ctx: PageContext): EditorPage {
    const rest = {...page};
    delete rest.layout;
    const only = items.length === 1 ? items[0]! : undefined;
    return {
        ...rest,
        items: only && !ctx.isVideo(only.key) && only.kenBurns === undefined ? [{...only, kenBurns: "in"}] : items,
    };
};

const replaceAt = function replaceAt<T>(list: readonly T[], index: number, ...replacement: readonly T[]): T[] {
    return [...list.slice(0, index), ...replacement, ...list.slice(index + 1)];
};

const inRange = (list: readonly unknown[], index: number): boolean => Number.isInteger(index) && index >= 0 && index < list.length;

const sameEntries = (a: object, b: object): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
};

/** 对象 + 补丁；补丁里值为 undefined 的字段被删除 */
const patched = function patched<T extends object>(target: T, patch: { [K in keyof T]?: T[K] | undefined }): T {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const next = {...target, ...patch} as Record<string, unknown>;
    for (const key of Object.keys(next)) {
        if (next[key] === undefined) {
            delete next[key];
        }
    }
    return next as T;
};

// ---------- 页操作（没有变化时返回同一个数组；不允许时返回 null） ----------

/** 把第 from 页移到第 to 页的位置 */
export const movePage = function movePage(pages: readonly EditorPage[], from: number, to: number): EditorPage[] | null {
    if (!inRange(pages, from) || !inRange(pages, to)) {
        return null;
    }
    if (from === to) {
        return pages as EditorPage[];
    }
    const next = [...pages];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
};

/** 修改一页的时长、转场、版式（值为 undefined 表示恢复自动） */
export const updatePage = function updatePage(pages: readonly EditorPage[], index: number, patch: Partial<Pick<EditorPage, "duration" | "transition" | "layout">>): EditorPage[] | null {
    if (!inRange(pages, index)) {
        return null;
    }
    const page = pages[index]!;
    const next = patched(page, patch);
    return sameEntries(page, next) ? (pages as EditorPage[]) : replaceAt(pages, index, next);
};

/** 修改页内一个素材的显示方式、取景、Ken Burns、片段起点（值为 undefined 表示恢复自动） */
export const updateItem = function updateItem(
    pages: readonly EditorPage[],
    pageIndex: number,
    itemIndex: number,
    patch: Partial<Pick<EditorItem, "fit" | "crop" | "kenBurns" | "clipStart" | "muted">>,
): EditorPage[] | null {
    if (!inRange(pages, pageIndex) || !inRange(pages[pageIndex]!.items, itemIndex)) {
        return null;
    }
    const page = pages[pageIndex]!;
    const item = page.items[itemIndex]!;
    const next = patched(item, patch);
    if (sameEntries(item, next)) {
        return pages as EditorPage[];
    }
    return replaceAt(pages, pageIndex, {...page, items: replaceAt(page.items, itemIndex, next)});
};

/** 页内换格子顺序（第 1 个是大格子） */
// eslint-disable-next-line @stylistic/max-len
export const moveItemInPage = function moveItemInPage(pages: readonly EditorPage[], pageIndex: number, from: number, to: number): EditorPage[] | null {
    if (!inRange(pages, pageIndex)) {
        return null;
    }
    const page = pages[pageIndex]!;
    if (!inRange(page.items, from) || !inRange(page.items, to)) {
        return null;
    }
    if (from === to) {
        return pages as EditorPage[];
    }
    const items = [...page.items];
    items.splice(to, 0, ...items.splice(from, 1));
    return replaceAt(pages, pageIndex, {...page, items});
};

/**
 * 把一张照片移到相邻页：向前移到前一页的末尾，向后移到后一页的开头（整体素材顺序不变）。
 * 视频不能移，也不能移进视频页或已满 4 张的页；原页空了就删掉。
 */
// eslint-disable-next-line @stylistic/max-len
export const movePhoto = function movePhoto(pages: readonly EditorPage[], ctx: PageContext, pageIndex: number, itemIndex: number, direction: -1 | 1): EditorPage[] | null {
    if (!inRange(pages, pageIndex) || !inRange(pages[pageIndex]!.items, itemIndex)) {
        return null;
    }
    const from = pages[pageIndex]!;
    const item = from.items[itemIndex]!;
    const targetIndex = pageIndex + direction;
    if (ctx.isVideo(item.key) || !inRange(pages, targetIndex)) {
        return null;
    }
    const target = pages[targetIndex]!;
    if (target.items.some((it) => ctx.isVideo(it.key)) || target.items.length >= MAX_PAGE_ITEMS) {
        return null;
    }

    const rest = from.items.filter((_, i) => i !== itemIndex);
    const grown = reshaped(target, direction === 1 ? [item, ...target.items] : [...target.items, item], ctx);
    const next = [...pages];
    next[targetIndex] = grown;
    if (rest.length === 0) {
        next.splice(pageIndex, 1);
    } else {
        next[pageIndex] = reshaped(from, rest, ctx);
    }
    return next;
};

/** 把多图页里的一张照片拆成紧跟其后的单独一页（淡入，推近） */
// eslint-disable-next-line @stylistic/max-len
export const splitPhoto = function splitPhoto(pages: readonly EditorPage[], ctx: PageContext, pageIndex: number, itemIndex: number): EditorPage[] | null {
    if (!inRange(pages, pageIndex) || !inRange(pages[pageIndex]!.items, itemIndex)) {
        return null;
    }
    const page = pages[pageIndex]!;
    if (page.items.length < 2) {
        return null;
    }
    const item = page.items[itemIndex]!;
    const alone: EditorPage = reshaped({items: []}, [item], ctx);
    // eslint-disable-next-line @stylistic/max-len
    return [...pages.slice(0, pageIndex), reshaped(page, page.items.filter((_, i) => i !== itemIndex), ctx), alone, ...pages.slice(pageIndex + 1)];
};

/** 本页与下一页合并成一页（保留本页的转场和时长）；视频页不能合并，合并后不超过 4 张 */
// eslint-disable-next-line @stylistic/max-len
export const mergeWithNext = function mergeWithNext(pages: readonly EditorPage[], ctx: PageContext, pageIndex: number): EditorPage[] | null {
    if (!inRange(pages, pageIndex) || !inRange(pages, pageIndex + 1)) {
        return null;
    }
    const a = pages[pageIndex]!;
    const b = pages[pageIndex + 1]!;
    if ([...a.items, ...b.items].some((it) => ctx.isVideo(it.key)) || a.items.length + b.items.length > MAX_PAGE_ITEMS) {
        return null;
    }
    return [...pages.slice(0, pageIndex), reshaped(a, [...a.items, ...b.items], ctx), ...pages.slice(pageIndex + 2)];
};

/** 全片转场改成固定类型：第 2 页起的所有页都用它（滑动的方向依次轮换，相邻页不重复） */
export const applyTransitionToAll = function applyTransitionToAll(pages: readonly EditorPage[], choice: TransitionChoice): EditorPage[] {
    return pages.map((page, index) => {
        if (index === 0) {
            return page;
        }
        const transition = choice === "slide" ? {type: choice, direction: KNOWN_DIRECTIONS[(index - 1) % KNOWN_DIRECTIONS.length]!} : {type: choice};
        return {...page, transition};
    });
};

/** 该页可用的版式编号（按张数） */
export const layoutsOf = function layoutsOf(page: EditorPage): readonly string[] {
    return LAYOUTS[page.items.length as 1 | 2 | 3 | 4] ?? [];
};

// ---------- 增删素材后的对齐 ----------

/**
 * 素材列表变了之后让页和入选素材对上：去掉不再入选的素材（空页删除，页内素材少了版式换回默认），
 * 新入选的素材按模板规则分页接在末尾；已有页的其他设置不动。没有任何入选素材时返回 null（回到自动编排）。
 */
// eslint-disable-next-line @stylistic/max-len
export const reconcilePages = function reconcilePages(pages: readonly EditorPage[], input: PlanningInput, ctx: PageContext): EditorPage[] | null {
    if (input.media.length === 0) {
        return null;
    }
    const selected = new Set(input.media.map((m) => m.key));
    const kept: EditorPage[] = [];
    for (const page of pages) {
        const items = page.items.filter((item) => selected.has(item.key));
        if (items.length === page.items.length) {
            kept.push(page);
        } else if (items.length > 0) {
            kept.push(reshaped(page, items, ctx));
        }
    }
    const present = new Set(keysOf(kept));
    const added = input.media.filter((m) => !present.has(m.key));
    if (added.length === 0) {
        return kept;
    }
    // 新素材按“整片”的画面比例分页（自动比例看全部入选素材）；第一页的淡入对接在末尾的页没有意义，去掉
    const aspectRatio: AspectRatio = input.aspect !== "auto" ? input.aspect : defaultAspectRatio(input.media.map(mediaInputOf));
    const fresh = pagesFromPlan(planPagesFor({...planningOptions(input), media: added, aspectRatio}), keysById(added.map((m) => m.key)));
    if (kept.length > 0) {
        delete fresh[0]!.transition;
    }
    return [...kept, ...fresh];
};

/** 让素材列表的顺序跟随页的顺序：入选素材按页序排进它们原来占的位置，未入选的不动 */
export const followPageOrder = function followPageOrder<T extends {key: number}>(media: readonly T[], pages: readonly EditorPage[]): T[] {
    const order = new Map(keysOf(pages).map((key, index) => [key, index]));
    const slots = media.map((m, index) => order.has(m.key) ? index : -1).filter((index) => index >= 0);
    const ordered = media.filter((m) => order.has(m.key)).sort((a, b) => order.get(a.key)! - order.get(b.key)!);
    const next = [...media];
    slots.forEach((slot, i) => next[slot] = ordered[i]!);
    return next;
};

/** 编排是否正好覆盖这些素材（每个一次，不多不少） */
export const coversExactly = function coversExactly(pages: readonly EditorPage[], keys: readonly number[]): boolean {
    const used = keysOf(pages);
    return used.length === keys.length && new Set(used).size === used.length && keys.every((k) => used.includes(k));
};
