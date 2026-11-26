import {useEffect, useRef, type RefObject} from "react";
import {createUseStyles} from "react-jss";
import {useI18n} from "./i18n";
import type {PlaybackController} from "./player/PlaybackController";
import {theme} from "./ui/theme";

/** 缩略图在条里的显示高度（CSS 像素） */
const TILE_HEIGHT = 56;

const useStyles = createUseStyles({
    strip: {
        display: "flex",
        width: "100%",
        minWidth: 0,
        overflowX: "auto",
        "& > * + *": {marginLeft: 6},
        padding: "4px 0 8px",
        scrollBehavior: "smooth",
        scrollbarWidth: "thin",
    },
    tile: {
        position: "relative",
        flex: "none",
        minWidth: 0,
        height: TILE_HEIGHT,
        padding: 0,
        border: "2px solid transparent",
        borderRadius: 4,
        overflow: "hidden",
        background: "#1b2230",
        cursor: "pointer",
        "&:hover": {borderColor: "rgba(255, 255, 255, 0.5)"},
        "&:focus-visible": {outline: `2px solid ${theme.accent}`},
    },
    current: {borderColor: theme.accent, "&:hover": {borderColor: theme.accent}},
    canvas: {display: "block", height: "100%", width: "100%"},
    number: {
        position: "absolute",
        left: 3,
        bottom: 1,
        fontSize: 11,
        lineHeight: 1.2,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
    },
});

/** 一页的缩略图：按钮滚动到可见范围内才向控制器请求（一次画一个，由控制器排队），画好后画进 canvas；返回两个元素的 ref */
// eslint-disable-next-line @stylistic/max-len
export const useLazyThumbnail = function useLazyThumbnail(controller: PlaybackController, index: number, stripRef: RefObject<HTMLElement | null>): {
    buttonRef: RefObject<HTMLButtonElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
} {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const button = buttonRef.current;
        const canvas = canvasRef.current;
        if (!button || !canvas) {
            return;
        }
        let alive = true;
        let requested = false;
        const observer = new IntersectionObserver(
            (entries) => {
                if (requested || !entries.some((entry) => entry.isIntersecting)) {
                    return;
                }
                requested = true;
                observer.disconnect();
                controller
                    .pageThumbnail(index)
                    .then((thumbnail) => {
                        if (!alive) {
                            return;
                        }
                        canvas.width = thumbnail.width;
                        canvas.height = thumbnail.height;
                        canvas.getContext("2d")?.drawImage(thumbnail, 0, 0);
                    })
                    .catch(() => undefined);
            },
            {root: stripRef.current, rootMargin: "0px 120px"},
        );
        observer.observe(button);
        return () => {
            alive = false;
            observer.disconnect();
        };
    }, [controller, index, stripRef]);

    return {buttonRef, canvasRef};
};

interface PageTileProps {
    controller: PlaybackController;
    index: number;
    current: boolean;
    stripRef: RefObject<HTMLDivElement | null>;
}

/** 一页的缩略图按钮 */
const PageTile = function PageTile({controller, index, current, stripRef}: PageTileProps) {
    const classes = useStyles();
    const {t} = useI18n();
    const {buttonRef, canvasRef} = useLazyThumbnail(controller, index, stripRef);

    const aspect = controller.canvas.width / controller.canvas.height;
    return (
        <button
            ref={buttonRef}
            className={`${classes.tile} ${current ? classes.current : ""}`}
            style={{width: Math.round(TILE_HEIGHT * aspect) + 4}}
            aria-label={t("playerPageLabel", {page: index + 1})}
            aria-current={current ? "true" : undefined}
            onClick={() => controller.seekToPage(index)}
        >
            <canvas ref={canvasRef} className={classes.canvas} />
            <span className={classes.number}>{index + 1}</span>
        </button>
    );
};

interface PageStripProps {
    controller: PlaybackController;
    /** 当前页的下标 */
    current: number;
}

/** 底部缩略图条：每页一张缩略图，点击跳到该页；当前页高亮并自动滚到可见位置 */
export const PageStrip = function PageStrip({controller, current}: PageStripProps) {
    const classes = useStyles();
    const {t} = useI18n();
    const stripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const strip = stripRef.current;
        const tile = strip?.children[current] as HTMLElement | undefined;
        if (!strip || !tile) {
            return;
        }
        strip.scrollLeft = tile.offsetLeft - ((strip.clientWidth - tile.offsetWidth) / 2);
    }, [current]);

    return (
        <div ref={stripRef} className={classes.strip} role="group" aria-label={t("playerPages")}>
            {Array.from({length: controller.pageCount}, (_, index) =>
                <PageTile key={index} controller={controller} index={index} current={index === current} stripRef={stripRef} />)}
        </div>
    );
};
