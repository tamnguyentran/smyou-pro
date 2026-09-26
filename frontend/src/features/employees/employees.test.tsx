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
    email: "hoa.le@smyou.vn",
    phone: "0932068787",
    department: "SALES",
    title: "Nhân viên kinh doanh",
    roles: ["SALE"],
    is_active: true,
    is_locked: false,
    must_change_password: false,
    version: 1,
    ...overrides,
  };
}
const AN_ROW = employee({
  id,
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  phone: null,
  department: "MANAGEMENT",
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
          department: "MANAGEMENT",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
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
    await user.selectOptions(within(dialog).getByLabelText("Bộ phận"), "SALES");
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
    await user.selectOptions(within(dialog).getByLabelText("Bộ phận"), "SALES");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Cần chọn ít nhất một vai trò.")).toBeInTheDocument();
    expect(posted).toBe(false);
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
    signedInAs(TUAN, () => HttpResponse.json(page([employee()])));
    renderApp("/employees");
    await openMenu();
    expect(screen.queryByRole("button", { name: "Thêm nhân viên" })).not.toBeInTheDocument();
    await userEvent.setup().click(await screen.findByText("Lê Thị Hoa"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết nhân viên" });
    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Khoá tài khoản" }),
    ).not.toBeInTheDocument();
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
    await user.selectOptions(within(dialog).getByLabelText("Bộ phận"), "SALES");
    await user.click(within(dialog).getByRole("checkbox", { name: "Nhân viên kinh doanh" }));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    const emailField = within(dialog).getByLabelText("Email");
    await waitFor(() => {
      expect(emailField).toHaveAccessibleDescription("Email không hợp lệ.");
    });
  });
});
