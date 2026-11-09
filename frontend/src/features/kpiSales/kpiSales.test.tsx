import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type KpiSalesRow = components["schemas"]["KpiSalesRowOut"];
type KpiSalesTotals = components["schemas"]["KpiSalesTotalsOut"];
type MyKpiSales = components["schemas"]["MyKpiSalesOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const tuanId = "a0000000-0000-4000-8000-000000000011";
const khangId = "a0000000-0000-4000-8000-000000000014";
const salesDeptId = "d2222222-2222-4222-8222-222222222222";
const securityGroupId = "e3333333-3333-4333-8333-333333333333";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": ["all"],
    "report.kpi_sales.read": ["all"],
    "employee.read": ["all"],
    "employee.lookup": ["all"],
    "profile.manage": ["self"],
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": ["all"],
    "report.revenue.read": ["own"],
    "profile.manage": ["self"],
  },
};
const LAN: Person = {
  code: "NV007",
  full_name: "Phạm Thị Lan",
  email: "lan.pham@smyou.vn",
  roles: ["CUSTOMER_CARE"],
  capabilities: { "dashboard.read": ["all"], "report.revenue.read": ["own"] },
};
const TUAN: Person = {
  code: "NV010",
  full_name: "Lê Minh Tuấn",
  email: "tuan.le@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: { "dashboard.read": ["all"], "kpi.read": ["all"], "report.revenue.read": ["all"] },
};
const KHANG: Person = {
  code: "NV014",
  full_name: "Võ Minh Khang",
  email: "khang.vo@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["all"], "kpi.read": ["self"], "profile.manage": ["self"] },
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
  vi.useRealTimers();
});

function row(overrides: Partial<KpiSalesRow> = {}): KpiSalesRow {
  return {
    stt: 1,
    employee_id: hoaId,
    employee_code: "NV005",
    employee_name: "Nguyễn Thị Hoa",
    department_name: "Kinh doanh",
    total_sales: 130_000_000,
    net_revenue: 25_000_000,
    target: 20_000_000,
    achievement_pct: 125.0,
    ...overrides,
  };
}

const TOTALS: KpiSalesTotals = {
  total_sales: 130_000_000,
  net_revenue: 25_000_000,
  target: 20_000_000,
  has_missing_cost: false,
  achievement_pct: 125.0,
};

function mockReport(
  rows: KpiSalesRow[],
  onRequest?: (search: string) => void,
  totals: KpiSalesTotals = TOTALS,
) {
  server.use(
    http.get("/api/v1/reports/kpi-sales", ({ request }) => {
      const url = new URL(request.url);
      onRequest?.(url.search);
      return HttpResponse.json({
        month: url.searchParams.get("month") ?? "2026-11",
        rows,
        totals,
      });
    }),
  );
}

