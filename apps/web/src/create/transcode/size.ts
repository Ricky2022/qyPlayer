// 视频转码的目标尺寸（docs/dev-0.3.0.md 5.5，T-08）。纯逻辑。

const LANDSCAPE_BOX = {width: 1920, height: 1080};
const PORTRAIT_BOX = {width: 1080, height: 1920};
/** 转码输出的帧率上限；源视频帧率更低时保持原样 */
export const VIDEO_MAX_FPS = 30;
/** 转码输出的视频码率（约 8 Mbps） */
export const VIDEO_BITRATE = 8_000_000;

const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2));

/**
 * 显示尺寸超过 1080p 时返回缩小后的尺寸，否则返回 null（不放大、不缩小）。
 * 横屏不超过 1920×1080，竖屏不超过 1080×1920，宽高取偶数（H.264 的要求）。
 */
export const fitVideoSize = function fitVideoSize(width: number, height: number): {
    width: number;
    height: number;
} | null {
    const box = width >= height ? LANDSCAPE_BOX : PORTRAIT_BOX;
    const scale = Math.min(1, box.width / width, box.height / height);
    if (scale === 1) {
        return null;
    }
    return {width: even(width * scale), height: even(height * scale)};
};
