import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["**/dist/", "**/node_modules/", "fixtures/downloads/", "fixtures/build/", "apps/web/public/samples/"]),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    // 网页代码跑在浏览器里；构建脚本、配置文件和测试跑在 Node 里
    files: ["apps/web/**/*.{ts,tsx}", "packages/renderer/**/*.ts", "packages/qyp/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**/*.ts", "*.config.{js,ts}", "apps/web/vite.config.ts", "**/*.test.ts"],
    languageOptions: { globals: globals.node },
  },

  {
    // 这几处是有意用 any：测试和一致性用例要构造非法清单，bench 要探测可能不存在的浏览器接口
    files: ["**/*.test.ts", "packages/qyp/src/conformance.ts", "apps/web/src/dev/bench.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
