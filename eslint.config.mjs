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
    // Node entry/config scripts (plain JS/CJS) — allow Node globals.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "writable",
      },
    },
  },
);
