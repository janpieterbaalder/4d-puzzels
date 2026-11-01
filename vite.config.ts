import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: "es" },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 120000,
  },
} as any);
