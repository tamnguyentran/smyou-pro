import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { Department } from "./api";

const id = "9d1f0c2e-0000-4000-8000-000000000001";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const self = ["self"];
const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": all,
    "employee.read": all,
    "employee.manage": all,
    "profile.manage": self,
  },
};
const HOA: Person = {
  code: "NV010",
  full_name: "Trần Thị Hoa",
  email: "hoa.tran@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: { "dashboard.read": all, "employee.read": all, "profile.manage": self },
};
const BINH: Person = {
  code: "NV005",
  full_name: "Lê Văn Bình",
  email: "binh.le@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};

function department(overrides: Partial<Department> = {}): Department {
  return {
    id: "d5555555-5555-4555-8555-555555555555",
    name: "Nhân sự/marketing",
    is_active: true,
    version: 1,
    created_at: "2026-10-28T00:00:00Z",
    updated_at: "2026-10-28T00:00:00Z",
    ...overrides,
  };
}

/** In-memory backend so the list reflects mutations after invalidation. */
function departmentsBackend(initial: Department[]) {
  let rows = [...initial];
  server.use(
    http.get("/api/v1/departments", () =>
      HttpResponse.json({ items: rows, total: rows.length, limit: 20, offset: 0 }),
    ),
    http.post("/api/v1/departments", async ({ request }) => {
      const { name } = (await request.json()) as { name: string };
      if (rows.some((d) => d.is_active && d.name.toLowerCase() === name.trim().toLowerCase())) {
        return HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            code: "DUPLICATE_NAME",
            detail: "Tên phòng ban đã tồn tại.",
            errors: [{ field: "name", code: "taken", message: "Tên phòng ban đã tồn tại." }],
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        );
      }
      const created = department({ id: "d9999999-9999-4999-8999-999999999999", name: name.trim() });
      rows = [...rows, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.post("/api/v1/departments/:id/:command", ({ params }) => {
      const active = params.command === "activate";
      rows = rows.map((d) =>
        d.id === params.id ? { ...d, is_active: active, version: d.version + 1 } : d,
      );
      return HttpResponse.json(rows.find((d) => d.id === params.id));
    }),
  );
}

function signedInAs(person: Person) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: person.code, full_name: person.full_name, roles: person.roles },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id,
          code: person.code,
          full_name: person.full_name,
          email: person.email,
          title: null,
          department: "MANAGEMENT",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
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
  vi.clearAllMocks();
});

describe("AC-EMP-047 màn Phòng ban (desktop)", () => {
  test("bảng có cột Tên phòng ban/Trạng thái/Thao tác, nút Thêm, ô tìm kiếm + lọc", async () => {
    mockViewport(true);
    signedInAs(AN);
    departmentsBackend([
      department(),
      department({
        id: "d2222222-2222-4222-8222-222222222222",
        name: "Kinh doanh",
        is_active: false,
      }),
    ]);
    renderApp("/settings/departments");

    await screen.findByRole("heading", { level: 1, name: "Phòng ban" });
    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Tên phòng ban", "Trạng thái", "Thao tác"]);
    const hr = within(table).getByRole("row", { name: /Nhân sự\/marketing/ });
    expect(within(hr).getByText("Đang hoạt động")).toBeInTheDocument();
    const sales = within(table).getByRole("row", { name: /Kinh doanh/ });
    expect(within(sales).getByText("Ngừng hoạt động")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm phòng ban" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tìm kiếm")).toBeInTheDocument();
    expect(screen.getByLabelText("Trạng thái")).toBeInTheDocument();
  });
});

