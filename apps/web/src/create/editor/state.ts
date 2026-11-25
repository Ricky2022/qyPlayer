// 制作器的编辑状态：素材列表、设置、撤销重做和“有未保存更改”的判断。
// 全部是纯函数：每个操作接收旧状态、返回新状态；没有变化时返回同一个对象（不产生历史）。规则见 docs/dev-0.3.0.md 3A.11。
import {GENERATOR_LIMITS, selectByLength, type AspectRatio, type LengthChoice, type Look, type TransitionChoice} from "@qyplayer/core";
import type {MediaEntry, MusicEntry} from "../buildPackage";
import {DEFAULT_BUILTIN_TRACK_ID} from "../builtinMusicInfo";
import {moveItem, sortByCapturedAt} from "../files";
import {applyTransitionToAll, autoPages, followPageOrder, reconcilePages, type EditorPage, type PageContext, type PlanningInput} from "./pages";

/** 撤销栈最多保留的步数（3A.11） */
export const MAX_HISTORY = 50;
/** 标题连续输入时，两次输入间隔不超过这个毫秒数就合并为一步（3A.11） */
export const TITLE_MERGE_MS = 1000;
/** 滑块等连续调整同一项时，两次调整间隔不超过这个毫秒数就合并为一步（docs/dev-0.4.1.md 5） */
export const TWEAK_MERGE_MS = 1000;

/** 列表里的一个素材 */
export interface EditorMedia extends MediaEntry {
    /** 在整个编辑过程中唯一，界面用它做列表 key、缩略图缓存的键 */
    key: number;
    /** 为真表示 blob 已是最终文件，保存时不再转码（从包还原出来的素材） */
    final: boolean;
}

export type EditorMediaInput = Omit<EditorMedia, "key">;

export type AspectChoice = "auto" | AspectRatio;

/** 转场设置：auto 表示跟随模板 */
export type TransitionSetting = "auto" | TransitionChoice;

/** 滤镜设置：original 表示原片（清单里不写 look） */
export type LookSetting = "original" | Look;

export type MusicChoice =
    | {kind: "none"}
    | {
        kind: "builtin";
        trackId: string;
    }
    | {
        kind: "custom";
        entry: MusicEntry;
    };

/** 一份完整的编辑内容；撤销重做保存的就是它的快照。不含转码开关（那是用户偏好，不进历史）。 */
export interface EditorDoc {
    media: readonly EditorMedia[];
    title: string;
    /** 副标题，可以为空 */
    subtitle: string;
    /** 是否在影片开头显示标题 */
    showTitle: boolean;
    aspect: AspectChoice;
    templateId: string;
    transition: TransitionSetting;
    look: LookSetting;
    /** 影片时长档位；只决定用哪些素材，不写进清单，重新打开一律是长 */
    length: LengthChoice;
    music: MusicChoice;
    seed: number;
    /** 单页编辑后的手动编排；null 表示自动编排（素材 + 设置 + 种子决定整部影片）。素材用 EditorMedia.key 标识 */
    pages: readonly EditorPage[] | null;
}

/** 新建或打开时用来整体替换编辑内容；pages 里的素材 key 是素材在 media 里的位置加 1（loadEditor 就是这样编 key 的） */
export interface EditorContent extends Omit<EditorDoc, "media"> {
    media: readonly EditorMediaInput[];
}

interface HistoryEntry {
    /** 历史位置的编号，只用于判断“当前位置是不是上次保存的位置” */
    id: number;
    doc: EditorDoc;
}

export interface EditorState {
    readonly past: readonly HistoryEntry[];
    readonly present: HistoryEntry;
    readonly future: readonly HistoryEntry[];
    /** 上次保存或打开时的历史位置；该位置已被挤出撤销栈时为 null（此后一直算有更改） */
    readonly savedId: number | null;
    readonly nextKey: number;
    readonly nextEntryId: number;
    /** 新建时使用的模板 */
    readonly defaultTemplateId: string;
    /** 最近一步是标题输入时，该次输入的时间；用于合并连续输入 */
    readonly lastTitleAt: number | null;
    /** 最近一步是滑块类调整时，调整的项和时间；用于合并连续调整 */
    readonly lastTweak: {
        key: string;
        at: number;
    } | null;
}

