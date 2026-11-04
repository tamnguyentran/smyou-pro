import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const ADD_LINE_EVENT = {
  id: "a0000000-0000-4000-8000-000000000138",
  occurred_at: "2026-11-02T03:00:00Z",
  actor: { id: "hoa", code: "NV005", full_name: "Lê Thị Hoa" },
  entity_type: "ORDER",
  entity_id: "o0000000-0000-4000-8000-000000000003",
  action: "add_line_after_submit",
  from_status: null,
  to_status: null,
  data: null,
  business_area: "ORDERS",
  entity_label: "DH2611-0003",
};

function signedInAsManager(onAudit: (query: URLSearchParams) => void = () => undefined) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id: "self", code: "NV001", full_name: "Nguyễn Văn An", roles: ["MANAGER"] },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: "self",
          code: "NV001",
          full_name: "Nguyễn Văn An",
          email: "an.nguyen@smyou.vn",
          title: null,
          department: "MANAGEMENT",
        },
        roles: ["MANAGER"],
        capabilities: {
          "dashboard.read": ["all"],
          "audit.read": ["all"],
          "employee.read": ["all"],
        },
        counters: {},
      }),
    ),
    http.get("/api/v1/audit-events", ({ request }) => {
      onAudit(new URL(request.url).searchParams);
      return HttpResponse.json({ items: [ADD_LINE_EVENT], total: 1, limit: 20, offset: 0 });
    }),
    http.get("/api/v1/employees", () =>
      HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0 }),
    ),
  );
  markSignedIn();
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AC-SYS-145 cột Nghiệp vụ + đối tượng đọc được (1440px)", () => {
  test("Nghiệp vụ là cột thứ 2; Đơn hàng DH2611-0003; Thêm dòng hàng sau khi gửi", async () => {
    mockViewport(true);
    signedInAsManager();
    renderApp("/audit");

    const table = await screen.findByRole("table", { name: "Nhật ký hệ thống" });
    const headings = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headings.slice(0, 2)).toEqual(["Thời gian", "Nghiệp vụ"]);
    const row = within(table).getByRole("row", { name: /DH2611-0003/ });
    expect(within(row).getByText("Đơn hàng", { exact: true })).toBeInTheDocument();
    expect(within(row).getByText("Đơn hàng DH2611-0003")).toBeInTheDocument();
    expect(within(row).getByText("Thêm dòng hàng sau khi gửi")).toBeInTheDocument();
  });
});

describe("AC-SYS-146 bộ lọc Nghiệp vụ", () => {
  test("chọn Quản lý đầu việc gọi API business_area=TASKS", async () => {
    mockViewport(true);
    let last = new URLSearchParams();
    signedInAsManager((query) => {
      last = query;
    });
    renderApp("/audit");
    const user = userEvent.setup();

    const select = await screen.findByLabelText("Nghiệp vụ");
    const options = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual([
      "Tất cả",
      "Đơn hàng",
      "Quản lý đầu việc",
      "Việc của tôi (kỹ thuật viên)",
      "Khách hàng",
      "Ghi nhận quà tặng KH",
      "Danh mục",
      "Nhân sự & phân quyền",
      "Đăng nhập",
      "Thông tin Công ty",
      "Phòng ban",
      "Thiết lập doanh thu KPI",
    ]);
    await user.selectOptions(select, "TASKS");

    await waitFor(() => {
      expect(last.get("business_area")).toBe("TASKS");
    });
    expect(last.get("offset")).toBe("0");
  });
});
