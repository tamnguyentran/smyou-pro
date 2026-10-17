import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, TUAN, tuanId } from "./testFixtures";

type TaskBoardItem = components["schemas"]["TaskBoardItem"];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function boardItem(overrides: Partial<TaskBoardItem> = {}): TaskBoardItem {
  return {
    id: "d0000000-0000-4000-8000-000000000011",
    code: "DH2610-D01-T1",
    order_id: "b0000000-0000-4000-8000-000000000041",
    order_code: "DH2610-D01",
    title: "Lắp đặt 4 camera tầng 1",
    status: "PENDING_ACCEPTANCE",
    priority: "NORMAL",
    estimated_hours: "4.00",
    due_at: "2026-10-05T02:00:00Z",
    assignees: [],
    ...overrides,
  };
}

/** AC-DASH-040 (M10-07b): drill-down từ Tổng quan tới `/dispatch/board?status=...` chỉ hoạt động
 * đúng nếu trang đọc `status` từ URL lúc mount, giống `OrdersListPage` (M10-03). */
describe("/dispatch/board đọc status từ URL lúc tải", () => {
  test("?status=PENDING_ACCEPTANCE: request gửi status=PENDING_ACCEPTANCE, chỉ cột đó có item", async () => {
    signedInAs(tuanId, TUAN);
    const queries: string[] = [];
    server.use(
      http.get("/api/v1/tasks", ({ request }) => {
        const url = new URL(request.url);
        queries.push(url.search);
        const status = url.searchParams.get("status");
        const items = [boardItem()];
        return HttpResponse.json({
          items: status ? items.filter((t) => t.status === status) : items,
        });
      }),
      http.get("/api/v1/employees", () => HttpResponse.json({ items: [], total: 0 })),
    );
    renderApp("/dispatch/board?status=PENDING_ACCEPTANCE");

    await waitFor(() => {
      expect(queries[0]).toContain("status=PENDING_ACCEPTANCE");
    });
    expect(
      within(screen.getByTestId("task-board-column-PENDING_ACCEPTANCE")).getByText("DH2610-D01-T1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("task-board-column-ACCEPTED")).queryByText("DH2610-D01-T1"),
    ).not.toBeInTheDocument();
  });
});