const initialDoc = function initialDoc(seed: number, templateId: string): EditorDoc {
    return {
        media: [],
        title: "",
        subtitle: "",
        showTitle: true,
        aspect: "auto",
        templateId,
        transition: "auto",
        look: "original",
        length: "long",
        music: {kind: "builtin", trackId: DEFAULT_BUILTIN_TRACK_ID},
        seed,
        pages: null,
    };
};

/** 创建空的编辑状态；种子由调用方随机给出，保持函数纯净 */
export const createEditor = function createEditor(seed: number, defaultTemplateId: string): EditorState {
    return {
        past: [],
        present: {id: 0, doc: initialDoc(seed, defaultTemplateId)},
        future: [],
        savedId: 0,
        nextKey: 1,
        nextEntryId: 1,
        defaultTemplateId,
        lastTitleAt: null,
        lastTweak: null,
    };
};

export const currentDoc = (state: EditorState): EditorDoc => state.present.doc;
export const canUndo = (state: EditorState): boolean => state.past.length > 0;
export const canRedo = (state: EditorState): boolean => state.future.length > 0;
export const isDirty = (state: EditorState): boolean => state.present.id !== state.savedId;

/** 所有历史快照里还被引用的素材文件；不在其中的文件可以释放缩略图等资源 */
export const referencedBlobs = function referencedBlobs(state: EditorState): Set<Blob> {
    const blobs = new Set<Blob>();
    for (const entry of [...state.past, state.present, ...state.future]) {
        for (const media of entry.doc.media) {
            blobs.add(media.blob);
        }
    }
    return blobs;
};

const commit = function commit(state: EditorState, doc: EditorDoc, titleAt: number | null = null, tweak: EditorState["lastTweak"] = null): EditorState {
    const past = [...state.past, state.present].slice(-MAX_HISTORY);
    return {
        ...state,
        past,
        present: {id: state.nextEntryId, doc},
        future: [],
        nextEntryId: state.nextEntryId + 1,
        lastTitleAt: titleAt,
        lastTweak: tweak,
    };
};

/** 入选的素材 + 影响编排的设置，单页编辑用它算自动编排和对齐 */
export const selectedMedia = function selectedMedia(doc: Pick<EditorDoc, "media" | "length">): EditorMedia[] {
    const keep = new Set(selectByLength(doc.media, doc.length));
    return doc.media.filter((_, index) => keep.has(index));
};
const planningInputOf = function planningInputOf(doc: EditorDoc): PlanningInput {
    return {...doc, media: selectedMedia(doc)};
};

const pageContextOf = function pageContextOf(doc: EditorDoc): PageContext {
    const videos = new Set(doc.media.filter((m) => m.type === "video").map((m) => m.key));
    return {isVideo: (key) => videos.has(key)};
};

/** 换一份素材列表；手动编排时让页跟着对齐（去掉没了的素材，新素材分页接在末尾） */
const withMedia = function withMedia(doc: EditorDoc, media: readonly EditorMedia[]): EditorDoc {
    const next = {...doc, media};
    if (doc.pages === null) {
        return next;
    }
    return {...next, pages: reconcilePages(doc.pages, planningInputOf(next), pageContextOf(next))};
};

export interface AddResult {
    state: EditorState;
    /** 因超过素材数量上限而没有加入的个数 */
    rejected: number;
}

/** 把素材追加到列表末尾；一次添加算一步 */
export const addMedia = function addMedia(state: EditorState, inputs: readonly EditorMediaInput[]): AddResult {
    const doc = state.present.doc;
    const room = Math.max(0, GENERATOR_LIMITS.maxMedia - doc.media.length);
    const accepted = inputs.slice(0, room);
    const rejected = inputs.length - accepted.length;
    if (accepted.length === 0) {
        return {state, rejected};
    }
    const added = accepted.map((input, index) => ({...input, key: state.nextKey + index}));
    const next = commit({...state, nextKey: state.nextKey + accepted.length}, withMedia(doc, [...doc.media, ...added]));
    return {state: next, rejected};
};

