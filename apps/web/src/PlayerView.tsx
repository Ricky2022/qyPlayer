import { useEffect, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import type { PlaybackController, PlayState } from "./player/PlaybackController";

const SEEK_STEP_SECONDS = 5;

const useStyles = createUseStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", background: "#000", color: "#eee" },
  stage: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
  canvas: { maxWidth: "100%", maxHeight: "100%", display: "block", cursor: "pointer" },
  warning: {
    position: "absolute", top: 8, left: 8, right: 8, padding: "6px 10px", borderRadius: 4,
    background: "rgba(160, 90, 0, 0.9)", fontSize: 13, whiteSpace: "pre-line",
  },
  bar: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#111", fontSize: 14 },
  seek: { flex: 1, minWidth: 0 },
  volume: { width: 80 },
  time: { fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "center" },
  button: {
    minWidth: 56, padding: "4px 10px", border: "1px solid #444", borderRadius: 4,
    background: "#222", color: "#eee", cursor: "pointer",
    "&:hover": { background: "#333" },
  },
});

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface PlayerViewProps {
  controller: PlaybackController;
  onClose: () => void;
}

/** 播放界面：画面、播放/暂停、进度、音量、全屏；空格、方向键、F、M 为快捷键。 */
export function PlayerView({ controller, onClose }: PlayerViewProps) {
  const classes = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playState, setPlayState] = useState<PlayState>(controller.state);
  const [volume, setVolume] = useState(controller.volume);
  const [muted, setMuted] = useState(controller.muted);
  const [warnings, setWarnings] = useState<string[]>([...controller.warnings]);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const canvas = controller.canvas;
    canvas.className = classes.canvas;
    canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
    canvas.addEventListener("click", () => controller.toggle());
    stage.prepend(canvas);

    let lastShown = -1;
    controller.setEvents({
      // 进度条每 0.1 秒刷新一次即可，避免每帧都触发 React 渲染
      onTime: (t) => {
        if (Math.abs(t - lastShown) >= 0.1 || t === controller.duration || t === 0) {
          lastShown = t;
          setTime(t);
        }
      },
      onState: setPlayState,
      onWarning: (message) => setWarnings((list) => [...list, message]),
    });
    setTime(controller.currentTime);
    return () => {
      controller.setEvents(null);
      canvas.remove();
    };
  }, [controller, classes.canvas]);

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  };

  const changeVolume = (v: number): void => {
    controller.setVolume(v);
    setVolume(v);
    if (v > 0 && controller.muted) toggleMute();
  };

  const toggleMute = (): void => {
    controller.setMuted(!controller.muted);
    setMuted(controller.muted);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // 焦点在按钮或滑块上时，空格和方向键保留给它们自己的默认行为
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      switch (event.key) {
        case " ":
        case "k":
          controller.toggle();
          break;
        case "ArrowLeft":
          controller.seek(controller.currentTime - SEEK_STEP_SECONDS);
          break;
        case "ArrowRight":
          controller.seek(controller.currentTime + SEEK_STEP_SECONDS);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMute();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // toggleFullscreen 和 toggleMute 只依赖 controller 和 ref，无需重新绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  const playLabel = playState === "playing" ? "暂停" : playState === "ended" ? "重播" : "播放";

  return (
    <div ref={rootRef} className={classes.root}>
      <div ref={stageRef} className={classes.stage}>
        {warnings.length > 0 && <div className={classes.warning}>{warnings.join("\n")}</div>}
      </div>
      <div className={classes.bar}>
        <button className={classes.button} onClick={() => controller.toggle()}>
          {playLabel}
        </button>
        <input
          className={classes.seek}
          type="range"
          min={0}
          max={controller.duration}
          step={0.01}
          value={time}
          aria-label="播放进度"
          onChange={(e) => controller.seek(Number(e.target.value))}
        />
        <span className={classes.time}>
          {formatTime(time)} / {formatTime(controller.duration)}
        </span>
        <button className={classes.button} onClick={toggleMute}>
          {muted ? "取消静音" : "静音"}
        </button>
        <input
          className={classes.volume}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          aria-label="音量"
          onChange={(e) => changeVolume(Number(e.target.value))}
        />
        <button className={classes.button} onClick={toggleFullscreen}>
          {fullscreen ? "退出全屏" : "全屏"}
        </button>
        <button className={classes.button} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
