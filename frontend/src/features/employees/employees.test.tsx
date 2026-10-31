import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { Employee } from "./api";

const id = "7d1f0c2e-0000-4000-8000-000000000001";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const MANAGEMENT = {
  id: "d1111111-1111-4111-8111-111111111111",
  name: "Ban quản lý",
  is_active: true,
};
const SALES = { id: "d2222222-2222-4222-8222-222222222222", name: "Kinh doanh", is_active: true };
const TECHNICAL = { id: "d3333333-3333-4333-8333-333333333333", name: "Kỹ thuật", is_active: true };
const ACTIVE_DEPARTMENTS = [
  MANAGEMENT,
  { id: "d6666666-6666-4666-8666-666666666666", name: "Kế Toán - tài chính", is_active: true },
  SALES,
  TECHNICAL,
  { id: "d5555555-5555-4555-8555-555555555555", name: "Nhân sự/marketing", is_active: true },
  { id: "d4444444-4444-4444-8444-444444444444", name: "Phát Triển Kinh Tế", is_active: true },
];
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
const TUAN: Person = {
  code: "NV010",
  full_name: "Phạm Quốc Tuấn",
  email: "tuan.pham@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: { "dashboard.read": all, "employee.read": all, "profile.manage": self },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  email: "hoa.le@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "e0000000-0000-4000-8000-000000000005",
    code: "NV005",
    full_name: "Lê Thị Hoa",
    username: "hoa.lt",
    email: "hoa.le@smyou.vn",
    phone: "0932068787",
    department: SALES,
    title: "Nhân viên kinh doanh",
    roles: ["SALE"],
    is_active: true,
    is_locked: false,
    must_change_password: false,
    version: 1,
    birth_date: null,
    birth_place: null,
    gender: null,
    address: null,
    id_number: null,
    id_issued_date: null,
    id_issued_place: null,
    marital_status: null,
    ...overrides,
  };
}
const AN_ROW = employee({
  id,
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  phone: null,
  department: MANAGEMENT,
  title: "Quản lý chung",
  roles: ["MANAGER"],
});
const AN_ROW_WITH_SALE = employee({ ...AN_ROW, roles: ["MANAGER", "SALE"] });

function page(items: Employee[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function signedInAs(person: Person, employeesHandler?: Parameters<typeof http.get>[1]) {
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
          department: { id: MANAGEMENT.id, name: MANAGEMENT.name },
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
    http.get("/api/v1/departments", ({ request }) => {
      const onlyActive = new URL(request.url).searchParams.get("is_active") === "true";
      const items = ACTIVE_DEPARTMENTS.map((d) => ({
        ...d,
        version: 1,
        created_at: "2026-10-28T00:00:00Z",
        updated_at: "2026-10-28T00:00:00Z",
      })).filter((d) => !onlyActive || d.is_active);
      return HttpResponse.json({ items, total: items.length, limit: 100, offset: 0 });
    }),
    ...(employeesHandler ? [http.get("/api/v1/employees", employeesHandler)] : []),
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

async function openMenu() {
  return screen.findByRole("heading", { level: 1, name: "Nhân sự & phân quyền" });
}

describe("AC-EMP-013 danh sách nhân viên", () => {
  test("máy tính: bảng có đủ cột; điện thoại: thẻ xếp dọc", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW, employee()])));
    renderApp("/employees");
    await openMenu();

    const table = await screen.findByRole("table");
    for (const heading of ["Mã", "Họ tên", "Email", "SĐT", "Vai trò", "Trạng thái"]) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
    expect(within(table).getByText("NV005")).toBeInTheDocument();
    expect(within(table).getAllByText("Đang hoạt động").length).toBeGreaterThan(0);
  });

  test("điện thoại: thẻ xếp dọc, không phải bảng", async () => {
    mockViewport(false);
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    renderApp("/employees");
    await openMenu();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByText("Lê Thị Hoa")).toBeInTheDocument();
    expect(screen.getByText("NV005")).toBeInTheDocument();
  });

  test("AC-UI-011 mobile: thẻ nhân viên bỏ viền, p-5, shadow-card", async () => {
    mockViewport(false);
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    renderApp("/employees");
    await openMenu();

    const card = (await screen.findByText("Lê Thị Hoa")).closest("button") as HTMLElement;
    expect(card.className).toContain("shadow-card");
    expect(card.className).toContain("hover:shadow-card-hover");
    expect(card.className).toContain("p-5");
    expect(card.className).not.toMatch(/\bborder\b/);
  });

  test("AC-UI-011 desktop: table nhân viên vẫn giữ border border-line", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    renderApp("/employees");
    await openMenu();

    const table = await screen.findByRole("table");
    expect(table.className).toContain("border");
    expect(table.className).toContain("border-line");
  });

  test("tìm kiếm gọi API sau 300ms; lọc vai trò và trạng thái", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json(page([employee()]));
    });
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Tìm kiếm"), "kho");
    expect(lastQuery).not.toContain("q=kho"); // not yet — debounced
    await waitFor(
      () => {
        expect(lastQuery).toContain("q=kho");
      },
      { timeout: 1000 },
    );

    await user.selectOptions(screen.getByLabelText("Vai trò"), "TECHNICIAN");
    await waitFor(() => {
      expect(lastQuery).toContain("role=TECHNICIAN");
    });
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "false");
    await waitFor(() => {
      expect(lastQuery).toContain("is_active=false");
    });
  });

  test("phân trang: Trang sau đổi offset", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json(page([employee()], 45));
    });
    renderApp("/employees");
    await openMenu();
    expect(await screen.findByText("1–20 / 45")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => {
      expect(lastQuery).toContain("offset=20");
    });
    expect(await screen.findByText("21–40 / 45")).toBeInTheDocument();
  });

  test("trạng thái tải, trống, lỗi + Thử lại", async () => {
    let calls = 0;
    signedInAs(AN, () => {
      calls += 1;
      if (calls === 1) return HttpResponse.json({ status: 503 }, { status: 503 });
      return HttpResponse.json(page([]));
    });
    renderApp("/employees");
    await openMenu();
    expect(await screen.findByText("Không tải được danh sách.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có nhân viên phù hợp.")).toBeInTheDocument();
  });
});

