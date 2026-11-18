import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [resolve(__dirname, "../..")] } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        playground: resolve(__dirname, "playground.html"),
        bench: resolve(__dirname, "bench.html"),
      },
    },
  },
});
