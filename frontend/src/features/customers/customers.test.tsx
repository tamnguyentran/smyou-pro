import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { Customer } from "./api";
import { CustomerList } from "./components/CustomerList";

const id = "9d1f0c2e-0000-4000-8000-000000000003";

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
    "customer.read": all,
    "customer.manage": all,
    "profile.manage": self,
  },
};
const TUAN: Person = {
  code: "NV010",
  full_name: "Phạm Quốc Tuấn",
  email: "tuan.pham@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: { "dashboard.read": all, "customer.read": all, "profile.manage": self },
};
const KHOA: Person = {
  code: "NV014",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "e0000000-0000-4000-8000-000000000007",
    code: "KH00003",
    type: "COMPANY",
    name: "Cty Kim Long",
    contact_person: "Chị Mai",
    phone: "0912345678",
    email: null,
    tax_code: "0311122233",
    address: "12 Lê Lợi, Q1, TP.HCM",
    note: null,
    created_by: "a0000000-0000-4000-8000-000000000001",
    version: 1,
    ...overrides,
  };
}
const KIM_LONG = customer({ id, code: "KH00003" });

function page(items: Customer[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function signedInAs(person: Person, customersHandler?: Parameters<typeof http.get>[1]) {
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
    ...(customersHandler ? [http.get("/api/v1/customers", customersHandler)] : []),
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
  return screen.findByRole("heading", { level: 1, name: "Khách hàng" });
}

describe("AC-CUS-009 danh sách khách hàng", () => {
  test("máy tính: bảng Mã KH/Loại/Tên/Người liên hệ/SĐT/MST/Địa chỉ", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    renderApp("/customers");
    await openMenu();

    const table = await screen.findByRole("table");
    for (const heading of ["Mã KH", "Loại", "Tên", "Người liên hệ", "SĐT", "MST", "Địa chỉ"]) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
    expect(within(table).getByText("KH00003")).toBeInTheDocument();
    expect(within(table).getByText("0912345678")).toBeInTheDocument();
  });

  test("điện thoại: thẻ xếp dọc, không phải bảng", async () => {
    mockViewport(false);
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    renderApp("/customers");
    await openMenu();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByText("Cty Kim Long")).toBeInTheDocument();
    expect(screen.getByText("KH00003")).toBeInTheDocument();
  });

  test("tìm kiếm gọi API sau 300ms (tên/SĐT/MST); lọc loại khách hàng", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json(page([KIM_LONG]));
    });
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Tìm kiếm"), "kim long");
    expect(lastQuery).not.toContain("q=kim"); // chưa gọi — đang debounce
    await waitFor(
      () => {
        expect(lastQuery).toContain("q=kim");
      },
      { timeout: 1000 },
    );

    await user.selectOptions(screen.getByLabelText("Loại khách hàng"), "COMPANY");
    await waitFor(() => {
      expect(lastQuery).toContain("type=COMPANY");
    });
  });

  test("trạng thái tải, trống, lỗi + Thử lại", async () => {
    let calls = 0;
    signedInAs(AN, () => {
      calls += 1;
      if (calls === 1) return HttpResponse.json({ status: 503 }, { status: 503 });
      return HttpResponse.json(page([]));
    });
    renderApp("/customers");
    await openMenu();
    expect(await screen.findByText("Không tải được danh sách.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có khách hàng phù hợp.")).toBeInTheDocument();
  });

  test("AC-CUS-014 bấm ô khác trong hàng (không phải tên) → mở sheet sửa", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    renderApp("/customers");
    await openMenu();

    await userEvent.setup().click(await screen.findByText("0912345678"));
    expect(await screen.findByRole("dialog", { name: "Sửa khách hàng" })).toBeInTheDocument();
  });

  test("AC-CUS-014 bấm ô khác trong hàng → gọi onSelect đúng 1 lần", async () => {
    const onSelect = vi.fn();
    render(<CustomerList items={[KIM_LONG]} onSelect={onSelect} />);

    await userEvent.setup().click(screen.getByText("0912345678"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(KIM_LONG);
  });

  test("AC-CUS-015 bấm tên khách hàng vẫn mở sheet sửa (không regression)", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    renderApp("/customers");
    await openMenu();

    await userEvent.setup().click(await screen.findByText("Cty Kim Long"));
    expect(await screen.findByRole("dialog", { name: "Sửa khách hàng" })).toBeInTheDocument();
  });

  test("AC-CUS-015 bấm nút tên khách hàng gọi onSelect đúng 1 lần (không regression bấm đúp)", async () => {
    const onSelect = vi.fn();
    render(<CustomerList items={[KIM_LONG]} onSelect={onSelect} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cty Kim Long" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(KIM_LONG);
  });
});

