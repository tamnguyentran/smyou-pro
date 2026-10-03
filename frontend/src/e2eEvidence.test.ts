// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPORT = resolve(import.meta.dirname, "../../docs/evidence/M3-08-e2e-stability.md");

// `make e2e` itself cannot run inside vitest, so these guard the recorded evidence instead.
describe("Bằng chứng e2e ổn định (M3-08)", () => {
  const report = readFileSync(REPORT, "utf8");
  const section = report.split("## AC-SYS-080")[1]?.split("\n## ")[0] ?? "";
  const runTable = section.split("Thang thử")[0] ?? "";
  const runs = runTable.split("\n").filter((line) => /^\| [123] \|/.test(line));

  test("AC-SYS-080 báo cáo ghi đủ 3 lần chạy liên tiếp, đều xanh", () => {
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run).toMatch(/\d+ passed/);
      expect(run).not.toMatch(/failed|flaky(?! )|skipped/);
    }
    const counts = runs.map((run) => /(\d+) passed/.exec(run)?.[1]);
    expect(new Set(counts).size).toBe(1);
  });

  test("AC-SYS-081 báo cáo có cột thời gian và thang thử workers", () => {
    expect(section).toContain("Thời gian");
    expect(section).toContain("Thang thử `workers`");
    expect(report).toContain("git diff origin/main -- frontend/e2e");
  });
});