describe("AC-EMP-014 thêm nhân viên", () => {
  test("kiểm ở client, lỗi 422 dưới từng ô, mật khẩu tạm một lần, toast", async () => {
    let created = false;
    signedInAs(AN, () => HttpResponse.json(page(created ? [AN_ROW, employee()] : [AN_ROW])));
    server.use(
      http.post("/api/v1/employees", async ({ request }) => {
        const body = (await request.json()) as { email: string };
        if (body.email === "khong-hop-le") {
          return HttpResponse.json(
            {
              status: 422,
              code: "VALIDATION_ERROR",
              detail: "Dữ liệu không hợp lệ.",
              errors: [
                { field: "email", code: "string_pattern_mismatch", message: "Email không hợp lệ." },
              ],
            },
            { status: 422 },
          );
        }
        created = true;
        return HttpResponse.json(
          { employee: employee({ email: body.email }), temporary_password: "aB3dEfGh9k" },
          { status: 201 },
        );
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Vui lòng nhập họ tên.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Họ và tên"), "Lê Thị Hoa");
    await user.type(within(dialog).getByLabelText("Email"), "khong-hop-le");
    await user.selectOptions(within(dialog).getByLabelText("Phòng ban"), SALES.id);
    await user.click(within(dialog).getByRole("checkbox", { name: "Nhân viên kinh doanh" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Email không hợp lệ.")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText("Email"));
    await user.type(within(dialog).getByLabelText("Email"), "hoa.le@smyou.vn");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    const passwordDialog = await screen.findByRole("dialog", { name: "Mật khẩu tạm" });
    expect(within(passwordDialog).getByText("aB3dEfGh9k")).toBeInTheDocument();
    expect(
      within(passwordDialog).getByText(
        "Mật khẩu chỉ hiện một lần. Hãy gửi cho nhân viên qua kênh riêng.",
      ),
    ).toBeInTheDocument();
    await user.click(within(passwordDialog).getByRole("button", { name: "Đóng" }));

    expect(await screen.findByText("Đã thêm nhân viên Lê Thị Hoa.")).toBeInTheDocument();
  });

  test("roles rỗng bị chặn ở client trước khi gửi", async () => {
    let posted = false;
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    server.use(
      http.post("/api/v1/employees", () => {
        posted = true;
        return HttpResponse.json(
          { employee: employee(), temporary_password: "x" },
          { status: 201 },
        );
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });
    await user.type(within(dialog).getByLabelText("Họ và tên"), "X");
    await user.type(within(dialog).getByLabelText("Email"), "x@smyou.vn");
    await user.selectOptions(within(dialog).getByLabelText("Phòng ban"), SALES.id);
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Cần chọn ít nhất một vai trò.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });
});

describe("AC-EMP-024 khoá vai trò kèm Quản lý chung", () => {
  test("tick Quản lý chung tự tick và khoá Sale/CSKH/QLKT, khoá bỏ-tick Kỹ thuật viên", async () => {
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });

    await user.click(within(dialog).getByRole("checkbox", { name: "Nhân viên kỹ thuật" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Quản lý chung" }));

    const sale = within(dialog).getByRole("checkbox", { name: "Nhân viên kinh doanh" });
    const cskh = within(dialog).getByRole("checkbox", { name: "Chăm sóc khách hàng" });
    const techLead = within(dialog).getByRole("checkbox", { name: "Quản lý kỹ thuật" });
    const technician = within(dialog).getByRole("checkbox", { name: "Nhân viên kỹ thuật" });
    expect(sale).toBeChecked();
    expect(sale).toBeDisabled();
    expect(cskh).toBeChecked();
    expect(cskh).toBeDisabled();
    expect(techLead).toBeChecked();
    expect(techLead).toBeDisabled();
    expect(technician).not.toBeChecked(); // forced off — can't be Manager + Technician
    expect(technician).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: "Quản lý chung" }));
    expect(sale).not.toBeDisabled();
    expect(cskh).not.toBeDisabled();
    expect(techLead).not.toBeDisabled();
    expect(technician).not.toBeDisabled();
    expect(sale).toBeChecked(); // unlocked, selection kept as-is
  });
});

describe("AC-EMP-015 sửa nhân viên", () => {
  test("sửa thông tin và vai trò, Lưu → toast Đã cập nhật.", async () => {
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    server.use(
      http.patch("/api/v1/employees/:id", async ({ request }) => {
        const body = (await request.json()) as { title?: string };
        return HttpResponse.json(employee({ title: body.title, version: 2 }));
      }),
      http.post("/api/v1/employees/:id/roles", () =>
        HttpResponse.json(employee({ roles: ["SALE", "TECHNICIAN"], version: 3 })),
      ),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    const titleField = within(dialog).getByLabelText("Chức danh");
    await user.clear(titleField);
    await user.type(titleField, "Trưởng nhóm");
    await user.click(within(dialog).getByRole("checkbox", { name: "Nhân viên kỹ thuật" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
  });

  test("409 STALE_VERSION → thông báo + nút Tải lại", async () => {
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    server.use(
      http.patch("/api/v1/employees/:id", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: 409 },
        ),
      ),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    await user.type(within(dialog).getByLabelText("Chức danh"), "!");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });

  test("409 LAST_MANAGER hiện đúng thông điệp server", async () => {
    // AN gỡ vai trò Quản lý chung của chính mình nhưng vẫn còn vai trò khác được chọn (Sale) —
    // để lỗi đến từ server (luật "còn ≥ 1 Manager"), không phải kiểm ở client (roles rỗng).
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW_WITH_SALE])));
    server.use(
      http.post("/api/v1/employees/:id/roles", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "LAST_MANAGER",
            detail: "Phải còn ít nhất một Quản lý chung đang hoạt động.",
          },
          { status: 409 },
        ),
      ),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByText("Nguyễn Văn An"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Quản lý chung" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Phải còn ít nhất một Quản lý chung đang hoạt động."),
    ).toBeInTheDocument();
  });
});

describe("AC-EMP-016 khoá/mở/cấp lại mật khẩu", () => {
  test("Khoá tài khoản: ConfirmDialog nêu hậu quả, gọi API", async () => {
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    server.use(
      http.post("/api/v1/employees/:id/deactivate", () =>
        HttpResponse.json(employee({ is_active: false, version: 2 })),
      ),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    await user.click(within(dialog).getByRole("button", { name: "Khoá tài khoản" }));
    const confirm = await screen.findByRole("dialog", { name: "Khoá tài khoản" });
    expect(
      within(confirm).getByText("Nhân viên sẽ bị đăng xuất khỏi mọi thiết bị."),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Khoá tài khoản" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Khoá tài khoản" })).not.toBeInTheDocument();
    });
  });

  test("Cấp lại mật khẩu: cảnh báo, xong hiện mật khẩu tạm", async () => {
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    server.use(
      http.post("/api/v1/employees/:id/reset-password", () =>
        HttpResponse.json({ employee: employee({ version: 2 }), temporary_password: "Zz9mNpQr2s" }),
      ),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    await user.click(within(dialog).getByRole("button", { name: "Cấp lại mật khẩu" }));
    const confirm = await screen.findByRole("dialog", { name: "Cấp lại mật khẩu" });
    expect(within(confirm).getByText("Mật khẩu cũ sẽ không dùng được nữa.")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cấp lại mật khẩu" }));
    expect(await screen.findByText("Zz9mNpQr2s")).toBeInTheDocument();
  });

  test("nhân viên đã khoá có nút Mở khoá thay vì Khoá tài khoản", async () => {
    signedInAs(AN, () => HttpResponse.json(page([employee({ is_active: false })])));
    renderApp("/employees");
    await openMenu();
    await userEvent.setup().click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    expect(within(dialog).getByRole("button", { name: "Mở khoá" })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Khoá tài khoản" }),
    ).not.toBeInTheDocument();
  });

  test("không có nút Khoá tài khoản cho chính mình", async () => {
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    renderApp("/employees");
    await openMenu();
    const main = await screen.findByRole("main");
    await userEvent.setup().click(await within(main).findByText("Nguyễn Văn An"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    expect(
      within(dialog).queryByRole("button", { name: "Khoá tài khoản" }),
    ).not.toBeInTheDocument();
  });
});

describe("AC-EMP-017 phân quyền trang", () => {
  test("QLKT (chỉ đọc): xem được, không có nút Thêm/Sửa/Khoá/Cấp lại", async () => {
    signedInAs(TUAN, () => HttpResponse.json(page([employee({ is_locked: true })])));
    renderApp("/employees");
    await openMenu();
    expect(screen.queryByRole("button", { name: "Thêm nhân viên" })).not.toBeInTheDocument();
    await userEvent.setup().click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết nhân viên" });
    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Khoá tài khoản" }),
    ).not.toBeInTheDocument();
    // Q36: chi tiết cho QLKT phải có đủ Mã và Trạng thái, không chỉ thông tin liên hệ
    expect(within(dialog).getByText("NV005")).toBeInTheDocument();
    expect(within(dialog).getByText("Đang hoạt động")).toBeInTheDocument();
    expect(within(dialog).getByText("Tạm khoá đăng nhập")).toBeInTheDocument();
  });

  test("Sale mở /employees trực tiếp → 403", async () => {
    signedInAs(HOA);
    renderApp("/employees");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });
});

describe("Review vòng 1", () => {
  test("khoá rồi cấp lại mật khẩu trong cùng phiên sheet: không dùng version cũ (giả STALE_VERSION)", async () => {
    let resetBody: { version: number } | null = null;
    signedInAs(AN, () => HttpResponse.json(page([employee({ version: 1 })])));
    server.use(
      http.post("/api/v1/employees/:id/deactivate", () =>
        HttpResponse.json(employee({ is_active: false, version: 2 })),
      ),
      http.post("/api/v1/employees/:id/reset-password", async ({ request }) => {
        resetBody = (await request.json()) as { version: number };
        return HttpResponse.json({
          employee: employee({ version: 3 }),
          temporary_password: "Zz9mNpQr2s",
        });
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });

    await user.click(within(dialog).getByRole("button", { name: "Khoá tài khoản" }));
    const confirm1 = await screen.findByRole("dialog", { name: "Khoá tài khoản" });
    await user.click(within(confirm1).getByRole("button", { name: "Khoá tài khoản" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Khoá tài khoản" })).not.toBeInTheDocument();
    });
    // is_active giờ là false → nút phải đổi thành "Mở khoá" ngay, không cần đóng/mở lại sheet
    expect(within(dialog).getByRole("button", { name: "Mở khoá" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cấp lại mật khẩu" }));
    const confirm2 = await screen.findByRole("dialog", { name: "Cấp lại mật khẩu" });
    await user.click(within(confirm2).getByRole("button", { name: "Cấp lại mật khẩu" }));
    await waitFor(() => {
      expect(resetBody?.version).toBe(2); // version sau khi khoá, không phải version=1 ban đầu
    });
  });

  test("hộp xác nhận không đóng bằng Esc khi đang gửi yêu cầu", async () => {
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    server.use(
      http.post("/api/v1/employees/:id/deactivate", async () => {
        await delay(500); // long enough that the mock hasn't resolved when Esc is pressed below
        return HttpResponse.json(employee({ is_active: false, version: 2 }));
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    await user.click(within(dialog).getByRole("button", { name: "Khoá tài khoản" }));
    const confirm = await screen.findByRole("dialog", { name: "Khoá tài khoản" });
    await user.click(within(confirm).getByRole("button", { name: "Khoá tài khoản" }));
    // chờ đúng trạng thái "đang gửi" xuất hiện trên DOM trước khi thử Esc, để không phụ thuộc thời điểm
    await waitFor(() => {
      expect(within(confirm).getByRole("button", { name: "Huỷ" })).toBeDisabled();
    });

    await user.keyboard("{Escape}"); // vẫn đang gửi — Esc không được đóng hộp thoại
    expect(screen.getByRole("dialog", { name: "Khoá tài khoản" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Khoá tài khoản" })).not.toBeInTheDocument();
    });
  });

  test("trạng thái tải: Skeleton (aria-busy), không phải bảng/thẻ trống", async () => {
    signedInAs(AN, async () => {
      await delay("infinite");
      return HttpResponse.json(page([]));
    });
    renderApp("/employees");
    await openMenu();
    expect(await screen.findByLabelText(/^Đang tải/)).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("lỗi 422 gắn đúng vào từng ô (aria-describedby), không phải một dòng chung", async () => {
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    server.use(
      http.post("/api/v1/employees", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "VALIDATION_ERROR",
            detail: "Dữ liệu không hợp lệ.",
            errors: [
              { field: "email", code: "string_pattern_mismatch", message: "Email không hợp lệ." },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });
    await user.type(within(dialog).getByLabelText("Họ và tên"), "Lê Thị Hoa");
    await user.type(within(dialog).getByLabelText("Email"), "hoa.le@smyou.vn");
    await user.selectOptions(within(dialog).getByLabelText("Phòng ban"), SALES.id);
    await user.click(within(dialog).getByRole("checkbox", { name: "Nhân viên kinh doanh" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    const emailField = within(dialog).getByLabelText("Email");
    await waitFor(() => {
      expect(emailField).toHaveAccessibleDescription("Email không hợp lệ.");
    });
  });
});

describe("M17-02b phòng ban lấy từ danh sách", () => {
  test("AC-EMP-060 chỉ liệt kê phòng đang hoạt động; bỏ trống → thông báo", async () => {
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });

    const select = within(dialog).getByLabelText("Phòng ban");
    await waitFor(() => {
      expect(within(select).getAllByRole("option")).toHaveLength(7);
    });
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(["Chọn phòng ban", ...ACTIVE_DEPARTMENTS.map((d) => d.name)]);

    await user.type(within(dialog).getByLabelText("Họ và tên"), "X");
    await user.type(within(dialog).getByLabelText("Email"), "x@smyou.vn");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Vui lòng chọn phòng ban.")).toBeInTheDocument();
  });

  test("AC-EMP-061 phòng hiện tại đã ngừng hoạt động vẫn hiện và lưu được", async () => {
    const inactiveSales = { ...SALES, is_active: false };
    let patched: Record<string, unknown> | null = null;
    signedInAs(AN, () => HttpResponse.json(page([employee({ department: inactiveSales })])));
    server.use(
      http.get("/api/v1/departments", () => {
        const items = ACTIVE_DEPARTMENTS.filter((d) => d.id !== SALES.id).map((d) => ({
          ...d,
          version: 1,
          created_at: "2026-10-28T00:00:00Z",
          updated_at: "2026-10-28T00:00:00Z",
        }));
        return HttpResponse.json({ items, total: items.length, limit: 100, offset: 0 });
      }),
      http.patch("/api/v1/employees/:id", async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          employee({ department: inactiveSales, title: "Trưởng nhóm", version: 2 }),
        );
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa nhân viên" });

    const select = within(dialog).getByLabelText<HTMLSelectElement>("Phòng ban");
    expect(select.value).toBe(SALES.id);
    expect(within(select).getByRole("option", { selected: true })).toHaveTextContent(
      "Kinh doanh (ngừng hoạt động)",
    );
    const titleField = within(dialog).getByLabelText("Chức danh");
    await user.clear(titleField);
    await user.type(titleField, "Trưởng nhóm");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
    expect(patched).toMatchObject({ department_id: SALES.id, title: "Trưởng nhóm" });
  });

  test("AC-EMP-062 QLKT xem chi tiết: Phòng ban lấy tên từ API", async () => {
    const tu = employee({
      code: "NV030",
      full_name: "Phạm Minh Tú",
      department: TECHNICAL,
      roles: ["TECHNICIAN"],
    });
    signedInAs(TUAN, () => HttpResponse.json(page([tu])));
    renderApp("/employees");
    await openMenu();
    await userEvent.setup().click(await screen.findByText("Phạm Minh Tú"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết nhân viên" });

    const row = within(dialog).getByText("Phòng ban").closest("div");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Kỹ thuật")).toBeInTheDocument();
    expect(within(dialog).queryByText("Bộ phận")).not.toBeInTheDocument();
  });
});

const YEN = employee({
  id: "e0000000-0000-4000-8000-000000000064",
  code: "NV064",
  full_name: "Nguyễn Lê Kim Yến",
  email: null,
  birth_date: "1985-07-30",
  birth_place: "An Giang",
  gender: "FEMALE",
  address: "12 Trần Hưng Đạo, Long Xuyên",
  id_number: "089185000565",
  id_issued_date: "2018-10-08",
  id_issued_place: "Cục Cảnh sát QLHC về TTXH",
  marital_status: "MARRIED",
});

function detailValue(dialog: HTMLElement, label: string): string | null {
  const row = within(dialog).getByText(label, { selector: "dt" }).closest("div");
  return row?.querySelector("dd")?.textContent ?? null;
}

describe("M17-03a hồ sơ nhân viên", () => {
  test("AC-EMP-069 QLKT xem chi tiết: đủ trường mới, ngày dd/MM/yyyy, nhãn tiếng Việt", async () => {
    signedInAs(TUAN, () => HttpResponse.json(page([YEN])));
    renderApp("/employees");
    await openMenu();
    await userEvent.setup().click(await screen.findByText("Nguyễn Lê Kim Yến"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết nhân viên" });

    expect(detailValue(dialog, "Ngày sinh")).toBe("30/07/1985");
    expect(detailValue(dialog, "Nơi sinh")).toBe("An Giang");
    expect(detailValue(dialog, "Giới tính")).toBe("Nữ");
    expect(detailValue(dialog, "Địa chỉ")).toBe("12 Trần Hưng Đạo, Long Xuyên");
    expect(detailValue(dialog, "CMND/CCCD")).toBe("089185000565");
    expect(detailValue(dialog, "Ngày cấp")).toBe("08/10/2018");
    expect(detailValue(dialog, "Nơi cấp")).toBe("Cục Cảnh sát QLHC về TTXH");
    expect(detailValue(dialog, "Tình trạng hôn nhân")).toBe("Đã kết hôn");
    expect(detailValue(dialog, "Email")).toBe("—");
  });

  test("AC-EMP-069 trường trống hiện —", async () => {
    signedInAs(TUAN, () => HttpResponse.json(page([employee()])));
    renderApp("/employees");
    await openMenu();
    await userEvent.setup().click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết nhân viên" });

    for (const label of ["Ngày sinh", "Giới tính", "CMND/CCCD", "Tình trạng hôn nhân"]) {
      expect(detailValue(dialog, label)).toBe("—");
    }
  });

  test("AC-EMP-070 form thêm: đúng thứ tự ô, select tiếng Việt, Email không bắt buộc", async () => {
    let posted: Record<string, unknown> | null = null;
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    server.use(
      http.post("/api/v1/employees", async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            employee: employee({ full_name: "Trần Văn Lợi", email: null }),
            temporary_password: "aB3dEfGh9k",
          },
          { status: 201 },
        );
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });

    const order = [
      "Mã NV",
      "Họ và tên",
      "Ngày sinh",
      "Nơi sinh",
      "Giới tính",
      "SĐT",
      "Địa chỉ",
      "Email",
      "CMND/CCCD",
      "Ngày cấp",
      "Nơi cấp",
      "Tình trạng hôn nhân",
      "Phòng ban",
      "Chức danh",
    ];
    const labels = Array.from(dialog.querySelectorAll("label"))
      .map((l) => l.textContent.trim())
      .filter((text) => order.includes(text));
    expect(labels).toEqual(order);

    const gender = within(dialog).getByLabelText("Giới tính");
    expect(gender.tagName).toBe("SELECT");
    expect(
      within(gender)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["—", "Nam", "Nữ", "Khác"]);
    const marital = within(dialog).getByLabelText("Tình trạng hôn nhân");
    expect(marital.tagName).toBe("SELECT");
    expect(
      within(marital)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["—", "Độc thân", "Đã kết hôn", "Ly hôn", "Goá"]);
    expect(within(dialog).getByLabelText("Ngày sinh")).toHaveAttribute("type", "date");
    expect(within(dialog).getByLabelText("Ngày cấp")).toHaveAttribute("type", "date");

    await user.type(within(dialog).getByLabelText("Họ và tên"), "Trần Văn Lợi");
    await user.type(within(dialog).getByLabelText("CMND/CCCD"), "1234567890");
    await user.selectOptions(within(dialog).getByLabelText("Phòng ban"), SALES.id);
    await user.click(within(dialog).getByRole("checkbox", { name: "Nhân viên kinh doanh" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("CMND/CCCD gồm 9 hoặc 12 chữ số.")).toBeInTheDocument();
    expect(posted).toBeNull();

    await user.clear(within(dialog).getByLabelText("CMND/CCCD"));
    await user.type(within(dialog).getByLabelText("CMND/CCCD"), "089185000565");
    await user.type(within(dialog).getByLabelText("Ngày sinh"), "1985-07-30");
    await user.selectOptions(gender, "FEMALE");
    await user.selectOptions(marital, "MARRIED");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByRole("dialog", { name: "Mật khẩu tạm" })).toBeInTheDocument();
    expect(posted).toMatchObject({
      email: null,
      id_number: "089185000565",
      birth_date: "1985-07-30",
      gender: "FEMALE",
      marital_status: "MARRIED",
      birth_place: null,
      address: null,
      id_issued_date: null,
      id_issued_place: null,
    });
  });
});

describe("M17-03b tên đăng nhập", () => {
  test("AC-AUTH-073 tạo xong hiện tên đăng nhập + mật khẩu tạm; form sửa khoá ô Tên đăng nhập đến khi tick", async () => {
    let patched: Record<string, unknown> | null = null;
    const yen = employee({ ...YEN, username: "yen.nlk" });
    signedInAs(AN, () => HttpResponse.json(page([yen])));
    server.use(
      http.post("/api/v1/employees", () =>
        HttpResponse.json({ employee: yen, temporary_password: "30071985" }, { status: 201 }),
      ),
      http.patch("/api/v1/employees/:id", async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...yen, username: "kimyen", version: 2 });
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();

    // list: username under the full name
    expect(await screen.findByText("yen.nlk")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Thêm nhân viên" }));
    const create = await screen.findByRole("dialog", { name: "Thêm nhân viên" });
    expect(within(create).queryByLabelText("Tên đăng nhập")).not.toBeInTheDocument();
    await user.type(within(create).getByLabelText("Họ và tên"), "Nguyễn Lê Kim Yến");
    await user.selectOptions(within(create).getByLabelText("Phòng ban"), SALES.id);
    await user.click(within(create).getByRole("checkbox", { name: "Nhân viên kinh doanh" }));
    await user.click(within(create).getByRole("button", { name: "Lưu" }));

    const done = await screen.findByRole("dialog", { name: "Mật khẩu tạm" });
    expect(within(done).getByText("Tên đăng nhập: yen.nlk")).toBeInTheDocument();
    expect(within(done).getByText("30071985")).toBeInTheDocument();
    await user.click(within(done).getByRole("button", { name: "Đóng" }));

    await user.click(await screen.findByText("Nguyễn Lê Kim Yến"));
    const edit = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    const username = within(edit).getByLabelText("Tên đăng nhập");
    expect(username).toHaveValue("yen.nlk");
    expect(username).toBeDisabled();
    await user.click(within(edit).getByRole("checkbox", { name: "Thay đổi thông tin đăng nhập" }));
    expect(username).toBeEnabled();
    await user.clear(username);
    await user.type(username, "Kim Yen");
    await user.click(within(edit).getByRole("button", { name: "Lưu" }));
    expect(
      await within(edit).findByText("Chỉ gồm chữ thường không dấu, số và dấu chấm (3–50 ký tự)."),
    ).toBeInTheDocument();
    expect(patched).toBeNull();

    await user.clear(username);
    await user.type(username, "kimyen");
    await user.click(within(edit).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
    expect(patched).toMatchObject({ username: "kimyen" });
  });

  test("AC-AUTH-073 không tick → không gửi username", async () => {
    let patched: Record<string, unknown> | null = null;
    signedInAs(AN, () => HttpResponse.json(page([employee()])));
    server.use(
      http.patch("/api/v1/employees/:id", async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(employee({ title: "Trưởng nhóm", version: 2 }));
      }),
    );
    renderApp("/employees");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Lê Thị Hoa"));
    const edit = await screen.findByRole("dialog", { name: "Sửa nhân viên" });
    const titleField = within(edit).getByLabelText("Chức danh");
    await user.clear(titleField);
    await user.type(titleField, "Trưởng nhóm");
    await user.click(within(edit).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
    expect(patched).not.toHaveProperty("username");
  });
});

// ---------------- M17-05: khối "Cách phân quyền hoạt động" ----------------
const GUIDE = "Cách phân quyền hoạt động";

async function openGuide(person: Person = AN) {
  signedInAs(person, () => HttpResponse.json(page([AN_ROW, employee()])));
  renderApp("/employees");
  await openMenu();
  await userEvent.setup().click(await screen.findByRole("button", { name: GUIDE }));
  return screen.findByRole("region", { name: GUIDE });
}

const itemTexts = (container: HTMLElement) =>
  within(container)
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("AC-EMP-082 nút giải thích, mặc định đóng", () => {
  test("AC-EMP-082 Manager mở /employees: thấy nút (aria-expanded=false), khối chưa hiện", async () => {
    signedInAs(AN, () => HttpResponse.json(page([AN_ROW])));
    renderApp("/employees");
    await openMenu();
    const toggle = await screen.findByRole("button", { name: GUIDE });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: GUIDE })).not.toBeInTheDocument();
  });
});

describe("AC-EMP-083 mở/đóng khối giải thích", () => {
  test("AC-EMP-083 bấm nút → 3 tiêu đề, aria-expanded=true; bấm lại → ẩn", async () => {
    const region = await openGuide();
    for (const name of ["Nguyên tắc", "Luồng phân quyền", "Quyền theo vai trò"]) {
      expect(within(region).getByRole("heading", { name })).toBeInTheDocument();
    }
    const toggle = screen.getByRole("button", { name: GUIDE });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.setup().click(toggle);
    expect(screen.queryByRole("region", { name: GUIDE })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("AC-EMP-084 bảng quyền trên máy tính", () => {
  test("AC-EMP-084 ≥1024px: cột quyền + 5 vai trò, hàng Sửa đơn nháp đúng phạm vi", async () => {
    mockViewport(true);
    const region = await openGuide();
    const table = within(region).getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers.slice(0, 6)).toEqual([
      "Quyền",
      "Quản lý chung",
      "Nhân viên kinh doanh",
      "Chăm sóc khách hàng",
      "Quản lý kỹ thuật",
      "Nhân viên kỹ thuật",
    ]);
    expect(within(table).getByRole("rowheader", { name: "Đơn hàng" })).toBeInTheDocument();
    const row = within(table).getByRole("row", { name: /^Sửa đơn nháp/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(cells).toEqual(["Tất cả", "Của mình", "Của mình", "—", "—"]);
    expect(within(region).queryByLabelText("Vai trò")).not.toBeInTheDocument();
  });
});

describe("AC-EMP-085 điện thoại: chọn vai trò", () => {
  test("AC-EMP-085 390px: ô Vai trò mặc định Quản lý chung; đổi sang KTV → danh sách đổi", async () => {
    mockViewport(false);
    const region = await openGuide();
    expect(within(region).queryByRole("table")).not.toBeInTheDocument();
    const select = within(region).getByLabelText("Vai trò");
    expect(select).toHaveValue("MANAGER");
    expect(itemTexts(region)).toContain("Tạo đơn — Tất cả");

    await userEvent.setup().selectOptions(select, "TECHNICIAN");
    const texts = itemTexts(region);
    expect(texts).toContain("Nhận/từ chối/bắt đầu/xong việc được giao — Bản thân");
    expect(texts.some((t) => t.startsWith("Tạo đơn"))).toBe(false);
    expect(within(region).getByRole("heading", { name: "Đầu việc" })).toBeInTheDocument();
    expect(within(region).queryByRole("heading", { name: "Danh mục" })).not.toBeInTheDocument();
  });
});

describe("AC-EMP-086 QLKT cũng xem được giải thích", () => {
  test("AC-EMP-086 TECH_LEAD (chỉ employee.read): mở được khối, vẫn không có Thêm nhân viên", async () => {
    const region = await openGuide(TUAN);
    expect(within(region).getByRole("heading", { name: "Nguyên tắc" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm nhân viên" })).not.toBeInTheDocument();
  });
});

describe("AC-EMP-087 nguyên tắc Quản lý chung", () => {
  test("AC-EMP-087 có câu luật tự kèm vai trò", async () => {
    const region = await openGuide();
    expect(
      within(region).getByText(
        "Tick Quản lý chung sẽ tự kèm Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật và không thể đồng thời là Nhân viên kỹ thuật.",
      ),
    ).toBeInTheDocument();
  });
});

describe("AC-EMP-088 màn hình được vào theo menu.json", () => {
  test("AC-EMP-088 KTV: Tổng quan, Việc của tôi, Báo cáo › Báo cáo KPI; Sale có Khách hàng, không có Danh mục", async () => {
    mockViewport(false);
    const region = await openGuide();
    const user = userEvent.setup();
    await user.selectOptions(within(region).getByLabelText("Vai trò"), "TECHNICIAN");
    const screens = () =>
      within(within(region).getByRole("list", { name: "Màn hình được vào" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent);
    expect(screens()).toEqual(["Tổng quan", "Việc của tôi", "Báo cáo › Báo cáo KPI"]);

    await user.selectOptions(within(region).getByLabelText("Vai trò"), "SALE");
    expect(screens()).toContain("Đơn hàng › Khách hàng");
    expect(screens().some((t) => t.startsWith("Danh mục"))).toBe(false);
    expect(screens().some((t) => t.startsWith("Điều phối kỹ thuật"))).toBe(false);
  });

  test("AC-EMP-088 máy tính: hàng Màn hình được vào đúng theo từng cột vai trò", async () => {
    mockViewport(true);
    const region = await openGuide();
    const row = within(region).getByRole("row", { name: /^Màn hình được vào/ });
    const columns = within(row)
      .getAllByRole("cell")
      .map((td) =>
        within(td)
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      );
    // Columns follow the header order: Quản lý chung, Kinh doanh, CSKH, QLKT, Kỹ thuật.
    expect(columns[4]).toEqual(["Tổng quan", "Việc của tôi", "Báo cáo › Báo cáo KPI"]);
    expect(columns[0]).toContain("Điều phối kỹ thuật › Đơn chờ điều phối");
    expect(columns[1]).toContain("Đơn hàng › Khách hàng");
    expect(columns[1]?.some((t) => t.startsWith("Điều phối kỹ thuật"))).toBe(false);
  });
});

describe("AC-EMP-089 Quản lý chung = hợp quyền vai trò tự kèm", () => {
  test("AC-EMP-089 điện thoại: có ghi chú tự kèm, màn hình có Điều phối kỹ thuật, quyền có giao việc", async () => {
    mockViewport(false);
    const region = await openGuide();
    expect(
      within(region).getByText(
        "Gồm cả quyền của Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật (tự kèm)",
      ),
    ).toBeInTheDocument();
    const screens = within(within(region).getByRole("list", { name: "Màn hình được vào" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(screens).toContain("Điều phối kỹ thuật › Đơn chờ điều phối");
    expect(itemTexts(region)).toContain("Tạo, giao, sửa, huỷ đầu việc — Tất cả");
  });

  test("AC-EMP-089 máy tính: cột Quản lý chung gồm quyền QLKT, có ghi chú", async () => {
    mockViewport(true);
    const region = await openGuide();
    const row = within(region).getByRole("row", { name: /^Tạo, giao, sửa, huỷ đầu việc/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(cells).toEqual(["Tất cả", "—", "—", "Tất cả", "—"]);
    expect(
      within(region).getByText(
        /Gồm cả quyền của Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật \(tự kèm\)/,
      ),
    ).toBeInTheDocument();
  });
});
