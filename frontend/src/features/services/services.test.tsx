import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { Service } from "./api";

const id = "9d1f0c2e-0000-4000-8000-000000000002";

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
    "catalog.read": all,
    "catalog.manage": all,
    "profile.manage": self,
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  email: "hoa.le@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "catalog.read": all, "profile.manage": self },
};
const KHOA: Person = {
  code: "NV014",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "e0000000-0000-4000-8000-000000000006",
    code: "DV-LAPCAM",
    name: "Công đi dây + lắp đặt hệ thống camera",
    category: "NETWORK_CABLING",
    unit: "DIEM",
    price: 300_000,
    vat_rate: "10.00",
    price_fixed: false,
    default_estimated_hours: "2.00",
    description: "Bao gồm đi dây âm tường",
    is_active: true,
    version: 1,
    ...overrides,
  };
}
const LAPCAM = service({ id, code: "DV-LAPCAM" });

function page(items: Service[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function signedInAs(person: Person, servicesHandler?: Parameters<typeof http.get>[1]) {
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
    ...(servicesHandler ? [http.get("/api/v1/services", servicesHandler)] : []),
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

async function openMenu() {
  return screen.findByRole("heading", { level: 1, name: "Dịch vụ" });
}

describe("AC-CAT-027 danh sách dịch vụ", () => {
  test("máy tính: bảng Mã dịch vụ/Tên/Danh mục/Giá/Trạng thái", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([LAPCAM])));
    renderApp("/catalog/services");
    await openMenu();

    const table = await screen.findByRole("table");
    for (const heading of ["Mã dịch vụ", "Tên", "Danh mục", "Giá", "Trạng thái"]) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
    expect(within(table).getByText("DV-LAPCAM")).toBeInTheDocument();
    expect(within(table).getByText("300.000 ₫")).toBeInTheDocument();
    expect(within(table).getByText("Đang kinh doanh")).toBeInTheDocument();
  });

  test("giá = 0 hiện Liên hệ báo giá thay vì 0 ₫", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([service({ price: 0 })])));
    renderApp("/catalog/services");
    await openMenu();
    expect(await screen.findByText("Liên hệ báo giá")).toBeInTheDocument();
  });

  test("điện thoại: thẻ xếp dọc, không phải bảng", async () => {
    mockViewport(false);
    signedInAs(AN, () => HttpResponse.json(page([LAPCAM])));
    renderApp("/catalog/services");
    await openMenu();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByText("Công đi dây + lắp đặt hệ thống camera")).toBeInTheDocument();
    expect(screen.getByText("DV-LAPCAM")).toBeInTheDocument();
  });

  test("tìm kiếm gọi API sau 300ms; lọc danh mục và trạng thái", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json(page([LAPCAM]));
    });
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Tìm kiếm"), "lap cam");
    expect(lastQuery).not.toContain("q=lap"); // chưa gọi — đang debounce
    await waitFor(
      () => {
        expect(lastQuery).toContain("q=lap");
      },
      { timeout: 1000 },
    );

    await user.selectOptions(screen.getByLabelText("Danh mục"), "NETWORK_CABLING");
    await waitFor(() => {
      expect(lastQuery).toContain("category=NETWORK_CABLING");
    });
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "false");
    await waitFor(() => {
      expect(lastQuery).toContain("is_active=false");
    });
  });

  test("trạng thái tải, trống, lỗi + Thử lại", async () => {
    let calls = 0;
    signedInAs(AN, () => {
      calls += 1;
      if (calls === 1) return HttpResponse.json({ status: 503 }, { status: 503 });
      return HttpResponse.json(page([]));
    });
    renderApp("/catalog/services");
    await openMenu();
    expect(await screen.findByText("Không tải được danh sách.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có dịch vụ phù hợp.")).toBeInTheDocument();
  });
});

describe("AC-CAT-028 thêm dịch vụ", () => {
  test("zod kiểm ở client trước khi gửi", async () => {
    let posted = false;
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/services", () => {
        posted = true;
        return HttpResponse.json(service(), { status: 201 });
      }),
    );
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm dịch vụ" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm dịch vụ" });
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Vui lòng nhập mã dịch vụ.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  test("409 CONFLICT code hiện dưới đúng ô; lưu xong → toast, chuyển sang chi tiết dịch vụ mới", async () => {
    let attempt = 0;
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/services", async ({ request }) => {
        attempt += 1;
        const body = (await request.json()) as { code: string };
        if (attempt === 1) {
          return HttpResponse.json(
            {
              status: 409,
              code: "CONFLICT",
              detail: "Mã dịch vụ đã được dùng cho dịch vụ khác.",
              errors: [
                {
                  field: "code",
                  code: "taken",
                  message: "Mã dịch vụ đã được dùng cho dịch vụ khác.",
                },
              ],
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(
          service({ code: body.code, name: "Cài đặt phần mềm", id: "new-id" }),
          { status: 201 },
        );
      }),
    );
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm dịch vụ" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm dịch vụ" });
    await user.type(within(dialog).getByLabelText("Mã dịch vụ"), "DV-BOMMUC");
    await user.type(within(dialog).getByLabelText("Tên dịch vụ"), "Cài đặt phần mềm");
    await user.selectOptions(within(dialog).getByLabelText("Nhóm dịch vụ"), "SOFTWARE");
    await user.selectOptions(within(dialog).getByLabelText("Đơn vị tính"), "LAN");
    await user.type(within(dialog).getByLabelText("Đơn giá (chưa VAT)"), "150000");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Mã dịch vụ đã được dùng cho dịch vụ khác."),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã thêm dịch vụ Cài đặt phần mềm.")).toBeInTheDocument();
    // cùng Sheet chuyển sang chế độ sửa cho dịch vụ vừa tạo — không mở lại ô mã dịch vụ nữa
    expect(await screen.findByRole("dialog", { name: "Sửa dịch vụ" })).toBeInTheDocument();
  });

  test("422 từ server (không phải client) hiện dưới đúng ô — mô tả không có kiểm ở client", async () => {
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/services", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "VALIDATION_ERROR",
            detail: "Dữ liệu không hợp lệ.",
            errors: [{ field: "description", code: "string_too_long", message: "Mô tả quá dài." }],
          },
          { status: 422 },
        ),
      ),
    );
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm dịch vụ" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm dịch vụ" });
    await user.type(within(dialog).getByLabelText("Mã dịch vụ"), "DV-X");
    await user.type(within(dialog).getByLabelText("Tên dịch vụ"), "X");
    await user.selectOptions(within(dialog).getByLabelText("Nhóm dịch vụ"), "OTHER");
    await user.selectOptions(within(dialog).getByLabelText("Đơn vị tính"), "LAN");
    await user.type(within(dialog).getByLabelText("Đơn giá (chưa VAT)"), "1000");
    await user.type(within(dialog).getByLabelText("Mô tả"), "Một mô tả nào đó");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    const descField = within(dialog).getByLabelText("Mô tả");
    await waitFor(() => {
      expect(descField).toHaveAccessibleDescription("Mô tả quá dài.");
    });
  });
});

