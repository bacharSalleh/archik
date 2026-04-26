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
  },
});
