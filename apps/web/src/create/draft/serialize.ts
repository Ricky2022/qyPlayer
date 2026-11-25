// 编辑内容与草稿记录互转（docs/dev-0.6.0.md 3.2）。纯函数，不碰 IndexedDB。
// 素材的 blobKey 用编辑状态里的 key：一次编辑过程中 key 不变，所以没改过的文件不会重复写入。
import type {MusicEntry} from "../buildPackage";
import type {EditorPage} from "../editor/pages";
import type {EditorContent, EditorDoc, EditorMedia, MusicChoice} from "../editor/state";

export interface DraftMedia extends Omit<EditorMedia, "blob" | "key"> {
    blobKey: string;
}

export type DraftMusic =
    | {
        kind: "none";
    }
    | {
        kind: "builtin";
        trackId: string;
    }
    | {
        kind: "custom";
        blobKey: string;
        entry: Omit<MusicEntry, "blob">;
    };

/** 去掉全部 Blob 后的编辑内容。pages 里的素材 key 改成“在列表里的位置 + 1”，与打开包时的编号一致 */
export interface DraftDoc {
    media: DraftMedia[];
    title: string;
    subtitle: string;
    showTitle: boolean;
    aspect: EditorDoc["aspect"];
    templateId: string;
    transition: EditorDoc["transition"];
    look: EditorDoc["look"];
    length: EditorDoc["length"];
    music: DraftMusic;
    musicVolume: number;
    videoVolume: number;
    duckMusic: boolean;
    seed: number;
    pages: EditorPage[] | null;
}

export interface DraftFile {
    blobKey: string;
    blob: Blob;
}

export interface SerializedDraft {
    doc: DraftDoc;
    files: DraftFile[];
}

/** 同一首导入的曲子在这次会话里始终用同一个 blobKey */
const musicKeys = new WeakMap<Blob, string>();
let nextMusicKey = 1;

const musicBlobKey = function musicBlobKey(blob: Blob): string {
    const existing = musicKeys.get(blob);
    if (existing !== undefined) {
        return existing;
    }
    const key = `music-${nextMusicKey}`;
    nextMusicKey += 1;
    musicKeys.set(blob, key);
    return key;
};

const mediaBlobKey = (key: number): string => `m${key}`;

/** 编辑内容 → 草稿。文件按 blobKey 去重（同一首曲子只记一次） */
export const serializeDraft = function serializeDraft(doc: EditorDoc): SerializedDraft {
    const position = new Map(doc.media.map((item, index) => [item.key, index + 1]));
    const files: DraftFile[] = [];
    const media = doc.media.map((item) => {
        const {blob, key, ...rest} = item;
        const blobKey = mediaBlobKey(key);
        files.push({blobKey, blob});
        return {...rest, blobKey};
    });
    let music: DraftMusic;
    if (doc.music.kind === "custom") {
        const {blob, ...entry} = doc.music.entry;
        const blobKey = musicBlobKey(blob);
        files.push({blobKey, blob});
        music = {kind: "custom", blobKey, entry};
    } else {
        music = doc.music;
    }
    const pages = doc.pages === null
        ? null
        : doc.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => ({...item, key: position.get(item.key) ?? item.key})),
        }));
    return {
        doc: {
            media,
            music,
            pages,
            title: doc.title,
            subtitle: doc.subtitle,
            showTitle: doc.showTitle,
            aspect: doc.aspect,
            templateId: doc.templateId,
            transition: doc.transition,
            look: doc.look,
            length: doc.length,
            musicVolume: doc.musicVolume,
            videoVolume: doc.videoVolume,
            duckMusic: doc.duckMusic,
            seed: doc.seed,
        },
        files,
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** 读出来的 meta.doc 外形是否像草稿。不像就当损坏 */
export const isDraftDoc = function isDraftDoc(value: unknown): value is DraftDoc {
    if (!isRecord(value) || !Array.isArray(value.media) || !isRecord(value.music) || typeof value.music.kind !== "string") {
        return false;
    }
    if (typeof value.title !== "string" || typeof value.seed !== "number" || (value.pages !== null && !Array.isArray(value.pages))) {
        return false;
    }
    if (value.music.kind === "custom" && typeof value.music.blobKey !== "string") {
        return false;
    }
    return value.media.every((item) => isRecord(item) && typeof item.blobKey === "string");
};

/** 草稿 + 读到的文件 → 编辑内容。缺文件返回 null */
export const draftToContent = function draftToContent(doc: DraftDoc, blobs: ReadonlyMap<string, Blob>): EditorContent | null {
    const media = [];
    for (const item of doc.media) {
        const blob = blobs.get(item.blobKey);
        if (!blob) {
            return null;
        }
        const {blobKey: _blobKey, ...rest} = item;
        media.push({...rest, blob});
    }
    let music: MusicChoice;
    if (doc.music.kind === "custom") {
        const blob = blobs.get(doc.music.blobKey);
        if (!blob) {
            return null;
        }
        music = {kind: "custom", entry: {...doc.music.entry, blob}};
    } else {
        music = doc.music;
    }
    return {
        media,
        music,
        title: doc.title,
        subtitle: doc.subtitle,
        showTitle: doc.showTitle,
        aspect: doc.aspect,
        templateId: doc.templateId,
        transition: doc.transition,
        look: doc.look,
        length: doc.length,
        musicVolume: doc.musicVolume,
        videoVolume: doc.videoVolume,
        duckMusic: doc.duckMusic,
        seed: doc.seed,
        pages: doc.pages,
    };
};

/** 这份草稿用到的全部 blobKey */
export const blobKeysOf = function blobKeysOf(doc: DraftDoc): string[] {
    const keys = doc.media.map((item) => item.blobKey);
    if (doc.music.kind === "custom") {
        keys.push(doc.music.blobKey);
    }
    return keys;
};
