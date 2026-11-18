import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // 相对路径：发布到 GitHub Pages 的子路径（/仓库名/）下也能找到资源
  base: "./",
  plugins: [react()],
  server: { fs: { allow: [resolve(__dirname, "../..")] } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        create: resolve(__dirname, "create.html"),
        playground: resolve(__dirname, "playground.html"),
        bench: resolve(__dirname, "bench.html"),
      },
    },
  },
});
