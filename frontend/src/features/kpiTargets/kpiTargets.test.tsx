import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MENU, visibleMenu } from "../../app/menu";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import matrix from "../employees/permissionMatrix.json";
import type { KpiTargetRow } from "./api";

const id = "9d1f0c2e-0000-4000-8000-000000000001";
const HOA_ID = "e1111111-1111-4111-8111-111111111111";
const ECONOMIC_ID = "d1111111-1111-4111-8111-111111111111";
const all = ["all"];
const AN_CAPS = {
  "dashboard.read": all,
  "employee.read": all,
  "employee.manage": all,
  "kpi_target.manage": all,
  "profile.manage": ["self"],
};

function row(overrides: Partial<KpiTargetRow> = {}): KpiTargetRow {
  return {
    employee_id: HOA_ID,
    employee_code: "NV010",
    employee_name: "Trần Thị Hoa",
    department_name: "Phát Triển Kinh Tế",
    employee_status: "ACTIVE",
    phone: "0903123456",
    email: "hoa.tran@smyou.vn",
    target: null,
    version: null,
    updated_at: null,
    ...overrides,
  };
}

function signedIn(capabilities: Record<string, string[]> = AN_CAPS) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: "NV001", full_name: "Nguyễn Văn An", roles: ["MANAGER"] },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id,
          code: "NV001",
          full_name: "Nguyễn Văn An",
          email: "an.nguyen@smyou.vn",
          title: null,
          department: "MANAGEMENT",
        },
        roles: ["MANAGER"],
        capabilities,
        counters: {},
      }),
    ),
    http.get("/api/v1/departments", () =>
      HttpResponse.json({
        items: [
          {
            id: ECONOMIC_ID,
            name: "Phát Triển Kinh Tế",
            is_active: true,
            version: 1,
            created_at: "2026-10-28T00:00:00Z",
            updated_at: "2026-10-28T00:00:00Z",
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      }),
    ),
  );
  markSignedIn();
}

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json(
    { type: "about:blank", title: code, status, code, detail },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );

/** Records every GET's query string and pages by `limit`/`offset` (M21-01c); `rows` can be swapped to simulate another person's edit. */
function targetsBackend(initial: KpiTargetRow[]) {
  const state = { rows: [...initial], gets: [] as URLSearchParams[] };
  server.use(
    http.get("/api/v1/kpi-targets", ({ request }) => {
      const params = new URL(request.url).searchParams;
      state.gets.push(params);
      const limit = Number(params.get("limit") ?? "20");
      const offset = Number(params.get("offset") ?? "0");
      return HttpResponse.json({
        items: state.rows.slice(offset, offset + limit),
        total: state.rows.length,
        limit,
        offset,
      });
    }),
  );
  return state;
}

function mockViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openPage() {
  renderApp("/settings/kpi-targets");
  await screen.findByRole("heading", { level: 1, name: "Thiết lập doanh thu KPI" });
}

type Group = { capabilities: { id: string; roles: Record<string, string> }[] };
const ROLE_CAPS = (role: string): Record<string, string[]> =>
  Object.fromEntries(
    (matrix.groups as Group[])
      .flatMap((g) => g.capabilities)
      .filter((c) => role in c.roles)
      .map((c): [string, string[]] => [c.id, [c.roles[role] ?? ""]]),
  );

describe("AC-KPI-046 mục menu Thiết lập doanh thu KPI", () => {
  test("AC-KPI-046 Manager thấy ngay dưới Nhân sự & phân quyền; vai trò khác không thấy", () => {
    const company = visibleMenu(ROLE_CAPS("MANAGER"), MENU).find((i) => i.id === "organization");
    const labels = company?.children.map((c) => c.label) ?? [];
    const at = labels.indexOf("Nhân sự & phân quyền");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(labels[at + 1]).toBe("Thiết lập doanh thu KPI");
    const item = company?.children[at + 1];
    expect(item?.path).toBe("/settings/kpi-targets");
    expect(item?.icon).toBe("Target");

    for (const role of ["SALE", "CUSTOMER_CARE", "TECH_LEAD", "TECHNICIAN"]) {
      const paths = visibleMenu(ROLE_CAPS(role), MENU).flatMap((i) => [
        i.path,
        ...i.children.map((c) => c.path),
      ]);
      expect(paths).not.toContain("/settings/kpi-targets");
    }
  });

  test("AC-KPI-046 vào thẳng URL không có kpi_target.manage → trang cấm", async () => {
    signedIn({ "dashboard.read": all, "profile.manage": ["self"] });
    targetsBackend([]);
    renderApp("/settings/kpi-targets");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });
});

