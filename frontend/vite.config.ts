import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { resolveBasePath } from "./src/lib/basePath.ts";

// BASE_PATH ("" in dev, "/smyoutask" in production — ADR-014) drives the asset base,
// which the app reads back at runtime as import.meta.env.BASE_URL.
const { viteBase } = resolveBasePath(process.env.BASE_PATH);
const backendPort = process.env.BACKEND_PORT ?? "8010";

export default defineConfig({
  base: viteBase,
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITE_PORT ?? "5183"),
    strictPort: true,
    proxy: { "/api": `http://localhost:${backendPort}` },
  },
  preview: { port: 4183, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/features/**", "src/lib/**"],
      exclude: ["**/*.test.{ts,tsx}", "src/lib/api/schema.d.ts"],
      thresholds: { lines: 75, functions: 75, branches: 75, statements: 75 },
    },
  },
});
