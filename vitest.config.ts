import { defineConfig } from "vitest/config";

// core 等纯逻辑包在 Node 环境运行（对应 PRD N-TEST-01）；需要 DOM 的测试在文件头声明环境。
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
