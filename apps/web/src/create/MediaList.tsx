import { createUseStyles } from "react-jss";
import { useI18n, type Translate } from "../i18n";
import { theme } from "../ui/theme";
import type { MediaEntry } from "./buildPackage";
import { formatBytes, formatDuration } from "./files";

export interface LibraryItem {
  /** 列表项的稳定标识，与包内 id 无关 */
  key: number;
  entry: MediaEntry;
  /** 缩略图用的 object URL，移除时必须 revoke */
  url: string;
}

const useStyles = createUseStyles({
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: 6, borderRadius: 8, background: theme.surface },
  index: { width: 28, textAlign: "right", color: theme.muted, fontVariantNumeric: "tabular-nums" },
  thumb: { width: 72, height: 48, objectFit: "cover", borderRadius: 4, background: "#000", flex: "none" },
  info: { flex: 1, minWidth: 0 },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { fontSize: 12, color: theme.muted },
  button: {
    padding: "4px 10px", border: `1px solid ${theme.border}`, borderRadius: 999, background: "transparent", color: theme.text, cursor: "pointer", font: "inherit",
    "&:hover:not(:disabled)": { background: theme.surfaceHover },
    "&:disabled": { opacity: 0.35, cursor: "default" },
  },
});

function describe(entry: MediaEntry, t: Translate): string {
  const size = formatBytes(entry.blob.size);
  if (entry.type === "image") return t("mediaPhoto", { width: entry.width, height: entry.height, size });
  return t("mediaVideo", {
    duration: formatDuration(entry.duration ?? 0),
    width: entry.width,
    height: entry.height,
    sound: entry.hasAudio ? t("mediaSound") : t("mediaSilent"),
    size,
  });
}

interface MediaListProps {
  items: readonly LibraryItem[];
  disabled: boolean;
  onMove(index: number, delta: number): void;
  onRemove(index: number): void;
}

/** 素材列表：按列表顺序生成影片，每行可以上移、下移、删除 */
export function MediaList({ items, disabled, onMove, onRemove }: MediaListProps) {
  const classes = useStyles();
  const { t } = useI18n();
  return (
    <ol className={classes.list}>
      {items.map((item, index) => (
        <li key={item.key} className={classes.row}>
          <span className={classes.index}>{index + 1}</span>
          {item.entry.type === "image" ? (
            <img className={classes.thumb} src={item.url} alt="" />
          ) : (
            <video className={classes.thumb} src={`${item.url}#t=0.1`} preload="metadata" muted />
          )}
          <div className={classes.info}>
            <div className={classes.name} title={item.entry.fileName}>
              {item.entry.fileName}
            </div>
            <div className={classes.meta}>{describe(item.entry, t)}</div>
          </div>
          <button className={classes.button} disabled={disabled || index === 0} aria-label={t("mediaUpLabel", { name: item.entry.fileName })} onClick={() => onMove(index, -1)}>
            {t("mediaUp")}
          </button>
          <button className={classes.button} disabled={disabled || index === items.length - 1} aria-label={t("mediaDownLabel", { name: item.entry.fileName })} onClick={() => onMove(index, 1)}>
            {t("mediaDown")}
          </button>
          <button className={classes.button} disabled={disabled} aria-label={t("mediaRemoveLabel", { name: item.entry.fileName })} onClick={() => onRemove(index)}>
            {t("mediaRemove")}
          </button>
        </li>
      ))}
    </ol>
  );
}
