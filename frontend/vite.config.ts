import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { resolveBasePath } from "./src/lib/basePath.ts";

// BASE_PATH ("" in dev, "/smyoutask" in production — ADR-014) drives the asset base,
// which the app reads back at runtime as import.meta.env.BASE_URL.
const { viteBase, apiPrefix } = resolveBasePath(process.env.BASE_PATH);
// On the Mac: backend on localhost:8010. Inside compose.dev.yml: BACKEND_URL=http://backend:8000.
const backendUrl =
  process.env.BACKEND_URL ?? `http://localhost:${process.env.BACKEND_PORT ?? "8010"}`;

export default defineConfig({
  base: viteBase,
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITE_PORT ?? "5183"),
    strictPort: true,
    // The backend serves /api/v1 at its root; strip BASE_PATH when dev runs under a subpath, and move
    // its cookies under the subpath too — what a backend configured with BASE_PATH does in production.
    // (`vite preview`, used by E2E with BASE_PATH=/smyoutask, reuses this proxy.)
    proxy: {
      [`${apiPrefix}/api`]: {
        target: backendUrl,
        rewrite: (path) => path.slice(apiPrefix.length),
        ...(apiPrefix
          ? {
              cookiePathRewrite: {
                "/": `${apiPrefix}/`,
                "/api/v1/auth": `${apiPrefix}/api/v1/auth`,
              },
            }
          : {}),
      },
    },
  },
  preview: { port: 4183, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/features/**", "src/lib/**"],
      exclude: ["**/*.test.{ts,tsx}", "src/lib/api/schema.d.ts", "src/lib/api/openapi.json"],
      thresholds: { lines: 75, functions: 75, branches: 75, statements: 75 },
    },
  },
});