export const removeMedia = function removeMedia(state: EditorState, key: number): EditorState {
    const doc = state.present.doc;
    if (!doc.media.some((m) => m.key === key)) {
        return state;
    }
    return commit(state, withMedia(doc, doc.media.filter((m) => m.key !== key)));
};

/** 把第 from 项移到第 to 项的位置（拖动和 Alt+方向键都用它） */
export const moveMedia = function moveMedia(state: EditorState, from: number, to: number): EditorState {
    const doc = state.present.doc;
    if (from === to || from < 0 || to < 0 || from >= doc.media.length || to >= doc.media.length) {
        return state;
    }
    return commit(state, {...doc, media: moveItem(doc.media, from, to - from), pages: null});
};

/** 按拍摄时间升序重排整个列表 */
export const sortMediaByCapturedAt = function sortMediaByCapturedAt(state: EditorState): EditorState {
    const doc = state.present.doc;
    const sorted = sortByCapturedAt(doc.media, (m) => m);
    if (sorted.every((m, i) => m === doc.media[i])) {
        return state;
    }
    return commit(state, {...doc, media: sorted, pages: null});
};

export const setAspect = function setAspect(state: EditorState, aspect: AspectChoice): EditorState {
    const doc = state.present.doc;
    return doc.aspect === aspect ? state : commit(state, {...doc, aspect});
};

export const setTemplate = function setTemplate(state: EditorState, templateId: string): EditorState {
    const doc = state.present.doc;
    return doc.templateId === templateId ? state : commit(state, {...doc, templateId, pages: null});
};

export const setTransition = function setTransition(state: EditorState, transition: TransitionSetting): EditorState {
    const doc = state.present.doc;
    if (doc.transition === transition) {
        return state;
    }
    // 手动编排时，固定类型的全片转场覆盖各页的转场；选回“跟随模板”不改各页已有的转场
    const pages = doc.pages && transition !== "auto" ? applyTransitionToAll(doc.pages, transition) : doc.pages;
    return commit(state, {...doc, transition, pages});
};

export const setLength = function setLength(state: EditorState, length: LengthChoice): EditorState {
    const doc = state.present.doc;
    return doc.length === length ? state : commit(state, {...doc, length, pages: null});
};

export const setLook = function setLook(state: EditorState, look: LookSetting): EditorState {
    const doc = state.present.doc;
    return doc.look === look ? state : commit(state, {...doc, look});
};

const sameMusic = function sameMusic(a: MusicChoice, b: MusicChoice): boolean {
    if (a.kind !== b.kind) {
        return false;
    }
    if (a.kind === "builtin" && b.kind === "builtin") {
        return a.trackId === b.trackId;
    }
    if (a.kind === "custom" && b.kind === "custom") {
        return a.entry === b.entry;
    }
    return true;
};

export const setMusic = function setMusic(state: EditorState, music: MusicChoice): EditorState {
    const doc = state.present.doc;
    return sameMusic(doc.music, music) ? state : commit(state, {...doc, music});
};

/** “换一版”：换一个随机种子 */
export const setSeed = function setSeed(state: EditorState, seed: number): EditorState {
    const doc = state.present.doc;
    return doc.seed === seed ? state : commit(state, {...doc, seed, pages: null});
};

/**
 * 修改标题。at 是此刻的毫秒时间戳。连续输入间隔不超过 TITLE_MERGE_MS 时合并到上一步，
 * 但如果上一步正好是已保存的位置，就必须另起一步，否则保存后再改会被误判为没有更改。
 */
const setText = function setText(state: EditorState, field: "title" | "subtitle", value: string, at: number): EditorState {
    const doc = state.present.doc;
    if (doc[field] === value) {
        return state;
    }
    const mergeable = state.lastTitleAt !== null && at - state.lastTitleAt <= TITLE_MERGE_MS && state.present.id !== state.savedId;
    if (mergeable) {
        return {...state, present: {id: state.present.id, doc: {...doc, [field]: value}}, lastTitleAt: at, lastTweak: null};
    }
    return commit(state, {...doc, [field]: value}, at);
};
export const setTitle = function setTitle(state: EditorState, title: string, at: number): EditorState {
    return setText(state, "title", title, at);
};

