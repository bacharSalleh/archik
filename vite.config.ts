/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { archikWatch } from "./vite/archikWatch.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), archikWatch()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The CLI integration tests spawn `npx tsx src/cli/index.ts` per case
    // (subprocess + TS compile). On a cold CI runner that can exceed the
    // 5s default, making them flaky (it broke the v0.15.2 publish). Raise
    // the global timeout; fast unit tests finish in ms and are unaffected.
    testTimeout: 30000,
  },
});
