import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type EmployeeRevenueRow = components["schemas"]["EmployeeRevenueRowOut"];
type RevenueOrder = components["schemas"]["RevenueOrderOut"];
type OrderDetail = components["schemas"]["OrderDetail"];
type OrderLine = components["schemas"]["OrderLineOut"];
type EmployeeOut = components["schemas"]["EmployeeOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const ducId = "a0000000-0000-4000-8000-000000000084";
const order1Id = "b0000000-0000-4000-8000-000000000020";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": ["all"],
    "report.revenue.read": ["all"],
    "employee.read": ["all"],
  },
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

function row(overrides: Partial<EmployeeRevenueRow> = {}): EmployeeRevenueRow {
  return {
    employee_id: hoaId,
    employee_code: "NV005",
    employee_name: "Nguyễn Thị Hoa",
    order_count: 3,
    subtotal_revenue: 15_000_000,
    profit: 3_000_000,
    ...overrides,
  };
}

function order(overrides: Partial<RevenueOrder> = {}): RevenueOrder {
  return {
    id: order1Id,
    code: "DH2609-0010",
    created_at: "2026-09-10T02:00:00Z",
    completed_at: "2026-09-12T02:00:00Z",
    total: 5_000_000,
    profit: 1_000_000,
    ...overrides,
  };
}

function orderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: order1Id,
    code: "DH2609-0010",
    status: "COMPLETED",
    division: null,
    customer_id: "c0000000-0000-4000-8000-000000000001",
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "",
    priority: "NORMAL",
    requested_date: null,
    subtotal: 5_000_000,
    discount_amount: 0,
    vat_amount: 0,
    total: 5_000_000,
    payment_status: "PAID",
    payment_method: null,
    csat_rating: null,
    csat_comment: null,
    csat_recorded_by: null,
    csat_recorded_at: null,
    revision_no: 0,
    created_by: hoaId,
    version: 1,
    lines: [],
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: false,
    has_pending_revision_request: false,
    ...overrides,
  };
}

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: "d0000000-0000-4000-8000-000000000040",
    position: 1,
    item_type: "PRODUCT",
    product_id: "f0000000-0000-4000-8000-000000000050",
    service_id: null,
    sku_snapshot: "LCD-DELL22",
    name_snapshot: "Màn hình Dell 22 inch",
    unit_snapshot: "CAI",
    specs_snapshot: null,
    warranty_months_snapshot: 24,
    catalog_price_snapshot: 5_000_000,
    cost_price_snapshot: 4_000_000,
    price_fixed: true,
    quantity: "1",
    unit_price: 5_000_000,
    line_discount: 0,
    vat_rate: "0",
    is_gift: false,
    line_gross: 5_000_000,
    line_vat: 0,
    line_total: 5_000_000,
    note: null,
    ...overrides,
  };
}

function employee(overrides: Partial<EmployeeOut> = {}): EmployeeOut {
  return {
    id: hoaId,
    code: "NV005",
    full_name: "Nguyễn Thị Hoa",
    email: "hoa.nguyen@smyou.vn",
    phone: null,
    title: null,
    department: "SALES",
    roles: ["SALE"],
    is_active: true,
    is_locked: false,
    must_change_password: false,
    version: 1,
    ...overrides,
  };
}

function mockReport(items: EmployeeRevenueRow[], onRequest?: (search: string) => void) {
  server.use(
    http.get("/api/v1/reports/revenue-by-employee", ({ request }) => {
      const search = new URL(request.url).search;
      onRequest?.(search);
      return HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", items, total: 0 });
    }),
  );
}

function mockEmployeesList(
  items: EmployeeOut[] = [employee()],
  onRequest?: (search: string) => void,
) {
  server.use(
    http.get("/api/v1/employees", ({ request }) => {
      const search = new URL(request.url).search;
      const limit = Number(new URLSearchParams(search).get("limit") ?? "0");
      onRequest?.(search);
      if (limit > 100) {
        // Mirrors backend/app/modules/employees/router.py: limit: Annotated[int, Query(ge=1, le=100)]
        return HttpResponse.json({ error: "VALIDATION_ERROR" }, { status: 422 });
      }
      return HttpResponse.json({ items, limit, offset: 0, total: items.length });
    }),
  );
}