describe("AC-KPI-047 trang mặc định tháng hiện tại", () => {
  test("AC-KPI-047 tháng 11/2026; bảng 4 cột; dòng chưa đặt hiện Chưa đặt", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend([
      row(),
      row({
        employee_id: "e2222222-2222-4222-8222-222222222222",
        employee_code: "NV011",
        employee_name: "Lê Văn Bình",
        target: 25_000_000,
        version: 1,
      }),
    ]);
    await openPage();

    expect(screen.getByText("Chỉ tiêu thu nhập thuần theo tháng cho từng nhân viên")).toBeVisible();
    expect(screen.getByLabelText("Tháng")).toHaveValue("11/2026");
    expect(screen.getByText("Tháng 11/2026")).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Mã NV", "Họ tên", "Phòng ban", "Chỉ tiêu thu nhập thuần (VND)"]);
    const hoa = within(table).getByRole("row", { name: /Trần Thị Hoa/ });
    expect(within(hoa).getByText("Chưa đặt")).toBeInTheDocument();
    const binh = within(table).getByRole("row", { name: /Lê Văn Bình/ });
    expect(within(binh).getByText("25.000.000 ₫")).toBeInTheDocument();
    expect(backend.gets[0]?.get("month")).toBe("2026-11");
  });
});

describe("AC-KPI-048 lưu chỉ tiêu", () => {
  test("AC-KPI-048 nhập 30.000.000, bấm Lưu → PUT 30000000, toast, ô hiện 30.000.000 ₫", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend([row()]);
    let body: unknown = null;
    let path = "";
    server.use(
      http.put("/api/v1/kpi-targets/:employeeId/:month", async ({ request, params }) => {
        body = await request.json();
        path = `${String(params.employeeId)}/${String(params.month)}`;
        const saved = row({ target: 30_000_000, version: 1, updated_at: "2026-11-01T03:00:00Z" });
        backend.rows = [saved];
        return HttpResponse.json(saved);
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" }));
    const input = screen.getByLabelText("Chỉ tiêu của Trần Thị Hoa");
    await user.type(input, "30.000.000");
    expect(input).toHaveValue("30.000.000");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã lưu chỉ tiêu")).toBeInTheDocument();
    expect(body).toEqual({ net_revenue_target: 30_000_000 });
    expect(path).toBe(`${HOA_ID}/2026-11`);
    const hoa = screen.getByRole("row", { name: /Trần Thị Hoa/ });
    expect(await within(hoa).findByText("30.000.000 ₫")).toBeInTheDocument();
  });

  test("AC-KPI-048 Enter cũng lưu; sửa chỉ tiêu đã có gửi kèm version", async () => {
    mockViewport(true);
    signedIn();
    targetsBackend([row({ target: 20_000_000, version: 3 })]);
    let body: unknown = null;
    server.use(
      http.put("/api/v1/kpi-targets/:employeeId/:month", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(row({ target: 35_000_000, version: 4 }));
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" }));
    const input = screen.getByLabelText("Chỉ tiêu của Trần Thị Hoa");
    expect(input).toHaveValue("20.000.000");
    await user.clear(input);
    await user.type(input, "35000000{Enter}");

    expect(await screen.findByText("Đã lưu chỉ tiêu")).toBeInTheDocument();
    expect(body).toEqual({ net_revenue_target: 35_000_000, version: 3 });
  });

  test("AC-KPI-048 nhập 0 (không âm) → PUT 0", async () => {
    mockViewport(true);
    signedIn();
    targetsBackend([row()]);
    let body: unknown = null;
    server.use(
      http.put("/api/v1/kpi-targets/:employeeId/:month", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(row({ target: 0, version: 1 }));
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" }));
    await user.type(screen.getByLabelText("Chỉ tiêu của Trần Thị Hoa"), "0{Enter}");

    expect(await screen.findByText("Đã lưu chỉ tiêu")).toBeInTheDocument();
    expect(body).toEqual({ net_revenue_target: 0 });
  });

  test("AC-KPI-048 đổi tháng: dòng tháng cũ không sửa được khi tháng mới đang tải", async () => {
    mockViewport(true);
    signedIn();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/kpi-targets", async ({ request }) => {
        if (new URL(request.url).searchParams.get("month") === "2026-12") {
          await gate;
          return HttpResponse.json({ items: [row()], total: 1, limit: 20, offset: 0 });
        }
        return HttpResponse.json({
          items: [row({ target: 20_000_000, version: 3 })],
          total: 1,
          limit: 20,
          offset: 0,
        });
      }),
    );
    await openPage();
    await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" });

    fireEvent.change(screen.getByLabelText("Tháng"), { target: { value: "12/2026" } });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" })).toBeNull();
    });
    expect(screen.queryByText("20.000.000 ₫")).toBeNull();
    release();
    const hoa = await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" });
    expect(hoa).toHaveTextContent("Chưa đặt");
  });
});

describe("AC-KPI-047 xoá chỉ tiêu và nhân viên đã nghỉ", () => {
  test("AC-KPI-047 bấm Xoá chỉ tiêu → xác nhận đúng câu, chỉ DELETE sau khi xác nhận", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend([row({ target: 30_000_000, version: 1 })]);
    const deleted = vi.fn();
    server.use(
      http.delete("/api/v1/kpi-targets/:employeeId/:month", ({ params }) => {
        deleted(`${String(params.employeeId)}/${String(params.month)}`);
        backend.rows = [row()];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Xoá chỉ tiêu" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Xoá chỉ tiêu tháng 11/2026 của Trần Thị Hoa?"),
    ).toBeInTheDocument();
    expect(deleted).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Xoá chỉ tiêu" }));

    expect(await screen.findByText("Đã xoá chỉ tiêu")).toBeInTheDocument();
    expect(deleted).toHaveBeenCalledExactlyOnceWith(`${HOA_ID}/2026-11`);
    const hoa = screen.getByRole("row", { name: /Trần Thị Hoa/ });
    expect(await within(hoa).findByText("Chưa đặt")).toBeInTheDocument();
  });

  test("AC-KPI-047 nhân viên đã nghỉ → badge Đã nghỉ, không có nút sửa/xoá", async () => {
    mockViewport(true);
    signedIn();
    targetsBackend([row({ employee_status: "INACTIVE", target: 30_000_000, version: 1 })]);
    await openPage();

    const hoa = await screen.findByRole("row", { name: /Trần Thị Hoa/ });
    expect(within(hoa).getByText("Đã nghỉ")).toBeInTheDocument();
    expect(within(hoa).getByText("30.000.000 ₫")).toBeInTheDocument();
    expect(within(hoa).queryByRole("button", { name: /Sửa chỉ tiêu/ })).toBeNull();
    expect(within(hoa).queryByRole("button", { name: "Xoá chỉ tiêu" })).toBeNull();
  });
});

describe("AC-KPI-049 chỉ tiêu không hợp lệ", () => {
  test.each(["abc", "-5", "1,5", "99999999999999999999"])(
    "AC-KPI-049 nhập %s → không gọi PUT, báo lỗi",
    async (typed) => {
      mockViewport(true);
      signedIn();
      targetsBackend([row()]);
      const put = vi.fn();
      server.use(
        http.put("/api/v1/kpi-targets/:employeeId/:month", () => {
          put();
          return HttpResponse.json(row({ target: 5, version: 1 }));
        }),
      );
      await openPage();
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" }),
      );
      const input = screen.getByLabelText("Chỉ tiêu của Trần Thị Hoa");
      await user.type(input, typed);
      await user.click(screen.getByRole("button", { name: "Lưu" }));

      expect(await screen.findByText("Chỉ tiêu phải là số nguyên không âm")).toBeInTheDocument();
      expect(input).toHaveAccessibleDescription(/Chỉ tiêu phải là số nguyên không âm/);
      expect(put).not.toHaveBeenCalled();
    },
  );
});

