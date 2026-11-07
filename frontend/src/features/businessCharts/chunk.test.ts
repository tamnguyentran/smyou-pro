// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { build } from "vite";
import { describe, expect, test } from "vitest";

const SRC = resolve(import.meta.dirname, "../..");
const FEATURE = "features/businessCharts/";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Rollup keeps a module out of the entry chunk only if every path to it is a dynamic `import()`:
 * so recharts may be imported only inside the feature, and the feature only lazily by the router. */
describe("AC-RPT-138 thư viện biểu đồ nằm trong chunk riêng của route", () => {
  const files = sources(SRC).map((path) => ({
    rel: relative(SRC, path),
    text: readFileSync(path, "utf8"),
  }));

  test("AC-RPT-138 chỉ module trong features/businessCharts import recharts", () => {
    const importers = files.filter((f) => /from\s+["']recharts["']/.test(f.text)).map((f) => f.rel);
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((rel) => !rel.startsWith(FEATURE))).toEqual([]);
  });

  test("AC-RPT-138 ngoài feature chỉ được nạp feature bằng import() động", () => {
    const outside = files.filter((f) => !f.rel.startsWith(FEATURE));
    const staticImporters = outside
      .filter((f) => /from\s+["'][^"']*businessCharts\//.test(f.text))
      .map((f) => f.rel);
    expect(staticImporters).toEqual([]);
    const routes = outside.find((f) => f.rel === "app/routes.tsx");
    expect(routes?.text).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/features\/businessCharts\/pages\/BusinessChartsPage["']\s*\)/,
    );
  });

  type ManifestChunk = { file: string; isEntry?: boolean; imports?: string[] };

  // Source greps miss a manualChunks/config change that pulls recharts into the entry, so this
  // builds for real and walks the entry's static imports. "recharts-surface" is a class name
  // recharts writes on every <svg>; it survives minification.
  test("AC-RPT-138 build output: recharts không nằm trong chunk nạp lúc khởi động", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "chunk-check-"));
    try {
      await build({
        configFile: resolve(SRC, "../vite.config.ts"),
        logLevel: "silent",
        build: { outDir, emptyOutDir: true, manifest: true },
      });
      const manifest = JSON.parse(
        readFileSync(join(outDir, ".vite/manifest.json"), "utf8"),
      ) as Record<string, ManifestChunk>;
      const chunks = new Map(Object.entries(manifest));
      const hasRecharts = (key: string) => {
        const file = chunks.get(key)?.file;
        return (
          file !== undefined &&
          readFileSync(join(outDir, file), "utf8").includes("recharts-surface")
        );
      };

      const startup = new Set<string>();
      const queue = [...chunks].filter(([, chunk]) => chunk.isEntry).map(([key]) => key);
      for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
        if (startup.has(key)) continue;
        startup.add(key);
        queue.push(...(chunks.get(key)?.imports ?? []));
      }
      expect(startup.size).toBeGreaterThan(0);
      expect([...startup].filter(hasRecharts)).toEqual([]);
      expect([...chunks.keys()].filter((key) => !startup.has(key)).some(hasRecharts)).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
