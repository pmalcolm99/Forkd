import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: [
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/tailwind.config.js",
    // Static assets (incl. the hand-rolled service worker) — not source to lint.
    "**/public/**",
  ],
});