describe("AC-KPI-050 xung đột phiên bản", () => {
  test("AC-KPI-050 PUT 409 → báo đã bị người khác sửa và tải lại dòng", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend([row({ target: 20_000_000, version: 1 })]);
    server.use(
      http.put("/api/v1/kpi-targets/:employeeId/:month", () => {
        backend.rows = [row({ target: 28_000_000, version: 2 })];
        return problem(409, "STALE_VERSION", "Dữ liệu đã thay đổi, vui lòng tải lại.");
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sửa chỉ tiêu của Trần Thị Hoa" }));
    const input = screen.getByLabelText("Chỉ tiêu của Trần Thị Hoa");
    await user.clear(input);
    await user.type(input, "30000000");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(
      await screen.findByText("Chỉ tiêu vừa được người khác sửa, đã tải lại"),
    ).toBeInTheDocument();
    const hoa = screen.getByRole("row", { name: /Trần Thị Hoa/ });
    expect(await within(hoa).findByText("28.000.000 ₫")).toBeInTheDocument();
    expect(backend.gets.length).toBeGreaterThanOrEqual(2);
  });
});

describe("AC-KPI-051 lọc phòng ban / tìm kiếm", () => {
  test("AC-KPI-051 chọn phòng ban, gõ 0903 → GET có department_id / q; rỗng → thông báo", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend([row()]);
    await openPage();
    const user = userEvent.setup();
    await screen.findByRole("table");

    const department = screen.getByLabelText("Phòng ban");
    expect(within(department).getByRole("option", { name: "Tất cả phòng ban" })).toBeVisible();
    await within(department).findByRole("option", { name: "Phát Triển Kinh Tế" });
    await user.selectOptions(department, ECONOMIC_ID);
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("department_id")).toBe(ECONOMIC_ID);
    });

    backend.rows = [];
    const search = screen.getByLabelText("Tìm");
    expect(search).toHaveAttribute("placeholder", "Tên, SĐT hoặc email");
    await user.type(search, "0903");
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("q")).toBe("0903");
    });
    // Debounced: no request per keystroke.
    expect(backend.gets.some((p) => p.get("q") === "09")).toBe(false);
    expect(await screen.findByText("Không có nhân viên phù hợp")).toBeInTheDocument();
  });
});

