import {describe, expect, it} from "vitest";
import {PageThumbnails, THUMBNAIL_LONG_SIDE, omitTitleLayers, thumbnailSize} from "./thumbnails";

/** 可以手动完成的任务，用来观察排队 */
const deferred = function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => resolve = r);
    return {promise, resolve};
};

describe("PageThumbnails", () => {
    it("一次只画一页，按请求顺序排队", async () => {
        const started: number[] = [];
        const gates = new Map<number, ReturnType<typeof deferred<string>>>();
        const thumbs = new PageThumbnails<string>(async (index) => {
            started.push(index);
            const gate = deferred<string>();
            gates.set(index, gate);
            return gate.promise;
        });
        const a = thumbs.get(0);
        const b = thumbs.get(1);
        const c = thumbs.get(2);
        await Promise.resolve();
        await Promise.resolve();
        expect(started).toEqual([0]);
        gates.get(0)!.resolve("a");
        await a;
        await Promise.resolve();
        await Promise.resolve();
        expect(started).toEqual([0, 1]);
        gates.get(1)!.resolve("b");
        await b;
        await Promise.resolve();
        await Promise.resolve();
        expect(started).toEqual([0, 1, 2]);
        gates.get(2)!.resolve("c");
        await expect(c).resolves.toBe("c");
    });

    it("同一页只画一次，之后直接用缓存", async () => {
        let calls = 0;
        // eslint-disable-next-line @typescript-eslint/require-await
        const thumbs = new PageThumbnails<number>(async (index) => (calls++, index));
        expect(await thumbs.get(3)).toBe(3);
        expect(await thumbs.get(3)).toBe(3);
        expect(calls).toBe(1);
    });

    it("画失败不会卡住队列，失败的页下次请求时重试", async () => {
        let attempts = 0;
        // eslint-disable-next-line @typescript-eslint/require-await
        const thumbs = new PageThumbnails<string>(async (index) => {
            if (index === 0 && attempts++ === 0) {
                throw new Error("boom");
            }
            return `ok${index}`;
        });
        await expect(thumbs.get(0)).rejects.toThrow("boom");
        expect(await thumbs.get(1)).toBe("ok1");
        expect(await thumbs.get(0)).toBe("ok0");
    });

    it("释放后不再画新的页", async () => {
        let calls = 0;
        // eslint-disable-next-line @typescript-eslint/require-await
        const thumbs = new PageThumbnails<number>(async () => ++calls);
        thumbs.dispose();
        await expect(thumbs.get(0)).rejects.toThrow();
        expect(calls).toBe(0);
    });
});

describe("omitTitleLayers", () => {
    it("去掉片头标题层，没有标题层时不复制数组", () => {
        const photo = {role: undefined, id: "m1"};
        const title = {role: "title" as const, id: "t1"};
        const onlyPhoto = [photo];
        expect(omitTitleLayers(onlyPhoto)).toBe(onlyPhoto);
        expect(omitTitleLayers([photo, title])).toEqual([photo]);
    });
});

describe("thumbnailSize", () => {
    it("长边固定，保持画布宽高比", () => {
        expect(thumbnailSize({width: 1920, height: 1080})).toEqual({width: THUMBNAIL_LONG_SIDE, height: 144});
        expect(thumbnailSize({width: 1080, height: 1920})).toEqual({width: 144, height: THUMBNAIL_LONG_SIDE});
    });
});
