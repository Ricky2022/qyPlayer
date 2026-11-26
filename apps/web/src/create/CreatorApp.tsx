import {useEffect, useMemo, useRef, useState, type DragEvent} from "react";
import {createUseStyles} from "react-jss";
import {GENERATOR_LIMITS, TEMPLATES, cellAspect, defaultAspectRatio, layoutFrames} from "@qyplayer/core";
import {PACKAGE_LIMITS, openPackage, writePackage} from "@qyplayer/qyp";
import {AboutDialog} from "../AboutDialog";
import {isDesktop, saveBlob} from "../desktop";
import {LANG_NAMES, otherLang, useI18n, type MessageKey} from "../i18n";
import {describeError} from "../messages";
import {LanguageSwitch} from "../ui/LanguageSwitch";
import {Logo} from "../ui/Logo";
import {InfoIcon} from "../ui/icons";
import {theme} from "../ui/theme";
import {useMatchMedia} from "../ui/useMatchMedia";
import {AssetPanel, type ImportFailure} from "./AssetPanel";
import {planPackageWithTitle, type MusicEntry} from "./buildPackage";
import {describeBuildError, describeFileError} from "./describe";
import {addCover} from "./cover";
import {useDraftAutosave} from "./draft/useDraftAutosave";
import {ConfirmDialog, MessageDialog, ProgressDialog} from "./Dialogs";
import {MOBILE_MAX_BYTES, exceedsMobileLimit, mobileSizeLevel} from "./environment";
import {classifyDrop} from "./editor/drop";
import {editorMediaFromImport} from "./editor/fromImport";
import type {PlaybackController} from "../player/PlaybackController";
import {syncDefaultTitle} from "./editor/defaultTitle";
import {DESKTOP_MEDIA_QUERY} from "./editor/layout";
import {menuStatus} from "./editor/menu";
import {needsMusicRightsConfirm, resolveMusic} from "./editor/music";
import {buildOptionsOf, createPreviewPackage} from "./editor/preview";
import {RestoreError, restorePackage} from "./editor/restore";
import {applyPageAction, type PageAction} from "./editor/pageActions";
import {autoPages, type PageContext} from "./editor/pages";
import {commandForShortcut, shortcutLabel} from "./editor/shortcuts";
import {
    addMedia,
    canRedo,
    canUndo,
    createEditor,
    currentDoc,
    isDirty,
    loadDraft,
    loadEditor,
    markSaved,
    moveMedia,
    redo,
    removeMedia,
    resetEditor,
    resetPages,
    setAspect,
    selectedMedia,
    setLength,
    setDuckMusic,
    setLook,
    setMusic,
    setMusicVolume,
    setSeed,
    setShowTitle,
    setSubtitle,
    setTemplate,
    setTitle,
    setTransition,
    setVideoVolume,
    sortMediaByCapturedAt,
    undo,
    type EditorMediaInput,
    type EditorState,
} from "./editor/state";
import {browserExportCheckEnv, findUndecodable} from "./export/plan";
import {exportMp4, type ExportProgress} from "./export/run";
import {LONG_EXPORT_SECONDS} from "./export/spec";
import {formatDuration, safeFileName, sortByCapturedAt} from "./files";
import {ImportError, importMedia, importMusic} from "./importers";
import {MenuBar, type BarCommand, type MenuGroup} from "./MenuBar";
import {FramingDialog} from "./FramingDialog";
import {PagePanel} from "./PagePanel";
import {EmptyState, PreviewPane} from "./PreviewPane";
import {RightPanel, type PanelMode} from "./RightPanel";
import {SettingsPanel} from "./SettingsPanel";
import {StoryStrip, type StripPage} from "./StoryStrip";
import {TranscodeCache} from "./transcode/cache";
import {isAbortError, transcodeForSave, type TranscodeProgress} from "./transcode/run";
import {browserWorkers} from "./transcode/workers";
import {useObjectUrls} from "./useObjectUrls";
import {usePreview} from "./usePreview";
import {useTranscode} from "./useTranscode";