describe("AC-KPI-052 copy sang các tháng sau", () => {
  test("AC-KPI-052 chọn đến 01/2027, không ghi đè → POST copy, modal đóng, toast kết quả", async () => {
    mockViewport(true);
    signedIn();
    targetsBackend([row({ target: 30_000_000, version: 1 })]);
    let body: unknown = null;
    server.use(
      http.post("/api/v1/kpi-targets/copy", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ created: 3, overwritten: 0, skipped: 1 });
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Copy sang tháng sau" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy sang các tháng sau" });
    expect(within(dialog).getByText("Từ tháng: 11/2026")).toBeInTheDocument();
    const to = within(dialog).getByLabelText("Đến tháng");
    const options = within(to)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toHaveLength(12);
    expect(options[0]).toBe("2026-12");
    expect(options[11]).toBe("2027-11");
    expect(within(to).getByRole("option", { name: "01/2027" })).toBeInTheDocument();
    await user.selectOptions(to, "2027-01");
    expect(within(dialog).getByLabelText("Ghi đè chỉ tiêu đã có")).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Copy" }));

    expect(await screen.findByText("Đã copy: 3 mới, 0 ghi đè, 1 giữ nguyên")).toBeInTheDocument();
    expect(body).toEqual({ from_month: "2026-11", to_month: "2027-01", overwrite: false });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Copy sang các tháng sau" })).toBeNull();
    });
  });

  test("AC-KPI-052 tích Ghi đè chỉ tiêu đã có → POST overwrite true", async () => {
    mockViewport(true);
    signedIn();
    targetsBackend([row({ target: 30_000_000, version: 1 })]);
    let body: unknown = null;
    server.use(
      http.post("/api/v1/kpi-targets/copy", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ created: 0, overwritten: 2, skipped: 0 });
      }),
    );
    await openPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Copy sang tháng sau" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy sang các tháng sau" });
    await user.click(within(dialog).getByLabelText("Ghi đè chỉ tiêu đã có"));
    await user.click(within(dialog).getByRole("button", { name: "Copy" }));

    expect(await screen.findByText("Đã copy: 0 mới, 2 ghi đè, 0 giữ nguyên")).toBeInTheDocument();
    expect(body).toEqual({ from_month: "2026-11", to_month: "2026-12", overwrite: true });
  });
});

