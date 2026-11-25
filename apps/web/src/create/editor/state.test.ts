import {describe, expect, it} from "vitest";
import {DEFAULT_BUILTIN_TRACK_ID} from "../builtinMusicInfo";
import {
    MAX_HISTORY,
    addMedia,
    canRedo,
    canUndo,
    createEditor,
    currentDoc,
    isDirty,
    loadEditor,
    markSaved,
    moveMedia,
    redo,
    referencedBlobs,
    removeMedia,
    resetEditor,
    setAspect,
    setMusic,
    setSeed,
    selectedMedia,
    setLength,
    setLook,
    setShowTitle,
    setSubtitle,
    setTemplate,
    setTransition,
    setTitle,
    sortMediaByCapturedAt,
    undo,
    type EditorMediaInput,
    type EditorState,
} from "./state";

const photo = (name: string, capturedAt?: string): EditorMediaInput => ({
    fileName: name,
    type: "image",
    blob: new Blob([name]),
    width: 1600,
    height: 1067,
    mimeType: "image/jpeg",
    source: {mimeType: "image/jpeg", transcoded: false},
    final: false,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    ...capturedAt && {capturedAt},
});

const fresh = (): EditorState => createEditor(7, "clean");
const names = (state: EditorState): string[] => currentDoc(state).media.map((m) => m.fileName);
const withPhotos = (...list: string[]): EditorState => addMedia(fresh(), list.map((n) => photo(n))).state;

describe("编辑状态：素材列表", () => {
    it("一次添加多个素材算一步，追加在末尾并分配唯一编号", () => {
        const first = addMedia(fresh(), [photo("a"), photo("b")]).state;
        const second = addMedia(first, [photo("c")]).state;
        expect(names(second)).toEqual(["a", "b", "c"]);
        expect(currentDoc(second).media.map((m) => m.key)).toEqual([1, 2, 3]);
        expect(undo(second)).toMatchObject({present: {doc: {media: [{fileName: "a"}, {fileName: "b"}]}}});
    });

    it("添加空列表不产生历史", () => {
        const state = fresh();
        const result = addMedia(state, []);
        expect(result.state).toBe(state);
        expect(canUndo(result.state)).toBe(false);
    });

    it("超过 100 个素材的部分被拒绝并报告个数", () => {
        const full = addMedia(fresh(), Array.from({length: 99}, (_, i) => photo(`p${i}`))).state;
        const result = addMedia(full, [photo("x"), photo("y"), photo("z")]);
        expect(currentDoc(result.state).media).toHaveLength(100);
        expect(result.rejected).toBe(2);
        const again = addMedia(result.state, [photo("w")]);
        expect(again.state).toBe(result.state);
        expect(again.rejected).toBe(1);
    });

    it("删除一个素材，可以删到 0 个，撤销可恢复", () => {
        const state = withPhotos("a");
        const key = currentDoc(state).media[0]!.key;
        const emptied = removeMedia(state, key);
        expect(names(emptied)).toEqual([]);
        expect(names(undo(emptied))).toEqual(["a"]);
        expect(removeMedia(emptied, 999)).toBe(emptied);
    });

    it("移动素材：移到目标位置；原地或越界不产生历史", () => {
        const state = withPhotos("a", "b", "c");
        expect(names(moveMedia(state, 0, 2))).toEqual(["b", "c", "a"]);
        expect(names(moveMedia(state, 2, 1))).toEqual(["a", "c", "b"]);
        expect(moveMedia(state, 1, 1)).toBe(state);
        expect(moveMedia(state, 0, 3)).toBe(state);
        expect(moveMedia(state, -1, 0)).toBe(state);
    });

    it("按拍摄时间排序：缺少时间的排最后；已经有序时不产生历史", () => {
        const state = addMedia(fresh(), [photo("late", "2026-05-01T00:00:00Z"), photo("none"), photo("early", "2026-01-01T00:00:00Z")]).state;
        const sorted = sortMediaByCapturedAt(state);
        expect(names(sorted)).toEqual(["early", "late", "none"]);
        expect(sortMediaByCapturedAt(sorted)).toBe(sorted);
    });
});

