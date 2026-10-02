// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

async function loadConfig(workers?: string) {
  vi.resetModules();
  if (workers === undefined) vi.stubEnv("E2E_WORKERS", "");
  else vi.stubEnv("E2E_WORKERS", workers);
  const mod = (await import("../playwright.config")) as {
    default: { workers?: unknown; fullyParallel?: boolean };
  };
  return mod.default;
}

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listTs(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Playwright config (M3-08)", () => {
  test("AC-SYS-077 workers mặc định là số nguyên dương ≤ 4 và vẫn fullyParallel", async () => {
    const config = await loadConfig();
    expect(Number.isInteger(config.workers)).toBe(true);
    expect(config.workers as number).toBeGreaterThan(0);
    expect(config.workers as number).toBeLessThanOrEqual(4);
    expect(config.fullyParallel).toBe(true);
  });

  test("AC-SYS-078 E2E_WORKERS ghi đè được; giá trị sai rơi về mặc định", async () => {
    const fallback = (await loadConfig()).workers;
    expect((await loadConfig("2")).workers).toBe(2);
    for (const bad of ["abc", "0", "-1", "1.5"]) {
      const value = (await loadConfig(bad)).workers;
      expect(value).toBe(fallback);
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  test("AC-SYS-079 không file e2e nào ép chạy tuần tự", () => {
    const offenders = listTs(join(ROOT, "e2e")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /describe\s*\.\s*configure\s*\(/.test(source) || /mode\s*:\s*["']serial["']/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });
});
