import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Le JSX des composants PDF est compilé tel quel par Next ; Vitest, lui, doit le transformer.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
