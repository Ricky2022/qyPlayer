// 页的编排（docs/dev-0.4.1.md 第 2 节）：生成器里所有“挑选”的结果。
// 自动编排由 planPages 产出；单页编辑后由制作器保存，再交给组装部分算出清单。

export const KEN_BURNS_KINDS = ["none", "in", "out", "left", "right", "up", "down"] as const;
export type KenBurns = typeof KEN_BURNS_KINDS[number];

/** 取景：zoom 是相对“铺满”的放大倍数；(x, y) 是可见区域中心在素材上的位置（0..1） */
export interface Crop {
    zoom: number;
    x: number;
    y: number;
}

export const CROP_MIN_ZOOM = 1;
export const CROP_MAX_ZOOM = 3;

/** 入场动画的选择；延迟和时长由组装部分按页内顺序算 */
export interface EnterChoice {
    type: string;
    direction?: string;
}

export interface ItemPlan {
    assetId: string;
    /** 缺省：按裁切损失自动 */
    fit?: "cover" | "contain";
    crop?: Crop;
    /** 缺省按 none 处理；planPages 给每个单张照片页都写上 */
    kenBurns?: KenBurns;
    /** 仅视频；缺省居中截取 */
    clipStart?: number;
    /** 仅多图页使用；缺省为淡入 */
    enter?: EnterChoice;
    /** 仅视频：为 true 时这个视频不出声（docs/dev-0.6.0.md 1） */
    muted?: boolean;
}

export interface PagePlan {
    /** 顺序即格子顺序 */
    items: ItemPlan[];
    /** 版式编号；缺省为该张数的默认版式 */
    layout?: string;
    transition?: {
        type: string;
        direction?: string;
    };
    /** 秒；缺省自动。视频页指片段长度 */
    duration?: number;
}

export const MAX_PAGE_ITEMS = 4;

/**
 * 检查编排是否能用于这批素材，返回第一个问题的描述，没有问题返回 null。
 * 规则：每个素材恰好出现一次；每页 1 到 4 个；视频独占一页；取景放大倍数在范围内；时长大于 0；只有视频能静音。
 */
export const planProblems = function planProblems(pages: readonly PagePlan[], media: readonly {
    id: string;
    type: "image" | "video";
}[]): string | null {
    if (pages.length === 0) {
        return "the plan has no pages";
    }
    const types = new Map(media.map((m) => [m.id, m.type]));
    const seen = new Set<string>();
    for (const [index, page] of pages.entries()) {
        const at = `page ${index + 1}`;
        if (page.items.length < 1 || page.items.length > MAX_PAGE_ITEMS) {
            return `${at} must hold 1 to ${MAX_PAGE_ITEMS} items`;
        }
        if (page.duration !== undefined && !(page.duration > 0)) {
            return `${at} has a non-positive duration`;
        }
        for (const item of page.items) {
            const type = types.get(item.assetId);
            if (!type) {
                return `${at} uses unknown media ${item.assetId}`;
            }
            if (seen.has(item.assetId)) {
                return `media ${item.assetId} is used more than once`;
            }
            seen.add(item.assetId);
            if (type === "video" && page.items.length > 1) {
                return `${at}: a video must have a page of its own`;
            }
            if (item.muted !== undefined && type !== "video") {
                return `${at}: only a video can be muted`;
            }
            if (item.crop) {
                const {zoom, x, y} = item.crop;
                if (!(zoom >= CROP_MIN_ZOOM && zoom <= CROP_MAX_ZOOM) || !Number.isFinite(x) || !Number.isFinite(y)) {
                    return `${at}: invalid crop`;
                }
                if (type === "video") {
                    return `${at}: a video cannot be cropped`;
                }
            }
        }
    }
    if (seen.size !== media.length) {
        return "the plan does not use every media file";
    }
    return null;
};
