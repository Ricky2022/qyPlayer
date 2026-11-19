import type { ReactNode } from "react";
import { createUseStyles } from "react-jss";
import { useI18n } from "../i18n";
import type { PlaybackController } from "../player/PlaybackController";
import { PlayerView } from "../PlayerView";
import { theme } from "../ui/theme";
import { formatDuration } from "./files";

const useStyles = createUseStyles({
  pane: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0 },
  status: { display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 14px", fontSize: 13, color: theme.muted, borderBottom: `1px solid ${theme.border}` },
  updating: { color: theme.accent },
  notice: { margin: 0, padding: "6px 14px", fontSize: 13, background: "rgba(160, 90, 0, 0.35)", color: "#ffe2b0" },
  error: { margin: 0, padding: "8px 14px", fontSize: 13, background: theme.dangerBg, color: theme.danger, whiteSpace: "pre-line" },
  stage: { flex: 1, minHeight: 0, background: "#000" },
  empty: { height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", color: theme.muted },
  big: {
    minWidth: 220, minHeight: 56, padding: "12px 28px", border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.surface, color: theme.text, font: "inherit", fontSize: 17, cursor: "pointer",
    "&:hover": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  bigPrimary: { background: theme.accent, borderColor: theme.accent, color: theme.onAccent, fontWeight: 600, "&:hover": { background: "#67d0fb" } },
});

interface EmptyStateProps {
  /** 只显示“先添加素材”的一句话（手机的预览和设置标签） */
  messageOnly?: boolean;
  disabled: boolean;
  onAdd(): void;
  onOpen(): void;
}

/** 空状态（3A.13）：两个大按钮和一行拖放提示 */
export function EmptyState({ messageOnly, disabled, onAdd, onOpen }: EmptyStateProps) {
  const classes = useStyles();
  const { t } = useI18n();
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
}

/** 预览区（3A.8）：状态行 + 内嵌播放器 + 页面条 */
export function PreviewPane({ controller, pages, duration, updating, error, layoutMayDiffer, strip }: PreviewPaneProps) {
  const classes = useStyles();
  const { t } = useI18n();
  return (
    <div className={classes.pane}>
      <div className={classes.status}>
        {controller && <span>{t("previewStatus", { pages, duration: formatDuration(duration) })}</span>}
        {updating && <span className={classes.updating}>{t("previewUpdating")}</span>}
      </div>
      {layoutMayDiffer && <p className={classes.notice}>{t("previewLayoutHint")}</p>}
      {error && (
        <p className={classes.error} role="alert">
          {error}
        </p>
      )}
      <div className={classes.stage}>{controller && <PlayerView controller={controller} />}</div>
      {controller && strip}
    </div>
  );
}
