import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { ApiError } from "../auth/errors";
import type { Product } from "./api";
import { compressImage, validateImageFile } from "./imageCompression";
import { uploadProductImage } from "./upload";

vi.mock("./imageCompression", () => ({
  validateImageFile: vi.fn(),
  compressImage: vi.fn(),
}));
vi.mock("./upload", () => ({
  uploadProductImage: vi.fn(),
}));

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

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "e0000000-0000-4000-8000-000000000005",
    sku: "LCD1137",
    name: "Màn hình Dell 22 inch",
    category: "MONITOR",
    brand: "Dell",
    unit: "CAI",
    price: 2_800_000,
    vat_rate: "10.00",
    price_fixed: false,
    warranty_months: 24,
    specs: null,
    image_attachment_id: null,
    is_active: true,
    version: 1,
    ...overrides,
  };
}
const LCD = product({ id, sku: "LCD1137", name: "Màn hình Dell 22 inch" });

function page(items: Product[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function signedInAs(person: Person, productsHandler?: Parameters<typeof http.get>[1]) {
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
    ...(productsHandler ? [http.get("/api/v1/products", productsHandler)] : []),
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
  return screen.findByRole("heading", { level: 1, name: "Sản phẩm" });
}

function file(name: string, type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("AC-CAT-012 danh sách sản phẩm", () => {
  test("máy tính: bảng Mã hàng/Tên/Danh mục/Giá/Trạng thái", async () => {
    mockViewport(true);
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();

    const table = await screen.findByRole("table");
    for (const heading of ["Mã hàng", "Tên", "Danh mục", "Giá", "Trạng thái"]) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
    expect(within(table).getByText("LCD1137")).toBeInTheDocument();
    expect(within(table).getByText("2.800.000 ₫")).toBeInTheDocument();
    expect(within(table).getByText("Đang kinh doanh")).toBeInTheDocument();
  });

  test("điện thoại: thẻ xếp dọc kèm ảnh thu nhỏ, không phải bảng", async () => {
    mockViewport(false);
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByText("Màn hình Dell 22 inch")).toBeInTheDocument();
    expect(screen.getByText("LCD1137")).toBeInTheDocument();
  });

  test("tìm kiếm gọi API sau 300ms; lọc danh mục và trạng thái", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json(page([LCD]));
    });
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Tìm kiếm"), "man hinh");
    expect(lastQuery).not.toContain("q=man"); // chưa gọi — đang debounce
    await waitFor(
      () => {
        expect(lastQuery).toContain("q=man");
      },
      { timeout: 1000 },
    );

    await user.selectOptions(screen.getByLabelText("Danh mục"), "MONITOR");
    await waitFor(() => {
      expect(lastQuery).toContain("category=MONITOR");
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
      return HttpResponse.json(page([LCD], 45));
    });
    renderApp("/catalog/products");
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
    renderApp("/catalog/products");
    await openMenu();
    expect(await screen.findByText("Không tải được danh sách.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có sản phẩm phù hợp.")).toBeInTheDocument();
  });
});

