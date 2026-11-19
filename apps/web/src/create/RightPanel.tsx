import type { ReactNode } from "react";
import { createUseStyles } from "react-jss";
import { useI18n, type MessageKey } from "../i18n";
import { theme } from "../ui/theme";

export type PanelMode = "film" | "page";

const useStyles = createUseStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  switch: { display: "flex", flex: "none", gap: 4, padding: "8px 14px 0", borderBottom: `1px solid ${theme.border}` },
  tab: {
    flex: 1, minHeight: 36, border: "none", borderBottom: "3px solid transparent", background: "transparent", color: theme.muted, font: "inherit", fontSize: 14, cursor: "pointer",
    "&[aria-selected=true]": { color: theme.accent, borderBottomColor: theme.accent },
    "&:disabled": { opacity: 0.45, cursor: "default" },
    "&:focus-visible": { outline: `2px solid ${theme.accent}`, outlineOffset: -2 },
  },
  body: { flex: 1, minHeight: 0 },
});

const LABELS: Record<PanelMode, MessageKey> = { film: "panelFilm", page: "panelPage" };

interface RightPanelProps {
  mode: PanelMode;
  onMode(mode: PanelMode): void;
  /** 没有素材时两个标签都不可用 */
  disabled: boolean;
  film: ReactNode;
  page: ReactNode;
}

/** 右侧面板顶部的“影片 | 本页”切换（docs/dev-0.4.1.md 7）：影片是整片设置，本页是选中页的单页编辑 */
export function RightPanel({ mode, onMode, disabled, film, page }: RightPanelProps) {
  const classes = useStyles();
  const { t } = useI18n();
  return (
    <div className={classes.root}>
      <div className={classes.switch} role="tablist" aria-label={t("panelSwitchLabel")}>
        {(Object.keys(LABELS) as PanelMode[]).map((key) => (
          <button key={key} className={classes.tab} role="tab" aria-selected={mode === key} disabled={disabled && key === "page"} onClick={() => onMode(key)}>
            {t(LABELS[key])}
          </button>
        ))}
      </div>
      <div className={classes.body}>{mode === "film" ? film : page}</div>
    </div>
  );
}
