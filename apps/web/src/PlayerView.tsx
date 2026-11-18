import { useEffect, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import { useI18n, type MessageKey } from "./i18n";
import type { PlaybackController, PlayerWarning, PlayState } from "./player/PlaybackController";
import { Slider } from "./ui/Slider";
import { theme } from "./ui/theme";
import { useAutoHide } from "./ui/useAutoHide";
import {
  BackIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMutedIcon,
} from "./ui/icons";

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;

const WARNING_MESSAGES: Record<PlayerWarning["code"], MessageKey> = {
  "bgm-decode": "warnBgmDecode",
  "bgm-read": "warnBgmRead",
  "asset-failed": "warnAssetFailed",
  "autoplay-blocked": "warnAutoplay",
};

const useStyles = createUseStyles({
  root: { position: "relative", height: "100%", overflow: "hidden", background: "#000", color: theme.text, fontFamily: theme.font, userSelect: "none" },
  idle: { cursor: "none" },
  stage: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  canvas: { maxWidth: "100%", maxHeight: "100%", display: "block", cursor: "inherit" },
  overlay: { position: "absolute", left: 0, right: 0, transition: "opacity 0.25s", pointerEvents: "none", "& > *": { pointerEvents: "auto" } },
  hidden: { opacity: 0, "& > *": { pointerEvents: "none" } },
  top: {
    top: 0, display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 36px",
    background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.65), transparent)",
  },
  title: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 16, fontWeight: 600, textShadow: "0 1px 3px rgba(0, 0, 0, 0.6)" },
  bottom: { bottom: 0, padding: "40px 16px 10px", background: "linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)" },
  row: { display: "flex", alignItems: "center", gap: 4, marginTop: 2 },
  spacer: { flex: 1 },
  time: { margin: "0 8px", fontSize: 13, fontVariantNumeric: "tabular-nums", color: "#d6deea", whiteSpace: "nowrap" },
  iconButton: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, padding: 0, border: "none", borderRadius: "50%",
    background: "transparent", color: "inherit", cursor: "pointer", transition: "background 0.12s",
    "&:hover": { background: "rgba(255, 255, 255, 0.16)" },
    "&:focus-visible": { outline: `2px solid ${theme.accent}` },
  },
  volume: { display: "flex", alignItems: "center", "&:hover $volumeSlider, &:focus-within $volumeSlider": { width: 80, marginRight: 8, opacity: 1 } },
  volumeSlider: { width: 0, opacity: 0, marginRight: 0, transition: "width 0.18s, opacity 0.18s, margin 0.18s" },
  bigPlay: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", justifyContent: "center",
    width: 84, height: 84, padding: 0, border: "none", borderRadius: "50%", background: "rgba(7, 11, 18, 0.62)", color: "#fff",
    boxShadow: `0 0 0 2px ${theme.border}`, backdropFilter: "blur(6px)", cursor: "pointer", transition: "transform 0.12s, background 0.12s",
    "&:hover": { background: "rgba(14, 165, 233, 0.85)", transform: "translate(-50%, -50%) scale(1.06)" },
    "&:focus-visible": { outline: `2px solid ${theme.accent}`, outlineOffset: 3 },
  },
  warning: {
    position: "absolute", top: 64, left: 16, right: 16, padding: "6px 10px", borderRadius: 6,
    background: "rgba(160, 90, 0, 0.92)", fontSize: 13, whiteSpace: "pre-line",
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

/** 播放界面：画面铺满，控制条浮在底部、静止几秒后自动隐藏；空格、方向键、F、M 为快捷键。 */
export function PlayerView({ controller, onClose }: PlayerViewProps) {
  const classes = useStyles();
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playState, setPlayState] = useState<PlayState>(controller.state);
  const [volume, setVolume] = useState(controller.volume);
  const [muted, setMuted] = useState(controller.muted);
  const [warnings, setWarnings] = useState<PlayerWarning[]>([...controller.warnings]);
  const [fullscreen, setFullscreen] = useState(false);
  const { visible, poke, hold } = useAutoHide(playState === "playing");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const canvas = controller.canvas;
    canvas.className = classes.canvas;
    canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
    const onClick = (): void => controller.toggle();
    canvas.addEventListener("click", onClick);
    stage.prepend(canvas);

    let lastShown = -1;
    controller.setEvents({
      // 进度条每 0.1 秒刷新一次即可，避免每帧都触发 React 渲染
      onTime: (current) => {
        if (Math.abs(current - lastShown) >= 0.1 || current === controller.duration || current === 0) {
          lastShown = current;
          setTime(current);
        }
      },
      onState: setPlayState,
      onWarning: (warning) => setWarnings((list) => [...list, warning]),
    });
    setTime(controller.currentTime);
    return () => {
      controller.setEvents(null);
      canvas.removeEventListener("click", onClick);
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

  const toggleMute = (): void => {
    controller.setMuted(!controller.muted);
    setMuted(controller.muted);
  };

  const changeVolume = (v: number): void => {
    const next = Math.min(1, Math.max(0, v));
    controller.setVolume(next);
    setVolume(next);
    if (next > 0 && controller.muted) toggleMute();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // 焦点在按钮上时，空格保留给按钮自己的默认行为
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
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // toggleFullscreen 和 toggleMute 只依赖 controller 和 ref，无需重新绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, poke]);

  const playing = playState === "playing";
  const playLabel = playing ? t("playerPause") : playState === "ended" ? t("playerReplay") : t("playerPlay");
  const PlayStateIcon = playing ? PauseIcon : playState === "ended" ? ReplayIcon : PlayIcon;
  const VolumeIcon = muted || volume === 0 ? VolumeMutedIcon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon;
  const duration = controller.duration;

  return (
    <div ref={rootRef} className={`${classes.root} ${!visible ? classes.idle : ""}`} onPointerMove={poke} onPointerDown={poke}>
      <div ref={stageRef} className={classes.stage} onDoubleClick={toggleFullscreen} />

      <div className={`${classes.overlay} ${classes.top} ${visible ? "" : classes.hidden}`}>
        <button className={classes.iconButton} aria-label={t("playerBack")} title={t("playerBack")} onClick={onClose}>
          <BackIcon />
        </button>
        <div className={classes.title}>{controller.title}</div>
      </div>

      {warnings.length > 0 && (
        <div className={classes.warning} role="status">
          {warnings.map((w) => t(WARNING_MESSAGES[w.code], { src: w.src ?? "" })).join("\n")}
        </div>
      )}

      {!playing && (
        <button className={classes.bigPlay} aria-label={playLabel} onClick={() => controller.toggle()}>
          <PlayStateIcon size={44} />
        </button>
      )}

      <div
        className={`${classes.overlay} ${classes.bottom} ${visible ? "" : classes.hidden}`}
        onPointerEnter={() => hold(true)}
        onPointerLeave={() => hold(false)}
      >
        <Slider
          label={t("playerSeek")}
          value={duration > 0 ? time / duration : 0}
          valueText={`${formatTime(time)} / ${formatTime(duration)}`}
          tooltip={(fraction) => formatTime(fraction * duration)}
          onChange={(fraction) => controller.seek(fraction * duration)}
        />
        <div className={classes.row}>
          <button className={classes.iconButton} aria-label={playLabel} title={playLabel} onClick={() => controller.toggle()}>
            <PlayStateIcon />
          </button>
          <div className={classes.volume}>
            <button className={classes.iconButton} aria-label={muted ? t("playerUnmute") : t("playerMute")} title={muted ? t("playerUnmute") : t("playerMute")} onClick={toggleMute}>
              <VolumeIcon />
            </button>
            <Slider
              className={classes.volumeSlider}
              label={t("playerVolume")}
              value={muted ? 0 : volume}
              onChange={changeVolume}
              onKeyStep={(direction) => changeVolume((muted ? 0 : volume) + direction * VOLUME_STEP)}
            />
          </div>
          <span className={classes.time}>
            {formatTime(time)} / {formatTime(duration)}
          </span>
          <div className={classes.spacer} />
          <button
            className={classes.iconButton}
            aria-label={fullscreen ? t("playerExitFullscreen") : t("playerFullscreen")}
            title={fullscreen ? t("playerExitFullscreen") : t("playerFullscreen")}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