describe("AC-KPI-053 copy lỗi giữ modal mở", () => {
  test.each([
    [422, "VALIDATION_ERROR", "Tháng cuối phải sau tháng nguồn và cách tối đa 12 tháng."],
    [500, "INTERNAL_ERROR", "Đã có lỗi xảy ra."],
  ])("AC-KPI-053 lỗi %i → modal vẫn mở, hiện lỗi tiếng Việt", async (status, code, detail) => {
    mockViewport(true);
    signedIn();
    targetsBackend([row({ target: 30_000_000, version: 1 })]);
    server.use(http.post("/api/v1/kpi-targets/copy", () => problem(status, code, detail)));
    await openPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Copy sang tháng sau" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy sang các tháng sau" });
    await user.click(within(dialog).getByRole("button", { name: "Copy" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByRole("dialog", { name: "Copy sang các tháng sau" })).toBeInTheDocument();
  });
});

describe("AC-KPI-055 khối Cách phân quyền hoạt động", () => {
  test("AC-KPI-055 Manager có nhãn Thiết lập doanh thu KPI và màn hình mới", async () => {
    mockViewport(true);
    signedIn();
    server.use(
      http.get("/api/v1/employees", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/employees");
    await screen.findByRole("heading", { level: 1, name: "Nhân sự & phân quyền" });
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Cách phân quyền hoạt động" }));
    const region = await screen.findByRole("region", { name: "Cách phân quyền hoạt động" });
    const capability = within(region).getByRole("row", { name: /^Thiết lập doanh thu KPI/ });
    expect(within(capability).getAllByRole("cell")[0]).toHaveTextContent("Tất cả");
    const screensRow = within(region).getByRole("row", { name: /^Màn hình được vào/ });
    const managerScreens = within(within(screensRow).getAllByRole("cell")[0] as HTMLElement)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(managerScreens).toContain("Thông tin Công ty › Thiết lập doanh thu KPI");
  });
});

// --- M21-01c: phân trang ---

const forty_five = (): KpiTargetRow[] =>
  Array.from({ length: 45 }, (_, i) => {
    const n = String(i + 1).padStart(3, "0");
    return row({
      employee_id: `e0000000-0000-4000-8000-000000000${n}`,
      employee_code: `NV${n}`,
      employee_name: `Nhân viên ${n}`,
      phone: null,
      email: `nv${n}@smyou.vn`,
    });
  });

function at(rows: KpiTargetRow[], index: number): KpiTargetRow {
  const found = rows[index];
  if (!found) throw new Error(`no row ${String(index)}`);
  return found;
}

const lastOffset = (backend: { gets: URLSearchParams[] }) => backend.gets.at(-1)?.get("offset");

describe("AC-KPI-063 trang đầu", () => {
  test("AC-KPI-063 GET limit=20&offset=0; 20 nhân viên, 1–20 / 45; Trang trước mờ", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend(forty_five());
    await openPage();

    const table = await screen.findByRole("table");
    expect(backend.gets[0]?.get("limit")).toBe("20");
    expect(backend.gets[0]?.get("offset")).toBe("0");
    expect(within(table).getAllByRole("row")).toHaveLength(21); // header + 20
    expect(within(table).getByText("NV020")).toBeInTheDocument();
    expect(within(table).queryByText("NV021")).toBeNull();
    expect(screen.getByText("1–20 / 45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeEnabled();
  });
});

describe("AC-KPI-064 chuyển trang", () => {
  test("AC-KPI-064 Trang sau ×2 → offset 20, 40; trang cuối 41–45 / 45; Trang trước → 20", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend(forty_five());
    await openPage();
    const user = userEvent.setup();
    await screen.findByText("1–20 / 45");

    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(await screen.findByText("21–40 / 45")).toBeInTheDocument();
    expect(lastOffset(backend)).toBe("20");

    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(await screen.findByText("41–45 / 45")).toBeInTheDocument();
    expect(lastOffset(backend)).toBe("40");
    expect(screen.getByText("NV045")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(await screen.findByText("21–40 / 45")).toBeInTheDocument();
    expect(lastOffset(backend)).toBe("20");
  });
});

describe("AC-KPI-065 đổi bộ lọc về trang 1", () => {
  async function onPageTwo() {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend(forty_five());
    await openPage();
    const user = userEvent.setup();
    await screen.findByText("1–20 / 45");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await screen.findByText("21–40 / 45");
    return { backend, user };
  }

  test("AC-KPI-065 đổi tháng → offset=0", async () => {
    const { backend } = await onPageTwo();
    fireEvent.change(screen.getByLabelText("Tháng"), { target: { value: "12/2026" } });
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("month")).toBe("2026-12");
    });
    expect(lastOffset(backend)).toBe("0");
    expect(await screen.findByText("1–20 / 45")).toBeInTheDocument();
  });

  test("AC-KPI-065 chọn phòng ban → offset=0", async () => {
    const { backend, user } = await onPageTwo();
    const department = screen.getByLabelText("Phòng ban");
    await within(department).findByRole("option", { name: "Phát Triển Kinh Tế" });
    await user.selectOptions(department, ECONOMIC_ID);
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("department_id")).toBe(ECONOMIC_ID);
    });
    expect(lastOffset(backend)).toBe("0");
    expect(await screen.findByText("1–20 / 45")).toBeInTheDocument();
  });

  test("AC-KPI-065 gõ hoa vào ô tìm → offset=0", async () => {
    const { backend, user } = await onPageTwo();
    await user.type(screen.getByLabelText("Tìm"), "hoa");
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("q")).toBe("hoa");
    });
    expect(lastOffset(backend)).toBe("0");
    expect(await screen.findByText("1–20 / 45")).toBeInTheDocument();
  });

  test("AC-KPI-065 gõ tìm không gọi thêm trang 1 với từ khoá cũ trước khi debounce xong", async () => {
    const { backend, user } = await onPageTwo();
    const before = backend.gets.length;
    await user.type(screen.getByLabelText("Tìm"), "hoa");
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("q")).toBe("hoa");
    });
    const stale = backend.gets.slice(before).filter((p) => p.get("q") === null);
    expect(stale).toHaveLength(0);
  });
});

