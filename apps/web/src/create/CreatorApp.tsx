import { useEffect, useRef, useState, type DragEvent } from "react";
import { createUseStyles } from "react-jss";
import { GENERATOR_LIMITS, GenerateError, TEMPLATES, defaultAspectRatio, type AspectRatio, type Manifest } from "@qyplayer/core";
import { MediaFormatError } from "@qyplayer/qyp/inspect";
import { PACKAGE_LIMITS, QypError, openPackage } from "@qyplayer/qyp";
import { isDesktop, saveBlob } from "../desktop";
import { describeError } from "../messages";
import { PlaybackController } from "../player/PlaybackController";
import { PlayerView } from "../PlayerView";
import { buildPackage, type MusicEntry } from "./buildPackage";
import { BUILTIN_MUSIC_TITLE, loadBuiltinMusic } from "./builtinMusic";
import { formatBytes, formatDuration, moveItem, removeItem, safeFileName, sortByCapturedAt } from "./files";
import { ImportError, importMedia, importMusic } from "./importers";
import { MediaList, type LibraryItem } from "./MediaList";

const useStyles = createUseStyles({
  "@global": {
    "html, body, #root": { margin: 0, minHeight: "100%" },
    body: { background: "#0b0b0d", color: "#eee", fontFamily: "system-ui, 'Microsoft YaHei', sans-serif" },
  },
  page: { maxWidth: 880, margin: "0 auto", padding: "24px 16px 48px", boxSizing: "border-box" },
  dragging: { outline: "2px dashed #6ea8ff", outlineOffset: -8 },
  header: { display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", "& h1": { margin: 0, fontSize: 26 }, "& a": { color: "#6ea8ff" } },
  note: { color: "#aaa", margin: "6px 0 20px" },
  section: { margin: "0 0 24px", "& h2": { fontSize: 18, margin: "0 0 10px" } },
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap", color: "#aaa" },
  empty: { padding: "28px 12px", textAlign: "center", border: "2px dashed #444", borderRadius: 8, color: "#aaa" },
  failures: { margin: "10px 0 0", padding: "8px 12px", borderRadius: 6, background: "rgba(220, 60, 60, 0.15)", color: "#ff9a9a", fontSize: 14 },
  failureList: { margin: "4px 0 0", paddingLeft: 18 },
  grid: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center", "@media (max-width: 520px)": { gridTemplateColumns: "1fr" } },
  input: { padding: "6px 8px", borderRadius: 4, border: "1px solid #444", background: "#17171b", color: "#eee", font: "inherit", maxWidth: "100%", boxSizing: "border-box" },
  choices: { display: "flex", flexDirection: "column", gap: 6 },
  hint: { fontSize: 13, color: "#999" },
  primary: { padding: "10px 28px", border: "none", borderRadius: 6, background: "#3b82f6", color: "#fff", fontSize: 16, cursor: "pointer", "&:disabled": { opacity: 0.4, cursor: "default" } },
  button: {
    padding: "6px 14px", border: "1px solid #444", borderRadius: 4, background: "#222", color: "#eee", cursor: "pointer", font: "inherit",
    "&:hover:not(:disabled)": { background: "#333" },
    "&:disabled": { opacity: 0.4, cursor: "default" },
  },
  error: { margin: "12px 0 0", padding: "10px 14px", borderRadius: 6, background: "rgba(220, 60, 60, 0.15)", color: "#ff9a9a", whiteSpace: "pre-line" },
  preview: { height: "min(68vh, 640px)", borderRadius: 8, overflow: "hidden", border: "1px solid #222" },
  actions: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "14px 0" },
});

type MusicChoice = "none" | "builtin" | "custom";
type AspectChoice = "auto" | AspectRatio;

interface ImportFailure {
  fileName: string;
  message: string;
}

interface PreviewResult {
  controller: PlaybackController;
  blob: Blob;
  manifest: Manifest;
}

