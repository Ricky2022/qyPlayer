// 草稿的存储（docs/dev-0.6.0.md 3.2）：一条 meta 加按 blobKey 存放的文件。
import {isDraftDoc, type DraftDoc} from "./serialize";

export interface DraftMeta {
    version: 1;
    savedAt: number;
    doc: DraftDoc;
}

export interface DraftStore {
    readMeta: () => Promise<DraftMeta | null>;
    writeMeta: (meta: DraftMeta) => Promise<void>;
    readBlob: (key: string) => Promise<Blob | null>;
    writeBlob: (key: string, blob: Blob) => Promise<void>;
    deleteBlob: (key: string) => Promise<void>;
    blobKeys: () => Promise<string[]>;
    clear: () => Promise<void>;
}

const isMeta = function isMeta(value: unknown): value is DraftMeta {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const meta = value as {version?: unknown; savedAt?: unknown; doc?: unknown};
    return meta.version === 1 && typeof meta.savedAt === "number" && isDraftDoc(meta.doc);
};

const isBlob = (value: unknown): value is Blob => value instanceof Blob;

/** 内存实现，测试用 */
export const memoryDraftStore = function memoryDraftStore(): DraftStore {
    let meta: DraftMeta | null = null;
    const blobs = new Map<string, Blob>();
    return {
        readMeta: async () => {
            await Promise.resolve();
            return meta;
        },
        writeMeta: async (next) => {
            meta = next;
            await Promise.resolve();
        },
        readBlob: async (key) => {
            await Promise.resolve();
            return blobs.get(key) ?? null;
        },
        writeBlob: async (key, blob) => {
            blobs.set(key, blob);
            await Promise.resolve();
        },
        deleteBlob: async (key) => {
            blobs.delete(key);
            await Promise.resolve();
        },
        blobKeys: async () => {
            await Promise.resolve();
            return [...blobs.keys()];
        },
        clear: async () => {
            meta = null;
            blobs.clear();
            await Promise.resolve();
        },
    };
};

const DATABASE = "qymaker-draft";
const META = "meta";
const BLOBS = "blobs";
const CURRENT = "current";

const failed = (error: DOMException | null): Error => error ?? new Error("indexedDB request failed");

/** get() 的结果在类型上是 any，先收成 unknown 再判断 */
const readUnknown = async function readUnknown(request: IDBRequest): Promise<unknown> {
    const typed = request as IDBRequest<unknown>;
    return await new Promise((resolve, reject) => {
        typed.onsuccess = () => resolve(typed.result);
        typed.onerror = () => reject(failed(typed.error));
    });
};

const ask = async function ask<T>(request: IDBRequest<T>): Promise<T> {
    return await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(failed(request.error));
    });
};

let database: Promise<IDBDatabase> | null = null;

const openDatabase = async function openDatabase(): Promise<IDBDatabase> {
    database ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(META)) {
                db.createObjectStore(META);
            }
            if (!db.objectStoreNames.contains(BLOBS)) {
                db.createObjectStore(BLOBS);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(failed(request.error));
    });
    return await database;
};

const transaction = async function transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
    const db = await openDatabase();
    const tx = db.transaction(stores, mode);
    const result = await run(tx);
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(failed(tx.error));
        tx.onabort = () => reject(failed(tx.error));
    });
    return result;
};

/** 浏览器 IndexedDB 实现。数据库 qymaker-draft，版本 1 */
export const indexedDbDraftStore = function indexedDbDraftStore(): DraftStore {
    return {
        async readMeta() {
            return transaction([META], "readonly", async (tx) => {
                const value = await readUnknown(tx.objectStore(META).get(CURRENT));
                return isMeta(value) ? value : null;
            });
        },
        async writeMeta(meta) {
            await transaction([META], "readwrite", async (tx) => {
                await ask(tx.objectStore(META).put(meta, CURRENT));
            });
        },
        async readBlob(key) {
            return transaction([BLOBS], "readonly", async (tx) => {
                const value = await readUnknown(tx.objectStore(BLOBS).get(key));
                return isBlob(value) ? value : null;
            });
        },
        async writeBlob(key, blob) {
            await transaction([BLOBS], "readwrite", async (tx) => {
                await ask(tx.objectStore(BLOBS).put(blob, key));
            });
        },
        async deleteBlob(key) {
            await transaction([BLOBS], "readwrite", async (tx) => {
                await ask(tx.objectStore(BLOBS).delete(key));
            });
        },
        async blobKeys() {
            return transaction([BLOBS], "readonly", async (tx) => {
                const keys = await ask(tx.objectStore(BLOBS).getAllKeys());
                return keys.flatMap((key) => typeof key === "string" ? [key] : []);
            });
        },
        async clear() {
            await transaction([META, BLOBS], "readwrite", async (tx) => {
                await ask(tx.objectStore(META).clear());
                await ask(tx.objectStore(BLOBS).clear());
            });
        },
    };
};