describe("AC-CAT-013 thêm sản phẩm", () => {
  test("zod kiểm ở client trước khi gửi", async () => {
    let posted = false;
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/products", () => {
        posted = true;
        return HttpResponse.json(product(), { status: 201 });
      }),
    );
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm sản phẩm" });
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Vui lòng nhập mã hàng.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  test("409 CONFLICT sku hiện dưới đúng ô; lưu xong → toast, chuyển sang chi tiết sản phẩm mới", async () => {
    let attempt = 0;
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/products", async ({ request }) => {
        attempt += 1;
        const body = (await request.json()) as { sku: string };
        if (attempt === 1) {
          return HttpResponse.json(
            {
              status: 409,
              code: "CONFLICT",
              detail: "Mã hàng đã được dùng cho sản phẩm khác.",
              errors: [
                { field: "sku", code: "taken", message: "Mã hàng đã được dùng cho sản phẩm khác." },
              ],
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(
          product({ sku: body.sku, name: "PC SMYOU CORE I5-13400", id: "new-id" }),
          { status: 201 },
        );
      }),
    );
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm sản phẩm" });
    await user.type(within(dialog).getByLabelText("Mã hàng"), "MAYBO3551");
    await user.type(within(dialog).getByLabelText("Tên sản phẩm"), "PC SMYOU CORE I5-13400");
    await user.selectOptions(within(dialog).getByLabelText("Danh mục"), "PC");
    await user.selectOptions(within(dialog).getByLabelText("Đơn vị tính"), "BO");
    await user.type(within(dialog).getByLabelText("Đơn giá"), "12500000");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Mã hàng đã được dùng cho sản phẩm khác."),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã thêm sản phẩm PC SMYOU CORE I5-13400.")).toBeInTheDocument();
    // cùng Sheet chuyển sang chế độ sửa cho sản phẩm vừa tạo (§8 giả định) — không mở sku nữa
    expect(await screen.findByRole("dialog", { name: "Sửa sản phẩm" })).toBeInTheDocument();
  });

  test("422 từ server (không phải client) hiện dưới đúng ô — brand không có kiểm ở client", async () => {
    signedInAs(AN, () => HttpResponse.json(page([])));
    server.use(
      http.post("/api/v1/products", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "VALIDATION_ERROR",
            detail: "Dữ liệu không hợp lệ.",
            errors: [{ field: "brand", code: "string_too_long", message: "Tối đa 60 ký tự." }],
          },
          { status: 422 },
        ),
      ),
    );
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm sản phẩm" });
    await user.type(within(dialog).getByLabelText("Mã hàng"), "X1");
    await user.type(within(dialog).getByLabelText("Tên sản phẩm"), "X");
    await user.selectOptions(within(dialog).getByLabelText("Danh mục"), "PC");
    await user.selectOptions(within(dialog).getByLabelText("Đơn vị tính"), "CAI");
    await user.type(within(dialog).getByLabelText("Đơn giá"), "1000");
    await user.type(within(dialog).getByLabelText("Hãng"), "Một hãng nào đó");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    const brandField = within(dialog).getByLabelText("Hãng");
    await waitFor(() => {
      expect(brandField).toHaveAccessibleDescription("Tối đa 60 ký tự.");
    });
  });
});

describe("AC-CAT-014 sửa sản phẩm", () => {
  test("không có ô sku/category/unit; Lưu → toast Đã cập nhật.", async () => {
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    server.use(
      http.patch("/api/v1/products/:id", async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json(product({ id, name: body.name, version: 2 }));
      }),
    );
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();

    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });
    expect(within(dialog).queryByLabelText("Mã hàng")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Danh mục")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Đơn vị tính")).not.toBeInTheDocument();

    const nameField = within(dialog).getByLabelText("Tên sản phẩm");
    await user.clear(nameField);
    await user.type(nameField, "Màn hình Dell 22in FHD");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã cập nhật.")).toBeInTheDocument();
  });

  test("409 STALE_VERSION → thông báo + nút Tải lại", async () => {
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    server.use(
      http.patch("/api/v1/products/:id", () =>
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
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });
    await user.type(within(dialog).getByLabelText("Tên sản phẩm"), "!");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });
});

describe("AC-CAT-015 ngừng/mở kinh doanh", () => {
  test("Ngừng kinh doanh: ConfirmDialog nêu hậu quả, badge đổi ngay không cần tải lại", async () => {
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    server.use(
      http.post("/api/v1/products/:id/deactivate", () =>
        HttpResponse.json(product({ id, is_active: false, version: 2 })),
      ),
    );
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });
    await user.click(within(dialog).getByRole("button", { name: "Ngừng kinh doanh" }));
    const confirm = await screen.findByRole("dialog", { name: "Ngừng kinh doanh" });
    expect(
      within(confirm).getByText("Sản phẩm sẽ không hiện khi tạo đơn mới."),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Ngừng kinh doanh" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Ngừng kinh doanh" })).not.toBeInTheDocument();
    });
    expect(within(dialog).getByText("Đã ngừng kinh doanh")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Mở lại kinh doanh" })).toBeInTheDocument();
  });

  test("Mở lại kinh doanh", async () => {
    signedInAs(AN, () => HttpResponse.json(page([product({ id, is_active: false })])));
    server.use(
      http.post("/api/v1/products/:id/activate", () =>
        HttpResponse.json(product({ id, is_active: true, version: 2 })),
      ),
    );
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });
    await user.click(within(dialog).getByRole("button", { name: "Mở lại kinh doanh" }));
    const confirm = await screen.findByRole("dialog", { name: "Mở lại kinh doanh" });
    expect(within(confirm).getByText("Sản phẩm sẽ hiện lại khi tạo đơn mới.")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Mở lại kinh doanh" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Đang kinh doanh")).toBeInTheDocument();
    });
  });
});

