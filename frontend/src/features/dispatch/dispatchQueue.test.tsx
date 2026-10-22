import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { DispatchQueueList } from "./components/DispatchQueueList";
import { AN, anId, DON_I, HOA, hoaId, QUEUE, signedInAs, TUAN, tuanId } from "./testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];

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

  test("AC-UI-026 mobile: thẻ đơn bỏ viền, p-5, shadow-card; bấm vẫn chọn đúng 1 lần", async () => {
    mobile();
    const onSelect = vi.fn();
    render(<DispatchQueueList items={QUEUE} onSelect={onSelect} />);

    const cards = screen.getAllByRole("button", { name: /^DH2610-/ });
    expect(cards[0]?.className).toContain("shadow-card");
    expect(cards[0]?.className).toContain("hover:shadow-card-hover");
    expect(cards[0]?.className).toContain("p-5");
    expect(cards[0]?.className).not.toMatch(/\bborder\b/);

    await userEvent.setup().click(cards[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(QUEUE[0]);
  });

  test("AC-UI-026 mobile: bấm thẻ không hồi quy luồng mở panel tạo task", async () => {
    mobile();
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 4 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: QUEUE, total: 4, limit: 20, offset: 0 }),
      ),
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json({
          id: DON_I.id,
          code: DON_I.code,
          status: "PENDING_DISPATCH",
          division: null,
          customer_id: null,
          customer_name: DON_I.customer_name,
          customer_phone: DON_I.customer_phone,
          customer_email: null,
          customer_tax_code: null,
          service_address: "12 Lê Lợi, Q1, TP.HCM",
          work_description: "Lắp 4 camera tầng 1",
          priority: DON_I.priority,
          requested_date: DON_I.requested_date,
          payment_method: null,
          csat_rating: null,
          csat_comment: null,
          csat_recorded_by: null,
          csat_recorded_at: null,
          payment_status: "UNPAID",
          subtotal: DON_I.total,
          discount_amount: 0,
          vat_amount: 0,
          total: DON_I.total,
          revision_no: 0,
          version: 1,
          created_by: DON_I.created_by,
          allowed_commands: [],
          can_edit_contact: true,
          can_edit_lines_after_submit: true,
          can_upload_confirmation: false,
          can_complete: false,
          can_revise: false,
          has_pending_revision_request: false,
          lines: [],
        } satisfies OrderDetail),
      ),
      http.get("/api/v1/employees", () =>
        HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");
    await screen.findByText("DH2610-0009");

    const cards = screen.getAllByRole("button", { name: /^DH2610-/ });
    await userEvent.setup().click(cards[0] as HTMLElement);
    expect(
      await screen.findByRole("dialog", { name: "Tạo đầu việc — DH2610-0009" }),
    ).toBeInTheDocument();
  });

  test("AC-UI-027 desktop: table hàng đợi điều phối vẫn giữ border border-line", async () => {
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 4 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: QUEUE, total: 4, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");

    const table = await screen.findByRole("table");
    expect(table.className).toContain("border");
    expect(table.className).toContain("border-line");
  });

  test("AC-DSP-017 skeleton khi tải, empty state khi không có đơn", async () => {
    signedInAs(tuanId, TUAN);
    server.use(
      // Chậm có chủ ý: khung xương phải quan sát được trong lúc hàng đợi đang tải (không phải
      // ở ngay lần render đầu — lúc đó app còn đang khôi phục phiên đăng nhập).
      http.get("/api/v1/orders", async () => {
        await delay(50);
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/dispatch/queue");

    expect(await screen.findByLabelText("Đang tải hàng đợi điều phối")).toHaveAttribute(
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