describe("Báo cáo doanh thu theo nhân viên", () => {
  test("AC-RPT-030 mặc định đầu tháng→hôm nay, nhân viên Tất cả, trạng thái Đã hoàn tất, gọi đúng API", async () => {
    vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport([row()], (search) => {
      requests.push(search);
    });
    mockEmployeesList();
    renderApp("/reports/revenue-by-employee");

    await screen.findByRole("heading", { name: "Báo cáo doanh thu theo nhân viên" });
    await waitFor(() => {
      expect(requests).toContain("?from=2026-09-01&to=2026-09-15&status=COMPLETED");
    });
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("2026-09-15");
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("COMPLETED");
    expect(screen.getByLabelText("Nhân viên")).toHaveValue("");
  });

  test("AC-RPT-030 Manager thấy danh sách nhân viên trong dropdown (GET /employees đúng limit backend cho phép)", async () => {
    signedInAs(anId, AN);
    mockReport([row()]);
    const employeeRequests: string[] = [];
    mockEmployeesList(
      [
        employee(),
        employee({
          id: "c0000000-0000-4000-8000-000000000099",
          code: "NV099",
          full_name: "Trần Văn Bình",
        }),
      ],
      (search) => {
        employeeRequests.push(search);
      },
    );
    renderApp("/reports/revenue-by-employee");

    await screen.findByRole("heading", { name: "Báo cáo doanh thu theo nhân viên" });
    await waitFor(() => {
      expect(employeeRequests.length).toBeGreaterThan(0);
    });
    // backend/app/modules/employees/router.py: limit: Annotated[int, Query(ge=1, le=100)] — a
    // request above 100 would 422 and silently leave the dropdown with only "Tất cả".
    for (const search of employeeRequests) {
      expect(Number(new URLSearchParams(search).get("limit"))).toBeLessThanOrEqual(100);
    }
    await screen.findByRole("option", { name: /Trần Văn Bình/ });
  });

  test("AC-RPT-031 bấm 1 dòng → drilldown đúng danh sách đơn của nhân viên, đúng 3 đơn", async () => {
    signedInAs(anId, AN);
    mockReport([row()]);
    mockEmployeesList();
    const ordersRequests: string[] = [];
    server.use(
      http.get("/api/v1/reports/revenue-by-employee/:employeeId/orders", ({ request }) => {
        ordersRequests.push(new URL(request.url).search);
        return HttpResponse.json([
          order({ code: "DH2609-0010" }),
          order({ id: "b0000000-0000-4000-8000-000000000021", code: "DH2609-0011" }),
          order({ id: "b0000000-0000-4000-8000-000000000022", code: "DH2609-0012" }),
        ]);
      }),
    );
    renderApp("/reports/revenue-by-employee");
    const user = userEvent.setup();

    await screen.findByText("Nguyễn Thị Hoa");
    await user.click(screen.getByRole("button", { name: "Nguyễn Thị Hoa" }));

    await screen.findByRole("dialog", { name: "Nguyễn Thị Hoa" });
    await waitFor(() => {
      expect(ordersRequests[0]).toContain("status=COMPLETED");
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("DH2609-0010")).toBeInTheDocument();
    expect(within(dialog).getByText("DH2609-0011")).toBeInTheDocument();
    expect(within(dialog).getByText("DH2609-0012")).toBeInTheDocument();
  });

  test("AC-RPT-032 bấm 1 đơn trong drilldown → gọi GET /orders/{id}, hiện dòng hàng chỉ đọc", async () => {
    signedInAs(anId, AN);
    mockReport([row()]);
    mockEmployeesList();
    server.use(
      http.get("/api/v1/reports/revenue-by-employee/:employeeId/orders", () =>
        HttpResponse.json([order()]),
      ),
      http.get("/api/v1/orders/:id", ({ params }) => {
        expect(params.id).toBe(order1Id);
        return HttpResponse.json(
          orderDetail({ lines: [line({ name_snapshot: "Màn hình Dell 22 inch" })] }),
        );
      }),
    );
    renderApp("/reports/revenue-by-employee");
    const user = userEvent.setup();

    await screen.findByText("Nguyễn Thị Hoa");
    await user.click(screen.getByRole("button", { name: "Nguyễn Thị Hoa" }));
    await screen.findByText("DH2609-0010");
    await user.click(screen.getByText("DH2609-0010"));

    const lineDialog = await screen.findByRole("dialog", { name: "Đơn DH2609-0010" });
    expect(within(lineDialog).getByText("Màn hình Dell 22 inch")).toBeInTheDocument();
    expect(within(lineDialog).queryByRole("button", { name: /xoá/i })).not.toBeInTheDocument();
  });

  test("AC-RPT-033 bấm 'Xuất Excel' → link trỏ đúng endpoint CSV kèm điều kiện lọc", async () => {
    signedInAs(anId, AN);
    mockReport([row()]);
    mockEmployeesList();
    renderApp("/reports/revenue-by-employee");

    await screen.findByText("Nguyễn Thị Hoa");
    const link = screen.getByRole("link", { name: /Xuất Excel/i });
    expect(link.getAttribute("href")).toMatch(
      /^\/api\/v1\/reports\/revenue-by-employee\/export\?from=.+&to=.+&status=COMPLETED$/,
    );
  });

  test("AC-RPT-034 mobile 390px: thẻ (không bảng), bộ lọc xếp dọc", async () => {
    mobile();
    signedInAs(anId, AN);
    mockReport([
      row(),
      row({
        employee_id: "a0000000-0000-4000-8000-000000000002",
        employee_code: "NV002",
        employee_name: "Nhân viên khác",
      }),
    ]);
    mockEmployeesList();
    renderApp("/reports/revenue-by-employee");

    await screen.findByText("Nguyễn Thị Hoa");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Nhân viên khác")).toBeInTheDocument();
  });

  test("Hoa (SALE, scope own, không có employee.read) → dropdown nhân viên khoá, cố định chính mình, không gọi GET /employees", async () => {
    signedInAs(hoaId, HOA);
    mockReport([row()]);
    let employeesCalled = false;
    server.use(
      http.get("/api/v1/employees", () => {
        employeesCalled = true;
        return HttpResponse.json({ items: [], limit: 0, offset: 0, total: 0 });
      }),
    );
    renderApp("/reports/revenue-by-employee");

    const select = await screen.findByLabelText("Nhân viên");
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent("NV005");
    expect(employeesCalled).toBe(false);
  });

  test("Đức (TECHNICIAN, không có report.revenue.read) mở URL trực tiếp → 403", async () => {
    signedInAs(ducId, DUC);
    renderApp("/reports/revenue-by-employee");

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });

  test("Lỗi API mạng/5xx → trạng thái lỗi chung + nút Tải lại hoạt động", async () => {
    signedInAs(anId, AN);
    mockEmployeesList();
    let calls = 0;
    server.use(
      http.get("/api/v1/reports/revenue-by-employee", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 })
          : HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", items: [row()], total: 0 });
      }),
    );
    renderApp("/reports/revenue-by-employee");
    const user = userEvent.setup();

    expect(
      await screen.findByText("Không tải được báo cáo doanh thu theo nhân viên."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await screen.findByText("Nguyễn Thị Hoa");
  });

  test("422 'Từ ngày' > 'Đến ngày' → banner lỗi chung, không tự chặn ở client", async () => {
    signedInAs(anId, AN);
    mockEmployeesList();
    server.use(
      http.get("/api/v1/reports/revenue-by-employee", () =>
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
    renderApp("/reports/revenue-by-employee");

    expect(await screen.findByRole("alert")).toHaveTextContent("Từ ngày không được sau Đến ngày.");
  });
});