describe("编辑状态：设置", () => {
    it("改比例、模板、转场、配乐、种子各算一步；改成相同的值不算", () => {
        let state = withPhotos("a");
        const base = state;
        state = setAspect(state, "9:16");
        state = setTemplate(state, "lively");
        state = setMusic(state, {kind: "builtin", trackId: "goldberg-aria"});
        state = setSeed(state, 99);
        state = setTransition(state, "rotate");
        state = setLook(state, "warm");
        expect(currentDoc(state)).toMatchObject({aspect: "9:16", templateId: "lively", transition: "rotate", look: "warm", music: {kind: "builtin", trackId: "goldberg-aria"}, seed: 99});
        expect(setTransition(state, "rotate")).toBe(state);
        expect(setLook(state, "warm")).toBe(state);
        state = setShowTitle(state, false);
        expect(currentDoc(state).showTitle).toBe(false);
        expect(setShowTitle(state, false)).toBe(state);
        state = setLength(state, "short");
        expect(currentDoc(state).length).toBe("short");
        expect(setLength(state, "short")).toBe(state);
        expect(setAspect(state, "9:16")).toBe(state);
        expect(setTemplate(state, "lively")).toBe(state);
        expect(setMusic(state, {kind: "builtin", trackId: "goldberg-aria"})).toBe(state);
        expect(setSeed(state, 99)).toBe(state);
        for (let i = 0; i < 8; i++) {
            state = undo(state);
        }
        expect(state.present.id).toBe(base.present.id);
    });

    it("导入的配乐按文件对象比较", () => {
        const entry = {blob: new Blob(["m"]), mimeType: "audio/mpeg", duration: 30};
        const state = setMusic(fresh(), {kind: "custom", entry});
        expect(setMusic(state, {kind: "custom", entry})).toBe(state);
        expect(setMusic(state, {kind: "custom", entry: {...entry}})).not.toBe(state);
    });
});

describe("编辑状态：时长档位", () => {
    const timedPhotos = (n: number) => {
        let state = fresh();
        state = addMedia(state, Array.from({length: n}, (_, i) => ({...photo(`p${i}`), capturedAt: new Date(Date.UTC(2026, 2, 1, 0, i * 10)).toISOString()}))).state;
        return state;
    };

    it("长档用全部素材；素材少于 10 个时任何档位都是全部", () => {
        expect(selectedMedia(currentDoc(timedPhotos(12)))).toHaveLength(12);
        expect(selectedMedia(currentDoc(setLength(timedPhotos(9), "short")))).toHaveLength(9);
    });

    it("中、短档按比例选用，选用的素材保持列表顺序，删除素材后重新计算", () => {
        let state = setLength(timedPhotos(20), "medium");
        expect(selectedMedia(currentDoc(state))).toHaveLength(12);
        state = setLength(state, "short");
        const doc = currentDoc(state);
        const chosen = selectedMedia(doc);
        expect(chosen).toHaveLength(6);
        expect(chosen.map((m) => doc.media.indexOf(m))).toEqual([...chosen.map((m) => doc.media.indexOf(m))].sort((a, b) => a - b));
        state = removeMedia(state, doc.media[0]!.key);
        expect(selectedMedia(currentDoc(state))).toHaveLength(6);
    });
});

describe("编辑状态：标题输入合并", () => {
    it("间隔不超过 1 秒的连续输入合并为一步，停顿超过 1 秒另起一步", () => {
        let state = fresh();
        state = setTitle(state, "春", 0);
        state = setTitle(state, "春游", 400);
        state = setTitle(state, "春游记", 1400);
        expect(state.past).toHaveLength(1);
        state = setTitle(state, "春游记!", 2500);
        expect(state.past).toHaveLength(2);
        expect(currentDoc(undo(state)).title).toBe("春游记");
        expect(currentDoc(undo(undo(state))).title).toBe("");
    });

    it("副标题输入同样合并；改成相同的值不算", () => {
        let state = setSubtitle(fresh(), "三", 0);
        state = setSubtitle(state, "三月", 300);
        expect(state.past).toHaveLength(1);
        expect(currentDoc(state).subtitle).toBe("三月");
        expect(setSubtitle(state, "三月", 400)).toBe(state);
    });

    it("其他操作打断合并", () => {
        let state = withPhotos("a");
        state = setTitle(state, "a", 0);
        state = setAspect(state, "9:16");
        state = setTitle(state, "ab", 100);
        expect(state.past).toHaveLength(4);
    });

    it("保存后再改标题，即使在 1 秒内也要另起一步，并且算有更改", () => {
        let state = setTitle(fresh(), "春", 0);
        state = markSaved(state);
        expect(isDirty(state)).toBe(false);
        state = setTitle(state, "春游", 100);
        expect(isDirty(state)).toBe(true);
        expect(isDirty(undo(state))).toBe(false);
    });

    it("相同的标题不产生历史", () => {
        const state = setTitle(fresh(), "x", 0);
        expect(setTitle(state, "x", 10)).toBe(state);
    });
});