/** 修改副标题，输入合并的规则同标题 */
export const setSubtitle = function setSubtitle(state: EditorState, subtitle: string, at: number): EditorState {
    return setText(state, "subtitle", subtitle, at);
};

export const setShowTitle = function setShowTitle(state: EditorState, showTitle: boolean): EditorState {
    const doc = state.present.doc;
    return doc.showTitle === showTitle ? state : commit(state, {...doc, showTitle});
};

export const undo = function undo(state: EditorState): EditorState {
    const previous = state.past[state.past.length - 1];
    if (!previous) {
        return state;
    }
    return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastTitleAt: null,
        lastTweak: null,
    };
};

export const redo = function redo(state: EditorState): EditorState {
    const [next, ...rest] = state.future;
    if (!next) {
        return state;
    }
    return {
        ...state,
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: next,
        future: rest,
        lastTitleAt: null,
        lastTweak: null,
    };
};

/** 保存成功后调用：把当前位置记为已保存 */
export const markSaved = function markSaved(state: EditorState): EditorState {
    return {...state, savedId: state.present.id, lastTitleAt: null, lastTweak: null};
};

/** 新建：回到与 createEditor 完全相同的初始状态，历史清空 */
export const resetEditor = function resetEditor(state: EditorState, seed: number): EditorState {
    return createEditor(seed, state.defaultTemplateId);
};

/** 打开已有包：用还原出的内容整体替换，历史清空，不算有更改 */
export const loadEditor = function loadEditor(state: EditorState, content: EditorContent): EditorState {
    const media = content.media.map((input, index) => ({...input, key: index + 1}));
    return {
        past: [],
        present: {id: 0, doc: {...content, media}},
        future: [],
        savedId: 0,
        nextKey: media.length + 1,
        nextEntryId: 1,
        defaultTemplateId: state.defaultTemplateId,
        lastTitleAt: null,
        lastTweak: null,
    };
};

// ---------- 单页编辑（docs/dev-0.4.1.md 2） ----------

/**
 * 修改手动编排：第一次修改时先把当前自动编排存成手动编排（画面不变），再应用 update。
 * update 返回 null（不允许）或原数组（没有变化）时状态不变。素材列表的顺序随之跟随页的顺序。
 * 传了 tweakKey 的连续调整（滑块、拖动取景）间隔不超过 TWEAK_MERGE_MS 时合并成一步撤销；at 是此刻的毫秒时间戳。
 */
export const editPages = function editPages(
    state: EditorState,
    update: (pages: readonly EditorPage[], ctx: PageContext) => readonly EditorPage[] | null,
    tweak?: {
        key: string;
        at: number;
    },
): EditorState {
    const doc = state.present.doc;
    const base = doc.pages ?? autoPages(planningInputOf(doc));
    const next = update(base, pageContextOf(doc));
    if (next === null || next === base) {
        return state;
    }
    const edited: EditorDoc = {...doc, pages: next, media: followPageOrder(doc.media, next)};
    const last = state.lastTweak;
    // eslint-disable-next-line @stylistic/max-len
    const mergeable = tweak && doc.pages !== null && last?.key === tweak.key && tweak.at - last.at <= TWEAK_MERGE_MS && state.present.id !== state.savedId;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (mergeable) {
        return {...state, present: {id: state.present.id, doc: edited}, lastTitleAt: null, lastTweak: tweak};
    }
    return commit(state, edited, null, tweak ?? null);
};

/** 删除一页：这一页的素材一并从影片里去掉（可撤销） */
export const removePage = function removePage(state: EditorState, pageIndex: number): EditorState {
    const doc = state.present.doc;
    const base = doc.pages ?? autoPages(planningInputOf(doc));
    const page = base[pageIndex];
    if (!page) {
        return state;
    }
    const gone = new Set(page.items.map((item) => item.key));
    return commit(state, withMedia({...doc, pages: base}, doc.media.filter((m) => !gone.has(m.key))));
};

/** 恢复自动编排：丢掉所有单页修改，按当前素材和设置重新编排 */
export const resetPages = function resetPages(state: EditorState): EditorState {
    const doc = state.present.doc;
    return doc.pages === null ? state : commit(state, {...doc, pages: null});
};
