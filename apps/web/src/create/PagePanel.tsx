import { createUseStyles } from "react-jss";
import { defaultLayout, type AspectRatio } from "@qyplayer/core";
import { useI18n, type MessageKey } from "../i18n";
import { theme } from "../ui/theme";
import type { PageAction } from "./editor/pageActions";
import { MAX_PAGE_SECONDS, MIN_PAGE_SECONDS, PAGE_SECONDS_STEP, layoutsOf, mergeWithNext, movePhoto, type EditorPage, type PageContext } from "./editor/pages";

const useStyles = createUseStyles({
  panel: { height: "100%", overflowY: "auto", boxSizing: "border-box", padding: "4px 14px 20px" },
  empty: { margin: "20px 0", fontSize: 14, color: theme.muted },
  title: { margin: "10px 0 2px", fontSize: 16, fontWeight: 600 },
  kind: { margin: 0, fontSize: 13, color: theme.muted },
  section: { margin: "14px 0 0", padding: 0, border: "none", minWidth: 0 },
  legend: { padding: 0, marginBottom: 6, fontSize: 13, fontWeight: 600, color: theme.muted },
  choice: { display: "flex", alignItems: "center", gap: 8, minHeight: 28, padding: "4px 0", fontSize: 14, cursor: "pointer" },
  select: {
    width: "100%", minHeight: 36, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, font: "inherit", boxSizing: "border-box",
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  slider: { width: "100%", minHeight: 28 },
  value: { fontSize: 13, color: theme.muted, fontVariantNumeric: "tabular-nums" },
  hint: { margin: "4px 0 0", fontSize: 12, color: theme.muted },
  item: { display: "flex", flexDirection: "column", gap: 6, padding: 8, marginBottom: 8, border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.surface },
  itemHead: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  thumb: { flex: "none", width: 44, height: 44, objectFit: "cover", borderRadius: 4, background: "#1b2230" },
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 },
  tag: { flex: "none", padding: "0 6px", fontSize: 11, borderRadius: 3, background: theme.accent, color: theme.onAccent },
  row: { display: "flex", flexWrap: "wrap", gap: 6 },
  small: {
    minHeight: 32, minWidth: 40, padding: "2px 10px", border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.surface, color: theme.text, cursor: "pointer", font: "inherit", fontSize: 13,
    "&:hover:not(:disabled)": { background: theme.surfaceHover },
    "&:disabled": { opacity: 0.4, cursor: "default" },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  danger: { color: theme.danger, borderColor: theme.danger },
});

/** 面板里一个素材的显示信息 */
export interface PageMediaInfo {
  name: string;
  url: string;
  video: boolean;
}

interface PagePanelProps {
  /** 选中的页（没有选中为 null） */
  index: number | null;
  /** 当前的页编排（手动编排或自动编排的结果） */
  pages: readonly EditorPage[];
  /** 本页在影片里的实际时长（秒），时长从“自动”改成固定时从它起步 */
  actualDuration: number;
  /** 画面比例（已解析），决定各张数的默认版式 */
  aspect: AspectRatio;
  mediaOf: (key: number) => PageMediaInfo | undefined;
  ctx: PageContext;
  onAction(action: PageAction): void;
}

const LAYOUT_LABELS: Record<string, MessageKey> = {
  full: "layoutFull",
  side: "layoutSide",
  stack: "layoutStack",
  "big-left": "layoutBigLeft",
  "big-right": "layoutBigRight",
  "big-top": "layoutBigTop",
  "big-bottom": "layoutBigBottom",
  grid: "layoutGrid",
};

const DIRECTION_LABELS: Record<string, MessageKey> = { left: "pageDirectionLeft", right: "pageDirectionRight", up: "pageDirectionUp", down: "pageDirectionDown" };

/** 转场下拉的取值：auto、类型，或 slide:方向 */
function transitionValue(page: EditorPage): string {
  const tr = page.transition;
  if (!tr) return "auto";
  return tr.type === "slide" ? `slide:${tr.direction ?? "left"}` : tr.type;
}

function parseTransition(value: string): { type: string; direction?: string } | undefined {
  if (value === "auto") return undefined;
  const [type, direction] = value.split(":");
  return direction ? { type: type!, direction } : { type: value };
}

/** “本页”面板（docs/dev-0.4.1.md 7）：按页的类型（单张、拼图、视频）显示适用的控件 */
export function PagePanel({ index, pages, actualDuration, aspect, mediaOf, ctx, onAction }: PagePanelProps) {
  const classes = useStyles();
  const { t } = useI18n();
  const page = index === null ? undefined : pages[index];
  if (index === null || !page) {
    return (
      <div className={classes.panel}>
        <p className={classes.empty}>{t("pageNone")}</p>
      </div>
    );
  }

  const count = page.items.length;
  const isVideo = ctx.isVideo(page.items[0]!.key);
  const kind = isVideo ? t("pageKindVideo") : count > 1 ? t("pageKindCollage", { count }) : t("pageKindPhoto");
  const act = (action: PageAction): void => onAction(action);
  const fixedSeconds = page.duration;
  const auto = fixedSeconds === undefined;
  const layouts = layoutsOf(page);
  const currentLayout = page.layout && layouts.includes(page.layout) ? page.layout : defaultLayout(count as 1 | 2 | 3 | 4, aspect);

  return (
    <div className={classes.panel}>
      <h2 className={classes.title}>{t("pageTitle", { page: index + 1, total: pages.length })}</h2>
      <p className={classes.kind}>{kind}</p>

      {!isVideo && (
        <fieldset className={classes.section}>
          <legend className={classes.legend}>{t("pageDuration")}</legend>
          <label className={classes.choice}>
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => act({ kind: "duration", index, seconds: event.target.checked ? undefined : actualDuration, at: Date.now() })}
            />{" "}
            {t("pageDurationAuto")}
          </label>
          {fixedSeconds !== undefined && (
            <>
              <input
                className={classes.slider}
                type="range"
                min={MIN_PAGE_SECONDS}
                max={MAX_PAGE_SECONDS}
                step={PAGE_SECONDS_STEP}
                value={fixedSeconds}
                aria-label={t("pageDuration")}
                onChange={(event) => act({ kind: "duration", index, seconds: Number(event.target.value), at: Date.now() })}
              />
              <span className={classes.value}>{t("pageDurationValue", { seconds: fixedSeconds })}</span>
            </>
          )}
        </fieldset>
      )}

      <fieldset className={classes.section}>
        <legend className={classes.legend}>{t("pageTransition")}</legend>
        {index === 0 ? (
          <p className={classes.hint}>{t("pageTransitionFirst")}</p>
        ) : (
          <select className={classes.select} value={transitionValue(page)} aria-label={t("pageTransition")} onChange={(event) => act({ kind: "transition", index, transition: parseTransition(event.target.value) })}>
            <option value="auto">{t("pageTransitionAuto")}</option>
            <option value="fade">{t("makerTransitionFade")}</option>
            {Object.entries(DIRECTION_LABELS).map(([direction, label]) => (
              <option key={direction} value={`slide:${direction}`}>
                {t("makerTransitionSlide")} · {t(label)}
              </option>
            ))}
            <option value="zoom">{t("makerTransitionZoom")}</option>
            <option value="rotate">{t("makerTransitionRotate")}</option>
          </select>
        )}
      </fieldset>

      {count > 1 && (
        <fieldset className={classes.section}>
          <legend className={classes.legend}>{t("pageLayout")}</legend>
          <select className={classes.select} value={currentLayout} aria-label={t("pageLayout")} onChange={(event) => act({ kind: "layout", index, layout: event.target.value })}>
            {layouts.map((id) => (
              <option key={id} value={id}>
                {t(LAYOUT_LABELS[id] ?? "layoutFull")}
              </option>
            ))}
          </select>
        </fieldset>
      )}

      {!isVideo && (
        <fieldset className={classes.section}>
          <legend className={classes.legend}>{t("pagePhotos")}</legend>
          {page.items.map((item, position) => {
            const info = mediaOf(item.key);
            const name = info?.name ?? "";
            return (
              <div key={item.key} className={classes.item}>
                <div className={classes.itemHead}>
                  {info && <img className={classes.thumb} src={info.url} alt="" />}
                  <span className={classes.name}>{name}</span>
                  {count > 1 && position === 0 && <span className={classes.tag}>{t("pagePhotoBig")}</span>}
                </div>
                <label className={classes.choice}>
                  {t("pageFit")}
                  <select
                    className={classes.select}
                    value={item.fit ?? "auto"}
                    aria-label={`${t("pageFit")} ${name}`}
                    onChange={(event) => act({ kind: "fit", index, item: position, fit: event.target.value === "auto" ? undefined : (event.target.value as "cover" | "contain") })}
                  >
                    <option value="auto">{t("pageFitAuto")}</option>
                    <option value="cover">{t("pageFitCover")}</option>
                    <option value="contain">{t("pageFitContain")}</option>
                  </select>
                </label>
                <div className={classes.row}>
                  {count > 1 && (
                    <>
                      <button className={classes.small} disabled={position === 0} aria-label={t("pageItemUp", { name })} onClick={() => act({ kind: "moveItem", index, from: position, to: position - 1 })}>
                        ↑
                      </button>
                      <button className={classes.small} disabled={position === count - 1} aria-label={t("pageItemDown", { name })} onClick={() => act({ kind: "moveItem", index, from: position, to: position + 1 })}>
                        ↓
                      </button>
                    </>
                  )}
                  <button className={classes.small} disabled={movePhoto(pages, ctx, index, position, -1) === null} onClick={() => act({ kind: "movePhoto", index, item: position, direction: -1 })}>
                    {t("pageToPrev")}
                  </button>
                  <button className={classes.small} disabled={movePhoto(pages, ctx, index, position, 1) === null} onClick={() => act({ kind: "movePhoto", index, item: position, direction: 1 })}>
                    {t("pageToNext")}
                  </button>
                  {count > 1 && (
                    <button className={classes.small} onClick={() => act({ kind: "split", index, item: position })}>
                      {t("pageSplit")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </fieldset>
      )}

      <fieldset className={classes.section}>
        <legend className={classes.legend}>{t("pageActions")}</legend>
        <div className={classes.row}>
          <button className={classes.small} disabled={index === 0} onClick={() => act({ kind: "movePage", from: index, to: index - 1 })}>
            {t("pageMoveEarlier")}
          </button>
          <button className={classes.small} disabled={index === pages.length - 1} onClick={() => act({ kind: "movePage", from: index, to: index + 1 })}>
            {t("pageMoveLater")}
          </button>
          <button className={classes.small} disabled={mergeWithNext(pages, ctx, index) === null} onClick={() => act({ kind: "merge", index })}>
            {t("pageMerge")}
          </button>
          <button className={`${classes.small} ${classes.danger}`} onClick={() => act({ kind: "removePage", index })}>
            {t("pageDelete")}
          </button>
        </div>
        <p className={classes.hint}>{t("pageDeleteNote")}</p>
      </fieldset>
    </div>
  );
}
