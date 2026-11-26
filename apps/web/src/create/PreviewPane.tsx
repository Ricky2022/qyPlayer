import type {ReactNode} from "react";
import {createUseStyles} from "react-jss";
import {useI18n} from "../i18n";
import type {PlaybackController} from "../player/PlaybackController";
import {PlayerView} from "../PlayerView";
import {theme} from "../ui/theme";
import {formatDuration} from "./files";

const useStyles = createUseStyles({
    pane: {display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0},
    status: {display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 14px", fontSize: 13, color: theme.muted, borderBottom: `1px solid ${theme.border}`},
    statusText: {flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, overflow: "hidden"},
    statusActions: {display: "flex", flex: "none", alignItems: "center", gap: 6},
    statusButton: {
        minHeight: 28,
        padding: "2px 12px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: theme.surface,
        color: theme.text,
        font: "inherit",
        fontSize: 13,
        cursor: "pointer",
        "&:hover:not(:disabled)": {background: theme.surfaceHover},
        "&:disabled": {opacity: 0.45, cursor: "default"},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    statusSave: {
        background: theme.accent,
        borderColor: theme.accent,
        color: theme.onAccent,
        fontWeight: 600,
        "&:hover:not(:disabled)": {background: "#67d0fb"},
    },
    updating: {color: theme.accent},
    notice: {margin: 0, padding: "6px 14px", fontSize: 13, background: "rgba(160, 90, 0, 0.35)", color: "#ffe2b0"},
    error: {margin: 0, padding: "8px 14px", fontSize: 13, background: theme.dangerBg, color: theme.danger, whiteSpace: "pre-line"},
    stage: {position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: "#000"},
    empty: {height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", color: theme.muted},
    big: {
        minWidth: 220,
        minHeight: 56,
        padding: "12px 28px",
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        background: theme.surface,
        color: theme.text,
        font: "inherit",
        fontSize: 17,
        cursor: "pointer",
        "&:hover": {background: theme.surfaceHover},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    bigPrimary: {background: theme.accent, borderColor: theme.accent, color: theme.onAccent, fontWeight: 600, "&:hover": {background: "#67d0fb"}},
});

interface EmptyStateProps {
    /** 只显示“先添加素材”的一句话（手机的预览和设置标签） */
    messageOnly?: boolean;
    disabled: boolean;
    onAdd: () => void;
    onOpen: () => void;
}

/** 空状态（3A.13）：两个大按钮和一行拖放提示 */
export const EmptyState = function EmptyState({messageOnly, disabled, onAdd, onOpen}: EmptyStateProps) {
    const classes = useStyles();
    const {t} = useI18n();
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (messageOnly) {
        return (
            <div className={classes.empty}>
                <p>{t("emptyNeedMedia")}</p>
            </div>
        );
    }
    return (
        <div className={classes.empty}>
            <button className={`${classes.big} ${classes.bigPrimary}`} disabled={disabled} onClick={onAdd}>
                {t("emptyAdd")}
            </button>
            <button className={classes.big} disabled={disabled} onClick={onOpen}>
                {t("emptyOpen")}
            </button>
            <p>{t("emptyDragHint")}</p>
        </div>
    );
};

interface PreviewActions {
    /** 回到素材标签 */
    onMedia: () => void;
    /** 与顶栏「保存」同一次处理，包括禁用和导入音乐的使用权确认 */
    onSave: () => void;
    saveDisabled: boolean;
}

interface PreviewPaneProps {
    controller: PlaybackController | null;
    pages: number;
    duration: number;
    updating: boolean;
    /** 已翻译的生成错误；有值时显示在状态行下面 */
    error: string | null;
    layoutMayDiffer: boolean;
    /** 播放器下面的页面条（单页编辑） */
    strip?: ReactNode;
    /** 窄窗口：状态行右侧的「素材」和「保存」 */
    actions?: PreviewActions;
}

/** 预览区（3A.8）：状态行 + 内嵌播放器 + 页面条 */
export const PreviewPane = function PreviewPane({
    controller,
    pages,
    duration,
    updating,
    error,
    layoutMayDiffer,
    strip,
    actions,
}: PreviewPaneProps) {
    const classes = useStyles();
    const {t} = useI18n();
    return (
        <div className={classes.pane}>
            <div className={classes.status}>
                <span className={classes.statusText}>
                    {controller && <span>{t("previewStatus", {pages, duration: formatDuration(duration)})}</span>}
                    {updating && <span className={classes.updating}>{t("previewUpdating")}</span>}
                </span>
                {actions && (
                    <span className={classes.statusActions}>
                        <button className={classes.statusButton} onClick={actions.onMedia}>{t("tabMedia")}</button>
                        <button className={`${classes.statusButton} ${classes.statusSave}`} disabled={actions.saveDisabled} onClick={actions.onSave}>
                            {t("makerSave")}
                        </button>
                    </span>
                )}
            </div>
            {layoutMayDiffer && <p className={classes.notice}>{t("previewLayoutHint")}</p>}
            {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */}
            {error && (
                <p className={classes.error} role="alert">
                    {error}
                </p>
            )}
            <div className={classes.stage}>{controller && <PlayerView controller={controller} embedded />}</div>
            {controller && strip}
        </div>
    );
};
