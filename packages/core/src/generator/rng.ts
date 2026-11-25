/** 带种子的伪随机数生成器（mulberry32）。相同种子产生相同序列，保证生成结果可复现（PRD F-GEN-08）。 */
export interface Rng {
    /** [0, 1) */
    next: () => number;
    /** 按权重从候选中选一个；权重为 0 的候选不会被选中。候选为空时抛错。 */
    weighted: <T>(items: readonly {
        value: T;
        weight: number;
    }[]) => T;
    /** 从列表中均匀选一个 */
    pick: <T>(items: readonly T[]) => T;
}

export const createRng = function createRng(seed: number): Rng {
    let state = seed >>> 0;
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        weighted<T>(items: readonly {
            value: T;
            weight: number;
        }[]): T {
            const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
            if (total <= 0) {
                throw new Error("weighted(): no candidate with positive weight");
            }
            let r = next() * total;
            for (const item of items) {
                const w = Math.max(0, item.weight);
                if (r < w) {
                    return item.value;
                }
                r -= w;
            }
            return items[items.length - 1]!.value;
        },
        pick<T>(items: readonly T[]): T {
            if (items.length === 0) {
                throw new Error("pick(): empty list");
            }
            return items[Math.min(items.length - 1, Math.floor(next() * items.length))]!;
        },
    };
};
