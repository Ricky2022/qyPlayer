import {hasAssetTypeInfo, type Asset, type Manifest} from "@qyplayer/core";

/** 预检要问浏览器的三件事，测试里换成桩 */
export interface PreflightEnv {
    /** HTMLVideoElement.canPlayType，空字符串表示不能播 */
    canPlayVideo: (type: string) => string;
    /** HTMLAudioElement.canPlayType */
    canPlayAudio: (type: string) => string;
    /** 试解码一张图片（createImageBitmap 后立即 close）；不能解码时抛错 */
    decodeImage: (blob: Blob) => Promise<void>;
}

export interface PreflightResult {
    /** 本设备无法播放的素材 id（图片、视频、音频） */
    unsupported: ReadonlySet<string>;
}

/** 无需检查、视为支持的图片和音频类型（dev-0.3.0 6.1） */
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_AUDIO_TYPES = new Set(["audio/wav", "audio/mpeg"]);
/** 试解码图片的并行数上限 */
const DECODE_CONCURRENCY = 2;
/** 提示里最多列出的页码数 */
export const MAX_LISTED_PAGES = 10;

export const browserPreflightEnv = function browserPreflightEnv(): PreflightEnv {
    const video = document.createElement("video");
    const audio = document.createElement("audio");
    return {
        canPlayVideo: (type) => video.canPlayType(type),
        canPlayAudio: (type) => audio.canPlayType(type),
        decodeImage: async (blob) => {
            (await createImageBitmap(blob)).close();
        },
    };
};

/**
 * 视频实际用来播放的类型：MOV（video/quicktime）的容器和 MP4 相同，
 * 浏览器只认 video/mp4，所以问它和创建 Blob 时都换成 video/mp4，保留 codecs 参数。
 */
export const playbackMimeType = function playbackMimeType(mimeType: string): string {
    return mimeType.replace(/^video\/quicktime(?=;|$)/i, "video/mp4");
};

/** 去掉 codecs 等参数后的小写主类型 */
const baseType = function baseType(mimeType: string): string {
    return (mimeType.split(";")[0] ?? "").trim().toLowerCase();
};

/** 并行度受限地逐个执行 */
const runLimited = async function runLimited<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            await task(items[next++] as T);
        }
    };
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
};

/**
 * 打开包时检查素材能否在本设备播放。只检查格式 0.2 起的包，0.1 的包不检查。
 * 图片不在白名单内就读出来试解码一次；视频和音频问 canPlayType。
 * 要试解码（会读文件、较慢）时，开始前调用一次 onChecking，便于界面显示“正在检查素材”。
 */
export const preflightAssets = async function preflightAssets(
    manifest: Manifest,
    readBlob: (path: string) => Promise<Blob>,
    env: PreflightEnv,
    onChecking?: () => void,
): Promise<PreflightResult> {
    const unsupported = new Set<string>();
    if (!hasAssetTypeInfo(manifest.formatVersion)) {
        return {unsupported};
    }

    const toDecode: Asset[] = [];
    for (const asset of manifest.assets) {
        const mimeType = asset.mimeType ?? "";
        if (asset.type === "image") {
            if (!SUPPORTED_IMAGE_TYPES.has(baseType(mimeType))) {
                toDecode.push(asset);
            }
        } else if (asset.type === "video") {
            if (env.canPlayVideo(playbackMimeType(mimeType)) === "") {
                unsupported.add(asset.id);
            }
        } else if (!SUPPORTED_AUDIO_TYPES.has(baseType(mimeType)) && env.canPlayAudio(mimeType) === "") {
            unsupported.add(asset.id);
        }
    }

    if (toDecode.length > 0) {
        onChecking?.();
        await runLimited(toDecode, DECODE_CONCURRENCY, async (asset) => {
            // 读取失败（包损坏）直接抛出，由打开流程报错；只有解码失败才算“本设备不支持”
            const blob = await readBlob(asset.src);
            try {
                await env.decodeImage(blob);
            } catch {
                unsupported.add(asset.id);
            }
        });
    }
    return {unsupported};
};

/** 用到了这些素材的页码（从 1 开始，去重、升序）。背景音乐不在页里，不计入。 */
export const pagesUsing = function pagesUsing(manifest: Manifest, assetIds: ReadonlySet<string>): number[] {
    const pages: number[] = [];
    manifest.pages.forEach((page, index) => {
        if (page.items.some((item) => assetIds.has(item.assetId))) {
            pages.push(index + 1);
        }
    });
    return pages;
};
