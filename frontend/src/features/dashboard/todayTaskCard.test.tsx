import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Dashboard } from "./api";
import { TodayTaskCard } from "./components/TodayTaskCard";

type TodayTask = NonNullable<Dashboard["today_tasks"]>[number];

const item: TodayTask = {
  assignment_id: "c0000000-0000-4000-8000-000000000001",
  assignment_status: "ACCEPTED",
  task_id: "d0000000-0000-4000-8000-000000000001",
  task_code: "DH2610-D01-T1",
  task_title: "Lắp đặt 4 camera tầng 1",
  task_description: null,
  order_id: "b0000000-0000-4000-8000-000000000001",
  order_code: "DH2610-D01",
  order_version: 1,
  customer_name: "Công ty TNHH Việt Tiến",
  customer_phone: "0932068787",
  service_address: "12 Nguyễn Huệ, Q1",
  priority: "NORMAL",
  estimated_hours: "4",
  actual_hours: null,
  completion_note: null,
  due_at: "2026-10-20T09:00:00+07:00",
};

test("AC-UI-003 TodayTaskCard: nổi bằng shadow, không viền, đệm rộng hơn", () => {
  const { container } = render(<TodayTaskCard item={item} now={Date.now()} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.className).toContain("shadow-card");
  expect(root.className).toContain("p-5");
  expect(root.className).not.toMatch(/\bborder\b/);
});
