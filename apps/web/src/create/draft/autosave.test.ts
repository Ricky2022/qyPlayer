import {describe, expect, it} from "vitest";
import {addMedia, createEditor, currentDoc, editPages, removeMedia, setMusic, setTitle, type EditorMediaInput, type EditorState} from "../editor/state";
import {updatePage} from "../editor/pages";
import {clearDraft, readDraft, writeDraft} from "./autosave";
import type {DraftDoc} from "./serialize";
import {memoryDraftStore, type DraftStore} from "./store";

const photo = (name: string): EditorMediaInput => ({
    fileName: name,
    type: "image",
    blob: new Blob([name]),
    width: 100,
    height: 80,
    mimeType: "image/jpeg",
    source: {mimeType: "image/jpeg", transcoded: false},
    final: false,
});

const fresh = (): EditorState => createEditor(3, "clean");

/** 记下调用顺序，用来核对“先写文件，再写 meta，最后删不再引用的文件” */
const recording = function recording(store: DraftStore): {
    store: DraftStore;
    calls: string[];
} {
    const calls: string[] = [];
    return {
        calls,
        store: {
            readMeta: async () => store.readMeta(),
            writeMeta: async (meta) => {
                calls.push("meta");
                await store.writeMeta(meta);
            },
            readBlob: async (key) => store.readBlob(key),
            writeBlob: async (key, blob) => {
                calls.push(`blob ${key}`);
                await store.writeBlob(key, blob);
            },
            deleteBlob: async (key) => {
                calls.push(`delete ${key}`);
                await store.deleteBlob(key);
            },
            blobKeys: async () => store.blobKeys(),
            clear: async () => store.clear(),
        },
    };
};

describe("草稿", () => {
    it("写完再读，素材、标题和单页修改都回来，页里的素材按位置重新编号", async () => {
        let state = addMedia(fresh(), [photo("a"), photo("b")]).state;
        state = setTitle(state, "春游", 0);
        state = removeMedia(state, currentDoc(state).media[0]!.key);
        state = editPages(state, (pages) => updatePage(pages, 0, {duration: 6}));
        const store = memoryDraftStore();
        await writeDraft(store, currentDoc(state), 1_700_000_000_000);
        const loaded = await readDraft(store);
        expect(loaded?.count).toBe(1);
        expect(loaded?.content.title).toBe("春游");
        expect(loaded?.content.media.map((item) => item.fileName)).toEqual(["b"]);
        expect(await loaded?.content.media[0]!.blob.text()).toBe("b");
        expect(loaded?.content.pages?.[0]?.items[0]?.key).toBe(1);
        expect(loaded?.content.pages?.[0]?.duration).toBe(6);
        expect(loaded?.content).toMatchObject({musicVolume: 1, videoVolume: 1, duckMusic: true});
    });

    it("先写还没有的文件，再写 meta；第二次不重复写，删掉的素材的文件被删掉", async () => {
        const recorded = recording(memoryDraftStore());
        const state = addMedia(fresh(), [photo("a"), photo("b")]).state;
        const doc = currentDoc(state);
        await writeDraft(recorded.store, doc, 1);
        expect(recorded.calls).toEqual([`blob m${doc.media[0]!.key}`, `blob m${doc.media[1]!.key}`, "meta"]);
        recorded.calls.length = 0;
        const removed = currentDoc(removeMedia(state, doc.media[0]!.key));
        await writeDraft(recorded.store, removed, 2);
        expect(recorded.calls).toEqual(["meta", `delete m${doc.media[0]!.key}`]);
        expect(await recorded.store.blobKeys()).toEqual([`m${doc.media[1]!.key}`]);
    });

    it("导入的曲子换了文件就另存一份，同一份文件不重复写", async () => {
        const recorded = recording(memoryDraftStore());
        const first = new Blob(["one"]);
        const entry = {blob: first, mimeType: "audio/mpeg", duration: 10};
        let state = setMusic(addMedia(fresh(), [photo("a")]).state, {kind: "custom", entry});
        await writeDraft(recorded.store, currentDoc(state), 1);
        recorded.calls.length = 0;
        await writeDraft(recorded.store, currentDoc(state), 2);
        expect(recorded.calls).toEqual(["meta"]);
        const second = new Blob(["two"]);
        state = setMusic(state, {kind: "custom", entry: {...entry, blob: second}});
        recorded.calls.length = 0;
        await writeDraft(recorded.store, currentDoc(state), 3);
        expect(recorded.calls.some((call) => call.startsWith("blob music-"))).toBe(true);
        expect(recorded.calls.some((call) => call.startsWith("delete music-"))).toBe(true);
        const loaded = await readDraft(recorded.store);
        expect(loaded?.content.music.kind).toBe("custom");
        if (loaded?.content.music.kind === "custom") {
            expect(await loaded.content.music.entry.blob.text()).toBe("two");
        }
    });

    it("文件缺失或版本不认识时删掉草稿，不恢复", async () => {
        const store = memoryDraftStore();
        await writeDraft(store, currentDoc(addMedia(fresh(), [photo("a")]).state), 1);
        const meta = await store.readMeta();
        await store.deleteBlob(meta!.doc.media[0]!.blobKey);
        expect(await readDraft(store)).toBeNull();
        expect(await store.readMeta()).toBeNull();

        const broken = {media: [], music: {kind: "none"}};
        await store.writeMeta({version: 1, savedAt: 1, doc: broken as unknown as DraftDoc});
        expect(await readDraft(store)).toBeNull();
        expect(await store.readMeta()).toBeNull();
    });

    it("清除后读不到", async () => {
        const store = memoryDraftStore();
        await writeDraft(store, currentDoc(addMedia(fresh(), [photo("a")]).state), 1);
        await clearDraft(store);
        expect(await readDraft(store)).toBeNull();
        expect(await store.blobKeys()).toEqual([]);
    });
});
