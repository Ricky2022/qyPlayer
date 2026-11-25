import {describe, expect, it} from "vitest";
import {FILMSTRIP_STORAGE_KEY, loadFilmstripSetting, saveFilmstripSetting, type StorageLike} from "./filmstripSetting";

const memoryStorage = function memoryStorage(initial: Record<string, string> = {}): StorageLike & {data: Record<string, string>} {
    const data = {...initial};
    // eslint-disable-next-line no-void
    return {data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value)};
};

describe("缩略图条设置", () => {
    it("没有保存过时默认不显示", () => {
        expect(loadFilmstripSetting(memoryStorage())).toBe(false);
    });

    it("保存后能读回，并且可以再关掉", () => {
        const storage = memoryStorage();
        saveFilmstripSetting(true, storage);
        expect(storage.data[FILMSTRIP_STORAGE_KEY]).toBe("on");
        expect(loadFilmstripSetting(storage)).toBe(true);
        saveFilmstripSetting(false, storage);
        expect(loadFilmstripSetting(storage)).toBe(false);
    });

    it("不认识的值按不显示处理", () => {
        expect(loadFilmstripSetting(memoryStorage({[FILMSTRIP_STORAGE_KEY]: "yes"}))).toBe(false);
    });

    it("读写出错或没有存储时不抛错", () => {
        const broken: StorageLike = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        };
        expect(loadFilmstripSetting(broken)).toBe(false);
        expect(() => saveFilmstripSetting(true, broken)).not.toThrow();
        expect(() => saveFilmstripSetting(true, undefined)).not.toThrow();
    });
});
