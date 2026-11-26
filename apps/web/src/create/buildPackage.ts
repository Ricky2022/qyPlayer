import {CANVAS_SIZE, defaultAspectRatio, generateManifest, planPages, type AspectRatio, type AssetSource, type Manifest, type Look, type MediaInput, type PagePlan, type TransitionChoice} from "@qyplayer/core";
import {writePackage} from "@qyplayer/qyp";
import {extensionForMimeType} from "./mediaType";
import {TITLE_ASSET_ID, TITLE_PATH, renderTitleCard, type TitleCardRequest} from "./titleCard";

/** 写进清单 generator.version 的应用版本；测试环境没有构建时注入的常量，用 0.0.0 */
const APP_VERSION = typeof __APP_VERSION__ === "undefined" ? "0.0.0" : __APP_VERSION__;

/** 已导入、可以放进影片的图片或视频：播放文件是原始文件的原样字节，或转码后的结果（见 source） */
export interface MediaEntry {
    /** 原文件名，用于排序的次级键和界面显示 */
    fileName: string;
    type: "image" | "video";
    blob: Blob;
    /** blob 的类型，写法见 docs/dev-0.3.0.md 4.3（含编码信息） */
    mimeType: string;
    /** 用户选的原始文件的类型，以及 blob 是否由它转码得到 */
    source: AssetSource;
    width: number;
    height: number;
    /** 视频必需，秒 */
    duration?: number;
    hasAudio?: boolean;
    /** 拍摄时间，UTC 的 ISO 8601 */
    capturedAt?: string;
    /** 拍摄时间其实是文件的修改时间（读不到 EXIF 或容器时间），界面要标注 */
    capturedAtFromModified?: boolean;
    /** 原始文件的大小（字节）；手机的素材总量限制按它累计。缺省时用 blob 的大小 */
    originalBytes?: number;
}

export interface MusicEntry {
    blob: Blob;
    /** blob 的类型，如 audio/mpeg、audio/mp4; codecs="mp4a.40.2" */
    mimeType: string;
    /** 缺省表示原样使用（transcoded 为 false） */
    source?: AssetSource;
    duration: number;
    title?: string;
    license?: string;
}

export interface BuildOptions {
    /** 按列表顺序使用，不再按拍摄时间重排 */
    media: readonly MediaEntry[];
    music?: MusicEntry;
    /** 缺省时按素材方向自动选择 */
    aspectRatio?: AspectRatio;
    templateId: string;
    /** 缺省表示转场跟随模板 */
    transition?: TransitionChoice;
    /** 缺省表示原片 */
    look?: Look;
    seed: number;
    /** 手动编排（单页编辑），素材用 idFor(位置) 的 id；缺省表示自动编排。给了就写进清单的 generator.plan */
    pages?: readonly PagePlan[];
    /** 整片的视频原声音量（0 到 1）；缺省时有配乐为 0，没有配乐为 1 */
    videoVolume?: number;
    /** 配乐音量（0 到 1），写进 bgm.volume；缺省 1 */
    musicVolume?: number;
    /** 有声视频页上配乐的增益（0 到 1），写进 bgm.duck；缺省 1 */
    duck?: number;
    /** 缺省时用生成器的默认标题。空字符串写进清单，并且不画片头 */
    title?: string;
    /** 副标题；写进清单，用于重新打开时还原 */
    subtitle?: string;
    /** 画好的片头标题图片（与画布同尺寸的透明 PNG）；缺省则影片没有片头标题 */
    titleImage?: Blob;
    /** 默认标题里“日期 + 词”的词，界面按语言传入 */
    defaultTitleWord?: string;
}

/** 要放进包里的一个文件 */
export interface BlobFile {
    path: string;
    data: Blob;
}

export interface BuiltPackage {
    blob: Blob;
    manifest: Manifest;
}

/** 第 index 个素材在清单里的 id（m001、m002……） */
export const idFor = function idFor(index: number): string {
    return `m${String(index + 1).padStart(3, "0")}`;
};

/** 包内扩展名按 4.3 的表取；表外的类型（只可能来自别的程序生成的包）退回该类型的通用扩展名，播放器以 mimeType 为准 */
const extensionFor = function extensionFor(entry: MediaEntry): string {
    return extensionForMimeType(entry.mimeType) ?? (entry.type === "image" ? ".jpg" : ".mp4");
};

/** 第 index 个素材交给生成器的描述；包内路径统一重命名为 media/m001.jpg 这样，不把用户的文件名带进路径 */
export const mediaInputOf = function mediaInputOf(entry: MediaEntry, index: number): MediaInput {
    const id = idFor(index);
    return {
        id,
        type: entry.type,
        src: `media/${id}${extensionFor(entry)}`,
        mimeType: entry.mimeType,
        source: entry.source,
        fileName: entry.fileName,
        width: entry.width,
        height: entry.height,
        ...entry.duration !== undefined && {duration: entry.duration},
        ...entry.hasAudio !== undefined && {hasAudio: entry.hasAudio},
        ...entry.capturedAt !== undefined && {capturedAt: entry.capturedAt},
    };
};

