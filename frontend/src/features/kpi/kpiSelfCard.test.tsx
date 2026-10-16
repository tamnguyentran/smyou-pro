import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import type { KpiRow } from "./api";
import { KpiSelfCard } from "./components/KpiSelfCard";

const row: KpiRow = {
  employee_id: "a0000000-0000-4000-8000-000000000081",
  employee_code: "NV014",
  employee_full_name: "Nguyễn Văn Khoa",
  employee_is_active: true,
  completed_task_count: 5,
  on_time_count: 4,
  on_time_rate: 80,
  defect_count: 1,
  rejection_counts: { BUSY: 0, SICK: 0, SKILL: 0, DISTANCE: 0, OTHER: 0 },
  rejection_total: 0,
  estimated_hours_total: "10",
  actual_hours_total: "9.5",
  actual_hours_missing_count: 0,
};

test("AC-UI-005 KpiSelfCard: card ngoài và tile số liệu đều nổi bằng shadow, không viền", () => {
  const { container } = render(<KpiSelfCard row={row} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.className).toContain("shadow-card");
  expect(root.className).toContain("p-5");
  expect(root.className).not.toMatch(/\bborder\b/);

  const tile = root.querySelector("div.grid > div") as HTMLElement;
  expect(tile.className).toContain("shadow-card");
  expect(tile.className).not.toMatch(/\bborder\b/);
});
