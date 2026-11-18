import { useEffect, useRef, useState, type DragEvent } from "react";
import { createUseStyles } from "react-jss";
import { GENERATOR_LIMITS, TEMPLATES, defaultAspectRatio, type AspectRatio, type Manifest } from "@qyplayer/core";
import { PACKAGE_LIMITS, openPackage } from "@qyplayer/qyp";
import { AboutDialog } from "../AboutDialog";
import { isDesktop, saveBlob } from "../desktop";
import { useI18n, type Translate } from "../i18n";
import { PlaybackController } from "../player/PlaybackController";
import { PlayerView } from "../PlayerView";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { Logo } from "../ui/Logo";
import { InfoIcon } from "../ui/icons";
import { theme } from "../ui/theme";
import { buildPackage, type MusicEntry } from "./buildPackage";
import { BUILTIN_MUSIC_TITLE, BUILTIN_MUSIC_TITLE_EN } from "./builtinMusicInfo";
import { loadBuiltinMusic } from "./builtinMusic";
import { describeBuildError, describeFileError } from "./describe";
import { formatBytes, formatDuration, moveItem, removeItem, safeFileName, sortByCapturedAt } from "./files";
import { ImportError, importMedia, importMusic } from "./importers";
import { MediaList, type LibraryItem } from "./MediaList";

