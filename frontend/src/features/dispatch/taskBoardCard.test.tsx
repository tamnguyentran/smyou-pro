import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import type { TaskBoardItem } from "./api";
import { TaskBoardCard } from "./components/TaskBoardCard";

const item: TaskBoardItem = {
  id: "d0000000-0000-4000-8000-000000000011",
  code: "DH2610-D01-T1",
  order_id: "b0000000-0000-4000-8000-000000000041",
  order_code: "DH2610-D01",
  title: "Lắp đặt 4 camera tầng 1",
  status: "PENDING_ACCEPTANCE",
  priority: "NORMAL",
  estimated_hours: "4",
  due_at: "2026-10-20T09:00:00+07:00",
  assignees: [],
};

test("AC-UI-004 TaskBoardCard: nổi bằng shadow, không viền, giữ hover shadow-card-hover", () => {
  const { container } = render(
    <MemoryRouter>
      <TaskBoardCard item={item} />
    </MemoryRouter>,
  );
  const root = container.querySelector("button") as HTMLElement;
  expect(root.className).toContain("shadow-card");
  expect(root.className).toContain("hover:shadow-card-hover");
  expect(root.className).not.toMatch(/\bborder\b/);
});
