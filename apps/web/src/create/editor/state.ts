// 制作器的编辑状态：素材列表、设置、撤销重做和“有未保存更改”的判断。
// 全部是纯函数：每个操作接收旧状态、返回新状态；没有变化时返回同一个对象（不产生历史）。规则见 docs/dev-0.3.0.md 3A.11。
import { GENERATOR_LIMITS, type AspectRatio, type Look, type TransitionChoice } from "@qyplayer/core";
import type { MediaEntry, MusicEntry } from "../buildPackage";
import { moveItem, sortByCapturedAt } from "../files";

/** 撤销栈最多保留的步数（3A.11） */
export const MAX_HISTORY = 50;
/** 标题连续输入时，两次输入间隔不超过这个毫秒数就合并为一步（3A.11） */
export const TITLE_MERGE_MS = 1000;

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
  | { kind: "none" }
  | { kind: "builtin"; trackId: string }
  | { kind: "custom"; entry: MusicEntry };

/** 一份完整的编辑内容；撤销重做保存的就是它的快照。不含转码开关（那是用户偏好，不进历史）。 */
export interface EditorDoc {
  media: readonly EditorMedia[];
  title: string;
  aspect: AspectChoice;
  templateId: string;
  transition: TransitionSetting;
  look: LookSetting;
  music: MusicChoice;
  seed: number;
}

/** 新建或打开时用来整体替换编辑内容 */
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
}

function initialDoc(seed: number, templateId: string): EditorDoc {
  return { media: [], title: "", aspect: "auto", templateId, transition: "auto", look: "original", music: { kind: "none" }, seed };
}

/** 创建空的编辑状态；种子由调用方随机给出，保持函数纯净 */
export function createEditor(seed: number, defaultTemplateId: string): EditorState {
  return {
    past: [],
    present: { id: 0, doc: initialDoc(seed, defaultTemplateId) },
    future: [],
    savedId: 0,
    nextKey: 1,
    nextEntryId: 1,
    defaultTemplateId,
    lastTitleAt: null,
  };
}

export const currentDoc = (state: EditorState): EditorDoc => state.present.doc;
export const canUndo = (state: EditorState): boolean => state.past.length > 0;
export const canRedo = (state: EditorState): boolean => state.future.length > 0;
export const isDirty = (state: EditorState): boolean => state.present.id !== state.savedId;

/** 所有历史快照里还被引用的素材文件；不在其中的文件可以释放缩略图等资源 */
export function referencedBlobs(state: EditorState): Set<Blob> {
  const blobs = new Set<Blob>();
  for (const entry of [...state.past, state.present, ...state.future]) {
    for (const media of entry.doc.media) blobs.add(media.blob);
  }
  return blobs;
}

function commit(state: EditorState, doc: EditorDoc, titleAt: number | null = null): EditorState {
  const past = [...state.past, state.present].slice(-MAX_HISTORY);
  return {
    ...state,
    past,
    present: { id: state.nextEntryId, doc },
    future: [],
    nextEntryId: state.nextEntryId + 1,
    lastTitleAt: titleAt,
  };
}

export interface AddResult {
  state: EditorState;
  /** 因超过素材数量上限而没有加入的个数 */
  rejected: number;
}

/** 把素材追加到列表末尾；一次添加算一步 */
export function addMedia(state: EditorState, inputs: readonly EditorMediaInput[]): AddResult {
  const doc = state.present.doc;
  const room = Math.max(0, GENERATOR_LIMITS.maxMedia - doc.media.length);
  const accepted = inputs.slice(0, room);
  const rejected = inputs.length - accepted.length;
  if (accepted.length === 0) return { state, rejected };
  const added = accepted.map((input, index) => ({ ...input, key: state.nextKey + index }));
  const next = commit({ ...state, nextKey: state.nextKey + accepted.length }, { ...doc, media: [...doc.media, ...added] });
  return { state: next, rejected };
}

export function removeMedia(state: EditorState, key: number): EditorState {
  const doc = state.present.doc;
  if (!doc.media.some((m) => m.key === key)) return state;
  return commit(state, { ...doc, media: doc.media.filter((m) => m.key !== key) });
}

