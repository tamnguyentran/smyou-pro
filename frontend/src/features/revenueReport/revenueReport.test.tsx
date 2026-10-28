import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type RevenueRow = components["schemas"]["RevenueRowOut"];
type RevenueLine = components["schemas"]["RevenueLineOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const ducId = "a0000000-0000-4000-8000-000000000084";
const kh1Id = "c0000000-0000-4000-8000-000000000001";
const order1Id = "b0000000-0000-4000-8000-000000000020";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": ["all"], "report.revenue.read": ["all"] },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["all"], "report.revenue.read": ["own"] },
};
const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["all"] },
};

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
  vi.useRealTimers();
});

function row(overrides: Partial<RevenueRow> = {}): RevenueRow {
  return {
    customer_id: kh1Id,
    customer_code: "KH00001",
    customer_name: "Cty Sáng Tạo Mới",
    contact_person: "Nguyễn Văn A",
    contact_phone: "0909123456",
    seller: { id: hoaId, code: "NV005", full_name: "Nguyễn Thị Hoa" },
    unassigned: false,
    order_count: 3,
    subtotal_revenue: 15_000_000,
    profit: 3_000_000,
    ...overrides,
  };
}

function unassignedRow(overrides: Partial<RevenueRow> = {}): RevenueRow {
  return {
    customer_id: kh1Id,
    customer_code: "KH00001",
    customer_name: "Cty Sáng Tạo Mới",
    contact_person: "Nguyễn Văn A",
    contact_phone: "0909123456",
    seller: null,
    unassigned: true,
    order_count: 1,
    subtotal_revenue: 2_000_000,
    profit: null,
    ...overrides,
  };
}

function revenueLine(overrides: Partial<RevenueLine> = {}): RevenueLine {
  return {
    id: "d0000000-0000-4000-8000-000000000040",
    order_id: order1Id,
    order_code: "DH2609-0010",
    line_name: "Màn hình Dell 22 inch",
    quantity: "1",
    line_total: 5_000_000,
    profit: 1_000_000,
    order_created_at: "2026-09-10T02:00:00Z",
    order_completed_at: "2026-09-12T02:00:00Z",
    ...overrides,
  };
}

function mockReport(items: RevenueRow[], onRequest?: (search: string) => void) {
  server.use(
    http.get("/api/v1/reports/revenue-by-customer", ({ request }) => {
      const search = new URL(request.url).search;
      onRequest?.(search);
      return HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", items, total: 0 });
    }),
  );
}

