import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_COLOR = /\[#[0-9a-fA-F]{3,8}\]|['"`]#[0-9a-fA-F]{3,8}['"`]/;
const FILES = [
  "features/dispatch/components/DispatchQueueList.tsx",
  "features/dispatch/components/WorkloadList.tsx",
  "features/myTasks/components/MyAssignmentList.tsx",
  "features/kpi/components/KpiRows.tsx",
  "features/audit/components/AuditEventList.tsx",
];

test("AC-UI-036 5 component thẻ (dispatch/myTasks/kpi/audit) không thêm màu hex rời rạc (dùng token)", () => {
  for (const file of FILES) {
    const content = readFileSync(resolve(SRC, file), "utf-8");
    for (const line of content.split("\n")) {
      expect(line).not.toMatch(RAW_COLOR);
    }
  }
});
