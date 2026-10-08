import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, anId, HOA, hoaId, signedInAs, TUAN, tuanId } from "./testFixtures";

type OrderSummary = components["schemas"]["OrderSummary"];

function order(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: "b0000000-0000-4000-8000-000000000020",
    code: "DH2610-0020",
    status: "REVISION",
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    division: "SECURITY",
    priority: "NORMAL",
    total: 3300000,
    requested_date: null,
    created_by: hoaId,
    created_by_name: "Nguyễn Thị Hoa",
    created_at: "2026-10-01T03:00:00Z",
    revision_no: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Đơn cần chỉnh sửa — /dispatch/revisions (M6-03b)", () => {
  test("AC-DSP-127 2 đơn REVISION → danh sách đúng cột, bấm 1 dòng điều hướng /orders/{id}", async () => {
    signedInAs(tuanId, TUAN);
    let lastQuery = "";
    server.use(
      http.get("/api/v1/orders", ({ request }) => {
        lastQuery = new URL(request.url).search;
        return HttpResponse.json({
          items: [
            order(),
            order({
              id: "b0000000-0000-4000-8000-000000000023",
              code: "DH2610-0023",
              revision_no: 2,
            }),
          ],
          total: 2,
          limit: 20,
          offset: 0,
        });
      }),
    );
    const router = renderApp("/dispatch/revisions");

    expect(await screen.findByText("DH2610-0020")).toBeInTheDocument();
    expect(screen.getByText("DH2610-0023")).toBeInTheDocument();
    await waitFor(() => {
      expect(lastQuery).toContain("status=REVISION");
    });
    expect(screen.getByText("Cty Sáng Tạo Mới")).toBeInTheDocument();
    expect(screen.getByText("Lần chỉnh sửa 1")).toBeInTheDocument();
    expect(screen.getByText("Lần chỉnh sửa 2")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("DH2610-0020"));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/orders/b0000000-0000-4000-8000-000000000020");
    });
  });

  test("AC-DSP-128 không có đơn REVISION nào → EmptyState", async () => {
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/revisions");

    expect(await screen.findByText("Không có đơn cần chỉnh sửa.")).toBeInTheDocument();
  });

  test("AC-DSP-129 revision_count=2 → badge menu hiện 2; Hoa (không task.manage) không thấy mục menu", async () => {
    signedInAs(tuanId, TUAN, { revision_count: 2 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [order()], total: 1, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/revisions");

    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    const link = within(nav).getByRole("link", { name: /Đơn cần chỉnh sửa/ });
    expect(await within(link).findByText("2")).toBeInTheDocument();

    signedInAs(hoaId, HOA);
    renderApp("/");
    const nav2 = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav2).queryByRole("link", { name: /Đơn cần chỉnh sửa/ })).not.toBeInTheDocument();
  });

  test("Hoa/An (không có task.manage) mở /dispatch/revisions → 403, không gọi GET /orders", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/orders", () => {
        calls += 1;
        return HttpResponse.json({ items: [order()], total: 1, limit: 20, offset: 0 });
      }),
    );

    signedInAs(hoaId, HOA);
    renderApp("/dispatch/revisions");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    expect(calls).toBe(0);

    signedInAs(anId, AN);
    renderApp("/dispatch/revisions");
    await waitFor(() => {
      expect(screen.getAllByText("Bạn không có quyền truy cập trang này.")).toHaveLength(2);
    });
    expect(calls).toBe(0);
  });
});