const useStyles = createUseStyles({
    "@global": {
        "html, body, #root": {margin: 0, height: "100%"},
        body: {background: theme.bg, color: theme.text, fontFamily: theme.font, colorScheme: "dark", overflow: "hidden"},
    },
    root: {display: "flex", flexDirection: "column", height: "100vh", "@supports (height: 100dvh)": {height: "100dvh"}, position: "relative"},
    top: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 48,
        flex: "none",
        padding: "0 12px",
        boxSizing: "border-box",
        borderBottom: `1px solid ${theme.border}`,
        background: theme.surface,
        position: "relative",
        zIndex: 5,
    },
    spacer: {flex: 1},
    tabTitle: {flex: 1, textAlign: "center", fontSize: 15, fontWeight: 600},
    link: {color: theme.accent, fontSize: 14, textDecoration: "none", "&:hover": {textDecoration: "underline"}},
    tool: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 34,
        padding: "4px 12px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: "transparent",
        color: theme.text,
        font: "inherit",
        fontSize: 14,
        cursor: "pointer",
        "&:hover": {background: theme.surfaceHover},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    saveButton: {
        display: "inline-flex",
        alignItems: "center",
        flex: "none",
        minHeight: 34,
        padding: "4px 14px",
        border: `1px solid ${theme.accent}`,
        borderRadius: 999,
        background: theme.accent,
        color: theme.onAccent,
        font: "inherit",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        "&:hover:not(:disabled)": {background: "#67d0fb"},
        "&:disabled": {opacity: 0.45, cursor: "default"},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`, outlineOffset: 2},
    },
    notice: {display: "flex", alignItems: "center", gap: 10, flex: "none", padding: "6px 14px", fontSize: 13, background: "rgba(56, 189, 248, 0.15)", color: theme.text},
    noticeClose: {padding: "2px 10px", border: `1px solid ${theme.border}`, borderRadius: 999, background: "transparent", color: theme.text, font: "inherit", fontSize: 12, cursor: "pointer"},
    desktopMain: {flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "300px minmax(0, 1fr) 340px"},
    cell: {minWidth: 0, minHeight: 0, overflow: "hidden"},
    cellSide: {borderRight: `1px solid ${theme.border}`, background: theme.bg},
    cellRight: {borderLeft: `1px solid ${theme.border}`, background: theme.bg},
    mobileMain: {flex: 1, minHeight: 0, overflow: "hidden"},
    tabs: {display: "flex", flex: "none", position: "relative", zIndex: 5, borderTop: `1px solid ${theme.border}`, background: theme.surface},
    tab: {
        flex: 1,
        minHeight: 56,
        minWidth: 44,
        border: "none",
        background: "transparent",
        color: theme.muted,
        font: "inherit",
        fontSize: 15,
        cursor: "pointer",
        "&[aria-selected=true]": {color: theme.accent, boxShadow: `inset 0 -3px 0 ${theme.accent}`},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`, outlineOffset: -2},
    },
    dropOverlay: {
        position: "absolute",
        inset: 0,
        zIndex: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background: "rgba(7, 11, 18, 0.7)",
        border: `3px dashed ${theme.accent}`,
        fontSize: 22,
        fontWeight: 600,
        boxSizing: "border-box",
    },
    hiddenLive: {position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0},
});

type Tab = "media" | "preview" | "settings";

const TAB_LABELS: Record<Tab, MessageKey> = {media: "tabMedia", preview: "tabPreview", settings: "tabSettings"};

interface Confirmation {
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
}

/** 预览跳到某页：第一页从头是黑的（淡入），改为停在它基本出现的时刻 */
const seekToPage = function seekToPage(controller: PlaybackController, index: number): void {
    if (index === 0) {
        controller.seek(Math.min(1.2, controller.duration / 2));
    } else {
        controller.seekToPage(index);
    }
};

const randomSeed = (): number => Math.floor(Math.random() * (2 ** 31));
const createInitialEditor = (): EditorState => createEditor(randomSeed(), TEMPLATES[0]!.id);

const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.platform);

/** 焦点是否在文本输入框里（文本框自己处理撤销和重做） */
const inTextField = function inTextField(target: EventTarget | null): boolean {
    if (target instanceof HTMLTextAreaElement) {
        return true;
    }
    if (!(target instanceof HTMLInputElement)) {
        return false;
    }
    return !["radio", "checkbox", "button", "file", "range", "submit", "reset", "image", "color"].includes(target.type);
};

