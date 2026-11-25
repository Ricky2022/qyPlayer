import {stateAt, type Layer, type Manifest} from "@qyplayer/core";
import {renderFrame, type AssetResolver, type DrawableAsset, type PlaceholderAsset} from "@qyplayer/renderer";
import {playbackMimeType} from "./preflight";

/** 缩略图画在影片的哪个位置：该页时长的这个比例处（转场早已结束，入场动画也已完成） */
export const THUMBNAIL_AT = 0.75;
/** 缩略图画布的长边（像素）；条里按 CSS 像素缩小显示，留出高分屏的余量 */
export const THUMBNAIL_LONG_SIDE = 256;
/** 缩略图里的图片解码到的最长边 */
const THUMBNAIL_IMAGE_SIDE = 512;
/** 等视频定位到指定时刻的最长时间（毫秒） */
const VIDEO_SEEK_TIMEOUT_MS = 4000;

/**
 * 页缩略图的串行缓存：同一页只画一次，所有页排成一队，一次只画一个，
 * 这样滚动缩略图条时不会同时解码大量素材。画失败的页下次再请求时会重试。
 */
export class PageThumbnails<T> {
    private readonly cache = new Map<number, Promise<T>>();
    private chain: Promise<unknown> = Promise.resolve();
    private disposed = false;

    constructor(private readonly renderPage: (index: number) => Promise<T>) {}

    async get(index: number): Promise<T> {
        const cached = this.cache.get(index);
        if (cached) {
            return cached;
        }
        const task = this.chain.then(async () => {
            if (this.disposed) {
                throw new Error("thumbnails disposed");
            }
            return this.renderPage(index);
        });
        this.chain = task.catch(() => undefined);
        this.cache.set(index, task);
        task.catch(() => this.cache.delete(index));
        return task;
    }

    dispose(): void {
        this.disposed = true;
        this.cache.clear();
    }
}

export interface ThumbnailSource {
    manifest: Manifest;
    readBlob: (path: string) => Promise<Blob>;
    /** 本设备无法播放的素材，在缩略图里和播放时一样画占位画面 */
    unsupported: ReadonlySet<string>;
}

/** 缩略图画布的像素尺寸：长边 THUMBNAIL_LONG_SIDE，宽高比同影片画布 */
export const thumbnailSize = function thumbnailSize(canvas: {
    width: number;
    height: number;
}): {
    width: number;
    height: number;
} {
    const scale = THUMBNAIL_LONG_SIDE / Math.max(canvas.width, canvas.height);
    return {width: Math.max(1, Math.round(canvas.width * scale)), height: Math.max(1, Math.round(canvas.height * scale))};
};

/** 去掉片头标题层。没有标题层时原样返回，避免无谓复制。 */
export const omitTitleLayers = function omitTitleLayers<T extends {role?: string}>(layers: T[]): T[] {
    return layers.some((layer) => layer.role === "title") ? layers.filter((layer) => layer.role !== "title") : layers;
};

/** 用与播放相同的渲染函数，把第 index 页画成一张小画布。不含片头标题，素材不可用的格子留空 */
// eslint-disable-next-line @stylistic/max-len
const loadVideoFrame = async function loadVideoFrame(blob: Blob, mimeType: string | undefined, time: number, cleanups: (() => void)[]): Promise<HTMLVideoElement | undefined> {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const url = URL.createObjectURL(mimeType ? blob.slice(0, blob.size, playbackMimeType(mimeType)) : blob);
    const element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.preload = "auto";
    cleanups.push(() => {
        element.removeAttribute("src");
        element.load();
        URL.revokeObjectURL(url);
    });
    const ready = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), VIDEO_SEEK_TIMEOUT_MS);
        const done = (ok: boolean): void => {
            clearTimeout(timer);
            resolve(ok);
        };
        element.addEventListener("error", () => done(false), {once: true});
        element.addEventListener("seeked", () => done(true), {once: true});
        element.addEventListener(
            "loadedmetadata",
            () => {
                element.currentTime = Math.min(time, Math.max(0, (element.duration || time) - 0.05));
            },
            {once: true},
        );
    });
    element.src = url;
    return await ready && element.videoWidth > 0 ? element : undefined;
};
// eslint-disable-next-line @stylistic/max-len
const loadDrawable = async function loadDrawable(source: ThumbnailSource, layer: Layer, cleanups: (() => void)[]): Promise<DrawableAsset | PlaceholderAsset | undefined> {
    const asset = source.manifest.assets.find((a) => a.id === layer.assetId);
    if (!asset) {
        return undefined;
    }
    if (source.unsupported.has(asset.id)) {
        return {placeholder: true};
    }
    try {
        const blob = await source.readBlob(asset.src);
        if (asset.type === "image") {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const scale = asset.width && asset.height ? Math.min(1, THUMBNAIL_IMAGE_SIDE / Math.max(asset.width, asset.height)) : 1;
            const bitmap
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                = scale < 1 && asset.width && asset.height
                    ? await createImageBitmap(blob, {resizeWidth: Math.round(asset.width * scale), resizeHeight: Math.round(asset.height * scale), resizeQuality: "high"})
                    : await createImageBitmap(blob);
            cleanups.push(() => bitmap.close());
            return {source: bitmap, width: bitmap.width, height: bitmap.height, still: true};
        }
        const element = await loadVideoFrame(blob, asset.mimeType, layer.videoTime ?? 0, cleanups);
        return element && {source: element, width: element.videoWidth, height: element.videoHeight};
    } catch {
    // 读不出或解不了的素材，缩略图里留空
        return undefined;
    }
};
export const renderPageThumbnail = async function renderPageThumbnail(source: ThumbnailSource, index: number): Promise<HTMLCanvasElement> {
    const {manifest} = source;
    const page = manifest.pages[index];
    if (!page) {
        throw new Error(`no page ${index}`);
    }
    const state = stateAt(manifest, page.start + (page.duration * THUMBNAIL_AT));
    const layers = omitTitleLayers(state.layers);

    const drawables = new Map<string, DrawableAsset | PlaceholderAsset>();
    const cleanups: (() => void)[] = [];
    try {
        for (const layer of layers) {
            if (drawables.has(layer.assetId)) {
                continue;
            }
            const drawable = await loadDrawable(source, layer, cleanups);
            if (drawable) {
                drawables.set(layer.assetId, drawable);
            }
        }
        const {width, height} = thumbnailSize(manifest.canvas);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const resolve: AssetResolver = (assetId) => drawables.get(assetId);
        renderFrame(canvas.getContext("2d")!, manifest, {...state, layers}, resolve);
        return canvas;
    } finally {
        for (const cleanup of cleanups) {
            cleanup();
        }
    }
};
