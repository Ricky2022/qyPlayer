// 把草稿自动保存接到界面上（docs/dev-0.6.0.md 3.1）：停止操作 2 秒后写入，抢到锁的页面才读写。
import {useEffect, useRef, useState} from "react";
import type {EditorContent, EditorDoc} from "../editor/state";
import {clearDraft, readDraft, writeDraft, type LoadedDraft} from "./autosave";
import {indexedDbDraftStore, type DraftStore} from "./store";

const LOCK = "qymaker-draft";
/** 停止操作后等多久写入 */
export const DRAFT_SAVE_DELAY_MS = 2000;

const isQuota = (error: unknown): boolean => error instanceof DOMException && error.name === "QuotaExceededError";

/** 整个页面共用一个库。不要在每次渲染时新建，否则保存效果会反复重新订阅 */
const browserStore = indexedDbDraftStore();

export interface DraftAutosave {
    /** 启动时发现的草稿；用户选择之前一直在 */
    offer: LoadedDraft | null;
    /** 恢复：调用方把 content 装进编辑器 */
    accept: () => void;
    /** 丢弃草稿 */
    discard: () => void;
}

/**
 * enabled 为假（手机）时什么都不做。
 * 两个制作器同时开时，只有抢到 qymaker-draft 这把锁的页面读写草稿。浏览器没有 locks 时视为抢到。
 */
export const useDraftAutosave = function useDraftAutosave(
    doc: EditorDoc,
    dirty: boolean,
    enabled: boolean,
    options: {
        store?: DraftStore;
        onQuota?: () => void;
    } = {},
): DraftAutosave {
    const store = options.store ?? browserStore;
    const [locked, setLocked] = useState(false);
    const [armed, setArmed] = useState(false);
    const [offer, setOffer] = useState<LoadedDraft | null>(null);
    const [stopped, setStopped] = useState(false);
    const docRef = useRef(doc);
    docRef.current = doc;
    const onQuotaRef = useRef(options.onQuota);
    onQuotaRef.current = options.onQuota;
    const writing = useRef(false);
    const again = useRef(false);

    useEffect(() => {
        if (!enabled || typeof indexedDB === "undefined") {
            return;
        }
        let stoppedEffect = false;
        let release = (): void => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        if (!("locks" in navigator)) {
            setLocked(true);
            return () => {
                stoppedEffect = true;
            };
        }
        void navigator.locks.request(LOCK, {ifAvailable: true}, async (lock) => {
            if (!lock || stoppedEffect) {
                return;
            }
            setLocked(true);
            await held;
        });
        return () => {
            stoppedEffect = true;
            release();
        };
    }, [enabled]);

    useEffect(() => {
        if (!locked) {
            return;
        }
        let cancel = false;
        void readDraft(store).then((found) => {
            if (cancel) {
                return;
            }
            if (found) {
                setOffer(found);
            } else {
                setArmed(true);
            }
        });
        return () => {
            cancel = true;
        };
    }, [locked, store]);

    useEffect(() => {
        if (!armed || stopped) {
            return;
        }
        if (!dirty) {
            void clearDraft(store);
            return;
        }
        const save = async (): Promise<void> => {
            if (writing.current) {
                again.current = true;
                return;
            }
            writing.current = true;
            try {
                do {
                    again.current = false;
                    await writeDraft(store, docRef.current, Date.now());
                } while (again.current);
            } catch (error) {
                if (!isQuota(error)) {
                    return;
                }
                await clearDraft(store).catch(() => undefined);
                setStopped(true);
                onQuotaRef.current?.();
            } finally {
                writing.current = false;
            }
        };
        const timer = setTimeout(() => {
            save().catch(() => undefined);
        }, DRAFT_SAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [armed, dirty, doc, stopped, store]);

    return {
        offer,
        accept: () => {
            setOffer(null);
            setArmed(true);
        },
        discard: () => {
            setOffer(null);
            setArmed(true);
            void clearDraft(store);
        },
    };
};
