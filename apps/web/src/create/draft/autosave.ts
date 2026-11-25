// 草稿的写入、读取和清除（docs/dev-0.6.0.md 3.1）。不含界面。
import type {EditorContent, EditorDoc} from "../editor/state";
import {blobKeysOf, draftToContent, isDraftDoc, serializeDraft} from "./serialize";
import type {DraftMeta, DraftStore} from "./store";

export interface LoadedDraft {
    content: EditorContent;
    savedAt: number;
    /** 素材个数，给恢复提示用 */
    count: number;
}

/**
 * 先写仓库里还没有的文件，再写 meta，最后删掉这份草稿不再引用的文件。
 * 中途失败时，旧的 meta 和它引用的文件都还在。
 */
export const writeDraft = async function writeDraft(store: DraftStore, doc: EditorDoc, savedAt: number): Promise<void> {
    const {doc: record, files} = serializeDraft(doc);
    const present = new Set(await store.blobKeys());
    for (const file of files) {
        if (!present.has(file.blobKey)) {
            await store.writeBlob(file.blobKey, file.blob);
        }
    }
    const meta: DraftMeta = {version: 1, savedAt, doc: record};
    await store.writeMeta(meta);
    const wanted = new Set(blobKeysOf(record));
    for (const key of present) {
        if (!wanted.has(key)) {
            await store.deleteBlob(key);
        }
    }
};

/** 读草稿。没有草稿返回 null；版本不认识或文件缺失时删掉并返回 null */
export const readDraft = async function readDraft(store: DraftStore): Promise<LoadedDraft | null> {
    const meta = await store.readMeta();
    if (!meta) {
        return null;
    }
    if (meta.version !== 1 || !isDraftDoc(meta.doc)) {
        await store.clear();
        return null;
    }
    const blobs = new Map<string, Blob>();
    for (const key of blobKeysOf(meta.doc)) {
        const blob = await store.readBlob(key);
        if (!blob) {
            await store.clear();
            return null;
        }
        blobs.set(key, blob);
    }
    const content = draftToContent(meta.doc, blobs);
    if (!content) {
        await store.clear();
        return null;
    }
    return {content, savedAt: meta.savedAt, count: content.media.length};
};

export const clearDraft = async function clearDraft(store: DraftStore): Promise<void> {
    await store.clear();
};