/** 导入出错时给用户看的说明；MediaFormatError 的消息已带文件名 */
function describeImportError(file: File, error: unknown): ImportFailure {
  if (error instanceof MediaFormatError) return { fileName: file.name, message: error.message };
  const reason = error instanceof Error ? error.message : String(error);
  return { fileName: file.name, message: `${file.name}：${reason}` };
}

function describeBuildError(error: unknown): string {
  if (error instanceof GenerateError) {
    switch (error.code) {
      case "no-media":
        return "请先添加至少一个照片或视频。";
      case "too-many-media":
        return `一部影片最多 ${GENERATOR_LIMITS.maxMedia} 个素材，请删除一些。`;
      default:
        return `生成失败：${error.message}`;
    }
  }
  if (error instanceof QypError) return describeError(error);
  return `生成失败：${error instanceof Error ? error.message : String(error)}`;
}

/** 制作页：选素材、调顺序、选模板和配乐，生成 .qyp 并在页内预览、下载。所有处理都在本机完成。 */
export function CreatorApp() {
  const classes = useStyles();
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
  const [buildError, setBuildError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [dragging, setDragging] = useState(false);

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
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const hasVideoSound = items.some((i) => i.entry.type === "video" && i.entry.hasAudio);

  const addFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0 || busy) return;
    setImporting({ done: 0, total: files.length });
    const added: LibraryItem[] = [];
    const failed: ImportFailure[] = [];
    let count = items.length;
    let bytes = totalBytes;
    for (const [index, file] of files.entries()) {
      try {
        if (count >= GENERATOR_LIMITS.maxMedia) throw new ImportError(`一部影片最多 ${GENERATOR_LIMITS.maxMedia} 个素材`);
        const entry = await importMedia(file);
        if (bytes + entry.blob.size > PACKAGE_LIMITS.maxUncompressedBytes) throw new ImportError("素材总大小超过上限（2 GB）");
        added.push({ key: nextKey.current++, entry, url: URL.createObjectURL(entry.blob) });
        count++;
        bytes += entry.blob.size;
      } catch (error) {
        failed.push(describeImportError(file, error));
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
      setBuildError(null);
    } catch (error) {
      setBuildError(error instanceof MediaFormatError ? error.message : `${file.name}：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const resolveMusic = async (): Promise<MusicEntry | undefined> => {
    if (musicChoice === "custom") {
      if (!customMusic) throw new Error("请先选择要导入的音乐文件");
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
    setBuildError(null);
    try {
      const music = await resolveMusic();
      const built = await buildPackage({
        media: items.map((i) => i.entry),
        ...(music && { music }),
        ...(aspect !== "auto" && { aspectRatio: aspect }),
        templateId,
        seed: useSeed,
        title,
      });
      const controller = await PlaybackController.create(await openPackage(built.blob));
      setResult((previous) => {
        previous?.controller.dispose();
        return { controller, blob: built.blob, manifest: built.manifest };
      });
      setSeed(useSeed);
    } catch (error) {
      setBuildError(describeBuildError(error));
    } finally {
      setBuilding(false);
    }
  };

  const backToEditing = (): void => {
    result?.controller.dispose();
    setResult(null);
  };

  if (result) {
    return (
      <div className={classes.page}>
        <div className={classes.header}>
          <h1>{result.manifest.title}</h1>
        </div>
        <p className={classes.note}>
          {formatDuration(result.manifest.duration)} · {result.manifest.pages.length} 页 · {formatBytes(result.blob.size)} · 模板“{template.name.zh}”· 第 {seed} 版
        </p>
        <div className={classes.preview}>
          <PlayerView controller={result.controller} onClose={backToEditing} />
        </div>
        <div className={classes.actions}>
          <button className={classes.primary} onClick={() => void saveBlob(result.blob, safeFileName(result.manifest.title)).catch((e: unknown) => setBuildError(`保存失败：${e instanceof Error ? e.message : String(e)}`))}>
            下载 .qyp
          </button>
          <button className={classes.button} disabled={building} onClick={() => void generate(seed + 1)}>
            {building ? "正在生成…" : "换一版"}
          </button>
          <button className={classes.button} onClick={backToEditing}>
            返回修改
          </button>
        </div>
        {buildError && <div className={classes.error} role="alert">{buildError}</div>}
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
      <div className={classes.header}>
        <h1>制作影片</h1>
        {!isDesktop() && <a href="./">← 回到播放器</a>}
      </div>
      <p className={classes.note}>选好照片和视频，自动生成回忆影片并保存为 .qyp 文件。文件只在本机处理，不会上传。</p>

      <section className={classes.section}>
        <h2>1. 素材</h2>
        <div className={classes.toolbar}>
          <button className={classes.button} disabled={busy} onClick={() => mediaInput.current?.click()}>
            添加照片或视频
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
          <span>
            {items.length} / {GENERATOR_LIMITS.maxMedia} 个 · {formatBytes(totalBytes)}
          </span>
          {importing && <span role="status">正在处理 {importing.done} / {importing.total}…</span>}
        </div>
        {items.length === 0 ? (
          <div className={classes.empty}>把照片或视频拖到这里，或点上面的按钮添加。照片支持浏览器能打开的格式，视频仅支持 H.264 编码的 MP4。</div>
        ) : (
          <>
            <MediaList items={items} disabled={busy} onMove={(index, delta) => setItems(moveItem(items, index, delta))} onRemove={remove} />
            <p className={classes.hint}>影片按这个顺序生成。新添加的素材按文件修改时间排在末尾。</p>
          </>
        )}
        {failures.length > 0 && (
          <div className={classes.failures} role="alert">
            有 {failures.length} 个文件没能添加：
            <ul className={classes.failureList}>
              {failures.map((f, i) => (
                <li key={i}>{f.message}</li>
              ))}
            </ul>
            <button className={classes.button} onClick={() => setFailures([])}>
              知道了
            </button>
          </div>
        )}
      </section>

      <section className={classes.section}>
        <h2>2. 设置</h2>
        <div className={classes.grid}>
          <label htmlFor="aspect">画面比例</label>
          <select id="aspect" className={classes.input} value={aspect} onChange={(e) => setAspect(e.target.value as AspectChoice)}>
            <option value="auto">自动（当前：{resolvedAspect === "16:9" ? "横屏 16:9" : "竖屏 9:16"}）</option>
            <option value="16:9">横屏 16:9</option>
            <option value="9:16">竖屏 9:16</option>
          </select>

          <label htmlFor="template">风格模板</label>
          <div>
            <select id="template" className={classes.input} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.zh}
                </option>
              ))}
            </select>
            <div className={classes.hint}>{template.description.zh}</div>
          </div>

          <label htmlFor="title">标题</label>
          <input id="title" className={classes.input} value={title} maxLength={100} placeholder="留空则用“最早拍摄日期 + 回忆”" onChange={(e) => setTitle(e.target.value)} />

          <span>配乐</span>
          <div className={classes.choices}>
            <label>
              <input type="radio" name="music" checked={musicChoice === "none"} onChange={() => setMusicChoice("none")} /> 不用配乐（视频播放自带声音）
            </label>
            <label>
              <input type="radio" name="music" checked={musicChoice === "builtin"} onChange={() => setMusicChoice("builtin")} /> 内置配乐：{BUILTIN_MUSIC_TITLE}，CC0
            </label>
            <label>
              <input type="radio" name="music" checked={musicChoice === "custom"} disabled={!customMusic} onChange={() => setMusicChoice("custom")} /> 导入音乐
              {customMusic ? `：${customMusic.title}（${formatDuration(customMusic.duration)}）` : ""}
            </label>
            <div>
              <button className={classes.button} onClick={() => musicInput.current?.click()}>
                选择 MP3 或 M4A 文件
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
            {musicChoice !== "none" && hasVideoSound && <div className={classes.hint}>选了配乐后，视频的原声会静音。</div>}
          </div>
        </div>
      </section>

      <div className={classes.actions}>
        <button className={classes.primary} disabled={items.length === 0 || busy} onClick={() => void generate(seed)}>
          {building ? "正在生成…" : "生成影片"}
        </button>
      </div>
      {buildError && <div className={classes.error} role="alert">{buildError}</div>}
    </div>
  );
}
