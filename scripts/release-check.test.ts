// 发版一致性检查：版本号、下载文件名、协议文本。改了其中一处忘了改另一处时，这里会失败。
import {existsSync, readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {describe, expect, it} from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const version = (path: string): string => (JSON.parse(read(path)) as {version: string}).version;

const TAURI_CONFS = ["apps/desktop-player/src-tauri/tauri.conf.json", "apps/desktop-maker/src-tauri/tauri.conf.json"];
const VERSIONED_FILES = [...TAURI_CONFS, "apps/web/package.json", "apps/desktop-player/package.json", "apps/desktop-maker/package.json"];
const HOOKS = ["apps/desktop-player/src-tauri/nsis/installer-hooks.nsh", "apps/desktop-maker/src-tauri/nsis/installer-hooks.nsh"];

const VERSION = version("apps/web/package.json");
const ASSET_PATTERN = /\bqy(?:Player|Maker)-(\d+\.\d+\.\d+)-/g;

const assetNames = function assetNames(version: string): string[] {
    return [
        `qyPlayer-${version}-Setup-x64.exe`,
        `qyPlayer-${version}-x64-portable.zip`,
        `qyMaker-${version}-Setup-x64.exe`,
        `qyMaker-${version}-x64-portable.zip`,
        `qyPlayer-${version}-android-arm64.apk`,
    ];
};

const versionsIn = function versionsIn(text: string): string[] {
    return [...text.matchAll(ASSET_PATTERN)].map((m) => m[1] as string);
};

describe("版本号", () => {
    it("网页、两个桌面程序、两个 Tauri 配置的版本号一致", () => {
        for (const file of VERSIONED_FILES) {
            expect(version(file), file).toBe(VERSION);
        }
    });

    it("三个 Rust crate 的版本号与应用一致", () => {
        for (const file of ["apps/desktop-common/Cargo.toml", "apps/desktop-player/src-tauri/Cargo.toml", "apps/desktop-maker/src-tauri/Cargo.toml"]) {
            expect(/^version = "([^"]+)"/m.exec(read(file))?.[1], file).toBe(VERSION);
        }
    });
});

describe("README 的下载表格", () => {
    for (const file of ["README.md", "README.en.md"]) {
        it(`${file}：五个下载链接带当前版本，且没有“最新版”链接`, () => {
            const text = read(file);
            for (const name of assetNames(VERSION)) {
                expect(text, name).toContain(`https://github.com/Ricky2022/qyPlayer/releases/download/v${VERSION}/${name}`);
            }
            expect(text).toContain(`https://github.com/Ricky2022/qyPlayer/releases/tag/v${VERSION}`);
            expect(text).not.toContain("releases/latest/download/");
        });

        it(`${file}：出现的文件名版本都是当前版本`, () => {
            expect(new Set(versionsIn(read(file)))).toEqual(new Set([VERSION]));
        });
    }
});

describe("发布说明", () => {
    const notes = read(".github/release-notes.md");

    it("文件表格含五个带当前版本的文件名", () => {
        for (const name of assetNames(VERSION)) {
            expect(notes, name).toContain(`\`${name}\``);
        }
    });

    it("没有其他版本的文件名", () => {
        expect(new Set(versionsIn(notes))).toEqual(new Set([VERSION]));
    });
});

describe("安装包协议页", () => {
    const licensePath = "apps/desktop-common/nsis/license.zh-CN.txt";
    const SEPARATOR = "──────── 以下为许可证英文原文 ────────\n\n";

    it("中文协议文件以 BOM 开头（NSIS 才不会把中文当乱码）", () => {
        const bytes = readFileSync(resolve(ROOT, licensePath));
        expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    });

    it("中文说明声明以英文原文为准，并以仓库 LICENSE 全文结尾", () => {
        const text = read(licensePath).replace(/^\uFEFF/, "");
        const index = text.indexOf(SEPARATOR);
        expect(index).toBeGreaterThan(0);
        expect(text.slice(0, index)).toContain("以英文原文为准");
        expect(text.slice(index + SEPARATOR.length)).toBe(read("LICENSE"));
    });

    for (const hooks of HOOKS) {
        it(`${hooks} 指向存在的中文协议文件`, () => {
            const match = /!define QY_LICENSE_ZH "\$\{__FILEDIR__\}\\(.+)"/.exec(read(hooks));
            expect(match, "缺少 QY_LICENSE_ZH").not.toBeNull();
            const target = resolve(dirname(resolve(ROOT, hooks)), (match?.[1] ?? "").replaceAll("\\", "/"));
            expect(existsSync(target), target).toBe(true);
            expect(target).toBe(resolve(ROOT, licensePath));
        });
    }
});