const useStyles = createUseStyles({
  "@global": {
    "html, body, #root": { margin: 0, minHeight: "100%" },
    body: { background: theme.bg, color: theme.text, fontFamily: theme.font, colorScheme: "dark" },
  },
  page: { maxWidth: 880, margin: "0 auto", padding: "20px 16px 48px", boxSizing: "border-box" },
  dragging: { outline: `2px dashed ${theme.accent}`, outlineOffset: -8 },
  header: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { margin: 0, fontSize: 24, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  link: { color: theme.accent, fontSize: 14 },
  tool: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: `1px solid ${theme.border}`, borderRadius: 999,
    background: "transparent", color: theme.text, font: "inherit", fontSize: 14, cursor: "pointer",
    "&:hover": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  note: { color: theme.muted, margin: "10px 0 22px" },
  section: { margin: "0 0 24px", "& h2": { fontSize: 18, margin: "0 0 10px" } },
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap", color: theme.muted },
  empty: { padding: "28px 12px", textAlign: "center", border: `2px dashed ${theme.border}`, borderRadius: 10, color: theme.muted },
  failures: { margin: "10px 0 0", padding: "8px 12px", borderRadius: 8, background: theme.dangerBg, color: theme.danger, fontSize: 14 },
  failureList: { margin: "4px 0 8px", paddingLeft: 18 },
  grid: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center", "@media (max-width: 520px)": { gridTemplateColumns: "1fr" } },
  input: { padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, font: "inherit", maxWidth: "100%", boxSizing: "border-box" },
  choices: { display: "flex", flexDirection: "column", gap: 6 },
  hint: { fontSize: 13, color: theme.muted },
  primary: {
    padding: "10px 28px", border: "none", borderRadius: 999, background: theme.accent, color: theme.onAccent, fontSize: 16, fontWeight: 600, cursor: "pointer",
    "&:hover:not(:disabled)": { background: "#67d0fb" },
    "&:disabled": { opacity: 0.4, cursor: "default" },
  },
  button: {
    padding: "6px 14px", border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.surface, color: theme.text, cursor: "pointer", font: "inherit",
    "&:hover:not(:disabled)": { background: theme.surfaceHover },
    "&:disabled": { opacity: 0.4, cursor: "default" },
  },
  error: { margin: "12px 0 0", padding: "10px 14px", borderRadius: 8, background: theme.dangerBg, color: theme.danger, whiteSpace: "pre-line" },
  preview: { height: "min(68vh, 640px)", borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.border}` },
  actions: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "14px 0" },
});

type MusicChoice = "none" | "builtin" | "custom";
type AspectChoice = "auto" | AspectRatio;

interface ImportFailure {
  fileName: string;
  error: unknown;
}

/** 生成、保存、导入音乐时的错误；保存原始错误，显示时再按当前语言翻译 */
type Problem = { kind: "build" | "save"; error: unknown } | { kind: "music"; fileName: string; error: unknown };

function describeProblem(problem: Problem, t: Translate): string {
  switch (problem.kind) {
    case "build":
      return describeBuildError(problem.error, t);
    case "save":
      return t("makerSaveFailed", { detail: problem.error instanceof Error ? problem.error.message : String(problem.error) });
    case "music":
      return describeFileError(problem.fileName, problem.error, t);
  }
}

interface PreviewResult {
  controller: PlaybackController;
  blob: Blob;
  manifest: Manifest;
}

/** 制作页：选素材、调顺序、选模板和配乐，生成 .qyp 并在页内预览、保存。所有处理都在本机完成。 */
export function CreatorApp() {
  const classes = useStyles();
  const { lang, t } = useI18n();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [failures, setFailures] = useState<ImportFailure[]>([]);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [aspect, setAspect] = useState<AspectChoice>("auto");
  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [title, setTitle] = useState("");
  const [musicChoice, setMusicChoice] = useState<MusicChoice>("none");
  const [customMusic, setCustomMusic] = useState<MusicEntry | null>(null);
  const [builtinMusic, setBuiltinMusic] = useState<MusicEntry | null>(null);
  const [seed, setSeed] = useState(1);
  const [building, setBuilding] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const nextKey = useRef(1);
  const mediaInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const resultRef = useRef(result);
  resultRef.current = result;

  // 离开页面时释放缩略图 URL 和播放器
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      resultRef.current?.controller.dispose();
    },
    [],
  );

  const busy = importing !== null || building;
  const totalBytes = items.reduce((sum, item) => sum + item.entry.blob.size, 0);
  const resolvedAspect: AspectRatio = aspect === "auto" ? defaultAspectRatio(items.map((i) => i.entry)) : aspect;
  const template = TEMPLATES.find((tpl) => tpl.id === templateId)!;
  const hasVideoSound = items.some((i) => i.entry.type === "video" && i.entry.hasAudio);
  const problemText = problem ? describeProblem(problem, t) : null;

  const addFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0 || busy) return;
    setImporting({ done: 0, total: files.length });
    const added: LibraryItem[] = [];
    const failed: ImportFailure[] = [];
    let count = items.length;
    let bytes = totalBytes;
    for (const [index, file] of files.entries()) {
      try {
        if (count >= GENERATOR_LIMITS.maxMedia) throw new ImportError("too-many");
        const entry = await importMedia(file);
        if (bytes + entry.blob.size > PACKAGE_LIMITS.maxUncompressedBytes) throw new ImportError("too-large");
        added.push({ key: nextKey.current++, entry, url: URL.createObjectURL(entry.blob) });
        count++;
        bytes += entry.blob.size;
      } catch (error) {
        failed.push({ fileName: file.name, error });
      }
      setImporting({ done: index + 1, total: files.length });
    }
    // 只对这一批按拍摄时间排序后接在末尾，已有的手动顺序不动
    const sortedBatch = sortByCapturedAt(added, (item) => item.entry);
    setItems((previous) => [...previous, ...sortedBatch]);
    setFailures((previous) => [...previous, ...failed]);
    setImporting(null);
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    setDragging(false);
    void addFiles([...event.dataTransfer.files]);
  };

  const remove = (index: number): void => {
    const removed = items[index];
    if (removed) URL.revokeObjectURL(removed.url);
    setItems(removeItem(items, index));
  };

  const pickCustomMusic = async (file: File): Promise<void> => {
    try {
      setCustomMusic(await importMusic(file));
      setMusicChoice("custom");
      setProblem(null);
    } catch (error) {
      setProblem({ kind: "music", fileName: file.name, error });
    }
  };

  const resolveMusic = async (): Promise<MusicEntry | undefined> => {
    if (musicChoice === "custom") {
      if (!customMusic) throw new ImportError("music-not-picked");
      return customMusic;
    }
    if (musicChoice === "builtin") {
      const music = builtinMusic ?? (await loadBuiltinMusic());
      setBuiltinMusic(music);
      return music;
    }
    return undefined;
  };

  const generate = async (useSeed: number): Promise<void> => {
    setBuilding(true);
    setProblem(null);
    try {
      const music = await resolveMusic();
      const built = await buildPackage({
        media: items.map((i) => i.entry),
        ...(music && { music }),
        ...(aspect !== "auto" && { aspectRatio: aspect }),
        templateId,
        seed: useSeed,
        title,
        defaultTitleWord: t("defaultTitleWord"),
      });
      const controller = await PlaybackController.create(await openPackage(built.blob));
      setResult((previous) => {
        previous?.controller.dispose();
        return { controller, blob: built.blob, manifest: built.manifest };
      });
      setSeed(useSeed);
    } catch (error) {
      setProblem({ kind: "build", error });
    } finally {
      setBuilding(false);
    }
  };

  const backToEditing = (): void => {
    result?.controller.dispose();
    setResult(null);
  };

  const header = (
    <div className={classes.header}>
      <Logo size={36} kind="maker" />
      <h1 className={classes.title}>{t("makerName")}</h1>
      {!isDesktop() && !result && (
        <a className={classes.link} href="./">
          {t("makerBackToPlayer")}
        </a>
      )}
      <LanguageSwitch />
      <button className={classes.tool} onClick={() => setAboutOpen(true)}>
        <InfoIcon size={18} />
        {t("about")}
      </button>
    </div>
  );
  const about = aboutOpen && <AboutDialog kind="maker" onClose={() => setAboutOpen(false)} />;

  if (result) {
    return (
      <div className={classes.page}>
        {header}
        <p className={classes.note}>
          {result.manifest.title} ·{" "}
          {t("makerResultMeta", {
            duration: formatDuration(result.manifest.duration),
            pages: result.manifest.pages.length,
            size: formatBytes(result.blob.size),
            template: template.name[lang],
            seed,
          })}
        </p>
        <div className={classes.preview}>
          <PlayerView controller={result.controller} onClose={backToEditing} />
        </div>
        <div className={classes.actions}>
          <button
            className={classes.primary}
            onClick={() => void saveBlob(result.blob, safeFileName(result.manifest.title, t("defaultTitleWord"))).catch((error: unknown) => setProblem({ kind: "save", error }))}
          >
            {isDesktop() ? t("makerSave") : t("makerDownload")}
          </button>
          <button className={classes.button} disabled={building} onClick={() => void generate(seed + 1)}>
            {building ? t("makerGenerating") : t("makerAnother")}
          </button>
          <button className={classes.button} onClick={backToEditing}>
            {t("makerBackToEdit")}
          </button>
        </div>
        {problemText && <div className={classes.error} role="alert">{problemText}</div>}
        {about}
      </div>
    );
  }

  return (
    <div
      className={`${classes.page} ${dragging ? classes.dragging : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {header}
      <p className={classes.note}>{t("makerNote")}</p>

      <section className={classes.section}>
        <h2>{t("makerSectionMedia")}</h2>
        <div className={classes.toolbar}>
          <button className={classes.button} disabled={busy} onClick={() => mediaInput.current?.click()}>
            {t("makerAdd")}
          </button>
          <input
            ref={mediaInput}
            type="file"
            multiple
            hidden
            accept="image/*,.heic,.heif,.mp4,.m4v,video/mp4"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void addFiles(files);
            }}
          />
          <span>{t("makerCount", { count: items.length, max: GENERATOR_LIMITS.maxMedia, size: formatBytes(totalBytes) })}</span>
          {importing && <span role="status">{t("makerImporting", importing)}</span>}
        </div>
        {items.length === 0 ? (
          <div className={classes.empty}>{t("makerEmpty")}</div>
        ) : (
          <>
            <MediaList items={items} disabled={busy} onMove={(index, delta) => setItems(moveItem(items, index, delta))} onRemove={remove} />
            <p className={classes.hint}>{t("makerOrderHint")}</p>
          </>
        )}
        {failures.length > 0 && (
          <div className={classes.failures} role="alert">
            {t("makerFailedSome", { count: failures.length })}
            <ul className={classes.failureList}>
              {failures.map((f, i) => (
                <li key={i}>{describeFileError(f.fileName, f.error, t)}</li>
              ))}
            </ul>
            <button className={classes.button} onClick={() => setFailures([])}>
              {t("makerGotIt")}
            </button>
          </div>
        )}
      </section>

      <section className={classes.section}>
        <h2>{t("makerSectionSettings")}</h2>
        <div className={classes.grid}>
          <label htmlFor="aspect">{t("makerAspect")}</label>
          <select id="aspect" className={classes.input} value={aspect} onChange={(e) => setAspect(e.target.value as AspectChoice)}>
            <option value="auto">{t("makerAspectAuto", { ratio: resolvedAspect === "16:9" ? t("makerLandscape") : t("makerPortrait") })}</option>
            <option value="16:9">{t("makerLandscape")}</option>
            <option value="9:16">{t("makerPortrait")}</option>
          </select>

          <label htmlFor="template">{t("makerTemplate")}</label>
          <div>
            <select id="template" className={classes.input} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name[lang]}
                </option>
              ))}
            </select>
            <div className={classes.hint}>{template.description[lang]}</div>
          </div>

          <label htmlFor="title">{t("makerTitle")}</label>
          <input id="title" className={classes.input} value={title} maxLength={100} placeholder={t("makerTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />

          <span>{t("makerMusic")}</span>
          <div className={classes.choices}>
            <label>
              <input type="radio" name="music" checked={musicChoice === "none"} onChange={() => setMusicChoice("none")} /> {t("makerMusicNone")}
            </label>
            <label>
              <input type="radio" name="music" checked={musicChoice === "builtin"} onChange={() => setMusicChoice("builtin")} />{" "}
              {t("makerMusicBuiltin", { title: lang === "zh" ? BUILTIN_MUSIC_TITLE : BUILTIN_MUSIC_TITLE_EN })}
            </label>
            <label>
              <input type="radio" name="music" checked={musicChoice === "custom"} disabled={!customMusic} onChange={() => setMusicChoice("custom")} /> {t("makerMusicCustom")}
              {customMusic ? t("makerMusicCustomPicked", { title: customMusic.title ?? "", duration: formatDuration(customMusic.duration) }) : ""}
            </label>
            <div>
              <button className={classes.button} onClick={() => musicInput.current?.click()}>
                {t("makerPickMusic")}
              </button>
              <input
                ref={musicInput}
                type="file"
                hidden
                accept=".mp3,.m4a,audio/mpeg,audio/mp4"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickCustomMusic(file);
                }}
              />
            </div>
            {musicChoice !== "none" && hasVideoSound && <div className={classes.hint}>{t("makerMuteNote")}</div>}
          </div>
        </div>
      </section>

      <div className={classes.actions}>
        <button className={classes.primary} disabled={items.length === 0 || busy} onClick={() => void generate(seed)}>
          {building ? t("makerGenerating") : t("makerGenerate")}
        </button>
      </div>
      {problemText && <div className={classes.error} role="alert">{problemText}</div>}
      {about}
    </div>
  );
}
