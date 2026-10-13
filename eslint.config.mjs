import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import jestPlugin from "eslint-plugin-jest";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "agent/artifacts/**",
      "puppeteer-data/**",
      "*.config.js",
      "*.config.cjs",
      "eslint.config.mjs",
    ],
  },
  eslint.configs.recommended,
  // TypeScript 规则只作用于 .ts，避免 mjs 工具吃到 parser/类型规则
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.ts"],
  })),
  {
    // 工具脚本（Node 环境；page.evaluate 回调内是浏览器全局，统一豁免 no-undef）
    files: ["**/*.mjs", "scripts/**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // TS 项目惯例：no-undef 交给编译器（typescript-eslint 官方同样建议在 .ts 关闭）
      "no-undef": "off",
    },
  },
  {
    // 类型感知规则：src 全部 .ts（含测试）——tsconfig.test.json 覆盖 src/** 不排除 test
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/test/**/*"],
    plugins: { jest: jestPlugin },
    languageOptions: {
      globals: jestPlugin.environments.globals.globals,
    },
  },
);