describe("AC-CAT-016 ảnh sản phẩm", () => {
  test("chọn ảnh hợp lệ: xem trước, nén, tiến trình, tải xong → hiện ảnh", async () => {
    // jsdom/vitest's built-in URL.createObjectURL chokes on a File built via `new File(...)`.
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(validateImageFile).mockReturnValue(null);
    vi.mocked(compressImage).mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    vi.mocked(uploadProductImage).mockImplementation(async (_id, _blob, onProgress) => {
      onProgress(50);
      // Real delay (not just a microtask tick) so "Đang tải ảnh…" is observable before it clears —
      // a fully synchronous mock resolves faster than findByText's polling interval can catch it.
      await new Promise((resolve) => setTimeout(resolve, 20));
      onProgress(100);
      return { image_attachment_id: "attach-1" };
    });
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });

    const input = within(dialog).getByLabelText("Chọn ảnh", { exact: false });
    await user.upload(input, file("photo.jpg", "image/jpeg"));

    expect(await within(dialog).findByText("Đang tải ảnh… 50%")).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    await waitFor(() => {
      expect(uploadProductImage).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(within(dialog).getByAltText("Ảnh sản phẩm").getAttribute("src")).toContain("attach-1");
    });
  });

  test("file không phải ảnh → lỗi tức thì, không gọi API nén/tải", async () => {
    vi.mocked(validateImageFile).mockReturnValue({
      code: "INVALID_FILE_TYPE",
      message: "Tệp không phải ảnh hợp lệ.",
    });
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });

    const input = within(dialog).getByLabelText("Chọn ảnh", { exact: false });
    await user.upload(input, file("a.gif", "image/gif"));

    expect(await within(dialog).findByText("Tệp không phải ảnh hợp lệ.")).toBeInTheDocument();
    expect(compressImage).not.toHaveBeenCalled();
    expect(uploadProductImage).not.toHaveBeenCalled();
  });

  test("file > 10MB → lỗi tức thì, không gọi API", async () => {
    vi.mocked(validateImageFile).mockReturnValue({
      code: "FILE_TOO_LARGE",
      message: "Ảnh vượt quá 10MB.",
    });
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });

    const input = within(dialog).getByLabelText("Chọn ảnh", { exact: false });
    await user.upload(input, file("big.jpg", "image/jpeg", 11 * 1024 * 1024));

    expect(await within(dialog).findByText("Ảnh vượt quá 10MB.")).toBeInTheDocument();
    expect(compressImage).not.toHaveBeenCalled();
    expect(uploadProductImage).not.toHaveBeenCalled();
  });

  test("server từ chối ảnh (vd. 10MB thật sau khi nén) → hiện đúng thông báo lỗi của server", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(validateImageFile).mockReturnValue(null);
    vi.mocked(compressImage).mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    vi.mocked(uploadProductImage).mockRejectedValue(
      new ApiError({ status: 422, code: "FILE_TOO_LARGE", detail: "Ảnh vượt quá 10MB." }),
    );
    signedInAs(AN, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Sửa sản phẩm" });

    const input = within(dialog).getByLabelText("Chọn ảnh", { exact: false });
    await user.upload(input, file("photo.jpg", "image/jpeg"));

    expect(await within(dialog).findByText("Ảnh vượt quá 10MB.")).toBeInTheDocument();
  });

  test("không hiện ô chọn ảnh khi đang tạo mới (chưa có id)", async () => {
    signedInAs(AN, () => HttpResponse.json(page([])));
    renderApp("/catalog/products");
    await openMenu();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm sản phẩm" });
    expect(within(dialog).queryByLabelText("Chọn ảnh", { exact: false })).not.toBeInTheDocument();
  });
});

describe("AC-CAT-017 phân quyền trang", () => {
  test("Sale (chỉ đọc): không có nút Thêm/Sửa/Ngừng/tải ảnh", async () => {
    signedInAs(HOA, () => HttpResponse.json(page([LCD])));
    renderApp("/catalog/products");
    await openMenu();
    expect(screen.queryByRole("button", { name: "Thêm sản phẩm" })).not.toBeInTheDocument();

    await userEvent.setup().click(await screen.findByText("Màn hình Dell 22 inch"));
    const dialog = await screen.findByRole("dialog", { name: "Chi tiết sản phẩm" });
    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Ngừng kinh doanh" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Chọn ảnh", { exact: false })).not.toBeInTheDocument();
    expect(within(dialog).getByText("LCD1137")).toBeInTheDocument();
  });

  test("Khoa (TECHNICIAN) mở /catalog/products trực tiếp → 403", async () => {
    signedInAs(KHOA);
    renderApp("/catalog/products");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });
});