describe("编辑状态：撤销和重做", () => {
    it("撤销、重做回到对应内容；栈空时原样返回", () => {
        const state = withPhotos("a");
        expect(undo(fresh())).toEqual(fresh());
        const undone = undo(state);
        expect(names(undone)).toEqual([]);
        expect(canRedo(undone)).toBe(true);
        expect(names(redo(undone))).toEqual(["a"]);
        const end = redo(undone);
        expect(redo(end)).toBe(end);
    });

    it("执行新操作清空重做栈", () => {
        let state = withPhotos("a", "b");
        state = undo(state);
        expect(canRedo(state)).toBe(true);
        state = setAspect(state, "9:16");
        expect(canRedo(state)).toBe(false);
    });

    it("撤销栈最多 50 步，超出时丢弃最旧的步", () => {
        let state = fresh();
        for (let i = 1; i <= MAX_HISTORY + 10; i++) {
            state = setSeed(state, 1000 + i);
        }
        expect(state.past).toHaveLength(MAX_HISTORY);
        let steps = 0;
        while (canUndo(state)) {
            state = undo(state);
            steps++;
        }
        expect(steps).toBe(MAX_HISTORY);
        expect(currentDoc(state).seed).toBe(1010);
    });

    it("被删除的素材仍被撤销栈引用；挤出撤销栈后才不再被引用", () => {
        let state = withPhotos("a");
        const {key, blob} = currentDoc(state).media[0]!;
        state = removeMedia(state, key);
        expect(referencedBlobs(state).has(blob)).toBe(true);
        for (let i = 1; i <= MAX_HISTORY; i++) {
            state = setSeed(state, 2000 + i);
        }
        expect(referencedBlobs(state).has(blob)).toBe(false);
    });

    it("新建时默认选中第一首内置配乐，预览和保存都会播放它", () => {
        expect(currentDoc(fresh()).music).toEqual({kind: "builtin", trackId: DEFAULT_BUILTIN_TRACK_ID});
    });

    it("转码开关不在历史里（状态里没有它）", () => {
        expect(Object.keys(currentDoc(fresh())).sort()).toEqual(["aspect", "length", "look", "media", "music", "pages", "seed", "showTitle", "subtitle", "templateId", "title", "transition"]);
    });
});

describe("编辑状态：有未保存的更改", () => {
    it("新状态没有更改；改动后有；撤销回到保存点后变回没有", () => {
        let state = fresh();
        expect(isDirty(state)).toBe(false);
        state = addMedia(state, [photo("a")]).state;
        expect(isDirty(state)).toBe(true);
        state = markSaved(state);
        expect(isDirty(state)).toBe(false);
        state = setAspect(state, "9:16");
        expect(isDirty(state)).toBe(true);
        state = undo(state);
        expect(isDirty(state)).toBe(false);
        state = undo(state);
        expect(isDirty(state)).toBe(true);
        state = redo(state);
        expect(isDirty(state)).toBe(false);
    });

    it("保存点被新操作覆盖后，回不到保存点", () => {
        let state = markSaved(withPhotos("a"));
        state = undo(state);
        state = setAspect(state, "9:16");
        state = undo(state);
        expect(isDirty(state)).toBe(true);
    });

    it("保存点被挤出撤销栈后一直算有更改", () => {
        let state = markSaved(withPhotos("a"));
        for (let i = 1; i <= MAX_HISTORY + 1; i++) {
            state = setSeed(state, 3000 + i);
        }
        while (canUndo(state)) {
            state = undo(state);
        }
        expect(isDirty(state)).toBe(true);
    });
});

describe("编辑状态：新建和打开", () => {
    it("新建得到与初始状态完全相同的结果，包括清空历史", () => {
        let state = withPhotos("a", "b");
        state = setTitle(setTemplate(state, "classic"), "x", 0);
        state = undo(state);
        expect(resetEditor(state, 7)).toEqual(createEditor(7, "clean"));
        expect(isDirty(resetEditor(state, 7))).toBe(false);
    });

    it("打开：整体替换内容、分配编号、清空历史、不算有更改", () => {
        const dirty = withPhotos("old");
        const state = loadEditor(dirty, {
            media: [photo("照片 1"), photo("照片 2")],
            title: "T",
            subtitle: "",
            showTitle: true,
            length: "long",
            aspect: "9:16",
            templateId: "classic",
            transition: "auto",
            look: "original",
            music: {kind: "none"},
            seed: 5,
            pages: null,
        });
        expect(names(state)).toEqual(["照片 1", "照片 2"]);
        expect(currentDoc(state).media.map((m) => m.key)).toEqual([1, 2]);
        expect(canUndo(state) || canRedo(state)).toBe(false);
        expect(isDirty(state)).toBe(false);
        expect(addMedia(state, [photo("c")]).state.present.doc.media[2]!.key).toBe(3);
    });
});