describe("AC-KPI-066 lưu/xoá ở nguyên trang", () => {
  test("AC-KPI-066 lưu NV025 rồi xoá người khác trên trang 2 → tải lại với offset=20", async () => {
    mockViewport(true);
    signedIn();
    const initial = forty_five();
    const nv025 = at(initial, 24);
    const nv030 = { ...at(initial, 29), target: 10_000_000, version: 1 };
    initial[29] = nv030;
    const backend = targetsBackend(initial);
    server.use(
      http.put("/api/v1/kpi-targets/:employeeId/:month", () => {
        const saved = { ...nv025, target: 30_000_000, version: 1 };
        backend.rows[24] = saved;
        return HttpResponse.json(saved);
      }),
      http.delete("/api/v1/kpi-targets/:employeeId/:month", () => {
        backend.rows[29] = { ...nv030, target: null, version: null };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await openPage();
    const user = userEvent.setup();
    await screen.findByText("1–20 / 45");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await screen.findByText("21–40 / 45");

    const gets = backend.gets.length;
    await user.click(screen.getByRole("button", { name: "Sửa chỉ tiêu của Nhân viên 025" }));
    await user.type(screen.getByLabelText("Chỉ tiêu của Nhân viên 025"), "30.000.000");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã lưu chỉ tiêu")).toBeInTheDocument();
    const savedRow = screen.getByRole("row", { name: /NV025/ });
    expect(await within(savedRow).findByText("30.000.000 ₫")).toBeInTheDocument();
    expect(backend.gets.length).toBeGreaterThan(gets);
    expect(lastOffset(backend)).toBe("20");

    const reloads = backend.gets.length;
    await user.click(
      within(screen.getByRole("row", { name: /NV030/ })).getByRole("button", {
        name: "Xoá chỉ tiêu",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Xoá chỉ tiêu" }));
    expect(await screen.findByText("Đã xoá chỉ tiêu")).toBeInTheDocument();
    expect(
      await within(screen.getByRole("row", { name: /NV030/ })).findByText("Chưa đặt"),
    ).toBeInTheDocument();
    expect(backend.gets.length).toBeGreaterThan(reloads);
    expect(lastOffset(backend)).toBe("20");
    expect(screen.getByText("21–40 / 45")).toBeInTheDocument();
  });

  test("AC-KPI-066 danh sách co lại khi đang ở trang cuối (người khác cho NV nghỉ) → lùi về trang cuối còn dữ liệu", async () => {
    mockViewport(true);
    signedIn();
    const initial = forty_five().slice(0, 41);
    const nv041 = at(initial, 40);
    const backend = targetsBackend(initial);
    server.use(
      http.put("/api/v1/kpi-targets/:employeeId/:month", () => {
        const saved = { ...nv041, target: 30_000_000, version: 1 };
        backend.rows[40] = saved;
        backend.rows.shift(); // NV001 vừa bị cho nghỉ, không có chỉ tiêu → rời danh sách
        return HttpResponse.json(saved);
      }),
    );
    await openPage();
    const user = userEvent.setup();
    await screen.findByText("1–20 / 41");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await screen.findByText("21–40 / 41");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await screen.findByText("41–41 / 41");

    await user.click(screen.getByRole("button", { name: "Sửa chỉ tiêu của Nhân viên 041" }));
    await user.type(screen.getByLabelText("Chỉ tiêu của Nhân viên 041"), "30.000.000");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("21–40 / 40")).toBeInTheDocument();
    expect(lastOffset(backend)).toBe("20");
    expect(screen.getByRole("row", { name: /NV041/ })).toBeInTheDocument();
  });
});

describe("AC-KPI-067 không có kết quả", () => {
  test("AC-KPI-067 total=0 → Không có nhân viên phù hợp, không có thanh phân trang", async () => {
    mockViewport(false);
    signedIn();
    targetsBackend([]);
    await openPage();

    expect(await screen.findByText("Không có nhân viên phù hợp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trang sau" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Trang trước" })).toBeNull();
    expect(screen.queryByText(/\/ 0$/)).toBeNull();
  });
});

describe("AC-UI-091 ô Tháng là DateField", () => {
  test("AC-UI-091 hiện 11/2026 (không còn input[type=month]), chọn Th12 → tải lại month=2026-12, về trang 1", async () => {
    mockViewport(true);
    signedIn();
    const backend = targetsBackend(forty_five());
    await openPage();
    const user = userEvent.setup();
    await screen.findByText("1–20 / 45");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await screen.findByText("21–40 / 45");

    const input = screen.getByLabelText("Tháng");
    expect(input).toHaveValue("11/2026");
    expect(input).not.toHaveAttribute("type", "month");
    expect(document.querySelector('input[type="month"]')).toBeNull();
    expect(screen.getByText("Tháng 11/2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chọn tháng" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn tháng" });
    await user.click(within(dialog).getByRole("button", { name: "Th12" }));
    await waitFor(() => {
      expect(backend.gets.at(-1)?.get("month")).toBe("2026-12");
    });
    expect(lastOffset(backend)).toBe("0");
    expect(screen.getByLabelText("Tháng")).toHaveValue("12/2026");
    expect(await screen.findByText("1–20 / 45")).toBeInTheDocument();
  });
});
