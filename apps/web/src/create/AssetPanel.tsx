import {useEffect, useRef, useState, type DragEvent, type KeyboardEvent} from "react";
import {createUseStyles} from "react-jss";
import {GENERATOR_LIMITS} from "@qyplayer/core";
import {useI18n, type Translate} from "../i18n";
import {AddIcon, ArrowDownIcon, ArrowUpIcon, CloseIcon, DragHandleIcon} from "../ui/icons";
import {theme} from "../ui/theme";
import {dropMoveTarget} from "./editor/reorder";
import type {EditorMedia} from "./editor/state";
import {formatBytes, formatDuration} from "./files";

const DRAG_TYPE = "application/x-qy-media";

const useStyles = createUseStyles({
    panel: {display: "flex", flexDirection: "column", minHeight: 0, height: "100%"},
    head: {display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${theme.border}`},
    title: {margin: 0, fontSize: 15, flex: 1},
    count: {fontSize: 12, color: theme.muted, fontVariantNumeric: "tabular-nums"},
    add: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        minHeight: 36,
        padding: "4px 12px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: theme.surface,
        color: theme.text,
        font: "inherit",
        fontSize: 14,
        cursor: "pointer",
        "&:hover:not(:disabled)": {background: theme.surfaceHover},
        "&:disabled": {opacity: 0.4, cursor: "default"},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    scroll: {flex: 1, minHeight: 0, overflowY: "auto", padding: 8},
    status: {margin: "0 0 8px", fontSize: 13, color: theme.muted},
    none: {margin: "24px 0", textAlign: "center", color: theme.muted, fontSize: 14},
    list: {listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4},
    row: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 6,
        borderRadius: 8,
        background: theme.surface,
        border: "1px solid transparent",
        "&:focus-visible": {outline: `2px solid ${theme.accent}`, outlineOffset: -1},
    },
    insertBefore: {boxShadow: `inset 0 3px 0 ${theme.accent}`},
    insertAfter: {boxShadow: `inset 0 -3px 0 ${theme.accent}`},
    dragging: {opacity: 0.45},
    unselected: {opacity: 0.5},
    handle: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 44,
        padding: 0,
        border: "none",
        borderRadius: 4,
        background: "transparent",
        color: theme.muted,
        cursor: "grab",
        flex: "none",
        "&:hover": {color: theme.text},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    thumb: {width: 72, height: 48, objectFit: "cover", borderRadius: 4, background: "#000", flex: "none", pointerEvents: "none"},
    info: {flex: 1, minWidth: 0},
    name: {overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14},
    meta: {fontSize: 12, color: theme.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"},
    actions: {display: "flex", alignItems: "center", flex: "none"},
    iconButton: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 44,
        height: 44,
        padding: 0,
        border: "none",
        borderRadius: "50%",
        background: "transparent",
        color: theme.muted,
        cursor: "pointer",
        "&:hover:not(:disabled)": {background: theme.surfaceHover, color: theme.text},
        "&:disabled": {opacity: 0.3, cursor: "default"},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    compactButton: {width: 32, height: 32},
    sizeWarning: {margin: "0 0 8px", padding: "6px 10px", borderRadius: 8, background: "rgba(160, 90, 0, 0.92)", color: "#fff", fontSize: 13},
    noPreview: {display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: theme.muted, textAlign: "center", lineHeight: 1.2},
    failures: {margin: "10px 0 0", padding: "6px 10px", borderRadius: 8, background: theme.dangerBg, color: theme.danger, fontSize: 13},
    failureSummary: {cursor: "pointer"},
    failureList: {margin: "6px 0", paddingLeft: 18},
    clear: {
        padding: "4px 12px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: "transparent",
        color: theme.text,
        font: "inherit",
        fontSize: 13,
        cursor: "pointer",
        "&:hover": {background: theme.surfaceHover},
    },
});

export interface ImportFailure {
    fileName: string;
    error: unknown;
}

/** 界面语言的本地日期时间；拍摄时间读不到而用修改时间时加“修改时间”字样 */
const describeCapturedAt = function describeCapturedAt(media: EditorMedia, t: Translate, lang: string): string | undefined {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!media.capturedAt) {
        return undefined;
    }
    const date = new Date(media.capturedAt);
    const text = Number.isNaN(date.getTime()) ? media.capturedAt.slice(0, 10) : date.toLocaleString(lang === "zh" ? "zh-CN" : "en", {dateStyle: "medium", timeStyle: "short"});
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return media.capturedAtFromModified ? t("mediaCapturedModified", {time: text}) : text;
};

const describeMedia = function describeMedia(media: EditorMedia, t: Translate, lang: string): string {
    const size = formatBytes(media.blob.size);
    const base
        = media.type === "image"
            ? t("mediaPhoto", {width: media.width, height: media.height, size})
            : t("mediaVideo", {
                duration: formatDuration(media.duration ?? 0),
                width: media.width,
                height: media.height,
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                sound: media.hasAudio ? t("mediaSound") : t("mediaSilent"),
                size,
            });
    const captured = describeCapturedAt(media, t, lang);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return captured ? `${base} · ${captured}` : base;
};

interface ThumbnailProps {
    item: EditorMedia;
    url: string;
    className: string;
    fallbackClassName: string;
    label: string;
}

/** 缩略图；本机解不了（例如 Chrome 里的 HEIC）时显示“无法预览” */
const Thumbnail = function Thumbnail({item, url, className, fallbackClassName, label}: ThumbnailProps) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return <div className={fallbackClassName}>{label}</div>;
    }
    if (item.type === "image") {
        return <img className={className} src={url} alt="" onError={() => setFailed(true)} />;
    }
    return (
        <video className={className} src={`${url}#t=${Math.min(0.5, (item.duration ?? 1) / 2)}`} preload="metadata" muted aria-hidden="true" onError={() => setFailed(true)} />
    );
};

interface AssetPanelProps {
    media: readonly EditorMedia[];
    /** 当前时长档位下没有入选的素材：变灰并标注，不会进入影片 */
    unselectedKeys: ReadonlySet<number>;
    urlFor: (media: EditorMedia) => string;
    failures: readonly ImportFailure[];
    describeFailure: (failure: ImportFailure) => string;
    busy: boolean;
    importing: {
        done: number;
        total: number;
    } | null;
    /** 手机布局：用上移、下移按钮代替拖动手柄 */
    mobile: boolean;
    /** 手机环境下素材累计超过 300 MB：在列表上方显示提示条 */
    sizeWarning: boolean;
    onAdd: () => void;
    onMove: (from: number, to: number) => void;
    onRemove: (key: number) => void;
    onClearFailures: () => void;
}

/** 素材面板（3A.7）：列表顺序就是影片播放顺序 */
// eslint-disable-next-line @stylistic/max-len
export const AssetPanel = function AssetPanel({media, unselectedKeys, urlFor, failures, describeFailure, busy, importing, mobile, sizeWarning, onAdd, onMove, onRemove, onClearFailures}: AssetPanelProps) {
    const classes = useStyles();
    const {lang, t} = useI18n();
    const rowRefs = useRef(new Map<number, HTMLLIElement>());
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [insertAt, setInsertAt] = useState<number | null>(null);

    // 用键盘移动一行后，行在列表里换了位置，把焦点放回它
    const [refocus, setRefocus] = useState<number | null>(null);
    useEffect(() => {
        if (refocus === null) {
            return;
        }
        rowRefs.current.get(refocus)?.focus();
        setRefocus(null);
    }, [refocus, media]);

    const endDrag = (): void => {
        setDragIndex(null);
        setInsertAt(null);
    };

    const onDragOverRow = (event: DragEvent<HTMLLIElement>, index: number): void => {
        if (dragIndex === null) {
            return;
        }
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        setInsertAt(index + (event.clientY > rect.top + (rect.height / 2) ? 1 : 0));
    };

    const onDropList = (event: DragEvent): void => {
        if (dragIndex === null || insertAt === null) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const target = dropMoveTarget(dragIndex, insertAt);
        endDrag();
        if (target !== null) {
            onMove(dragIndex, target);
        }
    };

    const onRowKey = (event: KeyboardEvent, index: number, key: number): void => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
            return;
        }
        event.preventDefault();
        if (busy) {
            return;
        }
        onMove(index, index + (event.key === "ArrowUp" ? -1 : 1));
        setRefocus(key);
    };

    const size = media.reduce((sum, m) => sum + m.blob.size, 0);
    const buttonClass = `${classes.iconButton} ${mobile ? "" : classes.compactButton}`;

    return (
        <div className={classes.panel}>
            <div className={classes.head}>
                <h2 className={classes.title}>{t("assetPanelTitle")}</h2>
                <span className={classes.count}>{t("makerCount", {count: media.length, max: GENERATOR_LIMITS.maxMedia, size: formatBytes(size)})}</span>
                <button className={classes.add} disabled={busy || media.length >= GENERATOR_LIMITS.maxMedia} aria-keyshortcuts="Control+I" onClick={onAdd}>
                    <AddIcon size={18} />
                    {t("assetAdd")}
                </button>
            </div>
            <div className={classes.scroll}>
                {sizeWarning && (
                    <p className={classes.sizeWarning} role="status">
                        {t("mobileSizeWarning")}
                    </p>
                )}
                {importing && (
                    <p className={classes.status} role="status">
                        {t("makerImporting", importing)}
                    </p>
                )}
                {media.length === 0
                    ? <p className={classes.none}>{t("assetNone")}</p>
                    : (
                        <ul className={classes.list} role="list" aria-label={t("assetListLabel")} onDragOver={(event) => dragIndex !== null && event.preventDefault()} onDrop={onDropList}>
                            {media.map((item, index) => {
                                const name = item.fileName;
                                const unselected = unselectedKeys.has(item.key);
                                const detail = describeMedia(item, t, lang) + (unselected ? ` · ${t("assetUnselected")}` : "");
                                const rowClass = [
                                    classes.row,
                                    insertAt === index ? classes.insertBefore : "",
                                    insertAt === media.length && index === media.length - 1 ? classes.insertAfter : "",
                                    dragIndex === index ? classes.dragging : "",
                                    unselected ? classes.unselected : "",
                                ].join(" ");
                                return (
                                    <li
                                        key={item.key}
                                        ref={(element) => {
                                            if (element) {
                                                rowRefs.current.set(item.key, element);
                                            } else {
                                                rowRefs.current.delete(item.key);
                                            }
                                        }}
                                        className={rowClass}
                                        tabIndex={0}
                                        aria-label={t("assetRowLabel", {name, detail})}
                                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                        onKeyDown={(event) => onRowKey(event, index, item.key)}
                                        onDragOver={(event) => onDragOverRow(event, index)}
                                    >
                                        {!mobile && (
                                            <span
                                                className={classes.handle}
                                                draggable={!busy}
                                                aria-hidden="true"
                                                title={t("assetDragLabel", {name})}
                                                onDragStart={(event) => {
                                                    event.dataTransfer.setData(DRAG_TYPE, String(index));
                                                    event.dataTransfer.effectAllowed = "move";
                                                    const row = event.currentTarget.closest("li");
                                                    if (row) {
                                                        event.dataTransfer.setDragImage(row, 20, 20);
                                                    }
                                                    setDragIndex(index);
                                                }}
                                                onDragEnd={endDrag}
                                            >
                                                <DragHandleIcon size={18} />
                                            </span>
                                        )}
                                        <Thumbnail
                                            item={item}
                                            url={urlFor(item)}
                                            className={classes.thumb}
                                            fallbackClassName={`${classes.thumb} ${classes.noPreview}`}
                                            label={t("assetNoPreview")}
                                        />
                                        <div className={classes.info}>
                                            <div className={classes.name} title={name}>
                                                {name}
                                            </div>
                                            <div className={classes.meta} title={detail}>
                                                {detail}
                                            </div>
                                        </div>
                                        <div className={classes.actions}>
                                            {mobile && (
                                                <>
                                                    <button className={buttonClass} disabled={busy || index === 0} aria-label={t("mediaUpLabel", {name})} onClick={() => onMove(index, index - 1)}>
                                                        <ArrowUpIcon size={22} />
                                                    </button>
                                                    <button className={buttonClass} disabled={busy || index === media.length - 1} aria-label={t("mediaDownLabel", {name})} onClick={() => onMove(index, index + 1)}>
                                                        <ArrowDownIcon size={22} />
                                                    </button>
                                                </>
                                            )}
                                            <button className={buttonClass} disabled={busy} aria-label={t("mediaRemoveLabel", {name})} title={t("mediaRemoveLabel", {name})} onClick={() => onRemove(item.key)}>
                                                <CloseIcon size={18} />
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                {failures.length > 0 && (
                    <details className={classes.failures}>
                        <summary className={classes.failureSummary}>{t("assetFailedSummary", {count: failures.length})}</summary>
                        <ul className={classes.failureList}>
                            {failures.map((failure, index) =>
                                <li key={index}>{describeFailure(failure)}</li>)}
                        </ul>
                        <button className={classes.clear} onClick={onClearFailures}>
                            {t("makerGotIt")}
                        </button>
                    </details>
                )}
            </div>
        </div>
    );
};