/** 制作器：新建或打开 → 添加和调整（预览自动更新）→ 保存。所有处理都在本机完成。 */
export const CreatorApp = function CreatorApp() {
    const classes = useStyles();
    const {lang, t, setLang} = useI18n();
    const desktopLayout = useMatchMedia(DESKTOP_MEDIA_QUERY);

    const [editor, setEditor] = useState<EditorState>(createInitialEditor);
    const editorRef = useRef(editor);
    editorRef.current = editor;
    const doc = currentDoc(editor);
    const urlFor = useObjectUrls(editor);
    const transcodeSetting = useTranscode();
    const transcodeRef = useRef(transcodeSetting.transcode);
    transcodeRef.current = transcodeSetting.transcode;

    const [failures, setFailures] = useState<ImportFailure[]>([]);
    const [importing, setImporting] = useState<{
        done: number;
        total: number;
    } | null>(null);
    const [working, setWorking] = useState<"saving" | "opening" | "exporting" | null>(null);
    const [customMusic, setCustomMusic] = useState<MusicEntry | null>(null);
    const [layoutMayDiffer, setLayoutMayDiffer] = useState(false);
    const [tab, setTab] = useState<Tab>("media");
    const [selectedPage, setSelectedPage] = useState<number | null>(null);
    const [panelMode, setPanelMode] = useState<PanelMode>("film");
    /** 正在取景的照片：第 index 页的第 item 张 */
    const [framing, setFraming] = useState<{
        index: number;
        item: number;
    } | null>(null);
    const selectedPageRef = useRef(selectedPage);
    selectedPageRef.current = selectedPage;
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const [progress, setProgress] = useState<TranscodeProgress | null>(null);
    const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
    const saveAbort = useRef<AbortController | null>(null);
    const transcodeCache = useRef(new TranscodeCache());
    const [aboutOpen, setAboutOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const [dragging, setDragging] = useState(false);
    const [, bumpTitle] = useState(0);

    const mediaInput = useRef<HTMLInputElement>(null);
    const musicInput = useRef<HTMLInputElement>(null);
    const qypInput = useRef<HTMLInputElement>(null);
    const dragDepth = useRef(0);

    const preview = usePreview(doc, t("defaultTitleWord"));
    const busy = importing !== null || working !== null;
    const busyRef = useRef(busy);
    busyRef.current = busy;
    const dirty = isDirty(editor);
    const draft = useDraftAutosave(doc, dirty, !transcodeSetting.mobile, {onQuota: () => setErrorMessage(t("draftQuota"))});
    // eslint-disable-next-line @stylistic/max-len
    const modalOpen = confirmation !== null || errorMessage !== null || savedNote !== null || progress !== null || exportProgress !== null || aboutOpen || framing !== null || draft.offer !== null;

    // 转码开关关闭时丢弃转码缓存（5.5）
    useEffect(() => {
        if (!transcodeSetting.transcode) {
            transcodeCache.current.clear();
        }
    }, [transcodeSetting.transcode]);

    const apply = (change: (state: EditorState) => EditorState): void => setEditor(change);
    const announce = (message: string): void => setAnnouncement(message);

    /**
   * 会重新编排整部影片的操作（换模板、换一版、改时长档、排序、素材列表拖动）：
   * 做过单页修改时先确认，因为这些修改会被清除（可以撤销）。
   */
    const applyFilm = (change: (state: EditorState) => EditorState): void => {
        const current = editorRef.current;
        const next = change(current);
        if (next === current) {
            return;
        }
        if (currentDoc(current).pages !== null && currentDoc(next).pages === null) {
            setConfirmation({message: t("pagesResetMessage"), confirmLabel: t("pagesResetContinue"), onConfirm: () => apply(change)});
        } else {
            apply(change);
        }
    };

    // 标题改了（包括撤销重做）直接更新预览里的标题，不重新生成
    const {applyTitle, applyAudio, result} = preview;
    useEffect(() => {
        if (applyTitle(doc.title, doc.subtitle)) {
            bumpTitle((n) => n + 1);
        }
    }, [applyTitle, doc.title, doc.subtitle, result]);

    // 音量改了（包括撤销重做）直接更新预览的清单，拖滑块时边播边听
    useEffect(() => {
        applyAudio(doc.musicVolume, doc.videoVolume, doc.duckMusic);
    }, [applyAudio, doc.musicVolume, doc.videoVolume, doc.duckMusic, result]);

    // 预览重新生成后停留在选中的页（docs/dev-0.4.1.md 7）
    useEffect(() => {
        const page = selectedPageRef.current;
        if (result && page !== null) {
            seekToPage(result.controller, Math.min(page, result.controller.pageCount - 1));
        }
    }, [result]);

    useEffect(() => {
        if (result) {
            announce(t("previewAnnounce", {pages: result.manifest.pages.length, duration: formatDuration(result.manifest.duration)}));
        }
    // 只在生成出新的预览时播报
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    // 有未保存的更改时，关闭或刷新网页由浏览器确认（桌面制作器关闭窗口暂不提示，见开发说明 3A.12）
    useEffect(() => {
        if (!dirty) {
            return;
        }
        const onBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    const status = menuStatus({
        mediaCount: doc.media.length,
        busy,
        canUndo: canUndo(editor),
        canRedo: canRedo(editor),
        canExport: !transcodeSetting.mobile && transcodeSetting.capabilities.videoEncode && transcodeSetting.capabilities.audioEncode,
        manualPages: doc.pages !== null,
    });

    const guardDirty = (action: () => void): void => {
        if (!isDirty(editorRef.current)) {
            action();
            return;
        }
        setConfirmation({message: t("discardMessage"), confirmLabel: t("discardContinue"), onConfirm: action});
    };

    const addFiles = async (files: File[]): Promise<void> => {
        if (files.length === 0 || busyRef.current) {
            return;
        }
        busyRef.current = true;
        setImporting({done: 0, total: files.length});
        const added: EditorMediaInput[] = [];
        const failed: ImportFailure[] = [];
        let count = currentDoc(editorRef.current).media.length;
        let bytes = currentDoc(editorRef.current).media.reduce((sum, m) => sum + m.blob.size, 0);
        // 手机的总量按原始文件大小累计；第一个让总量超过 600 MB 的文件及其后的文件都被拒绝（5.3）
        let originalBytes = currentDoc(editorRef.current).media.reduce((sum, m) => sum + (m.originalBytes ?? m.blob.size), 0);
        let mobileBlocked = false;
        for (const [index, file] of files.entries()) {
            try {
                if (count >= GENERATOR_LIMITS.maxMedia) {
                    throw new ImportError("too-many");
                }
                if (transcodeSetting.mobile && (mobileBlocked || exceedsMobileLimit(originalBytes, file.size))) {
                    mobileBlocked = true;
                    throw new ImportError("mobile-limit");
                }
                const entry = await importMedia(file, {transcode: transcodeRef.current});
                if (bytes + entry.blob.size > PACKAGE_LIMITS.maxUncompressedBytes) {
                    throw new ImportError("too-large");
                }
                added.push(editorMediaFromImport(entry));
                count++;
                bytes += entry.blob.size;
                originalBytes += file.size;
            } catch (error) {
                failed.push({fileName: file.name, error});
            }
            setImporting({done: index + 1, total: files.length});
        }
        // 只对这一批按拍摄时间排序后接在末尾，已有的手动顺序不动
        const sortedBatch = sortByCapturedAt(added, (m) => m);
        if (sortedBatch.length > 0) {
            apply((state) => syncDefaultTitle(state, addMedia(state, sortedBatch).state, t("defaultTitleWord")));
            announce(t("statusAdded", {count: sortedBatch.length}));
        }
        setFailures((previous) => [...previous, ...failed]);
        setImporting(null);
        // 窄窗口这一批至少加入一个时进入预览；一个都没成功则留在原标签。宽窗口不切标签，右栏仍停在「影片」
        if (sortedBatch.length > 0 && !desktopLayout) {
            setTab("preview");
        }
    };

    const serialName = (type: "image" | "video", index: number): string => t(type === "image" ? "serialPhoto" : "serialVideo", {n: index});

    const openFile = async (file: File): Promise<void> => {
        if (busyRef.current) {
            return;
        }
        busyRef.current = true;
        setWorking("opening");
        announce(t("statusOpening"));
        let opened: Awaited<ReturnType<typeof openPackage>> | undefined;
        try {
            opened = await openPackage(file);
            // eslint-disable-next-line @stylistic/max-len
            const restored = await restorePackage(opened, {serialName, fallbackSeed: randomSeed(), ...transcodeSetting.mobile && {maxTotalBytes: MOBILE_MAX_BYTES}});
            apply((state) => loadEditor(state, restored.content));
            const music = restored.content.music;
            setCustomMusic(music.kind === "custom" ? music.entry : null);
            setLayoutMayDiffer(restored.layoutMayDiffer);
            setFailures([]);
            setNotice(null);
            setSelectedPage(null);
            setPanelMode("film");
            setTab("preview");
            announce(t("statusOpened", {count: restored.content.media.length}));
        } catch (error) {
            setErrorMessage(error instanceof RestoreError ? t("importMobileLimit") : describeError(error, t));
        } finally {
            await opened?.close();
            setWorking(null);
        }
    };

    const save = async (): Promise<void> => {
        const current = currentDoc(editorRef.current);
        if (busyRef.current || current.media.length === 0) {
            return;
        }
        busyRef.current = true;
        setWorking("saving");
        announce(t("statusSaving"));
        const controller = new AbortController();
        saveAbort.current = controller;
        try {
            const music = await resolveMusic(current.music);
            const planned = await planPackageWithTitle(
                {
                    ...buildOptionsOf(current),
                    ...music && {music},
                    defaultTitleWord: t("defaultTitleWord"),
                },
                current.showTitle,
            );
            let {manifest, files} = planned;
            let failedToTranscode: string[] = [];
            if (transcodeRef.current) {
                const outcome = await transcodeForSave({
                    manifest,
                    files,
                    media: selectedMedia(current),
                    ...music && {music},
                    audioEncode: transcodeSetting.capabilities.audioEncode,
                    cache: transcodeCache.current,
                    workers: browserWorkers,
                    signal: controller.signal,
                    onProgress: setProgress,
                });
                ({manifest, files} = outcome);
                failedToTranscode = outcome.failed;
            }
            setProgress(null);
            ({manifest, files} = await addCover(manifest, files));
            const blob = await writePackage(manifest, files);
            const fileName = safeFileName(manifest.title, t("defaultTitleWord"));
            let saved: boolean;
            try {
                saved = await saveBlob(blob, fileName);
            } catch (error) {
                setErrorMessage(t("makerSaveFailed", {detail: error instanceof Error ? error.message : String(error)}));
                return;
            }
            if (saved) {
                apply(markSaved);
                announce(t("statusSaved", {name: fileName}));
                if (failedToTranscode.length > 0) {
                    setSavedNote(t("transcodeFailed", {count: failedToTranscode.length, names: failedToTranscode.join("\n")}));
                }
            }
        } catch (error) {
            if (isAbortError(error)) {
                announce(t("statusSaveCanceled"));
            } else {
                setErrorMessage(describeBuildError(error, t));
            }
        } finally {
            saveAbort.current = null;
            setProgress(null);
            setWorking(null);
        }
    };

    /** 导出 MP4（10）：用当前编辑内容生成与预览相同的影片，检查素材能解码后逐帧渲染和编码 */
    const exportMovie = async (confirmedLong = false): Promise<void> => {
        if (busyRef.current) {
            return;
        }
        busyRef.current = true;
        setWorking("exporting");
        result?.controller.pause();
        const controller = new AbortController();
        saveAbort.current = controller;
        try {
            const current = currentDoc(editorRef.current);
            const music = await resolveMusic(current.music);
            const {opened, manifest} = await createPreviewPackage(current, {...music && {music}, defaultTitleWord: t("defaultTitleWord")});
            if (!confirmedLong && manifest.duration > LONG_EXPORT_SECONDS) {
                setConfirmation({
                    message: t("exportLongMessage", {duration: formatDuration(manifest.duration)}),
                    confirmLabel: t("exportLongContinue"),
                    // eslint-disable-next-line no-void
                    onConfirm: () => void exportMovie(true),
                });
                return;
            }
            announce(t("statusExporting"));
            const undecodable = await findUndecodable(manifest, opened.readBlob, browserExportCheckEnv());
            if (undecodable.length > 0) {
                const nameOf = (id: string): string => {
                    const index = /^m(\d+)$/.exec(id)?.[1];
                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                    return (index !== undefined && selectedMedia(current)[Number(index) - 1]?.fileName) || music?.title || id;
                };
                setErrorMessage(t("exportUndecodable", {names: undecodable.map(nameOf).join("\n")}));
                return;
            }
            setExportProgress({fraction: 0});
            const blob = await exportMp4({manifest, readBlob: opened.readBlob, signal: controller.signal, onProgress: setExportProgress});
            setExportProgress(null);
            const fileName = safeFileName(manifest.title, t("defaultTitleWord"), ".mp4");
            let saved: boolean;
            try {
                saved = await saveBlob(blob, fileName);
            } catch (error) {
                setErrorMessage(t("makerSaveFailed", {detail: error instanceof Error ? error.message : String(error)}));
                return;
            }
            if (saved) {
                announce(t("statusExported", {name: fileName}));
            }
        } catch (error) {
            if (isAbortError(error)) {
                announce(t("statusExportCanceled"));
            } else {
                setErrorMessage(t("exportFailed", {detail: error instanceof Error ? error.message : String(error)}));
            }
        } finally {
            saveAbort.current = null;
            setExportProgress(null);
            setWorking(null);
        }
    };

    const pickMusic = async (file: File): Promise<void> => {
        try {
            const entry = await importMusic(file);
            setCustomMusic(entry);
            apply((state) => setMusic(state, {kind: "custom", entry}));
        } catch (error) {
            setErrorMessage(describeFileError(file.name, error, t));
        }
    };

    const startNew = (): void => {
        apply((state) => resetEditor(state, randomSeed()));
        setCustomMusic(null);
        setLayoutMayDiffer(false);
        setFailures([]);
        setNotice(null);
        setSelectedPage(null);
        setPanelMode("film");
        setTab("media");
        announce(t("statusNew"));
    };

    const run = (command: BarCommand): void => {
        if (command === "language") {
            setLang(otherLang(lang));
            return;
        }
        if (status[command] !== "enabled") {
            return;
        }
        switch (command) {
            case "new":
                guardDirty(startNew);
                break;
            case "open":
                guardDirty(() => qypInput.current?.click());
                break;
            case "save": {
                // 导入的音乐每次保存前都提示确认使用权，内置曲目不提示（5.6）
                if (needsMusicRightsConfirm(currentDoc(editorRef.current).music)) {
                    // eslint-disable-next-line no-void
                    setConfirmation({message: t("musicRightsMessage"), confirmLabel: t("musicRightsContinue"), onConfirm: () => void save()});
                } else {
                    void save();
                }
                break;
            }
            case "exportMp4":
                // 导入的音乐在导出前同样提示确认使用权（5.6）
                if (needsMusicRightsConfirm(currentDoc(editorRef.current).music)) {
                    // eslint-disable-next-line no-void
                    setConfirmation({message: t("musicRightsMessage"), confirmLabel: t("musicRightsContinueExport"), onConfirm: () => void exportMovie()});
                } else {
                    void exportMovie();
                }
                break;
            case "undo":
                apply(undo);
                announce(t("statusUndo"));
                break;
            case "redo":
                apply(redo);
                announce(t("statusRedo"));
                break;
            case "addMedia":
                mediaInput.current?.click();
                break;
            case "sortByTime":
                applyFilm(sortMediaByCapturedAt);
                break;
            case "resetPages":
                setConfirmation({
                    message: t("pagesResetCommandMessage"),
                    confirmLabel: t("pagesResetCommandContinue"),
                    onConfirm: () => {
                        apply(resetPages);
                        announce(t("statusPagesReset"));
                    },
                });
                break;
            case "about":
                setAboutOpen(true);
                break;
        }
    };

    // 全局快捷键：对话框打开时不响应；Ctrl+S 等总是阻止浏览器的默认行为
    const runRef = useRef(run);
    runRef.current = run;
    const statusRef = useRef(status);
    statusRef.current = status;
    const modalRef = useRef(modalOpen);
    modalRef.current = modalOpen;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            const command = commandForShortcut(event, {isMac: isMac(), inTextField: inTextField(event.target)});
            if (!command || statusRef.current[command] === "hidden") {
                return;
            }
            event.preventDefault();
            if (!modalRef.current) {
                runRef.current(command);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const onDropFiles = (event: DragEvent): void => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (busy || modalOpen) {
            return;
        }
        const action = classifyDrop([...event.dataTransfer.files]);
        switch (action.kind) {
            case "open":
                // eslint-disable-next-line no-void
                guardDirty(() => void openFile(action.file));
                break;
            case "add":
                if (action.ignoredQyp) {
                    setNotice(t("noticeIgnoredQyp"));
                }
                void addFiles(action.files);
                break;
            case "multiple-qyp":
                setNotice(t("noticeMultipleQyp"));
                break;
            case "none":
                break;
        }
    };

    const hasFiles = (event: DragEvent): boolean => [...event.dataTransfer.types].includes("Files");

    const menuLabel = (label: MessageKey, command: BarCommand): MenuGroup["entries"][number] => ({
        command,
        label: t(label),
        shortcut: command === "language" ? undefined : shortcutLabel(command, isMac()),
        status: command === "language" ? "enabled" : status[command],
    });
    const groups: MenuGroup[] = [
        {id: "file", label: t("menuFile"), entries: [menuLabel("cmdNew", "new"), menuLabel("cmdOpen", "open"), menuLabel("cmdSave", "save"), menuLabel("cmdExportMp4", "exportMp4")]},
        {id: "edit", label: t("menuEdit"), entries: [menuLabel("cmdUndo", "undo"), menuLabel("cmdRedo", "redo"), menuLabel("cmdAddMedia", "addMedia"), menuLabel("cmdSortByTime", "sortByTime"), menuLabel("cmdResetPages", "resetPages")]},
        {
            id: "help",
            label: t("menuHelp"),
            entries: [
                menuLabel("about", "about"),
                ...desktopLayout ? [] : [{command: "language" as const, label: `${t("switchLanguage")}: ${LANG_NAMES[otherLang(lang)]}`, status: "enabled" as const}],
            ],
        },
    ];

    const empty = doc.media.length === 0;
    const chosen = selectedMedia(doc);
    const unselectedKeys = new Set(doc.media.filter((m) => !chosen.includes(m)).map((m) => m.key));
    const resolvedAspect = empty ? "16:9" : defaultAspectRatio(chosen);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const hasVideoSound = chosen.some((m) => m.type === "video" && m.hasAudio);
    const originalTotal = doc.media.reduce((sum, m) => sum + (m.originalBytes ?? m.blob.size), 0);

    // 单页编辑：当前的页编排（手动编排，或自动编排的结果）、选中的页、页面条和“本页”面板
    const {pages: manualPages, media: allMedia, length: lengthChoice, aspect: aspectChoice, templateId, seed, transition} = doc;
    const pagePlan = useMemo(() => {
        if (manualPages) {
            return manualPages;
        }
        const media = selectedMedia({media: allMedia, length: lengthChoice});
        if (media.length === 0) {
            return [];
        }
        try {
            return autoPages({media, aspect: aspectChoice, templateId, seed, transition});
        } catch {
            return [];
        }
    }, [manualPages, allMedia, lengthChoice, aspectChoice, templateId, seed, transition]);
    const selected = selectedPage === null || pagePlan.length === 0 ? null : Math.min(selectedPage, pagePlan.length - 1);
    const mediaByKey = new Map(doc.media.map((m) => [m.key, m]));
    const pageContext: PageContext = {isVideo: (key) => mediaByKey.get(key)?.type === "video"};

    const selectPage = (index: number): void => {
        setSelectedPage(index);
        setPanelMode("page");
        if (result) {
            seekToPage(result.controller, index);
        }
        announce(t("statusPageSelected", {page: index + 1}));
    };
    const onPageAction = (action: PageAction): void => {
        const {state: next, select} = applyPageAction(editorRef.current, action);
        if (next === editorRef.current) {
            return;
        }
        editorRef.current = next;
        setEditor(next);
        if (select !== undefined) {
            setSelectedPage(select);
        }
        if (action.kind === "movePage") {
            announce(t("statusPageMoved", {page: action.to + 1}));
        } else if (action.kind === "removePage") {
            announce(t("statusPageRemoved"));
        }
    };

    const assets = (
        <AssetPanel
            media={doc.media}
            unselectedKeys={unselectedKeys}
            urlFor={urlFor}
            failures={failures}
            describeFailure={(failure) => describeFileError(failure.fileName, failure.error, t)}
            busy={busy}
            importing={importing}
            mobile={!desktopLayout}
            sizeWarning={transcodeSetting.mobile && mobileSizeLevel(originalTotal) === "warn"}
            onAdd={() => run("addMedia")}
            onMove={(from, to) => applyFilm((state) => moveMedia(state, from, to))}
            onRemove={(key) => apply((state) => syncDefaultTitle(state, removeMedia(state, key), t("defaultTitleWord")))}
            onClearFailures={() => setFailures([])}
        />
    );
    const emptyState = (messageOnly: boolean) =>
        <EmptyState messageOnly={messageOnly} disabled={busy} onAdd={() => run("addMedia")} onOpen={() => run("open")} />
  ;
    const assetTypes = new Map(result?.manifest.assets.map((a) => [a.id, a.type]));
    const stripPages: StripPage[] = (result?.manifest.pages ?? []).map((page) => ({
        duration: page.duration,
        kind: page.items.length > 1 ? "collage" : assetTypes.get(page.items[0]!.assetId) === "video" ? "video" : "photo",
    }));
    const strip
        = result && stripPages.length > 0
            ? (
                <StoryStrip
                    controller={result.controller}
                    pages={stripPages}
                    selected={selected}
                    draggable={desktopLayout}
                    onSelect={selectPage}
                    onMove={(from, to) => onPageAction({kind: "movePage", from, to})}
                    onRemove={(index) => onPageAction({kind: "removePage", index})}
                    {...!desktopLayout && {
                        onEditPage: () => {
                            setPanelMode("page");
                            setTab("settings");
                        },
                    }}
                />
            )
            : null;
    const previewPane = empty
        ? emptyState(!desktopLayout)
        : (
            <PreviewPane
                controller={result?.controller ?? null}
                pages={result?.manifest.pages.length ?? 0}
                duration={result?.manifest.duration ?? 0}
                updating={preview.updating}
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                error={preview.error ? describeBuildError(preview.error, t) : null}
                layoutMayDiffer={layoutMayDiffer}
                strip={strip}
                {...!desktopLayout && {
                    actions: {
                        onMedia: () => setTab("media"),
                        onSave: () => run("save"),
                        saveDisabled: status.save !== "enabled",
                    },
                }}
            />
        );
    const settings = (
        <SettingsPanel
            doc={doc}
            resolvedAspect={resolvedAspect}
            disabled={empty}
            hasVideoSound={hasVideoSound}
            customMusic={customMusic}
            placeholderTitle={t("makerTitlePlaceholder")}
            // eslint-disable-next-line @stylistic/max-len
            transcode={{checked: transcodeSetting.transcode, canChange: transcodeSetting.capabilities.videoEncode, note: transcodeSetting.note}}
            onTranscode={transcodeSetting.setTranscode}
            onTitle={(title) => apply((state) => setTitle(state, title, Date.now()))}
            onSubtitle={(subtitle) => apply((state) => setSubtitle(state, subtitle, Date.now()))}
            onShowTitle={(show) => apply((state) => setShowTitle(state, show))}
            onAspect={(aspect) => apply((state) => setAspect(state, aspect))}
            onTemplate={(templateId) => applyFilm((state) => setTemplate(state, templateId))}
            onTransition={(transition) => apply((state) => setTransition(state, transition))}
            onLook={(look) => apply((state) => setLook(state, look))}
            onLength={(length) => applyFilm((state) => setLength(state, length))}
            onMusic={(music) => apply((state) => setMusic(state, music))}
            onMusicVolume={(volume, at) => apply((state) => setMusicVolume(state, volume, at))}
            onVideoVolume={(volume, at) => apply((state) => setVideoVolume(state, volume, at))}
            onDuckMusic={(duck) => apply((state) => setDuckMusic(state, duck))}
            onPickMusic={() => musicInput.current?.click()}
            onReroll={() => {
                const seed = randomSeed();
                applyFilm((state) => setSeed(state, seed));
            }}
        />
    );

    const pageAspect = aspectChoice === "auto" ? resolvedAspect : aspectChoice;
    const framingPage = framing ? pagePlan[framing.index] : undefined;
    const framingItem = framingPage?.items[framing?.item ?? 0];
    const framingMedia = framingItem && mediaByKey.get(framingItem.key);
    const pagePanel = (
        <PagePanel
            index={selected}
            pages={pagePlan}
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            actualDuration={(selected !== null && result?.manifest.pages[selected]?.duration) || 4}
            aspect={pageAspect}
            mediaOf={(key) => {
                const m = mediaByKey.get(key);
                return m && {name: m.fileName, url: urlFor(m), video: m.type === "video", duration: m.duration ?? 0, hasAudio: m.hasAudio === true};
            }}
            ctx={pageContext}
            onAction={onPageAction}
            onFrame={(item) => selected !== null && setFraming({index: selected, item})}
        />
    );
    const rightPanel = <RightPanel mode={panelMode} onMode={setPanelMode} disabled={empty} film={settings} page={pagePanel} />;
    const saveButton = empty
        ? null
        : (
            <button className={classes.saveButton} disabled={status.save !== "enabled"} onClick={() => run("save")}>
                {t("makerSave")}
            </button>
        );

    return (
        <div
            className={classes.root}
            onDragEnter={(event) => {
                if (!hasFiles(event)) {
                    return;
                }
                dragDepth.current += 1;
                setDragging(true);
            }}
            onDragOver={(event) => hasFiles(event) && event.preventDefault()}
            onDragLeave={(event) => {
                if (!hasFiles(event)) {
                    return;
                }
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) {
                    setDragging(false);
                }
            }}
            onDrop={(event) => hasFiles(event) && onDropFiles(event)}
        >
            <header className={classes.top}>
                {desktopLayout
                    ? (
                        <>
                            <Logo size={28} kind="maker" />
                            <MenuBar groups={groups} label={t("menuBarLabel")} onCommand={run} />
                            <div className={classes.spacer} />
                            {!isDesktop() && (
                                <a className={classes.link} href="./">
                                    {t("makerBackToPlayer")}
                                </a>
                            )}
                            <LanguageSwitch />
                            <button className={classes.tool} onClick={() => setAboutOpen(true)}>
                                <InfoIcon size={18} />
                                {t("about")}
                            </button>
                            {saveButton}
                        </>
                    )
                    : (
                        <>
                            <MenuBar groups={groups} label={t("menuBarLabel")} onCommand={run} compact={{label: t("menuMobile")}} />
                            <div className={classes.tabTitle}>{t(TAB_LABELS[tab])}</div>
                            <Logo size={28} kind="maker" />
                            {saveButton}
                        </>
                    )}
            </header>

            {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */}
            {notice && (
                <div className={classes.notice} role="status">
                    <span style={{flex: 1}}>{notice}</span>
                    <button className={classes.noticeClose} onClick={() => setNotice(null)}>
                        {t("close")}
                    </button>
                </div>
            )}

            {desktopLayout
                ? (
                    <main className={classes.desktopMain}>
                        <section className={`${classes.cell} ${classes.cellSide}`} aria-label={t("tabMedia")}>
                            {assets}
                        </section>
                        <section className={classes.cell} aria-label={t("tabPreview")}>
                            {previewPane}
                        </section>
                        <section className={`${classes.cell} ${classes.cellRight}`} aria-label={t("tabSettings")}>
                            {rightPanel}
                        </section>
                    </main>
                )
                : (
                    <>
                        <main className={classes.mobileMain}>
                            {tab === "media" && (empty ? <div style={{height: "100%"}}>{emptyState(false)}</div> : assets)}
                            {tab === "preview" && previewPane}
                            {tab === "settings" && (empty ? emptyState(true) : rightPanel)}
                        </main>
                        <nav className={classes.tabs} role="tablist" aria-label={t("tabsLabel")}>
                            {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
                                <button key={key} className={classes.tab} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                                    {t(TAB_LABELS[key])}
                                </button>
                            ))}
                        </nav>
                    </>
                )}

            <div className={classes.hiddenLive} aria-live="polite" role="status">
                {announcement}
            </div>
            {dragging && <div className={classes.dropOverlay}>{t("dropHere")}</div>}

            <input
                ref={mediaInput}
                type="file"
                multiple
                hidden
                accept="image/*,.heic,.heif,.mp4,.m4v,video/mp4"
                onChange={(event) => {
                    const files = [...event.target.files ?? []];
                    event.target.value = "";
                    void addFiles(files);
                }}
            />
            <input
                ref={musicInput}
                type="file"
                hidden
                accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                        void pickMusic(file);
                    }
                }}
            />
            <input
                ref={qypInput}
                type="file"
                hidden
                accept=".qyp"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                        void openFile(file);
                    }
                }}
            />

            {draft.offer && (
                <ConfirmDialog
                    message={t("draftFound", {count: draft.offer.count, time: new Date(draft.offer.savedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en")})}
                    confirmLabel={t("draftRestore")}
                    cancelLabel={t("draftDiscard")}
                    onCancel={() => draft.discard()}
                    onConfirm={() => {
                        const content = draft.offer?.content;
                        draft.accept();
                        if (content) {
                            apply((state) => loadDraft(state, content));
                        }
                    }}
                />
            )}
            {confirmation && (
                <ConfirmDialog
                    message={confirmation.message}
                    confirmLabel={confirmation.confirmLabel}
                    onCancel={() => setConfirmation(null)}
                    onConfirm={() => {
                        const {onConfirm} = confirmation;
                        setConfirmation(null);
                        onConfirm();
                    }}
                />
            )}
            {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */}
            {errorMessage && <MessageDialog message={errorMessage} onClose={() => setErrorMessage(null)} />}
            {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */}
            {savedNote && <MessageDialog title={t("dialogNoticeTitle")} message={savedNote} onClose={() => setSavedNote(null)} />}
            {progress && (
                <ProgressDialog
                    message={t("transcodeProgress", {index: progress.index, total: progress.total, percent: Math.round(progress.fraction * 100)})}
                    fraction={progress.fraction}
                    onCancel={() => saveAbort.current?.abort()}
                />
            )}
            {exportProgress && (
                <ProgressDialog
                    message={
                        exportProgress.remainingSeconds === undefined
                            ? t("exportProgress", {percent: Math.round(exportProgress.fraction * 100)})
                            : t("exportProgressRemaining", {percent: Math.round(exportProgress.fraction * 100), remaining: formatDuration(exportProgress.remainingSeconds)})
                    }
                    fraction={exportProgress.fraction}
                    onCancel={() => saveAbort.current?.abort()}
                />
            )}
            {framing && framingPage && framingItem && framingMedia && (
                <FramingDialog
                    key={`${framing.index}-${framing.item}`}
                    name={framingMedia.fileName}
                    url={urlFor(framingMedia)}
                    asset={{width: framingMedia.width, height: framingMedia.height}}
                    // eslint-disable-next-line @stylistic/max-len
                    cellAspect={cellAspect(layoutFrames(framingPage.items.length as 1 | 2 | 3 | 4, pageAspect, framingPage.layout)[framing.item]!, pageAspect)}
                    initialCrop={framingItem.crop}
                    initialKenBurns={framingItem.kenBurns}
                    showKenBurns={framingPage.items.length === 1}
                    fitIsContain={framingItem.fit === "contain"}
                    onCancel={() => setFraming(null)}
                    onDone={(crop, kenBurns) => {
                        onPageAction({kind: "framing", index: framing.index, item: framing.item, crop, kenBurns});
                        setFraming(null);
                    }}
                />
            )}
            {aboutOpen && <AboutDialog kind="maker" onClose={() => setAboutOpen(false)} />}
        </div>
    );
};
