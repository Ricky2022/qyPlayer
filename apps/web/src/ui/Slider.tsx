import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createUseStyles } from "react-jss";
import { theme } from "./theme";

const useStyles = createUseStyles({
  slider: {
    position: "relative", display: "flex", alignItems: "center", height: 20, cursor: "pointer", touchAction: "none", outline: "none",
    "&:focus-visible $track": { boxShadow: `0 0 0 2px ${theme.accent}` },
  },
  track: { position: "relative", width: "100%", height: 4, borderRadius: 2, background: "rgba(255, 255, 255, 0.28)", transition: "height 0.12s" },
  active: { "& $track": { height: 6 }, "& $thumb": { opacity: 1 } },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, background: theme.accent },
  thumb: {
    position: "absolute", top: "50%", width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: "50%",
    background: "#fff", opacity: 0, transition: "opacity 0.12s", boxShadow: "0 1px 4px rgba(0, 0, 0, 0.5)",
  },
  tooltip: {
    position: "absolute", bottom: 20, transform: "translateX(-50%)", padding: "2px 6px", borderRadius: 4,
    background: "rgba(0, 0, 0, 0.8)", color: theme.text, fontSize: 12, fontVariantNumeric: "tabular-nums", pointerEvents: "none", whiteSpace: "nowrap",
  },
});

interface SliderProps {
  /** 0 到 1 */
  value: number;
  onChange(value: number): void;
  label: string;
  /** 读屏软件念的当前值，如 “0:12” */
  valueText?: string;
  /** 鼠标悬停位置的提示文字，如时间 */
  tooltip?(fraction: number): string;
  /** 提供时：方向键由滑块自己处理（每次一小步），不再冒泡给全局快捷键 */
  onKeyStep?(direction: -1 | 1): void;
  className?: string;
}

/** 自绘的横向滑块：鼠标和触摸可点可拖，悬停时变粗并可显示提示 */
export function Slider({ value, onChange, label, valueText, tooltip, onKeyStep, className }: SliderProps) {
  const classes = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const fractionOf = (event: PointerEvent): number => {
    const rect = ref.current!.getBoundingClientRect();
    return rect.width === 0 ? 0 : Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (event: PointerEvent): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onChange(fractionOf(event));
  };
  const onPointerMove = (event: PointerEvent): void => {
    const fraction = fractionOf(event);
    setHover(fraction);
    if (dragging) onChange(fraction);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!onKeyStep) return;
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    event.stopPropagation();
    onKeyStep(direction);
  };

  const percent = `${Math.min(1, Math.max(0, value)) * 100}%`;
  return (
    <div
      ref={ref}
      className={`${classes.slider} ${dragging || hover !== null ? classes.active : ""} ${className ?? ""}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      {...(valueText && { "aria-valuetext": valueText })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      <div className={classes.track}>
        <div className={classes.fill} style={{ width: percent }} />
        <div className={classes.thumb} style={{ left: percent }} />
      </div>
      {tooltip && hover !== null && (
        <div className={classes.tooltip} style={{ left: `${hover * 100}%` }}>
          {tooltip(hover)}
        </div>
      )}
    </div>
  );
}