describe("AC-CUS-010 thêm khách hàng", () => {
  test("zod kiểm ở client trước khi gửi", async () => {
    let posted = false;
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/customers", () => {
        posted = true;
        return HttpResponse.json({ ...customer(), duplicate_phone_matches: [] }, { status: 201 });
      }),
    );
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm khách hàng" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm khách hàng" });
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Vui lòng nhập tên khách hàng.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  test("lưu xong → toast, banner cảnh báo trùng SĐT, chuyển sang chi tiết khách hàng mới", async () => {
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/customers", async ({ request }) => {
        const body = (await request.json()) as { name: string; phone: string };
        return HttpResponse.json(
          {
            ...customer({ id: "new-id", name: body.name, phone: body.phone }),
            duplicate_phone_matches: [
              { id: "old-id", code: "KH00001", name: "Cty Sáng Tạo Mới", phone: body.phone },
            ],
          },
          { status: 201 },
        );
      }),
    );
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm khách hàng" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm khách hàng" });
    await user.type(within(dialog).getByLabelText("Tên khách hàng"), "Cty Việt Phát");
    await user.type(within(dialog).getByLabelText("Số điện thoại"), "0909123456");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã thêm khách hàng Cty Việt Phát.")).toBeInTheDocument();
    // cùng Sheet chuyển sang chế độ sửa cho khách hàng vừa tạo
    expect(await screen.findByRole("dialog", { name: "Sửa khách hàng" })).toBeInTheDocument();
    expect(
      await screen.findByText("SĐT này đã dùng cho: Cty Sáng Tạo Mới (KH00001)."),
    ).toBeInTheDocument();
  });

  test("409 CONFLICT (mã trùng) hiện dưới đúng ô", async () => {
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/customers", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "CONFLICT",
            detail: "Mã khách hàng đã được dùng cho khách hàng khác.",
            errors: [
              {
                field: "code",
                code: "taken",
                message: "Mã khách hàng đã được dùng cho khách hàng khác.",
              },
            ],
          },
          { status: 409 },
        ),
      ),
    );
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm khách hàng" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm khách hàng" });
    await user.type(within(dialog).getByLabelText("Tên khách hàng"), "Cty Việt Phát");
    await user.type(within(dialog).getByLabelText("Số điện thoại"), "0987654321");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Mã khách hàng đã được dùng cho khách hàng khác."),
    ).toBeInTheDocument();
  });
});

describe("AC-CUS-011 sửa khách hàng", () => {
  test("Lưu → toast Đã cập nhật.", async () => {
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    server.use(
      http.patch("/api/v1/customers/:id", async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json({
          ...customer({ id, name: body.name, version: 2 }),
          duplicate_phone_matches: [],
        });
      }),
    );
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByText("Cty Kim Long"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa khách hàng" });
    const nameField = within(dialog).getByLabelText("Tên khách hàng");
    await user.clear(nameField);
    await user.type(nameField, "Cty Kim Long Mới");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
  });

  test("409 STALE_VERSION → thông báo + nút Tải lại", async () => {
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    server.use(
      http.patch("/api/v1/customers/:id", () =>
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
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Cty Kim Long"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa khách hàng" });
    await user.type(within(dialog).getByLabelText("Ghi chú"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });

  test("đổi SĐT trùng khách khác → banner cảnh báo, Sheet không tự đóng", async () => {
    signedInAs(AN, () => HttpResponse.json(page([KIM_LONG])));
    server.use(
      http.patch("/api/v1/customers/:id", () =>
        HttpResponse.json({
          ...customer({ id, phone: "0909123456", version: 2 }),
          duplicate_phone_matches: [
            { id: "old-id", code: "KH00001", name: "Cty Sáng Tạo Mới", phone: "0909123456" },
          ],
        }),
      ),
    );
    renderApp("/customers");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Cty Kim Long"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa khách hàng" });
    const phoneField = within(dialog).getByLabelText("Số điện thoại");
    await user.clear(phoneField);
    await user.type(phoneField, "0909123456");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
    expect(
      await within(dialog).findByText("SĐT này đã dùng cho: Cty Sáng Tạo Mới (KH00001)."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Sửa khách hàng" })).toBeInTheDocument();
  });
});

describe("AC-CUS-012 phân quyền trang", () => {
  test("TECH_LEAD (chỉ đọc): không có nút Thêm, mở trực tiếp vẫn xem được", async () => {
    signedInAs(TUAN, () => HttpResponse.json(page([KIM_LONG])));
    renderApp("/customers");
    await openMenu();
    expect(screen.queryByRole("button", { name: "Thêm khách hàng" })).not.toBeInTheDocument();

    await userEvent.setup().click(await screen.findByText("Cty Kim Long"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết khách hàng" });
    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("KH00003")).toBeInTheDocument();
  });

  test("Khoa (TECHNICIAN) mở /customers trực tiếp → 403", async () => {
    signedInAs(KHOA);
    renderApp("/customers");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });
});
