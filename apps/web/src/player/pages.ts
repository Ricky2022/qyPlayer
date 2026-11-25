import type {Manifest} from "@qyplayer/core";

/** 回到本页开头还是回到上一页：本页已经播放超过这么多秒，“上一页”回到本页开头 */
export const RESTART_PAGE_AFTER_SECONDS = 1;

/** 时刻 t 所在页的下标（与时间线引擎 stateAt 一致：恰在两页交界时算后一页，影片结束时算最后一页） */
export const pageIndexAt = function pageIndexAt(manifest: Manifest, t: number): number {
    const pages = manifest.pages;
    for (let i = 0; i < pages.length; i++) {
        if (t < pages[i]!.start + pages[i]!.duration) {
            return i;
        }
    }
    return Math.max(0, pages.length - 1);
};

/** 跳到第 index 页时应定位的时刻：该页转场刚结束、画面完整出现的时候。第一页从 0 开始 */
export const pageSeekTime = function pageSeekTime(manifest: Manifest, index: number): number {
    const page = manifest.pages[Math.min(Math.max(index, 0), manifest.pages.length - 1)];
    if (!page) {
        return 0;
    }
    if (index <= 0) {
        return 0;
    }
    return page.start + Math.min(page.transitionIn?.duration ?? 0, page.duration);
};

/** “下一页”的目标时刻；已经是最后一页时返回 undefined */
export const nextPageTime = function nextPageTime(manifest: Manifest, t: number): number | undefined {
    const next = pageIndexAt(manifest, t) + 1;
    return next < manifest.pages.length ? pageSeekTime(manifest, next) : undefined;
};

/** “上一页”的目标时刻：本页已播放一阵就回到本页开头，否则回到上一页 */
export const previousPageTime = function previousPageTime(manifest: Manifest, t: number): number {
    const index = pageIndexAt(manifest, t);
    const here = pageSeekTime(manifest, index);
    if (index === 0 || t - here > RESTART_PAGE_AFTER_SECONDS) {
        return here;
    }
    return pageSeekTime(manifest, index - 1);
};
