// 清单类型，与 spec/manifest.schema.json 和 PRD 7.5 一一对应。
// type / direction 字段声明为 string：按 PRD 7.6 播放器必须容忍未知取值并降级处理。

export type AspectRatio = "16:9" | "9:16";
export type Direction = "left" | "right" | "up" | "down";
export type Fit = "cover" | "contain";
export type AssetType = "image" | "video" | "audio";

export const KNOWN_TRANSITION_TYPES = ["none", "fade", "slide", "zoom", "rotate"] as const;
export const KNOWN_ENTER_TYPES = ["none", "fade", "slide", "scale"] as const;
export const KNOWN_DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];

export interface Frame {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface GeneratorInfo {
    name: string;
    version: string;
    templateId?: string;
    seed?: number;
    /** 格式 0.3：用户选的转场，用于重新打开时还原；缺省表示跟随模板 */
    transition?: string;
    /** 0.4.1：单页编辑后的编排（PagePlan[]，素材用清单里的 id）；生成器的私有数据，播放器不读，缺省表示自动编排 */
    plan?: unknown;
}

export interface Canvas {
    aspectRatio: AspectRatio;
    width: number;
    height: number;
    background: string;
    /** 格式 0.3：留空处的背景。"blur" 为模糊背景；缺省或不认识的值只用 background */
    backdrop?: string;
}

/** 素材转码前的类型；包格式 0.2 起每个素材都记录（见 docs/dev-0.3.0.md 4.2） */
export interface AssetSource {
    mimeType: string;
    transcoded: boolean;
}

export interface Asset {
    id: string;
    type: AssetType;
    src: string;
    /** 包格式 0.2 起必填；0.1 的包没有 */
    mimeType?: string;
    source?: AssetSource;
    width?: number;
    height?: number;
    duration?: number;
    hasAudio?: boolean;
    capturedAt?: string;
    original?: string;
    title?: string;
    license?: string;
}

export interface Bgm {
    assetId: string;
    volume?: number;
    loop?: boolean;
    fadeIn?: number;
    fadeOut?: number;
    /** 格式 0.4：有声视频页上配乐的增益系数（0 到 1）；缺省为 1，不压低 */
    duck?: number;
}

export interface TransitionIn {
    type: string;
    direction?: string;
    duration: number;
}

export interface Enter {
    type: string;
    direction?: string;
    delay?: number;
    duration: number;
}

/** Ken Burns 的一个关键状态：scale 相对于素材按 fit 放好后的大小；x、y 以格子宽、高为单位 */
export interface MotionState {
    scale: number;
    x: number;
    y: number;
}

/** 格式 0.3：素材在整页时长内从 from 匀速变到 to */
export interface Motion {
    from: MotionState;
    to: MotionState;
}

export interface Item {
    assetId: string;
    frame: Frame;
    fit?: Fit;
    clipStart?: number;
    enter?: Enter;
    /** 格式 0.3 */
    motion?: Motion;
    /** 格式 0.4：为 true 时这个视频不出声；只对视频有意义 */
    muted?: boolean;
}

export interface Page {
    id: string;
    start: number;
    duration: number;
    transitionIn?: TransitionIn;
    items: Item[];
}

/** 格式 0.3：片头标题图片的显示时间。start、duration、fadeIn、fadeOut 都是秒 */
export interface TitleCard {
    assetId: string;
    start: number;
    duration: number;
    fadeIn: number;
    fadeOut: number;
}

export const KNOWN_LOOKS = ["mono", "warm", "cool", "vintage"] as const;
export type Look = typeof KNOWN_LOOKS[number];

export interface Manifest {
    formatVersion: string;
    id: string;
    title: string;
    createdAt: string;
    generator?: GeneratorInfo;
    canvas: Canvas;
    duration: number;
    cover?: string;
    assets: Asset[];
    bgm?: Bgm;
    pages: Page[];
    /** 格式 0.3：整片滤镜；缺省或不认识的值按原片 */
    look?: string;
    /** 格式 0.3 */
    subtitle?: string;
    /** 格式 0.3 */
    titleCard?: TitleCard;
    /** 格式 0.4：整片的视频原声音量（0 到 1）；缺省时有 bgm 为 0，没有 bgm 为 1 */
    videoVolume?: number;
}

/** 本实现支持的清单格式版本。1.0 之前只接受列表里的版本（PRD 7.6）；0.2 起新写入的包用最后一个。 */
export const SUPPORTED_FORMAT_VERSIONS: readonly string[] = ["0.1", "0.2", "0.3", "0.4"];

/** 新生成的包使用的格式版本 */
export const CURRENT_FORMAT_VERSION = "0.4";

/** 0.2 起每个素材都带 mimeType 和 source（之后的版本沿用） */
export const hasAssetTypeInfo = function hasAssetTypeInfo(formatVersion: string): boolean {
    return formatVersion === "0.2" || formatVersion === "0.3" || formatVersion === "0.4";
};

/** 清单引用的全部包内路径（素材、原片、封面），用于路径安全校验和缺失文件检查。 */
export const referencedPaths = function referencedPaths(manifest: Manifest): string[] {
    const paths = new Set<string>();
    for (const asset of manifest.assets) {
        paths.add(asset.src);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (asset.original) {
            paths.add(asset.original);
        }
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (manifest.cover) {
        paths.add(manifest.cover);
    }
    return [...paths];
};