describe("Báo cáo doanh thu theo khách hàng", () => {
  test("AC-RPT-010 mặc định đầu tháng→hôm nay, trạng thái Đã hoàn tất, gọi đúng API", async () => {
    vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport([row()], (search) => {
      requests.push(search);
    });
    renderApp("/reports/revenue-by-customer");

    await screen.findByRole("heading", { name: "Báo cáo doanh thu theo khách hàng" });
    await waitFor(() => {
      expect(requests).toContain("?from=2026-09-01&to=2026-09-15&status=COMPLETED");
    });
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("2026-09-15");
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("COMPLETED");
    expect(screen.getByLabelText("Khách hàng")).toHaveValue("");
  });

  test("AC-RPT-071 bấm 1 dòng → drilldown liệt kê DÒNG HÀNG (không phải đơn), kèm seller_id", async () => {
    signedInAs(anId, AN);
    mockReport([row()]);
    const linesRequests: string[] = [];
    server.use(
      http.get("/api/v1/reports/revenue-by-customer/:customerId/lines", ({ request }) => {
        linesRequests.push(new URL(request.url).search);
        return HttpResponse.json([
          revenueLine({ order_code: "DH2609-0010" }),
          revenueLine({
            id: "d0000000-0000-4000-8000-000000000041",
            order_code: "DH2609-0011",
            line_name: "Camera IMOU 2MP",
          }),
        ]);
      }),
    );
    renderApp("/reports/revenue-by-customer");
    const user = userEvent.setup();

    await screen.findByText("Cty Sáng Tạo Mới");
    await user.click(screen.getByRole("button", { name: "Cty Sáng Tạo Mới" }));

    await screen.findByRole("dialog", { name: "Cty Sáng Tạo Mới — Người bán: Nguyễn Thị Hoa" });
    await waitFor(() => {
      expect(linesRequests[0]).toContain(`seller_id=${hoaId}`);
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("DH2609-0010")).toBeInTheDocument();
    expect(within(dialog).getByText("Màn hình Dell 22 inch")).toBeInTheDocument();
    expect(within(dialog).getByText("DH2609-0011")).toBeInTheDocument();
    expect(within(dialog).getByText("Camera IMOU 2MP")).toBeInTheDocument();
  });

  test("AC-RPT-071 dòng 'Chưa gán' hiện trong bảng, bấm vào gọi /lines?unassigned=true", async () => {
    signedInAs(anId, AN);
    mockReport([row(), unassignedRow()]);
    const linesRequests: string[] = [];
    server.use(
      http.get("/api/v1/reports/revenue-by-customer/:customerId/lines", ({ request }) => {
        linesRequests.push(new URL(request.url).search);
        return HttpResponse.json([revenueLine({ order_code: "DH2609-0099" })]);
      }),
    );
    renderApp("/reports/revenue-by-customer");
    const user = userEvent.setup();

    await screen.findByText("Chưa gán");
    const [, unassignedButton] = screen.getAllByRole("button", { name: "Cty Sáng Tạo Mới" });
    if (!unassignedButton) throw new Error("expected 2 buttons");
    await user.click(unassignedButton);

    await screen.findByRole("dialog", { name: "Cty Sáng Tạo Mới — Người bán: Chưa gán" });
    await waitFor(() => {
      expect(linesRequests[0]).toContain("unassigned=true");
    });
    expect(screen.getByText("DH2609-0099")).toBeInTheDocument();
  });

  test("AC-RPT-013 profit null → hiện '—' kèm tooltip, không hiện '0 ₫'", async () => {
    signedInAs(anId, AN);
    mockReport([row({ profit: null })]);
    renderApp("/reports/revenue-by-customer");

    await screen.findByText("Cty Sáng Tạo Mới");
    const dash = screen.getByText("—");
    expect(dash).toHaveAttribute(
      "title",
      "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn.",
    );
    expect(screen.queryByText("0 ₫")).not.toBeInTheDocument();
  });

  test("AC-RPT-015 mobile 390px: thẻ (không bảng), bộ lọc xếp dọc", async () => {
    mobile();
    signedInAs(anId, AN);
    mockReport([
      row(),
      row({
        customer_id: "c0000000-0000-4000-8000-000000000002",
        customer_code: "KH00002",
        customer_name: "Cty Khác",
      }),
    ]);
    renderApp("/reports/revenue-by-customer");

    await screen.findByText("Cty Sáng Tạo Mới");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Cty Khác")).toBeInTheDocument();
  });

  test("AC-RPT-016 Hoa (SALE, scope own) lọc ra 0 dòng → EmptyState chung, không lỗi", async () => {
    signedInAs(hoaId, HOA);
    mockReport([]);
    renderApp("/reports/revenue-by-customer");

    expect(await screen.findByText("Không có dữ liệu phù hợp.")).toBeInTheDocument();
  });

  test("AC-RPT-017 Đức (TECHNICIAN, không có report.revenue.read) mở URL trực tiếp → 403", async () => {
    signedInAs(ducId, DUC);
    renderApp("/reports/revenue-by-customer");

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });

  test("AC-RPT-018 lỗi API mạng/5xx → trạng thái lỗi chung + nút Tải lại hoạt động", async () => {
    signedInAs(anId, AN);
    let calls = 0;
    server.use(
      http.get("/api/v1/reports/revenue-by-customer", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 })
          : HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", items: [row()], total: 0 });
      }),
    );
    renderApp("/reports/revenue-by-customer");
    const user = userEvent.setup();

    expect(
      await screen.findByText("Không tải được báo cáo doanh thu theo khách hàng."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await screen.findByText("Cty Sáng Tạo Mới");
  });

  test("AC-RPT-019 422 'Từ ngày' > 'Đến ngày' → banner lỗi chung, không tự chặn ở client", async () => {
    signedInAs(anId, AN);
    server.use(
      http.get("/api/v1/reports/revenue-by-customer", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            detail: "Dữ liệu không hợp lệ.",
            errors: [
              { field: "from", code: "invalid_range", message: "Từ ngày không được sau Đến ngày." },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    renderApp("/reports/revenue-by-customer");

    expect(await screen.findByRole("alert")).toHaveTextContent("Từ ngày không được sau Đến ngày.");
  });
});