function mockFilterSources() {
  server.use(
    http.get("/api/v1/departments", () =>
      HttpResponse.json({
        items: [
          {
            id: salesDeptId,
            name: "Kinh doanh",
            is_active: true,
            version: 1,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        limit: 100,
        offset: 0,
        total: 1,
      }),
    ),
    http.get("/api/v1/product-service-groups", () =>
      HttpResponse.json({
        items: [{ id: securityGroupId, name: "Thiết bị an ninh", is_active: true, version: 1 }],
        limit: 100,
        offset: 0,
        total: 1,
      }),
    ),
    http.get("/api/v1/employees/lookup", () =>
      HttpResponse.json([
        { id: tuanId, code: "NV010", full_name: "Lê Minh Tuấn", phone: null, is_active: true },
      ]),
    ),
  );
}

function mockMyKpi(body: (month: string) => MyKpiSales, onRequest?: (search: string) => void) {
  server.use(
    http.get("/api/v1/me/kpi-sales", ({ request }) => {
      const url = new URL(request.url);
      onRequest?.(url.search);
      return HttpResponse.json(body(url.searchParams.get("month") ?? "2026-11"));
    }),
  );
}

describe("Báo cáo KPI (/reports/kpi-sales)", () => {
  test("AC-RPT-089 mặc định tháng hiện tại, gọi month=2026-11, bảng 7 cột, tiền và tỷ lệ định dạng VN", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(anId, AN);
    mockFilterSources();
    const requests: string[] = [];
    mockReport([row()], (search) => {
      requests.push(search);
    });
    renderApp("/reports/kpi-sales");

    await screen.findByRole("heading", { name: "Báo cáo KPI" });
    expect(screen.getByLabelText("Tháng")).toHaveValue("11/2026");
    expect(screen.getByText("Tháng 11/2026")).toBeInTheDocument();
    await waitFor(() => {
      expect(requests).toContain("?month=2026-11");
    });
    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual([
      "STT",
      "Mã NV",
      "Họ tên",
      "Tổng doanh số",
      "Doanh thu thuần",
      "Mục tiêu",
      "Tỷ lệ đạt (%)",
    ]);
    const hoaRow = within(table).getByText("Nguyễn Thị Hoa").closest("tr");
    expect(hoaRow).not.toBeNull();
    const cells = within(hoaRow as HTMLElement)
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(cells).toEqual([
      "1",
      "NV005",
      "Nguyễn Thị Hoa",
      "130.000.000 ₫",
      "25.000.000 ₫",
      "20.000.000 ₫",
      "125,0%",
    ]);
    const totalRow = within(table).getByText("Tổng cộng").closest("tr");
    expect(within(totalRow as HTMLElement).getByText("130.000.000 ₫")).toBeInTheDocument();
  });

  test("AC-RPT-090 tỷ lệ ≥100 tô xanh, <100 mặc định, null hiện —; target null 'Chưa đặt'; net_revenue null '—' + 'Thiếu giá vốn'", async () => {
    signedInAs(anId, AN);
    mockFilterSources();
    mockReport([
      row(),
      row({
        stt: 2,
        employee_id: tuanId,
        employee_code: "NV010",
        employee_name: "Lê Minh Tuấn",
        total_sales: 10_000_000,
        net_revenue: 5_000_000,
        target: 10_000_000,
        achievement_pct: 50.0,
      }),
      row({
        stt: 3,
        employee_id: khangId,
        employee_code: "NV014",
        employee_name: "Võ Minh Khang",
        total_sales: 8_000_000,
        net_revenue: null,
        target: null,
        achievement_pct: null,
      }),
    ]);
    renderApp("/reports/kpi-sales");

    const table = await screen.findByRole("table");
    const rowOf = (name: string) => within(table).getByText(name).closest("tr") as HTMLElement;

    expect(within(rowOf("Nguyễn Thị Hoa")).getByText("125,0%")).toHaveClass("text-completed-fg");
    expect(within(rowOf("Lê Minh Tuấn")).getByText("50,0%")).not.toHaveClass("text-completed-fg");
    const khang = rowOf("Võ Minh Khang");
    expect(within(khang).getByText("Chưa đặt")).toBeInTheDocument();
    expect(within(khang).getByText("Thiếu giá vốn")).toBeInTheDocument();
    expect(within(khang).getAllByText("—")).toHaveLength(2); // Doanh thu thuần + Tỷ lệ đạt
  });

  test("AC-RPT-091 chọn Phòng ban, Nhóm dịch vụ, Nhân viên → gọi API với department_id, group_id, employee_id", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(anId, AN);
    mockFilterSources();
    const requests: string[] = [];
    mockReport([row()], (search) => {
      requests.push(search);
    });
    const user = userEvent.setup();
    renderApp("/reports/kpi-sales");

    await screen.findByRole("table");
    await screen.findByRole("option", { name: "Kinh doanh" });
    await user.selectOptions(screen.getByLabelText("Phòng ban"), salesDeptId);
    await screen.findByRole("option", { name: "Thiết bị an ninh" });
    await user.selectOptions(screen.getByLabelText("Nhóm dịch vụ"), securityGroupId);
    await user.type(screen.getByRole("combobox", { name: "Nhân viên" }), "Tuấn");
    await user.click(await screen.findByRole("option", { name: /Lê Minh Tuấn/ }));

    await waitFor(() => {
      expect(requests).toContain(
        `?month=2026-11&department_id=${salesDeptId}&group_id=${securityGroupId}&employee_id=${tuanId}`,
      );
    });
  });

  test("AC-RPT-092 không có dòng → 'Chưa có dữ liệu KPI cho tháng 11/2026'", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(anId, AN);
    mockFilterSources();
    mockReport([], undefined, {
      total_sales: 0,
      net_revenue: 0,
      target: 0,
      has_missing_cost: false,
      achievement_pct: null,
    });
    renderApp("/reports/kpi-sales");

    expect(await screen.findByText("Chưa có dữ liệu KPI cho tháng 11/2026")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("AC-RPT-093 desktop: 'Xuất Excel' tải bao-cao-kpi-2026-11.csv kèm điều kiện lọc", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(anId, AN);
    mockFilterSources();
    mockReport([row()]);
    renderApp("/reports/kpi-sales");

    await screen.findByRole("table");
    const link = screen.getByRole("link", { name: "Xuất Excel" });
    expect(link).toHaveAttribute("download", "bao-cao-kpi-2026-11.csv");
    expect(link).toHaveAttribute("href", "/api/v1/reports/kpi-sales/export?month=2026-11");
  });

  test("AC-RPT-093 mobile 390px: không có nút 'Xuất Excel', mỗi nhân viên 1 thẻ", async () => {
    mobile();
    signedInAs(anId, AN);
    mockFilterSources();
    mockReport([row()]);
    renderApp("/reports/kpi-sales");

    const list = await screen.findByRole("list", { name: "Báo cáo KPI theo nhân viên" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xuất Excel" })).not.toBeInTheDocument();
  });

  test("AC-RPT-172 desktop: dòng Tổng cộng có Tỷ lệ đạt = tổng doanh thu thuần / tổng mục tiêu", async () => {
    signedInAs(anId, AN);
    mockFilterSources();
    mockReport([row()], undefined, {
      total_sales: 140_000_000,
      net_revenue: 29_000_000,
      target: 35_000_000,
      has_missing_cost: false,
      achievement_pct: 82.9,
    });
    renderApp("/reports/kpi-sales");

    const table = await screen.findByRole("table");
    const totalRow = within(table).getByText("Tổng cộng").closest("tr");
    expect(
      within(totalRow as HTMLElement)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["Tổng cộng", "140.000.000 ₫", "29.000.000 ₫", "35.000.000 ₫", "82,9%"]);
  });

  test("AC-RPT-172 mobile 390px: thẻ Tổng cộng có Tỷ lệ đạt; null hiện —", async () => {
    mobile();
    signedInAs(anId, AN);
    mockFilterSources();
    mockReport([row()], undefined, {
      total_sales: 140_000_000,
      net_revenue: 29_000_000,
      target: 0,
      has_missing_cost: false,
      achievement_pct: null,
    });
    renderApp("/reports/kpi-sales");

    const totals = await screen.findByRole("region", { name: "Tổng cộng" });
    const rate = within(totals).getByText("Tỷ lệ đạt").closest("div");
    expect(rate).toHaveTextContent("—");
  });

  test.each([
    ["Hoa (SALE)", hoaId, HOA],
    ["Lan (CSKH)", "a0000000-0000-4000-8000-000000000007", LAN],
    ["Tuấn (QLKT)", tuanId, TUAN],
    ["Khang (KTV)", khangId, KHANG],
  ])("AC-RPT-095 %s vào /reports/kpi-sales trực tiếp → Không có quyền", async (_, id, person) => {
    signedInAs(id, person);
    renderApp("/reports/kpi-sales");

    expect(
      await screen.findByRole("heading", { name: "Không có quyền truy cập" }),
    ).toBeInTheDocument();
  });
});

describe("KPI doanh số của tôi (Thông tin tài khoản)", () => {
  test("AC-RPT-096 Hoa thấy thẻ 'KPI doanh số của tôi' tháng 11/2026 với 4 số liệu", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(hoaId, HOA);
    const requests: string[] = [];
    mockMyKpi(
      (month) => ({
        month,
        total_sales: 130_000_000,
        net_revenue: 25_000_000,
        target: 20_000_000,
        achievement_pct: 125.0,
      }),
      (search) => {
        requests.push(search);
      },
    );
    renderApp("/ca-nhan");

    const card = await screen.findByRole("region", { name: "KPI doanh số của tôi" });
    expect(within(card).getByText("Tháng 11/2026")).toBeInTheDocument();
    expect(within(card).queryByRole("textbox")).toBeNull();
    await waitFor(() => {
      expect(requests).toContain("?month=2026-11");
    });
    const value = (label: string) =>
      within(card).getByText(label).closest("div")?.querySelector("dd")?.textContent;
    await within(card).findByText("130.000.000 ₫");
    expect(value("Tổng doanh số")).toBe("130.000.000 ₫");
    expect(value("Doanh thu thuần")).toBe("25.000.000 ₫");
    expect(value("Mục tiêu")).toBe("20.000.000 ₫");
    expect(value("Tỷ lệ đạt")).toBe("125,0%");
  });

  test("AC-RPT-099 Hoa: thẻ cá nhân + thẻ KPI chung lưới 1 cột → md:grid-cols-2 (cùng hàng từ tablet)", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(hoaId, HOA);
    mockMyKpi((month) => ({
      month,
      total_sales: 0,
      net_revenue: 0,
      target: null,
      achievement_pct: null,
    }));
    renderApp("/ca-nhan");

    const card = await screen.findByRole("region", { name: "KPI doanh số của tôi" });
    const grid = card.parentElement as HTMLElement;
    const columns = grid.className.split(" ");
    expect(columns).toEqual(expect.arrayContaining(["grid", "md:grid-cols-2"]));
    const sections = Array.from(grid.children).filter((el) => el.tagName === "SECTION");
    expect(sections).toHaveLength(2);
    expect(sections[1]).toBe(card);
    for (const section of sections) expect(section.className).not.toContain("max-w-md");
  });

  test("AC-RPT-097 Hoa bấm 'Tháng trước' sang 10/2026 → gọi /me/kpi-sales?month=2026-10, thẻ cập nhật", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(hoaId, HOA);
    const requests: string[] = [];
    mockMyKpi(
      (month) => ({
        month,
        total_sales: month === "2026-10" ? 40_000_000 : 130_000_000,
        net_revenue: 25_000_000,
        target: 20_000_000,
        achievement_pct: 125.0,
      }),
      (search) => {
        requests.push(search);
      },
    );
    renderApp("/ca-nhan");

    const card = await screen.findByRole("region", { name: "KPI doanh số của tôi" });
    await within(card).findByText("130.000.000 ₫");
    await userEvent.setup().click(within(card).getByRole("button", { name: "Tháng trước" }));

    await waitFor(() => {
      expect(requests).toContain("?month=2026-10");
    });
    expect(await within(card).findByText("40.000.000 ₫")).toBeInTheDocument();
    expect(within(card).getByText("Tháng 10/2026")).toBeInTheDocument();
  });

  test("AC-RPT-098 Khang (KTV) chưa có chỉ tiêu → Mục tiêu 'Chưa đặt', Tỷ lệ '—'", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(khangId, KHANG);
    mockMyKpi((month) => ({
      month,
      total_sales: 0,
      net_revenue: 0,
      target: null,
      achievement_pct: null,
    }));
    renderApp("/ca-nhan");

    const card = await screen.findByRole("region", { name: "KPI doanh số của tôi" });
    const value = (label: string) =>
      within(card).getByText(label).closest("div")?.querySelector("dd")?.textContent;
    await within(card).findByText("Chưa đặt");
    expect(value("Mục tiêu")).toBe("Chưa đặt");
    expect(value("Tỷ lệ đạt")).toBe("—");
  });
});

