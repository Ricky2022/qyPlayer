import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import {defineConfig, globalIgnores} from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// 规则来自《代码规范》：Airbnb 调整后的风格（4 空格、双引号、分号、花括号内不留空格）
// 加上 typescript-eslint 的推荐规则和需要类型信息的规则。
// ESLint 10 不再内置格式规则，格式部分用 @stylistic，对应原来的 @typescript-eslint/indent、quotes、semi。
const style = stylistic.configs.customize({
    indent: 4,
    quotes: "double",
    semi: true,
    jsx: true,
    arrowParens: true,
    braceStyle: "1tbs",
    blockSpacing: true,
    quoteProps: "as-needed",
    commaDangle: "only-multiline",
});

export default defineConfig(
    globalIgnores([
        "**/dist/",
        "**/dist-*/",
        "**/node_modules/",
        "fixtures/downloads/",
        "fixtures/build/",
        "apps/web/public/samples/",
        "packages/core/src/schemaValidator.generated.js",
    ]),

    {linterOptions: {reportUnusedDisableDirectives: true}},

    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    style,

    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "dot-notation": "off",
            "default-case-last": "off",
            "no-await-in-loop": "off",
            "no-template-curly-in-string": "warn",
            "class-methods-use-this": "off",
            "no-cond-assign": ["error", "except-parens"],
            "no-constant-condition": ["error", {checkLoops: false}],
            "require-atomic-updates": "off",
            curly: ["error", "all"],
            eqeqeq: ["error", "always", {null: "always"}],
            "no-bitwise": "warn",
            "no-empty-function": ["error", {allow: []}],
            "no-param-reassign": "warn",
            "no-useless-call": "error",
            "vars-on-top": "off",
            "no-unused-vars": "off",
            "@stylistic/list-style": ["error", {
                singleLine: {spacing: "never"},
                multiLine: {minItems: 0},
                overrides: {"{}": {singleLine: {spacing: "never"}}},
            }],
            "max-depth": ["error", 5],
            "@stylistic/max-len": ["error", 140, 4, {
                ignoreUrls: true,
                ignoreComments: false,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreRegExpLiterals: true,
            }],
            "max-lines": ["warn", {max: 1000, skipBlankLines: true, skipComments: true}],
            "max-lines-per-function": ["warn", {max: 300, skipBlankLines: true, skipComments: true, IIFEs: true}],
            "max-nested-callbacks": ["error", 3],
            "@stylistic/max-statements-per-line": ["error", {max: 1}],
            "@stylistic/multiline-ternary": ["error", "always-multiline"],
            "@stylistic/no-mixed-operators": ["error", {}],
            "@stylistic/no-multiple-empty-lines": ["error", {max: 3, maxBOF: 0, maxEOF: 1}],
            "no-plusplus": "off",
            "@typescript-eslint/dot-notation": "error",
            "@typescript-eslint/array-type": ["error", {default: "array"}],
            "@stylistic/brace-style": ["error", "1tbs", {allowSingleLine: true}],
            "@typescript-eslint/consistent-type-assertions": ["error", {assertionStyle: "as", objectLiteralTypeAssertions: "allow-as-parameter"}],
            "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
            "@typescript-eslint/explicit-function-return-type": "off",
            "@stylistic/function-call-spacing": ["error", "never"],
            "@stylistic/indent": ["error", 4, {
                SwitchCase: 1,
                ignoredNodes: [
                    "TSTypeAliasDeclaration TSIntersectionType",
                    "TSTypeAliasDeclaration TSUnionType",
                ],
            }],
            "@typescript-eslint/member-ordering": "error",
            "@typescript-eslint/no-explicit-any": ["warn", {fixToUnknown: false, ignoreRestArgs: true}],
            "@stylistic/no-extra-parens": ["error", "all", {
                ignoreJSX: "multi-line",
                nestedBinaryExpressions: false,
                ignoredNodes: ["ArrowFunctionExpression > ConditionalExpression"],
            }],
            "@typescript-eslint/no-extraneous-class": ["error", {allowConstructorOnly: false, allowEmpty: false, allowStaticOnly: false}],
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/no-unnecessary-type-arguments": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "no-useless-constructor": "off",
            "@typescript-eslint/no-useless-constructor": "error",
            "@typescript-eslint/prefer-function-type": "error",
            "@typescript-eslint/promise-function-async": ["error", {
                allowedPromiseNames: [],
                allowAny: true,
                checkArrowFunctions: true,
                checkFunctionDeclarations: true,
                checkFunctionExpressions: true,
                checkMethodDeclarations: true,
            }],
            "@stylistic/quotes": ["error", "double", {avoidEscape: false}],
            "@typescript-eslint/require-array-sort-compare": "error",
            "@typescript-eslint/restrict-plus-operands": "error",
            "@stylistic/semi": ["error", "always"],
            "@typescript-eslint/strict-boolean-expressions": "error",
            "@typescript-eslint/unified-signatures": "error",
            "consistent-return": "off",
            "func-style": ["error", "expression"],
            "func-names": "error",
            "no-use-before-define": "off",
            "@typescript-eslint/no-use-before-define": ["error", {
                functions: true,
                classes: true,
                variables: true,
                enums: true,
                typedefs: true,
                ignoreTypeReferences: true,
            }],
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "no-void": ["error", {allowAsStatement: true}],
        },
    },

    {
        files: ["**/*.{js,mjs,cjs}", "vitest.config.ts"],
        extends: [tseslint.configs.disableTypeChecked],
    },

    {
        // 启动守卫必须保持 ES5，老 WebView 解析失败时它还要能执行
        files: ["apps/web/boot-guard.js"],
        rules: {
            "func-style": "off",
            "func-names": "off",
            "no-var": "off",
        },
    },

    {
    // 网页代码跑在浏览器里；构建脚本、配置文件和测试跑在 Node 里
        files: ["apps/web/**/*.{ts,tsx}", "apps/web/boot-guard.js", "packages/renderer/**/*.ts", "packages/qyp/**/*.ts"],
        languageOptions: {globals: globals.browser},
    },
    {
        files: ["scripts/**/*.ts", "assets/**/*.mjs", "*.config.{js,ts}", "apps/web/vite.config.ts", "**/*.test.ts"],
        languageOptions: {globals: globals.node},
    },

    {
    // 这几处是有意用 any：测试和一致性用例要构造非法清单，bench 要探测可能不存在的浏览器接口
        files: ["**/*.test.ts", "packages/qyp/src/conformance.ts", "apps/web/src/dev/bench.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            // 这些文件故意构造不合法的数据，类型检查器会把它看成 any
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
        },
    },

    {
        files: ["apps/web/**/*.{ts,tsx}"],
        plugins: {"react-hooks": reactHooks},
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            // eslint-plugin-react 7 在 ESLint 10 上会崩（context.getFilename 已删除），
            // JSX 缩进改由 @stylistic 负责。
            "@stylistic/jsx-indent-props": ["error", 4],
        },
    },
);
