// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const outDirs: string[] = [];

async function buildWith(basePath: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), "smyou-build-"));
  outDirs.push(outDir);
  const previous = process.env.BASE_PATH;
  process.env.BASE_PATH = basePath;
  try {
    await build({
      root: ROOT,
      configFile: join(ROOT, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    if (previous === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previous;
  }
  return outDir;
}

function readAll(dir: string, ext: string): string {
  return readdirSync(join(dir, "assets"))
    .filter((name) => name.endsWith(ext))
    .map((name) => readFileSync(join(dir, "assets", name), "utf-8"))
    .join("\n");
}

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

describe("production build", () => {
  test("AC-SYS-002 build ở gốc và dưới /smyoutask đều thành công, asset đúng tiền tố", async () => {
    const rootOut = await buildWith("");
    const rootHtml = readFileSync(join(rootOut, "index.html"), "utf-8");
    expect(rootHtml).toMatch(/src="\/assets\/[^"]+\.js"/);
    expect(rootHtml).toMatch(/href="\/assets\/[^"]+\.css"/);

    const subOut = await buildWith("/smyoutask");
    const subHtml = readFileSync(join(subOut, "index.html"), "utf-8");
    expect(subHtml).toMatch(/src="\/smyoutask\/assets\/[^"]+\.js"/);
    expect(subHtml).toMatch(/href="\/smyoutask\/assets\/[^"]+\.css"/);
    expect(subHtml).not.toContain('"/assets/');
    expect(readAll(subOut, ".css")).not.toMatch(/url\(\/assets\//);
  }, 120_000);

  test("AC-SYS-017 font tự host có subset tiếng Việt, không gọi Google Fonts, có token màu", async () => {
    const out = await buildWith("/smyoutask");
    const assets = readdirSync(join(out, "assets"));
    expect(assets.some((n) => /plus-jakarta-sans-vietnamese-wght-normal.*\.woff2$/.test(n))).toBe(
      true,
    );

    const css = readAll(out, ".css");
    const html = readFileSync(join(out, "index.html"), "utf-8");
    for (const text of [css, html, readAll(out, ".js")]) {
      expect(text).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
    expect(css).toContain("Plus Jakarta Sans Variable");
    expect(css).toMatch(/--color-brand:\s*#0f2f2e/i);
  }, 120_000);
});
