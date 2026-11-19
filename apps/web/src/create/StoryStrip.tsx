import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createUseStyles } from "react-jss";
import { useI18n } from "../i18n";
import { useLazyThumbnail } from "../PageStrip";
import type { PlaybackController } from "../player/PlaybackController";
import { theme } from "../ui/theme";

/** 缩略图在条里的显示高度（CSS 像素） */
const TILE_HEIGHT = 64;

const useStyles = createUseStyles({
  wrap: { flex: "none", display: "flex", alignItems: "stretch", gap: 8, padding: "6px 10px 4px", borderTop: `1px solid ${theme.border}`, background: theme.surface },
  strip: { flex: 1, minWidth: 0, display: "flex", gap: 6, overflowX: "auto", padding: "4px 2px 6px", scrollbarWidth: "thin" },
  tile: {
    position: "relative", flex: "none", height: TILE_HEIGHT, padding: 0, border: "2px solid transparent", borderRadius: 4, overflow: "hidden", background: "#1b2230", cursor: "pointer",
    "&:hover": { borderColor: "rgba(255, 255, 255, 0.5)" },
    "&:focus-visible": { outline: `2px solid ${theme.accent}`, outlineOffset: 1 },
  },
  selected: { borderColor: theme.accent, "&:hover": { borderColor: theme.accent } },
  dropBefore: { boxShadow: `-4px 0 0 ${theme.accent}` },
  canvas: { display: "block", height: "100%", width: "100%" },
  label: { position: "absolute", fontSize: 11, lineHeight: 1.2, color: "#fff", textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)", fontVariantNumeric: "tabular-nums", pointerEvents: "none" },
  number: { left: 3, bottom: 1 },
  seconds: { right: 3, bottom: 1 },
  kind: { left: 3, top: 2, padding: "0 4px", borderRadius: 3, background: "rgba(0, 0, 0, 0.6)" },
  edit: {
    flex: "none", alignSelf: "center", minHeight: 44, padding: "6px 14px", border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.surface, color: theme.text, font: "inherit", fontSize: 14, cursor: "pointer",
    "&:hover": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  hint: { margin: 0, padding: "0 12px 6px", fontSize: 12, color: theme.muted, background: theme.surface },
});

/** 条里一页的概况 */
export interface StripPage {
  /** 该页在影片里的实际时长（秒） */
  duration: number;
  kind: "photo" | "collage" | "video";
}

interface StoryStripProps {
  controller: PlaybackController;
  pages: readonly StripPage[];
  /** 选中的页（没有选中为 null） */
  selected: number | null;
  /** 桌面上允许拖动排序；手机上用面板里的按钮 */
  draggable: boolean;
  onSelect(index: number): void;
  onMove(from: number, to: number): void;
  onRemove(index: number): void;
  /** 手机：条旁的“编辑本页”按钮，打开“设置”标签里的本页面板 */
  onEditPage?: () => void;
}

interface TileProps {
  controller: PlaybackController;
  index: number;
  page: StripPage;
  selected: boolean;
  draggable: boolean;
  dropBefore: boolean;
  stripRef: React.RefObject<HTMLDivElement | null>;
  onSelect(): void;
  onDragStart(): void;
  onDragOver(): void;
  onDrop(): void;
  onDragEnd(): void;
}

/** 一页的缩略图按钮：页码、时长，视频和拼图页另有标记 */
function Tile({ controller, index, page, selected, draggable, dropBefore, stripRef, onSelect, onDragStart, onDragOver, onDrop, onDragEnd }: TileProps) {
  const classes = useStyles();
  const { t } = useI18n();
  const { buttonRef, canvasRef } = useLazyThumbnail(controller, index, stripRef);
  const aspect = controller.canvas.width / controller.canvas.height;
  const seconds = Math.round(page.duration * 10) / 10;
  return (
    <button
      ref={buttonRef}
      className={`${classes.tile} ${selected ? classes.selected : ""} ${dropBefore ? classes.dropBefore : ""}`}
      style={{ width: Math.round(TILE_HEIGHT * aspect) + 4 }}
      aria-label={t("storyTileLabel", { page: index + 1, seconds })}
      aria-pressed={selected}
      draggable={draggable}
      onClick={onSelect}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-qy-page", String(index));
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("application/x-qy-page")) return;
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("application/x-qy-page")) return;
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <canvas ref={canvasRef} className={classes.canvas} />
      <span className={`${classes.label} ${classes.number}`}>{index + 1}</span>
      <span className={`${classes.label} ${classes.seconds}`}>{seconds}s</span>
      {page.kind !== "photo" && <span className={`${classes.label} ${classes.kind}`}>{t(page.kind === "video" ? "storyKindVideo" : "storyKindCollage")}</span>}
    </button>
  );
}

/**
 * 预览下方的页面条（docs/dev-0.4.1.md 7）：每页一张缩略图，点击选中并让预览跳到该页；
 * 桌面上可拖动排序，选中后 Alt+←/→ 前后移动、Delete 删除，←/→ 切换选中页。
 */
export function StoryStrip({ controller, pages, selected, draggable, onSelect, onMove, onRemove, onEditPage }: StoryStripProps) {
  const classes = useStyles();
  const { t } = useI18n();
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // 选中页滚到可见位置；焦点本来就在条里时，焦点跟着选中页走（键盘移动页之后不会丢）
  useEffect(() => {
    const strip = stripRef.current;
    const tile = selected === null ? undefined : (strip?.children[selected] as HTMLElement | undefined);
    if (!strip || !tile) return;
    strip.scrollLeft = tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2;
    if (strip.contains(document.activeElement) && document.activeElement !== tile) tile.focus();
  }, [selected, pages.length]);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (selected === null) return;
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step !== 0) {
      event.preventDefault();
      const target = selected + step;
      if (target < 0 || target >= pages.length) return;
      if (event.altKey) onMove(selected, target);
      else onSelect(target);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(selected);
    }
  };

  const endDrag = (): void => {
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <>
      <div className={classes.wrap}>
        <div ref={stripRef} className={classes.strip} role="group" aria-label={t("storyStripLabel")} onKeyDown={onKeyDown}>
          {pages.map((page, index) => (
            <Tile
              key={index}
              controller={controller}
              index={index}
              page={page}
              selected={index === selected}
              draggable={draggable}
              dropBefore={dragFrom !== null && dropAt === index && dragFrom !== index}
              stripRef={stripRef}
              onSelect={() => onSelect(index)}
              onDragStart={() => setDragFrom(index)}
              onDragOver={() => setDropAt(index)}
              onDrop={() => {
                if (dragFrom !== null && dragFrom !== index) onMove(dragFrom, index);
                endDrag();
              }}
              onDragEnd={endDrag}
            />
          ))}
        </div>
        {onEditPage && (
          <button className={classes.edit} disabled={selected === null} onClick={onEditPage}>
            {t("storyEditPage")}
          </button>
        )}
      </div>
      {draggable && <p className={classes.hint}>{t("storyStripKeys")}</p>}
    </>
  );
}
