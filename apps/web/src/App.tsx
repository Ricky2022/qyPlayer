import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { createUseStyles } from "react-jss";
import { openPackage } from "@qyplayer/qyp";
import { describeError } from "./messages";
import { PlaybackController } from "./player/PlaybackController";
import { PlayerView } from "./PlayerView";

const useStyles = createUseStyles({
  "@global": {
    "html, body, #root": { height: "100%", margin: 0 },
    body: { background: "#0b0b0d", color: "#eee", fontFamily: "system-ui, 'Microsoft YaHei', sans-serif" },
  },
  home: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" },
  drop: {
    width: "min(560px, 100%)", padding: "56px 24px", textAlign: "center", border: "2px dashed #555", borderRadius: 12,
    "& h1": { margin: "0 0 8px", fontSize: 28 },
    "& p": { margin: "6px 0", color: "#aaa" },
  },
  dragging: { borderColor: "#6ea8ff", background: "rgba(110, 168, 255, 0.08)" },
  pick: {
    marginTop: 16, padding: "8px 20px", border: "none", borderRadius: 6, background: "#3b82f6", color: "#fff",
    fontSize: 15, cursor: "pointer",
  },
  samples: { marginTop: 24, color: "#aaa", fontSize: 14, "& button": { margin: "0 4px" } },
  sample: {
    padding: "4px 12px", border: "1px solid #444", borderRadius: 4, background: "#222", color: "#eee", fontSize: 14, cursor: "pointer",
    "&:hover:not(:disabled)": { background: "#333" },
    "&:disabled": { opacity: 0.5, cursor: "default" },
  },
  create: { marginTop: 16, "& a": { color: "#6ea8ff" } },
  error: { marginTop: 16, padding: "10px 14px", borderRadius: 6, background: "rgba(220, 60, 60, 0.15)", color: "#ff9a9a", textAlign: "left", whiteSpace: "pre-line" },
});

/** 随站点发布在 samples/ 下的示例包（由 fixtures:build 生成，部署时从 GitHub Release 取回） */
const SAMPLE_PACKAGES = [
  { file: "sample-16x9.qyp", label: "横屏，配乐" },
  { file: "sample-9x16.qyp", label: "竖屏，配乐" },
  { file: "sample-video-sound-16x9.qyp", label: "横屏，视频原声" },
] as const;

interface AppProps {
  /** 开发用：启动时自动打开的包（如 ?demo） */
  initialSource?: () => Promise<Blob>;
}

export function App({ initialSource }: AppProps) {
  const classes = useStyles();
  const [controller, setController] = useState<PlaybackController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (source: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const next = await PlaybackController.create(await openPackage(source));
      // 开发时在控制台和自动化测试里检查内部状态用
      if (import.meta.env.DEV) (window as unknown as { __qy?: PlaybackController }).__qy = next;
      setController((previous) => {
        previous?.dispose();
        return next;
      });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (initialSource) void initialSource().then(open, (e: unknown) => setError(describeError(e)));
  }, [initialSource, open]);

  const openSample = async (file: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(new URL(`samples/${file}`, document.baseURI));
      if (!response.ok) throw new Error(`示例文件不可用（HTTP ${response.status}）`);
      await open(await response.blob());
    } catch (e) {
      setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "示例文件下载失败，请检查网络");
      setBusy(false);
    }
  };

  const close = (): void => {
    controller?.dispose();
    setController(null);
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void open(file);
  };

  if (controller) return <PlayerView controller={controller} onClose={close} />;

  return (
    <div className={classes.home} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className={`${classes.drop} ${dragging ? classes.dragging : ""}`}>
        <h1>qyPlayer</h1>
        <p>把 .qyp 文件拖到这里，或点击下方按钮选择文件。</p>
        <p>文件只在本机读取，不会上传。</p>
        <input
          ref={inputRef}
          type="file"
          accept=".qyp,application/zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void open(file);
          }}
        />
        <button className={classes.pick} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "正在打开…" : "选择 .qyp 文件"}
        </button>
        <div className={classes.samples}>
          没有 .qyp 文件？试看示例：
          {SAMPLE_PACKAGES.map((sample) => (
            <button key={sample.file} className={classes.sample} disabled={busy} onClick={() => void openSample(sample.file)}>
              {sample.label}
            </button>
          ))}
        </div>
        <div className={classes.create}>
          想自己做一个？<a href="create.html">制作影片</a>
        </div>
        {error && <div className={classes.error} role="alert">{error}</div>}
      </div>
    </div>
  );
}