describe("AC-UI-092 ô Tháng (DateField) ở Báo cáo KPI", () => {
  test("AC-UI-092 gõ tay 10/2026 → month=2026-10; gõ dở 10/20 không gọi API, giữ tháng cũ", async () => {
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    signedInAs(anId, AN);
    mockFilterSources();
    const requests: string[] = [];
    mockReport([row()], (search) => {
      requests.push(search);
    });
    renderApp("/reports/kpi-sales");
    await screen.findByRole("heading", { name: "Báo cáo KPI" });
    await waitFor(() => {
      expect(requests).toContain("?month=2026-11");
    });
    const user = userEvent.setup();
    const input = screen.getByLabelText("Tháng");
    expect(input).toHaveValue("11/2026");
    expect(document.querySelector('input[type="month"]')).toBeNull();

    await user.clear(input);
    await user.type(input, "1020");
    expect(input).toHaveValue("10/20");
    const before = requests.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests.slice(before).length).toBe(0);
    expect(requests.every((search) => search.includes("month=2026-11"))).toBe(true);
    expect(screen.getByText("Tháng 11/2026")).toBeInTheDocument();

    await user.type(input, "26");
    expect(input).toHaveValue("10/2026");
    await waitFor(() => {
      expect(requests).toContain("?month=2026-10");
    });
    expect(screen.getByText("Tháng 10/2026")).toBeInTheDocument();
  });
});
