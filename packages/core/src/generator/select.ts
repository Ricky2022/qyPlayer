/** 影片时长三档（docs/dev-0.4.0.md 4.6）：长 = 全部素材，中、短按比例挑选 */
export const LENGTH_CHOICES = ["long", "medium", "short"] as const;
export type LengthChoice = (typeof LENGTH_CHOICES)[number];

/** 各档保留素材的比例 */
export const LENGTH_RATIO: Record<LengthChoice, number> = { long: 1, medium: 0.6, short: 0.3 };
/** 素材少于这个数量时不分档，一律全部使用 */
export const LENGTH_MIN_MEDIA = 10;

/** 目标素材数量：ceil(n × 比例)；素材太少时是全部 */
export function targetCount(total: number, length: LengthChoice): number {
  if (length === "long" || total < LENGTH_MIN_MEDIA) return total;
  return Math.ceil(total * LENGTH_RATIO[length]);
}

/**
 * 按档位挑出要用的素材，返回它们在 items 里的下标（升序）。
 * 反复在“相邻两项都有拍摄时间”的组合里找间隔最小的一对（并列取靠前的），去掉其中靠后的那项，
 * 直到只剩目标数量，这样先丢掉连拍和近似重复的照片；没有这样的一对时，按顺序均匀抽取并保留首尾。
 * 纯函数：相同输入必定得到相同结果。
 */
export function selectByLength(items: readonly { capturedAt?: string }[], length: LengthChoice): number[] {
  const kept = items.map((_, index) => index);
  const target = targetCount(items.length, length);
  while (kept.length > target) {
    let drop = -1;
    let smallest = Infinity;
    for (let i = 1; i < kept.length; i++) {
      const gap = timeGap(items[kept[i - 1]!]!, items[kept[i]!]!);
      if (gap < smallest) {
        smallest = gap;
        drop = i;
      }
    }
    if (drop < 0) return spread(kept, target);
    kept.splice(drop, 1);
  }
  return kept;
}

/** 两项拍摄时间相差的毫秒数；任何一项没有可用的拍摄时间时是 Infinity */
function timeGap(a: { capturedAt?: string }, b: { capturedAt?: string }): number {
  const x = a.capturedAt === undefined ? NaN : Date.parse(a.capturedAt);
  const y = b.capturedAt === undefined ? NaN : Date.parse(b.capturedAt);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(y - x) : Infinity;
}

/** 从 kept 里均匀取 count 项，保留第一项和最后一项 */
function spread(kept: readonly number[], count: number): number[] {
  if (count <= 1) return kept.slice(0, count);
  return Array.from({ length: count }, (_, i) => kept[Math.round((i * (kept.length - 1)) / (count - 1))]!);
}
