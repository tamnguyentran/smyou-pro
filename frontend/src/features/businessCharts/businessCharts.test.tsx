import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";
import { shortMoney } from "./format";

type Results = components["schemas"]["BusinessResultsOut"];
type Sales = components["schemas"]["BusinessSalesOut"];
type Staff = components["schemas"]["BusinessStaffOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const tuanId = "a0000000-0000-4000-8000-000000000011";
const maiId = "a0000000-0000-4000-8000-000000000012";
const quanId = "a0000000-0000-4000-8000-000000000020";
const longId = "a0000000-0000-4000-8000-000000000021";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": ["all"],
    "report.business_charts.read": ["all"],
    "report.kpi_sales.read": ["all"],
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

const LONG_NAME = "Camera IP Imou Ranger 2 4MP xoay 360 độ có màu ban đêm";

function results(overrides: Partial<Results> = {}): Results {
  return {
    from: "2026-09",
    to: "2026-10",
    monthly: [
      { month: "2026-09", revenue: 7_000_000, profit: 1_400_000 },
      { month: "2026-10", revenue: 3_700_000, profit: 950_000 },
    ],
    composition: {
      by_group: [
        { key: "g1", label: "Thiết bị văn phòng", revenue: 7_000_000, profit: 1_400_000 },
        { key: "g2", label: "Thiết bị an ninh", revenue: 3_700_000, profit: 950_000 },
      ],
      by_item: [
        { key: "p1", label: "Máy in Canon LBP 2900", revenue: 7_000_000, profit: 1_400_000 },
        { key: "p2", label: "Camera Imou", revenue: 3_200_000, profit: 800_000 },
        { key: "c1", label: "Công đi dây", revenue: 500_000, profit: 150_000 },
      ],
      by_customer_type: [
        { key: "COMPANY", label: "Tổ chức", revenue: 7_000_000, profit: 1_400_000 },
        { key: "INDIVIDUAL", label: "Cá nhân", revenue: 3_700_000, profit: 950_000 },
      ],
    },
    customers_monthly: [
      { month: "2026-09", new_count: 0, returning_count: 0 },
      { month: "2026-10", new_count: 1, returning_count: 1 },
    ],
    ...overrides,
  };
}

function pareto(metric: "revenue" | "profit") {
  const values = metric === "revenue" ? [50, 30, 10, 6, 4] : [20, 12, 4, 2.4, 1.6];
  const cumulative = [50, 80, 90, 96, 100];
  return values.map((value, i) => ({
    key: `p${String(i + 1)}`,
    label: `${metric === "revenue" ? "SP" : "LN"} ${String(i + 1)}`,
    value: value * 1_000_000,
    cumulative_pct: cumulative[i] ?? 0,
    is_vital: i < 2,
  }));
}

function sales(metric: "revenue" | "profit", overrides: Partial<Sales> = {}): Sales {
  return {
    from: "2026-09",
    to: "2026-10",
    metric,
    pareto: pareto(metric),
    top_selling: [
      { key: "p2", label: LONG_NAME, unit: "CAI", quantity: 4, revenue: 3_200_000 },
      { key: "p1", label: "Máy in Canon LBP 2900", unit: "CAI", quantity: 2, revenue: 7_000_000 },
    ],
    slow_selling: [
      { key: "s1", label: "Bảo trì máy in", unit: "BO", quantity: 0, revenue: 0 },
      { key: "s2", label: "Ổ cứng SSD 256GB", unit: "CAI", quantity: 0, revenue: 0 },
      { key: "p1", label: "Máy in Canon LBP 2900", unit: "CAI", quantity: 2, revenue: 7_000_000 },
    ],
    ...overrides,
  };
}

function kpiRow(
  stt: number,
  id: string,
  name: string,
  pct: number | null,
): Staff["kpi_completion"]["rows"][number] {
  return {
    stt,
    employee_id: id,
    employee_code: `NV0${String(stt)}`,
    employee_name: name,
    department_name: "Kinh doanh",
    total_sales: 100_000_000,
    net_revenue: pct === null ? 10_000_000 : 25_000_000,
    target: pct === null ? null : 20_000_000,
    achievement_pct: pct,
  };
}

function staff(overrides: Partial<Staff> = {}): Staff {
  return {
    from: "2026-09",
    to: "2026-10",
    hours_by_technician: [
      {
        employee_id: quanId,
        employee_code: "NV020",
        employee_name: "Võ Minh Quân",
        assigned_hours: 8,
        task_count: 3,
      },
      {
        employee_id: longId,
        employee_code: "NV021",
        employee_name: "Phạm Đức Long",
        assigned_hours: 5.5,
        task_count: 2,
      },
    ],
    kpi_completion: {
      month: "2026-10",
      rows: [
        kpiRow(1, tuanId, "Lê Minh Tuấn", 125.0),
        kpiRow(2, hoaId, "Nguyễn Thị Hoa", 80.0),
        kpiRow(3, maiId, "Trần Thị Mai", null),
      ],
    },
    ...overrides,
  };
}

const EMPTY_RESULTS = results({
  monthly: [
    { month: "2026-09", revenue: 0, profit: 0 },
    { month: "2026-10", revenue: 0, profit: 0 },
  ],
  composition: { by_group: [], by_item: [], by_customer_type: [] },
  customers_monthly: [
    { month: "2026-09", new_count: 0, returning_count: 0 },
    { month: "2026-10", new_count: 0, returning_count: 0 },
  ],
});

interface Calls {
  results: string[];
  sales: string[];
  staff: string[];
}

function mockCharts(
  body: {
    results?: Results;
    sales?: (metric: "revenue" | "profit") => Sales;
    staff?: Staff;
  } = {},
): Calls {
  const calls: Calls = { results: [], sales: [], staff: [] };
  server.use(
    http.get("/api/v1/reports/business-charts/results", ({ request }) => {
      calls.results.push(new URL(request.url).search);
      return HttpResponse.json(body.results ?? results());
    }),
    http.get("/api/v1/reports/business-charts/sales", ({ request }) => {
      const url = new URL(request.url);
      calls.sales.push(url.search);
      const metric = url.searchParams.get("metric") === "profit" ? "profit" : "revenue";
      return HttpResponse.json((body.sales ?? sales)(metric));
    }),
    http.get("/api/v1/reports/business-charts/staff", ({ request }) => {
      calls.staff.push(new URL(request.url).search);
      return HttpResponse.json(body.staff ?? staff());
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const PAGE = "/reports/business-charts";

async function openPage(path = PAGE) {
  vi.setSystemTime(new Date("2026-11-04T03:00:00Z"));
  signedInAs(anId, AN);
  const router = renderApp(path);
  await screen.findByRole("heading", { name: "Biểu đồ kinh doanh" });
  return router;
}

async function setPeriod(from: string, to: string) {
  const user = userEvent.setup();
  const fromInput = screen.getByLabelText("Từ tháng");
  const toInput = screen.getByLabelText("Đến tháng");
  await user.clear(fromInput);
  await user.type(fromInput, from.replace("/", ""));
  await user.clear(toInput);
  await user.type(toInput, to.replace("/", ""));
  return user;
}

/** Recharts tracks the pointer on its wrapper; jsdom rects sit at 0,0 so clientX/Y are chart coords. */
function hover(chart: HTMLElement, clientX: number, clientY = 100) {
  const wrapper = chart.querySelector(".recharts-wrapper");
  if (!wrapper) throw new Error("chart wrapper not rendered");
  fireEvent.mouseMove(wrapper, { clientX, clientY });
}

function card(name: string | RegExp) {
  return screen.getByRole("region", { name });
}

function barFills(chart: HTMLElement): (string | null)[] {
  return Array.from(chart.querySelectorAll(".recharts-bar-rectangle .recharts-rectangle")).map(
    (el) => el.getAttribute("fill"),
  );
}

function legendItems(region: HTMLElement): string[] {
  return within(within(region).getByRole("list", { name: "Chú giải" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
}

describe("Biểu đồ kinh doanh (/reports/business-charts)", () => {
  test("AC-RPT-123 menu Báo cáo → Biểu đồ kinh doanh: URL, tiêu đề, tab mặc định, kỳ 12/2025–11/2026", async () => {
    vi.setSystemTime(new Date("2026-11-04T03:00:00Z"));
    signedInAs(anId, AN);
    const calls = mockCharts();
    server.use(
      http.get("/api/v1/dashboard", () => HttpResponse.json({ cards: [] })),
      http.get("/api/v1/reports/kpi-sales", () =>
        HttpResponse.json({
          month: "2026-11",
          rows: [],
          totals: { total_sales: 0, net_revenue: 0, target: 0, has_missing_cost: false },
        }),
      ),
    );
    const router = renderApp("/reports/kpi-sales");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Biểu đồ kinh doanh" }));

    expect(router.state.location.pathname).toBe(PAGE);
    expect(await screen.findByRole("heading", { name: "Biểu đồ kinh doanh" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Kết quả kinh doanh" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Từ tháng")).toHaveValue("12/2025");
    expect(screen.getByLabelText("Đến tháng")).toHaveValue("11/2026");
    await waitFor(() => {
      expect(calls.results).toEqual(["?from=2025-12&to=2026-11"]);
    });
    expect(calls.sales).toEqual([]);
    expect(calls.staff).toEqual([]);
  });

  test("AC-RPT-124 Sale mở thẳng URL: không có menu, trang cấm, không gọi API biểu đồ", async () => {
    signedInAs(hoaId, HOA);
    const calls = mockCharts();
    renderApp(PAGE);

    // Same shared forbidden page as the other reports (spec: "như các báo cáo khác").
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Biểu đồ kinh doanh" })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual({ results: [], sales: [], staff: [] });
  });

  test("AC-RPT-125 biểu đồ kết hợp: nhóm T9/T10, tooltip tháng 10 doanh thu/lợi nhuận, trục Y rút gọn", async () => {
    const calls = mockCharts();
    await openPage();
    await setPeriod("09/2026", "10/2026");
    await waitFor(() => {
      expect(calls.results).toContain("?from=2026-09&to=2026-10");
    });

    const region = card("Doanh thu & Lợi nhuận theo tháng");
    const chart = await within(region).findByRole("img", {
      name: "Doanh thu và lợi nhuận theo tháng, 09/2026–10/2026",
    });
    await within(chart).findByText("T10/2026");
    expect(within(chart).getByText("T9/2026")).toBeInTheDocument();
    const ticks = Array.from(
      chart.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-label"),
    ).map((t) => t.textContent);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.some((t) => /^\d+(,\d)? tr$/.test(t))).toBe(true);
    expect(ticks.some((t) => t.includes("000"))).toBe(false);
    expect(shortMoney(3_700_000)).toBe("3,7 tr");
    expect(shortMoney(2_500_000_000)).toBe("2,5 tỷ");

    hover(chart, 450);
    const tooltip = await within(region).findByRole("tooltip");
    expect(tooltip).toHaveTextContent("T10/2026");
    expect(tooltip).toHaveTextContent("Doanh thu: 3.700.000 ₫");
    expect(tooltip).toHaveTextContent("Lợi nhuận: 950.000 ₫");
  });

  test("AC-RPT-126 Cơ cấu: radio Lợi nhuận + chiều Loại khách hàng → tròn theo Cá nhân/Tổ chức, % 1 chữ số, không gọi lại API", async () => {
    const calls = mockCharts();
    await openPage();
    await setPeriod("09/2026", "10/2026");
    const region = await screen.findByRole("region", { name: "Cơ cấu doanh thu" });
    await within(region).findByRole("img");
    const before = calls.results.length;
    const user = userEvent.setup();

    await user.click(within(region).getByRole("radio", { name: "Lợi nhuận" }));
    await user.click(within(region).getByRole("radio", { name: "Loại khách hàng" }));

    const profit = card("Cơ cấu lợi nhuận");
    expect(within(profit).getByRole("radio", { name: "Lợi nhuận" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(profit.querySelectorAll(".recharts-pie-sector")).toHaveLength(2);
    const legend = legendItems(profit);
    expect(legend).toHaveLength(2);
    expect(legend[0]).toContain("Tổ chức");
    expect(legend[0]).toContain("59,6%");
    expect(legend[1]).toContain("Cá nhân");
    expect(legend[1]).toContain("40,4%");
    expect(calls.results.length).toBe(before);
  });

  test("AC-RPT-127 Khách hàng mới & quay lại: 2 cột/tháng khác màu, chú giải, tooltip số khách", async () => {
    mockCharts();
    await openPage();
    await setPeriod("09/2026", "10/2026");
    const region = card("Khách hàng mới & quay lại");
    const chart = await within(region).findByRole("img");
    await within(chart).findByText("T10/2026");

    expect(legendItems(region)).toEqual(["Khách mới", "Khách quay lại"]);
    const fills = barFills(chart);
    expect(fills).toHaveLength(2);
    expect(new Set(fills).size).toBe(2);

    hover(chart, 450);
    const tooltip = await within(region).findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Khách mới: 1 khách");
    expect(tooltip).toHaveTextContent("Khách quay lại: 1 khách");
  });

  test("AC-RPT-128 tab Bán hàng & sản phẩm: ?tab=sales, gọi metric=revenue 1 lần, Pareto 5 cột, 2 cột đầu đậm, luỹ kế 100%, vạch 80%", async () => {
    const calls = mockCharts();
    const router = await openPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Bán hàng & sản phẩm" }));

    expect(router.state.location.search).toBe("?tab=sales");
    expect(screen.getByRole("tab", { name: "Bán hàng & sản phẩm" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const region = card("Phân tích Pareto 80/20");
    const chart = await within(region).findByRole("img");
    await within(chart).findByText("SP 1");
    expect(calls.sales).toEqual(["?from=2025-12&to=2026-11&metric=revenue"]);

    const fills = barFills(chart);
    expect(fills).toHaveLength(5);
    expect(fills[0]).toBe(fills[1]);
    expect(fills[2]).toBe(fills[4]);
    expect(fills[0]).not.toBe(fills[2]);
    expect(within(chart).getByText("80%")).toBeInTheDocument();

    hover(chart, 590);
    const tooltip = await within(region).findByRole("tooltip");
    expect(tooltip).toHaveTextContent("SP 5");
    expect(tooltip).toHaveTextContent("Luỹ kế: 100,0%");
  });

  test("AC-RPT-129 Pareto radio Lợi nhuận → gọi metric=profit, vẽ lại", async () => {
    const calls = mockCharts();
    await openPage(`${PAGE}?tab=sales`);
    const region = card("Phân tích Pareto 80/20");
    await within(region).findByText("SP 1");
    const user = userEvent.setup();

    await user.click(within(region).getByRole("radio", { name: "Lợi nhuận" }));

    await waitFor(() => {
      expect(calls.sales).toContain("?from=2025-12&to=2026-11&metric=profit");
    });
    expect(await within(region).findByText("LN 1")).toBeInTheDocument();
    expect(within(region).queryByText("SP 1")).toBeNull();
  });

  test("AC-RPT-130 Top bán chạy/bán chậm: cột ngang, tên dài cắt …, tooltip đủ tên, '4 Cái', mục 0 vẫn hiện", async () => {
    mockCharts();
    await openPage(`${PAGE}?tab=sales`);
    const top = card("Top bán chạy");
    const topChart = await within(top).findByRole("img");
    await within(topChart).findByText("4 Cái");
    expect(within(topChart).getByText("2 Cái")).toBeInTheDocument();
    expect(within(topChart).queryByText(LONG_NAME)).toBeNull();
    const truncated = within(topChart).getByText((text) => text.endsWith("…"));
    expect(LONG_NAME.startsWith(truncated.textContent.slice(0, -1))).toBe(true);
    expect(topChart.querySelector(".recharts-bar")).not.toBeNull();

    hover(topChart, 300, 60);
    expect(await within(top).findByRole("tooltip")).toHaveTextContent(LONG_NAME);

    const slow = card("Top bán chậm");
    const slowChart = within(slow).getByRole("img");
    expect(within(slowChart).getByText("Bảo trì máy in")).toBeInTheDocument();
    expect(within(slowChart).getByText("0 Bộ")).toBeInTheDocument();
    expect(within(slowChart).getByText("0 Cái")).toBeInTheDocument();
  });

  test("AC-RPT-131 tab Nhân sự & KPI: giờ Quân 8 / Long 5,5; KPI tháng 10/2026 Tuấn 125%, Hoa 80%, vạch 100%; bảng Mai —", async () => {
    const calls = mockCharts();
    const router = await openPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Nhân sự & KPI" }));
    expect(router.state.location.search).toBe("?tab=staff");

    const hours = card("Giờ được phân công theo kỹ thuật viên");
    const hoursChart = await within(hours).findByRole("img");
    await within(hoursChart).findByText("8 giờ");
    expect(within(hoursChart).getByText("5,5 giờ")).toBeInTheDocument();
    expect(within(hoursChart).getByText("Võ Minh Quân")).toBeInTheDocument();
    expect(within(hoursChart).getByText("Phạm Đức Long")).toBeInTheDocument();

    const kpi = card("Tỷ lệ hoàn thành KPI theo nhân viên — 10/2026");
    const kpiChart = within(kpi).getByRole("img");
    expect(within(kpiChart).getByText("125,0%")).toBeInTheDocument();
    expect(within(kpiChart).getByText("80,0%")).toBeInTheDocument();
    expect(within(kpiChart).getByText("100%")).toBeInTheDocument();
    const table = within(kpi).getByRole("table");
    const maiRow = within(table).getByText("Trần Thị Mai").closest("tr");
    expect(maiRow).not.toBeNull();
    expect(maiRow).toHaveTextContent("—");
    expect(within(table).getByText("Lê Minh Tuấn").closest("tr")).toHaveTextContent("125,0%");
    expect(calls.staff).toEqual(["?from=2025-12&to=2026-11"]);
  });

  test("AC-RPT-132 kỳ sai thứ tự / quá 24 tháng: báo lỗi dưới ô, không gọi API", async () => {
    const calls = mockCharts();
    await openPage();
    await waitFor(() => {
      expect(calls.results).toEqual(["?from=2025-12&to=2026-11"]);
    });

    await setPeriod("11/2026", "09/2026");
    expect(
      await screen.findByText("Tháng bắt đầu phải trước hoặc bằng tháng kết thúc"),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.results).not.toContain("?from=2026-11&to=2026-09");

    await setPeriod("01/2024", "10/2026");
    expect(await screen.findByText("Chỉ xem tối đa 24 tháng")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.results).not.toContain("?from=2024-01&to=2026-10");
  });

  test("AC-RPT-133 kỳ không có dữ liệu: ô trống cho từng biểu đồ, biểu đồ theo tháng vẫn vẽ cột 0", async () => {
    mockCharts({
      results: EMPTY_RESULTS,
      sales: (metric) => sales(metric, { pareto: [], top_selling: [], slow_selling: [] }),
      staff: staff({ hours_by_technician: [], kpi_completion: { month: "2026-10", rows: [] } }),
    });
    await openPage();
    const user = userEvent.setup();

    const monthly = card("Doanh thu & Lợi nhuận theo tháng");
    expect(await within(monthly).findByRole("img")).toBeInTheDocument();
    expect(within(card("Khách hàng mới & quay lại")).getByRole("img")).toBeInTheDocument();
    const composition = card("Cơ cấu doanh thu");
    expect(within(composition).getByText("Chưa có dữ liệu trong kỳ này")).toBeInTheDocument();
    expect(within(composition).queryByRole("img")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Bán hàng & sản phẩm" }));
    for (const name of ["Phân tích Pareto 80/20", "Top bán chạy", "Top bán chậm"]) {
      const region = await screen.findByRole("region", { name });
      expect(await within(region).findByText("Chưa có dữ liệu trong kỳ này")).toBeInTheDocument();
      expect(within(region).queryByRole("img")).toBeNull();
    }

    await user.click(screen.getByRole("tab", { name: "Nhân sự & KPI" }));
    for (const name of [
      "Giờ được phân công theo kỹ thuật viên",
      "Tỷ lệ hoàn thành KPI theo nhân viên — 10/2026",
    ]) {
      const region = await screen.findByRole("region", { name });
      expect(await within(region).findByText("Chưa có dữ liệu trong kỳ này")).toBeInTheDocument();
      expect(within(region).queryByRole("img")).toBeNull();
    }
  });

  test("AC-RPT-134 API 500: khối lỗi + Thử lại ≥44px; đang tải: skeleton đúng chiều cao biểu đồ", async () => {
    let fail = true;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/reports/business-charts/results", async () => {
        await gate;
        return fail
          ? HttpResponse.json({ status: 500, title: "Lỗi" }, { status: 500 })
          : HttpResponse.json(results());
      }),
    );
    await openPage();

    const skeletons = await screen.findAllByLabelText("Đang tải biểu đồ");
    expect(skeletons.length).toBeGreaterThan(0);
    for (const skeleton of skeletons) {
      expect(skeleton).toHaveAttribute("aria-busy", "true");
      expect(skeleton.style.height).toBe("280px");
    }

    release();
    expect(await screen.findByText("Không tải được số liệu")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Thử lại" });
    expect(retry.className).toContain("min-h-11");

    fail = false;
    await userEvent.setup().click(retry);
    expect(
      await screen.findByRole("region", { name: "Doanh thu & Lợi nhuận theo tháng" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Không tải được số liệu")).toBeNull();
  });

  test("AC-RPT-137 mỗi biểu đồ role=img + aria-label tóm tắt; màu từ token UI_GUIDELINES", async () => {
    mockCharts();
    await openPage();
    await setPeriod("09/2026", "10/2026");
    const user = userEvent.setup();

    const monthly = await screen.findByRole("img", {
      name: "Doanh thu và lợi nhuận theo tháng, 09/2026–10/2026",
    });
    await within(monthly).findByText("T10/2026");
    expect(
      screen.getByRole("img", { name: "Cơ cấu doanh thu theo nhóm SP/DV, 09/2026–10/2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Khách hàng mới và quay lại theo tháng, 09/2026–10/2026" }),
    ).toBeInTheDocument();
    expect(barFills(monthly).every((fill) => fill === "var(--color-brand)")).toBe(true);
    expect(monthly.querySelector(".recharts-line-curve")?.getAttribute("stroke")).toBe(
      "var(--color-completed-fg)",
    );

    await user.click(screen.getByRole("tab", { name: "Bán hàng & sản phẩm" }));
    for (const name of [
      "Pareto doanh thu theo sản phẩm – dịch vụ, 09/2026–10/2026",
      "Top bán chạy theo số lượng, 09/2026–10/2026",
      "Top bán chậm theo số lượng, 09/2026–10/2026",
    ]) {
      expect(await screen.findByRole("img", { name })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("tab", { name: "Nhân sự & KPI" }));
    for (const name of [
      "Giờ được phân công theo kỹ thuật viên, 09/2026–10/2026",
      "Tỷ lệ hoàn thành KPI theo nhân viên, tháng 10/2026",
    ]) {
      expect(await screen.findByRole("img", { name })).toBeInTheDocument();
    }
    for (const el of document.querySelectorAll(".recharts-rectangle, .recharts-pie-sector path")) {
      const fill = el.getAttribute("fill");
      if (fill && fill !== "none") expect(fill).toMatch(/^var\(--color-[a-z_-]+\)$/);
    }
  });
});