describe("AC-EMP-049 thêm phòng ban", () => {
  test("tên trùng → lỗi dưới ô; tên mới → toast + dòng mới", async () => {
    mockViewport(true);
    signedInAs(AN);
    departmentsBackend([department({ name: "Kế Toán - tài chính" })]);
    renderApp("/settings/departments");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm phòng ban" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm phòng ban" });
    const input = within(sheet).getByLabelText("Tên phòng ban");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));
    expect(await within(sheet).findByText("Vui lòng nhập tên phòng ban.")).toBeInTheDocument();

    await user.type(input, "kế toán - tài chính");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));
    expect(await within(sheet).findByText("Tên phòng ban đã tồn tại.")).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(/Tên phòng ban đã tồn tại\./);

    await user.clear(input);
    await user.type(input, "Chăm sóc khách hàng");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã thêm phòng ban.")).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(await within(table).findByText("Chăm sóc khách hàng")).toBeInTheDocument();
  });
});

describe("AC-EMP-050 ngừng / mở lại hoạt động", () => {
  test("xác nhận hộp thoại → toast + badge đổi, rồi mở lại", async () => {
    mockViewport(true);
    signedInAs(AN);
    departmentsBackend([department({ name: "Phát Triển Kinh Tế" })]);
    renderApp("/settings/departments");
    const user = userEvent.setup();

    const table = await screen.findByRole("table");
    const row = await within(table).findByRole("row", { name: /Phát Triển Kinh Tế/ });
    await user.click(within(row).getByRole("button", { name: "Ngừng hoạt động" }));
    const dialog = await screen.findByRole("dialog", { name: "Ngừng hoạt động" });
    await user.click(within(dialog).getByRole("button", { name: "Ngừng hoạt động" }));
    expect(await screen.findByText("Đã ngừng hoạt động phòng ban.")).toBeInTheDocument();
    const reopen = await within(row).findByRole("button", { name: "Mở lại hoạt động" });
    expect(within(row).getByText("Ngừng hoạt động")).toBeInTheDocument();

    await user.click(reopen);
    const again = await screen.findByRole("dialog", { name: "Mở lại hoạt động" });
    await user.click(within(again).getByRole("button", { name: "Mở lại hoạt động" }));
    expect(await screen.findByText("Đã mở lại hoạt động phòng ban.")).toBeInTheDocument();
    expect(await within(row).findByText("Đang hoạt động")).toBeInTheDocument();
  });

  test("dữ liệu cũ (STALE_VERSION) → toast yêu cầu tải lại, badge giữ nguyên", async () => {
    mockViewport(true);
    signedInAs(AN);
    departmentsBackend([department({ name: "Phát Triển Kinh Tế" })]);
    server.use(
      http.post("/api/v1/departments/:id/:command", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            code: "STALE_VERSION",
            detail: "Dữ liệu đã thay đổi.",
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    renderApp("/settings/departments");
    const user = userEvent.setup();

    const table = await screen.findByRole("table");
    const row = await within(table).findByRole("row", { name: /Phát Triển Kinh Tế/ });
    await user.click(within(row).getByRole("button", { name: "Ngừng hoạt động" }));
    const dialog = await screen.findByRole("dialog", { name: "Ngừng hoạt động" });
    await user.click(within(dialog).getByRole("button", { name: "Ngừng hoạt động" }));
    expect(await screen.findByText("Dữ liệu đã thay đổi, vui lòng tải lại.")).toBeInTheDocument();
    expect(within(row).getByText("Đang hoạt động")).toBeInTheDocument();
  });
});

describe("AC-EMP-051 chỉ Manager", () => {
  test("Manager thấy mục menu Phòng ban", async () => {
    mockViewport(true);
    signedInAs(AN);
    departmentsBackend([department()]);
    renderApp("/settings/departments");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).getByRole("link", { name: "Phòng ban" })).toBeInTheDocument();
  });

  test.each([
    ["Hoa (TECH_LEAD)", HOA],
    ["Bình (SALE)", BINH],
  ])("%s không thấy menu; vào thẳng URL → không có quyền", async (_label, person) => {
    mockViewport(true);
    signedInAs(person);
    departmentsBackend([department()]);
    renderApp("/settings/departments");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).queryByRole("link", { name: "Phòng ban" })).not.toBeInTheDocument();
  });
});
