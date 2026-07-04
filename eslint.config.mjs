import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  globalIgnores([
    "dist/**",
    ".output/**",
    ".tanstack/**",
    ".nitro/**",
    "src/routeTree.gen.ts",
    "lib/generated/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node entry/config scripts (plain JS) — allow Node globals.
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
      },
    },
  },
);
