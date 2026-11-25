/**
 * 播放用的墙钟：记录"影片时间 = 基准 + 经过的真实时间"，由调用方传入 now（毫秒）。
 * 有背景音乐时由音频校准它（PRD 第 9 节：音频是主时钟），没有时它自己走。
 * 不依赖任何浏览器接口，便于单元测试。
 */
export class Clock {
    private base = 0;
    private startedAt: number | null = null;

    constructor(private readonly duration: number) {}

    get playing(): boolean {
        return this.startedAt !== null;
    }

    /** 影片时间（秒），不超过总时长 */
    time(now: number): number {
        if (this.startedAt === null) {
            return this.base;
        }
        return Math.min(this.duration, this.base + ((now - this.startedAt) / 1000));
    }

    play(now: number): void {
        if (this.startedAt === null) {
            this.startedAt = now;
        }
    }

    pause(now: number): void {
        this.base = this.time(now);
        this.startedAt = null;
    }

    /** 跳到指定时间；正在播放则继续播放。同时用于音频校准 */
    seek(t: number, now: number): void {
        this.base = Math.min(this.duration, Math.max(0, t));
        if (this.startedAt !== null) {
            this.startedAt = now;
        }
    }
}

/** 两个位置的距离。period 给出时按循环处理：循环音频刚好绕回开头时不应被误判为严重漂移。 */
export const distance = function distance(a: number, b: number, period?: number): number {
    const d = Math.abs(a - b);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return period && period > 0 ? Math.min(d, period - d) : d;
};
