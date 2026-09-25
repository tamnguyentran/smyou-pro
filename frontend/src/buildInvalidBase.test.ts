// @vitest-environment node
import { join, resolve } from "node:path";
import { build } from "vite";
import { expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

test("AC-SYS-013 BASE_PATH sai làm vite build dừng ngay khi đọc cấu hình", async () => {
  const previous = process.env.BASE_PATH;
  process.env.BASE_PATH = "/a b";
  try {
    await expect(
      build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), logLevel: "silent" }),
    ).rejects.toThrow(/BASE_PATH/);
  } finally {
    if (previous === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previous;
  }
}, 60_000);
