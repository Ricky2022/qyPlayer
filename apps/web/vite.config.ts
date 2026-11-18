import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

const BUILTIN_MUSIC = "samples/bgm-goldberg-var1.mp3";

/** 制作器的网页产物只带内置配乐这一个文件，不带 public/ 下的示例包 */
function emitBuiltinMusic(): Plugin {
  return {
    name: "emit-builtin-music",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: BUILTIN_MUSIC, source: readFileSync(resolve(root, "public", BUILTIN_MUSIC)) });
    },
  };
}

/**
 * 三种构建：
 * - 默认：完整网站（播放器、制作页、示例、配乐、开发用页面），输出到 dist/
 * - --mode player：桌面播放器用，只有播放页，输出到 dist-player/
 * - --mode maker：桌面制作器用，只有制作页和内置配乐，输出到 dist-maker/
 */
export default defineConfig(({ mode }) => {
  const pages: Record<string, string> = {
    main: resolve(root, "index.html"),
    create: resolve(root, "create.html"),
    playground: resolve(root, "playground.html"),
    bench: resolve(root, "bench.html"),
  };
  const target = mode === "player" || mode === "maker" ? mode : "site";
  const input = target === "player" ? { main: pages.main! } : target === "maker" ? { create: pages.create! } : pages;

  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    // 相对路径：发布到 GitHub Pages 的子路径（/仓库名/）下也能找到资源
    base: "./",
    plugins: [react(), ...(target === "maker" ? [emitBuiltinMusic()] : [])],
    // 桌面版不复制 public/（示例包和配乐只有网站和制作器需要）
    publicDir: target === "site" ? "public" : false,
    server: { fs: { allow: [resolve(root, "../..")] } },
    build: {
      outDir: target === "site" ? "dist" : `dist-${target}`,
      rollupOptions: { input },
    },
  };
});
