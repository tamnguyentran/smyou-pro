import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, anId, HOA, hoaId, QUEUE, signedInAs, TUAN, tuanId } from "./testFixtures";

function mobile() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Hàng đợi điều phối", () => {
  test("AC-DSP-015 bảng desktop: đúng truy vấn, đủ cột, giữ thứ tự API, phân trang", async () => {
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 4 });
    const queries: string[] = [];
    server.use(
      http.get("/api/v1/orders", ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({ items: QUEUE, total: 25, limit: 20, offset: 0 });
      }),
    );
    renderApp("/dispatch/queue");

    expect(await screen.findByRole("heading", { name: "Đơn chờ điều phối" })).toBeInTheDocument();
    await waitFor(() => {
      expect(queries).toContain("?status=PENDING_DISPATCH&sort=dispatch&limit=20&offset=0");
    });

    for (const heading of ["Mã", "Khách", "Ưu tiên", "Ngày hẹn", "Tổng tiền", "Người tạo"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "DH2610-0009",
      "DH2610-0010",
      "DH2610-0008",
      "DH2610-0011",
    ]);
    expect(within(rows[3] as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("11.800.000 ₫")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => {
      expect(queries).toContain("?status=PENDING_DISPATCH&sort=dispatch&limit=20&offset=20");
    });
  });

  test("AC-DSP-016 mobile 390px: thẻ dọc, badge ưu tiên đúng nhãn + tone, vùng chạm ≥44px", async () => {
    mobile();
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 4 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: QUEUE, total: 4, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");
    await screen.findByText("DH2610-0009");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const cards = screen.getAllByRole("button", { name: /^DH2610-/ });
    expect(cards).toHaveLength(4);
    expect(cards[0]?.className).toContain("min-h-11");
    expect(within(cards[0] as HTMLElement).getByText("Khẩn").className).toContain("bg-urgent-bg");
    expect(within(cards[1] as HTMLElement).getByText("Cao").className).toContain("bg-review-bg");
    expect(within(cards[2] as HTMLElement).getByText("Bình thường").className).toContain(
      "bg-todo-bg",
    );
    expect(within(cards[3] as HTMLElement).getByText("Thấp").className).toContain("bg-todo-bg");
    expect(within(cards[0] as HTMLElement).getByText("Công ty TNHH Minh Phát")).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByText("12/10/2026")).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByText("11.800.000 ₫")).toBeInTheDocument();
  });

  test("AC-DSP-017 skeleton khi tải, empty state khi không có đơn", async () => {
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");

    expect(screen.getByLabelText("Đang tải hàng đợi điều phối")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(await screen.findByText("Không có đơn nào chờ điều phối.")).toBeInTheDocument();
    expect(screen.getByText("Đơn mới do Kinh doanh gửi sẽ xuất hiện ở đây.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Đang tải hàng đợi điều phối")).not.toBeInTheDocument();
  });

  test("AC-DSP-017 lỗi 500 → thông báo + nút Thử lại gọi lại đúng 1 lần", async () => {
    signedInAs(tuanId, TUAN);
    let calls = 0;
    server.use(
      http.get("/api/v1/orders", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ status: 500 }, { status: 500 });
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/dispatch/queue");

    expect(await screen.findByText("Không tải được hàng đợi điều phối.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có đơn nào chờ điều phối.")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  test("AC-DSP-018 Hoa (SALE) và An (MANAGER) không có task.manage → 403, không gọi GET /orders", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/orders", () => {
        calls += 1;
        return HttpResponse.json({ items: QUEUE, total: 4, limit: 20, offset: 0 });
      }),
    );

    signedInAs(hoaId, HOA);
    renderApp("/dispatch/queue");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    expect(calls).toBe(0);

    signedInAs(anId, AN);
    renderApp("/dispatch/queue");
    await waitFor(() => {
      expect(screen.getAllByText("Bạn không có quyền truy cập trang này.")).toHaveLength(2);
    });
    expect(calls).toBe(0);

    signedInAs(tuanId, TUAN, { pending_dispatch_count: 4 });
    renderApp("/dispatch/queue");
    expect(await screen.findByText("DH2610-0009")).toBeInTheDocument();
    expect(calls).toBe(1);
  });
});
