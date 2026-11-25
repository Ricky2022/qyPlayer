import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import react from "@vitejs/plugin-react";
import {defineConfig, type Plugin} from "vite";
import {BUILTIN_TRACKS} from "./src/create/builtinMusicInfo";

const root = import.meta.dirname;
const {version} = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {version: string};

/** 制作器的网页产物只带内置配乐，不带 public/ 下的示例包 */
const emitBuiltinMusic = function emitBuiltinMusic(): Plugin {
    return {
        name: "emit-builtin-music",
        generateBundle() {
            for (const {path} of BUILTIN_TRACKS) {
                this.emitFile({type: "asset", fileName: path, source: readFileSync(resolve(root, "public", path))});
            }
        },
    };
};

/**
 * 启动守卫作为独立的普通脚本发出去（不走打包）。
 * 主脚本在老旧 WebView 上解析失败时，它仍然能运行并把原因显示在屏幕上。
 */
const emitBootGuard = function emitBootGuard(): Plugin {
    return {
        name: "emit-boot-guard",
        generateBundle() {
            this.emitFile({type: "asset", fileName: "boot-guard.js", source: readFileSync(resolve(root, "boot-guard.js"))});
        },
    };
};

/**
 * 三种构建：
 * - 默认：完整网站（播放器、制作页、示例、配乐、开发用页面），输出到 dist/
 * - --mode player：桌面播放器用，只有播放页，输出到 dist-player/
 * - --mode maker：桌面制作器用，只有制作页和内置配乐，输出到 dist-maker/
 */
export default defineConfig(({mode}) => {
    const pages: Record<string, string> = {
        main: resolve(root, "index.html"),
        create: resolve(root, "create.html"),
        playground: resolve(root, "playground.html"),
        bench: resolve(root, "bench.html"),
    };
    const target = mode === "player" || mode === "maker" ? mode : "site";
    const input = target === "player" ? {main: pages.main!} : target === "maker" ? {create: pages.create!} : pages;

    return {
        define: {__APP_VERSION__: JSON.stringify(version)},
        // 相对路径：发布到 GitHub Pages 的子路径（/仓库名/）下也能找到资源
        base: "./",
        plugins: [react(), emitBootGuard(), ...target === "maker" ? [emitBuiltinMusic()] : []],
        // 桌面版不复制 public/（示例包和配乐只有网站和制作器需要）
        publicDir: target === "site" ? "public" : false,
        server: {fs: {allow: [resolve(root, "../..")]}},
        build: {
            outDir: target === "site" ? "dist" : `dist-${target}`,
            // 手机壳里用的是系统自带的 WebView，版本可能比 Chrome 桌面版老很多（Android 10 出厂只有 74），
            // Vite 默认按 Chrome 107+ 输出，老旧 WebView 会直接解析失败、页面一片空白。这里降保守一些。
            target: ["chrome80", "edge80", "firefox78", "safari14"],
            rollupOptions: {input},
        },
    };
});
