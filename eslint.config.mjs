import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import jestPlugin from "eslint-plugin-jest";

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
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
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
    languageOptions: { globals: jestPlugin.environments.globals.globals },
  },
);
