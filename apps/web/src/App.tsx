import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { createUseStyles } from "react-jss";
import { listen } from "@tauri-apps/api/event";
import { openPackage } from "@qyplayer/qyp";
import type { ByteSource } from "@qyplayer/qyp";
import { AboutDialog } from "./AboutDialog";
import { RECEIVED_FILE_EVENT, isDesktop, readInitialFile, shellFile } from "./desktop";
import { useI18n, type MessageKey } from "./i18n";
import { describeError } from "./messages";
import { PlaybackController } from "./player/PlaybackController";
import { PlayerView } from "./PlayerView";
import { LanguageSwitch } from "./ui/LanguageSwitch";
import { Logo } from "./ui/Logo";
import { InfoIcon } from "./ui/icons";
import { theme } from "./ui/theme";

const useStyles = createUseStyles({
  "@global": {
    "html, body, #root": { height: "100%", margin: 0 },
    body: { background: theme.bg, color: theme.text, fontFamily: theme.font, colorScheme: "dark" },
  },
  home: {
    position: "relative", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "auto",
    background: "radial-gradient(900px 520px at 50% 28%, rgba(56, 189, 248, 0.13), transparent 70%), " + theme.bg,
  },
  topbar: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 18px" },
  tool: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: `1px solid ${theme.border}`, borderRadius: 999,
    background: "transparent", color: theme.text, font: "inherit", fontSize: 14, cursor: "pointer",
    "&:hover": { background: theme.surfaceHover },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  hero: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 56px", textAlign: "center" },
  name: { margin: "20px 0 6px", fontSize: 38, fontWeight: 700, letterSpacing: 0.5 },
  tagline: { margin: 0, color: theme.muted, fontSize: 17 },
  open: {
    marginTop: 32, padding: "14px 40px", border: "none", borderRadius: 999, background: theme.accent, color: theme.onAccent,
    font: "inherit", fontSize: 17, fontWeight: 600, cursor: "pointer", boxShadow: "0 8px 28px rgba(14, 165, 233, 0.35)", transition: "transform 0.12s, background 0.12s",
    "&:hover:not(:disabled)": { background: "#67d0fb", transform: "translateY(-1px)" },
    "&:focus-visible": { outline: `3px solid #fff`, outlineOffset: 3 },
    "&:disabled": { opacity: 0.6, cursor: "default" },
  },
  hint: { margin: "18px 0 0", color: theme.muted, fontSize: 14 },
  privacy: { margin: "4px 0 0", color: theme.muted, fontSize: 13 },
  samples: { marginTop: 28, color: theme.muted, fontSize: 14, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8 },
  sample: {
    padding: "5px 14px", border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.surface, color: theme.text, font: "inherit", fontSize: 14, cursor: "pointer",
    "&:hover:not(:disabled)": { background: theme.surfaceHover },
    "&:disabled": { opacity: 0.5, cursor: "default" },
  },
  make: { marginTop: 16, color: theme.muted, fontSize: 14, "& a": { color: theme.accent } },
  error: {
    maxWidth: 520, marginTop: 20, padding: "10px 14px", borderRadius: 8, background: theme.dangerBg, color: theme.danger, textAlign: "left", whiteSpace: "pre-line", fontSize: 14,
  },
  dropOverlay: {
    position: "absolute", inset: 12, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", border: `2px dashed ${theme.accent}`, borderRadius: 18,
    background: "rgba(7, 11, 18, 0.82)", color: theme.accent, fontSize: 22, fontWeight: 600, pointerEvents: "none",
  },
});

/** 随站点发布在 samples/ 下的示例包（由 fixtures:build 生成，部署时从 GitHub Release 取回） */
const SAMPLE_PACKAGES: readonly { file: string; label: MessageKey }[] = [
  { file: "sample-16x9.qyp", label: "sampleLandscape" },
  { file: "sample-9x16.qyp", label: "samplePortrait" },
  { file: "sample-video-sound-16x9.qyp", label: "sampleVideo" },
];

interface AppProps {
  /** 开发用：启动时自动打开的包（如 ?demo） */
  initialSource?: () => Promise<Blob>;
}