describe("AC-CAT-029 sửa dịch vụ", () => {
  test("không có ô mã/nhóm/đơn vị; Lưu → toast Đã cập nhật.", async () => {
    signedInAs(AN, () => HttpResponse.json(page([LAPCAM])));
    server.use(
      http.patch("/api/v1/services/:id", async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json(service({ id, name: body.name, version: 2 }));
      }),
    );
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByText("Công đi dây + lắp đặt hệ thống camera"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa dịch vụ" });
    expect(within(dialog).queryByLabelText("Mã dịch vụ")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Nhóm dịch vụ")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Đơn vị tính")).not.toBeInTheDocument();

    const nameField = within(dialog).getByLabelText("Tên dịch vụ");
    await user.clear(nameField);
    await user.type(nameField, "Công đi dây + lắp camera trọn gói");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
  });

  test("409 STALE_VERSION → thông báo + nút Tải lại", async () => {
    signedInAs(AN, () => HttpResponse.json(page([LAPCAM])));
    server.use(
      http.patch("/api/v1/services/:id", () =>
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
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Công đi dây + lắp đặt hệ thống camera"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa dịch vụ" });
    await user.type(within(dialog).getByLabelText("Tên dịch vụ"), "!");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });
});

describe("AC-CAT-030 ngừng/mở kinh doanh", () => {
  test("Ngừng kinh doanh: ConfirmDialog nêu hậu quả, badge đổi ngay không cần tải lại", async () => {
    signedInAs(AN, () => HttpResponse.json(page([LAPCAM])));
    server.use(
      http.post("/api/v1/services/:id/deactivate", () =>
        HttpResponse.json(service({ id, is_active: false, version: 2 })),
      ),
    );
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Công đi dây + lắp đặt hệ thống camera"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa dịch vụ" });
    await user.click(within(dialog).getByRole("button", { name: "Ngừng kinh doanh" }));
    const confirm = await screen.findByRole("dialog", { name: "Ngừng kinh doanh" });
    expect(within(confirm).getByText("Dịch vụ sẽ không hiện khi tạo đơn mới.")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Ngừng kinh doanh" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Ngừng kinh doanh" })).not.toBeInTheDocument();
    });
    expect(within(dialog).getByText("Đã ngừng kinh doanh")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Mở lại kinh doanh" })).toBeInTheDocument();
  });

  test("Mở lại kinh doanh", async () => {
    signedInAs(AN, () => HttpResponse.json(page([service({ id, is_active: false })])));
    server.use(
      http.post("/api/v1/services/:id/activate", () =>
        HttpResponse.json(service({ id, is_active: true, version: 2 })),
      ),
    );
    renderApp("/catalog/services");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Công đi dây + lắp đặt hệ thống camera"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa dịch vụ" });
    await user.click(within(dialog).getByRole("button", { name: "Mở lại kinh doanh" }));
    const confirm = await screen.findByRole("dialog", { name: "Mở lại kinh doanh" });
    expect(within(confirm).getByText("Dịch vụ sẽ hiện lại khi tạo đơn mới.")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Mở lại kinh doanh" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Đang kinh doanh")).toBeInTheDocument();
    });
  });
});

describe("AC-CAT-031 phân quyền trang", () => {
  test("Sale (chỉ đọc): không có nút Thêm/Sửa/Ngừng", async () => {
    signedInAs(HOA, () => HttpResponse.json(page([LAPCAM])));
    renderApp("/catalog/services");
    await openMenu();
    expect(screen.queryByRole("button", { name: "Thêm dịch vụ" })).not.toBeInTheDocument();

    await userEvent.setup().click(await screen.findByText("Công đi dây + lắp đặt hệ thống camera"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết dịch vụ" });
    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Ngừng kinh doanh" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("DV-LAPCAM")).toBeInTheDocument();
  });

  test("Khoa (TECHNICIAN) mở /catalog/services trực tiếp → 403", async () => {
    signedInAs(KHOA);
    renderApp("/catalog/services");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });
});
