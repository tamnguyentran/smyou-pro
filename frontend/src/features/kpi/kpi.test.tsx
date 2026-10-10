import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type KpiRow = components["schemas"]["KpiRowOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const khoaId = "a0000000-0000-4000-8000-000000000081";
const minhId = "a0000000-0000-4000-8000-000000000082";
const lanId = "a0000000-0000-4000-8000-000000000083";
const ducId = "a0000000-0000-4000-8000-000000000084";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": ["all"], "kpi.read": ["all"] },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["all"] },
};
const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["all"], "kpi.read": ["self"] },
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
});

function row(overrides: Partial<KpiRow> = {}): KpiRow {
  return {
    employee_id: khoaId,
    employee_code: "NV010",
    employee_full_name: "Trần Văn Khoa",
    employee_is_active: true,
    completed_task_count: 2,
    on_time_count: 1,
    on_time_rate: 0.5,
    rejection_counts: { BUSY: 0, SICK: 1, SKILL: 0, DISTANCE: 2, OTHER: 0 },
    rejection_total: 3,
    defect_count: 1,
    estimated_hours_total: "5",
    actual_hours_total: "1.5",
    actual_hours_missing_count: 1,
    ...overrides,
  };
}

const KHOA = row();
const MINH = row({
  employee_id: minhId,
  employee_code: "NV011",
  employee_full_name: "Lê Văn Minh",
  completed_task_count: 0,
  on_time_count: 0,
  on_time_rate: null,
  rejection_counts: { BUSY: 0, SICK: 0, SKILL: 0, DISTANCE: 0, OTHER: 0 },
  rejection_total: 0,
  defect_count: 0,
  estimated_hours_total: "0",
  actual_hours_total: "0",
  actual_hours_missing_count: 0,
});
const LAN = row({
  employee_id: lanId,
  employee_code: "NV012",
  employee_full_name: "Phạm Thị Lan",
  employee_is_active: false,
});

function mockReport(rows: KpiRow[], onRequest?: (search: string) => void) {
  server.use(
    http.get("/api/v1/kpi/report", ({ request }) => {
      const search = new URL(request.url).search;
      onRequest?.(search);
      return HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", rows });
    }),
  );
}

describe("Báo cáo KPI", () => {
  test("AC-KPI-016 mặc định 30 ngày gần nhất, gọi API đúng tham số", async () => {
    vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport([KHOA], (search) => {
      requests.push(search);
    });
    renderApp("/reports/kpi");

    await screen.findByRole("heading", { name: "Báo cáo KPI" });
    await waitFor(() => {
      expect(requests).toContain("?from=2026-09-01&to=2026-09-30");
    });
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("2026-09-30");
    vi.useRealTimers();
  });

  test("AC-KPI-017 desktop: bảng 3 dòng, cột đúng, Lan (đã nghỉ) có badge", async () => {
    signedInAs(anId, AN);
    mockReport([KHOA, MINH, LAN]);
    renderApp("/reports/kpi");

    const table = await screen.findByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3
    expect(within(table).getByText("Đã nghỉ")).toBeInTheDocument();
    expect(within(table).getByText(/Trần Văn Khoa/)).toBeInTheDocument();
  });

  test("AC-KPI-018 mobile 390px: danh sách 3 card dọc, không có bảng", async () => {
    mobile();
    signedInAs(anId, AN);
    mockReport([KHOA, MINH, LAN]);
    renderApp("/reports/kpi");

    const list = await screen.findByRole("list");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(within(list).getByText(/Trần Văn Khoa/)).toBeInTheDocument();
    expect(within(list).getByText(/Lê Văn Minh/)).toBeInTheDocument();
    expect(within(list).getByText(/Phạm Thị Lan/)).toBeInTheDocument();
  });

  test('AC-KPI-019 completed_task_count=0 → "Đúng hạn" hiện "—"', async () => {
    signedInAs(anId, AN);
    mockReport([MINH]);
    renderApp("/reports/kpi");

    const table = await screen.findByRole("table");
    expect(within(table).getByText(/Lê Văn Minh/)).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
  });

  test("AC-KPI-020 đổi ngày → gọi lại API với tham số mới", async () => {
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport([KHOA], (search) => {
      requests.push(search);
    });
    renderApp("/reports/kpi");
    const table = await screen.findByRole("table");
    expect(within(table).getByText(/Trần Văn Khoa/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Từ ngày"));
    await user.type(screen.getByLabelText("Từ ngày"), "2026-08-01");
    await waitFor(() => {
      expect(requests.some((s) => s.includes("from=2026-08-01"))).toBe(true);
    });
  });

  test("AC-KPI-021 chọn 1 KTV trong dropdown → gọi lại API với employee_id, chỉ còn 1 dòng", async () => {
    signedInAs(anId, AN);
    const requests: string[] = [];
    server.use(
      http.get("/api/v1/kpi/report", ({ request }) => {
        const url = new URL(request.url);
        const employeeId = url.searchParams.get("employee_id");
        requests.push(url.search);
        const rows = employeeId ? [KHOA] : [KHOA, MINH];
        return HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", rows });
      }),
    );
    renderApp("/reports/kpi");
    const table = await screen.findByRole("table");
    expect(within(table).getByText(/Lê Văn Minh/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Kỹ thuật viên"), khoaId);

    await waitFor(() => {
      expect(requests.some((s) => s.includes(`employee_id=${khoaId}`))).toBe(true);
    });
    await waitFor(() => {
      expect(within(screen.getByRole("table")).queryByText(/Lê Văn Minh/)).not.toBeInTheDocument();
    });
    expect(within(screen.getByRole("table")).getByText(/Trần Văn Khoa/)).toBeInTheDocument();
  });

  test("AC-KPI-023 Đức (TECHNICIAN): không có ô chọn KTV, 1 thẻ số liệu, vẫn có nút Xuất CSV", async () => {
    signedInAs(ducId, DUC);
    mockReport([
      row({ employee_id: ducId, employee_code: "NV017", employee_full_name: "Nguyễn Văn Đức" }),
    ]);
    renderApp("/reports/kpi");

    await screen.findByText("Xong");
    expect(screen.queryByLabelText("Kỹ thuật viên")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xuất CSV/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("AC-KPI-025 Hoa (SALE, không có kpi.read) mở /reports/kpi trực tiếp → 403", async () => {
    signedInAs("hoa-id", HOA);
    renderApp("/reports/kpi");

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });

  test("AC-KPI-026 lỗi API: trạng thái lỗi chung + nút Tải lại hoạt động", async () => {
    signedInAs(anId, AN);
    let calls = 0;
    server.use(
      http.get("/api/v1/kpi/report", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 })
          : HttpResponse.json({ from: "2026-09-01", to: "2026-09-30", rows: [KHOA] });
      }),
    );
    renderApp("/reports/kpi");

    const reloadButton = await screen.findByRole("button", { name: "Tải lại" });
    await userEvent.setup().click(reloadButton);
    await waitFor(() => {
      expect(calls).toBe(2);
    });
  });
});