export function App({ initialSource }: AppProps) {
  const classes = useStyles();
  const { t } = useI18n();
  const [controller, setController] = useState<PlaybackController | null>(null);
  // 错误在显示时才翻译，这样切换语言后说明也跟着变
  const [error, setError] = useState<unknown>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (source: Blob | ByteSource) => {
    setBusy(true);
    setError(null);
    setSampleError(null);
    try {
      const next = await PlaybackController.create(await openPackage(source), { onChecking: () => setChecking(true) });
      // 开发时在控制台和自动化测试里检查内部状态用
      if (import.meta.env.DEV) (window as unknown as { __qy?: PlaybackController }).__qy = next;
      setController((previous) => {
        previous?.dispose();
        return next;
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (initialSource) void initialSource().then(open, (e: unknown) => setError(e));
  }, [initialSource, open]);

  // 桌面和手机壳：系统把 .qyp 交给播放器启动时，直接打开那个文件（按偏移读，不整个读进内存）
  const openedShellFile = useRef<string | null>(null);
  const openShellFile = useCallback(
    (name: string, size: number) => {
      // 启动参数和“收到文件”的事件可能指向同一个文件，只打开一次
      const key = `${name}\u0000${size}`;
      if (openedShellFile.current === key) return;
      openedShellFile.current = key;
      void open(shellFile(name, size).source);
    },
    [open],
  );

  useEffect(() => {
    void readInitialFile().then(
      (file) => {
        if (file) openShellFile(file.name, file.source.size);
      },
      (e: unknown) => setError(e),
    );
  }, [openShellFile]);

  // 手机壳：应用已经打开时，别的应用又发来一个 .qyp（见 desktop.ts 的 RECEIVED_FILE_EVENT）
  useEffect(() => {
    if (!isDesktop()) return;
    let stop: (() => void) | undefined;
    void listen<[string, number]>(RECEIVED_FILE_EVENT, (event) => openShellFile(event.payload[0], event.payload[1]))
      .then((fn) => {
        stop = fn;
      })
      .catch(() => undefined);
    return () => stop?.();
  }, [openShellFile]);  const openSample = async (file: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setSampleError(null);
    try {
      const response = await fetch(new URL(`samples/${file}`, document.baseURI));
      if (!response.ok) {
        setSampleError(t("sampleHttp", { status: response.status }));
        setBusy(false);
        return;
      }
      await open(await response.blob());
    } catch {
      setSampleError(t("sampleDownloadFailed"));
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

  if (controller) return <PlayerView controller={controller} onClose={close} filmstrip />;

  const message = sampleError ?? (error ? describeError(error, t) : null);
  return (
    <div
      className={classes.home}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <div className={classes.topbar}>
        <LanguageSwitch />
        <button className={classes.tool} onClick={() => setAboutOpen(true)}>
          <InfoIcon size={18} />
          {t("about")}
        </button>
      </div>
      <main className={classes.hero}>
        <Logo size={96} kind="player" />
        <h1 className={classes.name}>{t("appName")}</h1>
        <p className={classes.tagline}>{t("homeTagline")}</p>
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
        <button className={classes.open} disabled={busy} onClick={() => inputRef.current?.click()}>
          {checking ? t("homeChecking") : busy ? t("homeOpening") : t("homeOpen")}
        </button>
        <p className={classes.hint}>{t("homeDrop")}</p>
        <p className={classes.privacy}>{t("homePrivacy")}</p>
        {/* 示例和制作页只在网页版提供，桌面播放器里没有这两样 */}
        {!isDesktop() && (
          <>
            <div className={classes.samples}>
              {t("homeSamples")}
              {SAMPLE_PACKAGES.map((sample) => (
                <button key={sample.file} className={classes.sample} disabled={busy} onClick={() => void openSample(sample.file)}>
                  {t(sample.label)}
                </button>
              ))}
            </div>
            <div className={classes.make}>
              {t("homeMakeIntro")} <a href="create.html">{t("homeMakeLink")}</a>
            </div>
          </>
        )}
        {message && <div className={classes.error} role="alert">{message}</div>}
      </main>
      {dragging && <div className={classes.dropOverlay}>{t("homeDropRelease")}</div>}
      {aboutOpen && <AboutDialog kind="player" onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