/** 把第 from 项移到第 to 项的位置（拖动和 Alt+方向键都用它） */
export function moveMedia(state: EditorState, from: number, to: number): EditorState {
  const doc = state.present.doc;
  if (from === to || from < 0 || to < 0 || from >= doc.media.length || to >= doc.media.length) return state;
  return commit(state, { ...doc, media: moveItem(doc.media, from, to - from) });
}

/** 按拍摄时间升序重排整个列表 */
export function sortMediaByCapturedAt(state: EditorState): EditorState {
  const doc = state.present.doc;
  const sorted = sortByCapturedAt(doc.media, (m) => m);
  if (sorted.every((m, i) => m === doc.media[i])) return state;
  return commit(state, { ...doc, media: sorted });
}

export function setAspect(state: EditorState, aspect: AspectChoice): EditorState {
  const doc = state.present.doc;
  return doc.aspect === aspect ? state : commit(state, { ...doc, aspect });
}

export function setTemplate(state: EditorState, templateId: string): EditorState {
  const doc = state.present.doc;
  return doc.templateId === templateId ? state : commit(state, { ...doc, templateId });
}

export function setTransition(state: EditorState, transition: TransitionSetting): EditorState {
  const doc = state.present.doc;
  return doc.transition === transition ? state : commit(state, { ...doc, transition });
}

export function setLook(state: EditorState, look: LookSetting): EditorState {
  const doc = state.present.doc;
  return doc.look === look ? state : commit(state, { ...doc, look });
}

function sameMusic(a: MusicChoice, b: MusicChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "builtin" && b.kind === "builtin") return a.trackId === b.trackId;
  if (a.kind === "custom" && b.kind === "custom") return a.entry === b.entry;
  return true;
}

export function setMusic(state: EditorState, music: MusicChoice): EditorState {
  const doc = state.present.doc;
  return sameMusic(doc.music, music) ? state : commit(state, { ...doc, music });
}

/** “换一版”：换一个随机种子 */
export function setSeed(state: EditorState, seed: number): EditorState {
  const doc = state.present.doc;
  return doc.seed === seed ? state : commit(state, { ...doc, seed });
}

/**
 * 修改标题。at 是此刻的毫秒时间戳。连续输入间隔不超过 TITLE_MERGE_MS 时合并到上一步，
 * 但如果上一步正好是已保存的位置，就必须另起一步，否则保存后再改会被误判为没有更改。
 */
export function setTitle(state: EditorState, title: string, at: number): EditorState {
  const doc = state.present.doc;
  if (doc.title === title) return state;
  const mergeable = state.lastTitleAt !== null && at - state.lastTitleAt <= TITLE_MERGE_MS && state.present.id !== state.savedId;
  if (mergeable) {
    return { ...state, present: { id: state.present.id, doc: { ...doc, title } }, lastTitleAt: at };
  }
  return commit(state, { ...doc, title }, at);
}

export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    ...state,
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    lastTitleAt: null,
  };
}

export function redo(state: EditorState): EditorState {
  const [next, ...rest] = state.future;
  if (!next) return state;
  return {
    ...state,
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    present: next,
    future: rest,
    lastTitleAt: null,
  };
}

/** 保存成功后调用：把当前位置记为已保存 */
export function markSaved(state: EditorState): EditorState {
  return { ...state, savedId: state.present.id, lastTitleAt: null };
}

/** 新建：回到与 createEditor 完全相同的初始状态，历史清空 */
export function resetEditor(state: EditorState, seed: number): EditorState {
  return createEditor(seed, state.defaultTemplateId);
}

/** 打开已有包：用还原出的内容整体替换，历史清空，不算有更改 */
export function loadEditor(state: EditorState, content: EditorContent): EditorState {
  const media = content.media.map((input, index) => ({ ...input, key: index + 1 }));
  return {
    past: [],
    present: { id: 0, doc: { ...content, media } },
    future: [],
    savedId: 0,
    nextKey: media.length + 1,
    nextEntryId: 1,
    defaultTemplateId: state.defaultTemplateId,
    lastTitleAt: null,
  };
}
