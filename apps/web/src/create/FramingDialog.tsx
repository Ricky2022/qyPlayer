import {useRef, useState, type KeyboardEvent, type PointerEvent} from "react";
import {createUseStyles} from "react-jss";
import {CROP_MAX_ZOOM, CROP_MIN_ZOOM, KEN_BURNS_KINDS, clampCenter, framedState, visibleFraction, type Crop, type KenBurns} from "@qyplayer/core";
import {useI18n, type MessageKey} from "../i18n";
import {theme} from "../ui/theme";
import {useDialogFocus} from "../ui/useDialogFocus";

const useStyles = createUseStyles({
    backdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0, 0, 0, 0.62)",
        backdropFilter: "blur(4px)",
    },
    dialog: {
        width: "min(420px, 100%)",
        maxHeight: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "18px 20px 16px",
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        background: theme.surface,
        color: theme.text,
        fontFamily: theme.font,
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.55)",
    },
    title: {margin: "0 0 6px", fontSize: 16, overflowWrap: "anywhere"},
    hint: {margin: "0 0 10px", fontSize: 12, color: theme.muted},
    note: {margin: "8px 0 0", fontSize: 12, color: "#ffe2b0"},
    error: {margin: "8px 0", fontSize: 13, color: theme.danger},
    box: {
        position: "relative",
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        background: "#000",
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        touchAction: "none",
        cursor: "grab",
        userSelect: "none",
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    grabbing: {cursor: "grabbing"},
    image: {position: "absolute", maxWidth: "none", pointerEvents: "none", userSelect: "none"},
    row: {display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14},
    rowLabel: {flex: "none", minWidth: 64, fontSize: 13, fontWeight: 600, color: theme.muted},
    slider: {flex: 1, minHeight: 28, accentColor: theme.accent},
    value: {flex: "none", minWidth: 44, textAlign: "right", fontSize: 13, color: theme.muted, fontVariantNumeric: "tabular-nums"},
    select: {
        flex: 1,
        minHeight: 36,
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        color: theme.text,
        font: "inherit",
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    actions: {display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18},
    button: {
        minHeight: 36,
        padding: "6px 18px",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        background: theme.surface,
        color: theme.text,
        font: "inherit",
        cursor: "pointer",
        "&:hover:not(:disabled)": {background: theme.surfaceHover},
        "&:disabled": {opacity: 0.4, cursor: "default"},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`, outlineOffset: 2},
    },
    primary: {background: theme.accent, borderColor: theme.accent, color: theme.onAccent, fontWeight: 600, "&:hover:not(:disabled)": {background: "#67d0fb"}},
});

const KEN_BURNS_LABELS: Record<KenBurns, MessageKey> = {
    none: "kbNone",
    in: "kbIn",
    out: "kbOut",
    left: "kbLeft",
    right: "kbRight",
    up: "kbUp",
    down: "kbDown",
};

/** 方向键平移的步长：可见区域的比例（docs/dev-0.4.1.md 5） */
const PAN_STEP = 0.05;
const ZOOM_STEP = 0.05;
const round = (value: number, digits: number): number => Math.round(value * (10 ** digits)) / (10 ** digits);

interface FramingDialogProps {
    /** 照片的文件名（标题用） */
    name: string;
    url: string;
    asset: {
        width: number;
        height: number;
    };
    /** 这张照片所在格子的宽高比（版式和画面比例决定） */
    cellAspect: number;
    initialCrop: Crop | undefined;
    initialKenBurns: KenBurns | undefined;
    /** 单张照片页才有镜头动画 */
    showKenBurns: boolean;
    /** 这张照片现在被设为“完整显示”，取景会把它改回自动 */
    fitIsContain: boolean;
    onCancel: () => void;
    /** crop 为 undefined 表示不取景（居中、不放大） */
    onDone: (crop: Crop | undefined, kenBurns: KenBurns | undefined) => void;
}

/** 取景对话框（docs/dev-0.4.1.md 4）：拖动平移、滑块放大、选镜头动画；点“完成”才写入编辑状态 */
// eslint-disable-next-line @stylistic/max-len
export const FramingDialog = function FramingDialog({name, url, asset, cellAspect, initialCrop, initialKenBurns, showKenBurns, fitIsContain, onCancel, onDone}: FramingDialogProps) {
    const classes = useStyles();
    const {t} = useI18n();
    const dialogRef = useRef<HTMLDivElement>(null);
    const doneRef = useRef<HTMLButtonElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    useDialogFocus(dialogRef, onCancel, doneRef);

    const usable = asset.width > 0 && asset.height > 0;
    const aspect = usable ? asset.width / asset.height : 1;
    const [broken, setBroken] = useState(!usable);
    const [zoom, setZoom] = useState(initialCrop?.zoom ?? CROP_MIN_ZOOM);
    const [center, setCenter] = useState({x: initialCrop?.x ?? 0.5, y: initialCrop?.y ?? 0.5});
    const [kenBurns, setKenBurns] = useState<KenBurns>(initialKenBurns ?? "none");
    const [grabbing, setGrabbing] = useState(false);
    const last = useRef<{
        x: number;
        y: number;
    } | null>(null);

    const clamped = clampCenter(aspect, cellAspect, zoom, center.x, center.y);
    const state = framedState(aspect, cellAspect, zoom, clamped.x, clamped.y);
    const wide = aspect > cellAspect;
    const dispW = (wide ? 1 : aspect / cellAspect) * state.scale;
    const dispH = (wide ? cellAspect / aspect : 1) * state.scale;
    const percent = (n: number): string => `${n * 100}%`;

    const moveBy = (dxCells: number, dyCells: number): void => {
    // 照片跟着指针走：照片向右移 dx 个格子宽，可见区域中心就向左移 dx / dispW 个素材宽
        setCenter(clampCenter(aspect, cellAspect, zoom, clamped.x - (dxCells / dispW), clamped.y - (dyCells / dispH)));
    };
    const changeZoom = (next: number): void => {
        const value = Math.min(CROP_MAX_ZOOM, Math.max(CROP_MIN_ZOOM, next));
        setZoom(value);
        setCenter(clampCenter(aspect, cellAspect, value, clamped.x, clamped.y));
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
        if (broken) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        last.current = {x: event.clientX, y: event.clientY};
        setGrabbing(true);
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
        const from = last.current;
        const rect = boxRef.current?.getBoundingClientRect();
        if (!from || !rect || rect.width === 0 || rect.height === 0) {
            return;
        }
        last.current = {x: event.clientX, y: event.clientY};
        moveBy((event.clientX - from.x) / rect.width, (event.clientY - from.y) / rect.height);
    };
    const endDrag = (): void => {
        last.current = null;
        setGrabbing(false);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (broken) {
            return;
        }
        const v = visibleFraction(aspect, cellAspect, zoom);
        const pan: Record<string, [number, number]> = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
        const direction = pan[event.key];
        if (direction) {
            event.preventDefault();
            // eslint-disable-next-line @stylistic/max-len
            setCenter(clampCenter(aspect, cellAspect, zoom, clamped.x + (direction[0] * PAN_STEP * v.w), clamped.y + (direction[1] * PAN_STEP * v.h)));
        } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            changeZoom(zoom + (ZOOM_STEP * 2));
        } else if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            changeZoom(zoom - (ZOOM_STEP * 2));
        }
    };

    const isDefault = zoom === CROP_MIN_ZOOM && Math.abs(clamped.x - 0.5) < 1e-6 && Math.abs(clamped.y - 0.5) < 1e-6;
    const done = (): void => {
        const crop = broken ? initialCrop : isDefault ? undefined : {zoom: round(zoom, 3), x: round(clamped.x, 4), y: round(clamped.y, 4)};
        onDone(crop, showKenBurns ? kenBurns : initialKenBurns);
    };
    const reset = (): void => {
        setZoom(CROP_MIN_ZOOM);
        setCenter({x: 0.5, y: 0.5});
    };

    return (
        <div className={classes.backdrop} onClick={onCancel}>
            <div ref={dialogRef} className={classes.dialog} role="dialog" aria-modal="true" aria-label={t("framingTitle", {name})} onClick={(event) => event.stopPropagation()}>
                <h2 className={classes.title}>{t("framingTitle", {name})}</h2>
                <p className={classes.hint}>{t("framingHint")}</p>
                <div
                    ref={boxRef}
                    className={`${classes.box} ${grabbing ? classes.grabbing : ""}`}
                    style={{aspectRatio: String(cellAspect)}}
                    tabIndex={0}
                    role="group"
                    aria-label={t("framingBoxLabel")}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={onKeyDown}
                >
                    <img
                        className={classes.image}
                        src={url}
                        alt=""
                        draggable={false}
                        // eslint-disable-next-line @stylistic/max-len
                        style={{width: percent(dispW), height: percent(dispH), left: percent(0.5 + state.x - (dispW / 2)), top: percent(0.5 + state.y - (dispH / 2))}}
                        onError={() => setBroken(true)}
                    />
                </div>
                {broken && (
                    <p className={classes.error} role="alert">
                        {t("framingUndecodable")}
                    </p>
                )}
                <div className={classes.row}>
                    <label className={classes.rowLabel} htmlFor="qy-framing-zoom">
                        {t("framingZoom")}
                    </label>
                    <input
                        id="qy-framing-zoom"
                        className={classes.slider}
                        type="range"
                        min={CROP_MIN_ZOOM}
                        max={CROP_MAX_ZOOM}
                        step={ZOOM_STEP}
                        value={zoom}
                        disabled={broken}
                        onChange={(event) => changeZoom(Number(event.target.value))}
                    />
                    <span className={classes.value}>
                        {round(zoom, 2)}
                        ×
                    </span>
                </div>
                {showKenBurns && (
                    <div className={classes.row}>
                        <label className={classes.rowLabel} htmlFor="qy-framing-kb">
                            {t("framingKenBurns")}
                        </label>
                        <select id="qy-framing-kb" className={classes.select} value={kenBurns} onChange={(event) => setKenBurns(event.target.value as KenBurns)}>
                            {KEN_BURNS_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(KEN_BURNS_LABELS[kind])}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                {fitIsContain && !isDefault && <p className={classes.note}>{t("framingFitNote")}</p>}
                <div className={classes.actions}>
                    <button className={classes.button} disabled={broken || isDefault} onClick={reset}>
                        {t("framingReset")}
                    </button>
                    <button className={classes.button} onClick={onCancel}>
                        {t("cancel")}
                    </button>
                    <button ref={doneRef} className={`${classes.button} ${classes.primary}`} onClick={done}>
                        {t("framingDone")}
                    </button>
                </div>
            </div>
        </div>
    );
};
