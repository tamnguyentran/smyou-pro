// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = resolve(import.meta.dirname);
const NATIVE = /type=["'](date|month|datetime-local)["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe("Ô ngày dùng DateField (M21-06b)", () => {
  test('AC-UI-097 không file nguồn nào dùng type="date|month|datetime-local"', () => {
    const hits = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          NATIVE.test(line) ? [`${relative(SRC, file)}:${String(i + 1)}: ${line.trim()}`] : [],
        ),
    );
    expect(hits).toEqual([]);
  });
});