/** 画面比例：指定了用指定的，否则按素材方向自动选 */
const aspectOf = function aspectOf(options: Pick<BuildOptions, "media" | "aspectRatio">): AspectRatio {
    return options.aspectRatio ?? defaultAspectRatio(options.media.map(mediaInputOf));
};

/** 只做自动编排（不打包）：输入与 planPackage 里的自动编排完全相同，所以结果相同 */
export const planPagesFor = function planPagesFor(options: Pick<BuildOptions, "media" | "aspectRatio" | "templateId" | "seed" | "transition">): PagePlan[] {
    return planPages({
        media: options.media.map(mediaInputOf),
        aspectRatio: aspectOf(options),
        templateId: options.templateId,
        seed: options.seed,
        keepOrder: true,
        ...options.transition && {transition: options.transition},
    });
};

/** 按列表顺序生成清单，并列出要放进包里的文件。 */
export const planPackage = function planPackage(options: BuildOptions): {
    manifest: Manifest;
    files: BlobFile[];
} {
    const media = options.media.map(mediaInputOf);
    const files: BlobFile[] = options.media.map((entry, index) => ({path: media[index]!.src, data: entry.blob}));

    let music;
    if (options.music) {
        const src = `audio/bgm${extensionForMimeType(options.music.mimeType) ?? ".mp3"}`;
        files.push({path: src, data: options.music.blob});
        music = {
            id: "bgm",
            src,
            mimeType: options.music.mimeType,
            source: options.music.source ?? {mimeType: options.music.mimeType, transcoded: false},
            duration: options.music.duration,
            ...options.music.title !== undefined && {title: options.music.title},
            ...options.music.license !== undefined && {license: options.music.license},
            ...options.musicVolume !== undefined && {volume: options.musicVolume},
            ...options.duck !== undefined && {duck: options.duck},
        };
    }

    const titleGiven = options.title !== undefined;
    const title = options.title?.trim() ?? "";
    const subtitle = options.subtitle?.trim();
    const aspectRatio = aspectOf(options);
    if (options.titleImage) {
        files.push({path: TITLE_PATH, data: options.titleImage});
    }
    const manifest = generateManifest({
        media,
        aspectRatio,
        ...options.titleImage && {titleCard: {id: TITLE_ASSET_ID, src: TITLE_PATH, mimeType: "image/png", ...CANVAS_SIZE[aspectRatio]}},
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        ...subtitle && {subtitle},
        templateId: options.templateId,
        seed: options.seed,
        keepOrder: true,
        ...options.pages && {pages: options.pages},
        ...options.transition && {transition: options.transition},
        ...options.look && {look: options.look},
        ...titleGiven && {title},
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        ...options.defaultTitleWord && {defaultTitleWord: options.defaultTitleWord},
        ...music && {music},
        ...options.videoVolume !== undefined && {videoVolume: options.videoVolume},
        generator: {name: "qyPlayer web", version: APP_VERSION},
    });
    // 手动编排写进 generator.plan（私有数据，播放器不读），重新打开时据此还原
    if (options.pages && manifest.generator) {
        manifest.generator.plan = options.pages;
    }
    return {manifest, files};
};

/** 画片头标题图片的函数；测试里可以换成假的 */
export type RenderTitleImage = (request: TitleCardRequest) => Promise<Blob>;

/**
 * 同 planPackage，但 show 为 true 时先生成一次清单得到最终标题和画布尺寸，
 * 据此画出标题图片再生成第二次。两次的排版相同（标题图片不影响随机数），只有第二次放进了标题。
 */
export const planPackageWithTitle = async function planPackageWithTitle(
    options: BuildOptions,
    show: boolean,
    render: RenderTitleImage = renderTitleCard,
): Promise<{
    manifest: Manifest;
    files: BlobFile[];
}> {
    const first = planPackage(options);
    // 没勾选，或标题是空的：清单里不放片头图。预览里已有的图由调用方重画成空白
    if (!show || first.manifest.title.trim() === "") {
        return first;
    }
    const {width, height} = first.manifest.canvas;
    const titleImage = await render({title: first.manifest.title, subtitle: first.manifest.subtitle ?? "", width, height});
    return planPackage({...options, titleImage});
};

/** 按列表顺序生成清单并打成 .qyp */
export const buildPackage = async function buildPackage(options: BuildOptions): Promise<BuiltPackage> {
    const {manifest, files} = planPackage(options);
    return {blob: await writePackage(manifest, files), manifest};
};
