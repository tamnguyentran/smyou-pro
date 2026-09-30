import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { ApiError } from "../auth/errors";
import type { ImportPreview } from "./api";

// jsdom's File/FormData cannot round-trip through vitest's fetch shim (a known environment
// limitation, not a product bug — same reason products.test.tsx mocks imageCompression/upload
// rather than exercising real Blob/FormData bytes). We mock the two mutation hooks instead and
// exercise the real `fileLevelErrorMessage`/`importErrorRows` helpers via the mocked rejections;
// the real network round-trip is covered by e2e/catalog-import.spec.ts against a real browser.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, useImportPreview: vi.fn(), useImportCommit: vi.fn() };
});
const { useImportPreview, useImportCommit } = await import("./api");
const mockedPreview = vi.mocked(useImportPreview);
const mockedCommit = vi.mocked(useImportCommit);

function stubPreview(mutateAsync: (file: File) => Promise<ImportPreview>) {
  mockedPreview.mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useImportPreview>);
}
function stubCommit(mutateAsync: (file: File) => Promise<{ created: number }>) {
  mockedCommit.mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useImportCommit>);
}

const id = "9d1f0c2e-0000-4000-8000-000000000009";

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
const TUAN: Person = {
  code: "NV010",
  full_name: "Phạm Văn Tuấn",
  email: "tuan.pham@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: { "dashboard.read": all, "catalog.read": all, "profile.manage": self },
};

function emptyPage() {
  return { items: [], total: 0, limit: 20, offset: 0 };
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
    http.get("/api/v1/products", () => HttpResponse.json(emptyPage())),
    http.get("/api/v1/services", () => HttpResponse.json(emptyPage())),
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

beforeEach(() => {
  stubPreview(() => new Promise(() => undefined));
  stubCommit(() => new Promise(() => undefined));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function csvFile(name = "products_ok.csv"): File {
  return new File(["sku,name,category,unit,price\n"], name, { type: "text/csv" });
}

const ROW_1 = {
  line: 1,
  data: { sku: "MAYBO9101", name: "PC SMYOU CORE I3-12100", category: "PC", price: 8_500_000 },
  errors: null,
};
const ROW_2_VALID = {
  line: 2,
  data: { sku: "LCD9102", name: "Màn hình Dell 24 inch", category: "MONITOR", price: 3_200_000 },
  errors: null,
};
const ROW_2_INVALID = {
  line: 2,
  data: { sku: "LCD9102", name: "Màn hình Dell 24 inch", category: "TIVI", price: 3_200_000 },
  errors: [{ field: "category", code: "invalid_enum", message: "Danh mục không hợp lệ." }],
};
const ROW_3 = {
  line: 3,
  data: {
    sku: "HOPMUC9103",
    name: "Hộp mực Canon 325",
    category: "PRINTER_SUPPLY",
    price: 650_000,
  },
  errors: null,
};

const VALID_PREVIEW: ImportPreview = {
  total: 3,
  valid_count: 3,
  invalid_count: 0,
  rows: [ROW_1, ROW_2_VALID, ROW_3],
};

const INVALID_PREVIEW: ImportPreview = {
  total: 3,
  valid_count: 2,
  invalid_count: 1,
  rows: [ROW_1, ROW_2_INVALID, ROW_3],
};

async function openProductsImport() {
  await screen.findByRole("heading", { level: 1, name: "Sản phẩm" });
  await userEvent.click(await screen.findByRole("button", { name: "Nhập từ CSV" }));
  return screen.findByRole("dialog", { name: "Nhập sản phẩm từ CSV" });
}

describe("AC-CAT-046 bước 1: chọn file", () => {
  test("hiện vùng chọn file, liên kết file mẫu, chú thích giới hạn", async () => {
    signedInAs(AN);
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    expect(within(dialog).getByLabelText("Chọn file")).toBeInTheDocument();
    const link = within(dialog).getByRole("link", { name: "Tải file mẫu" });
    expect(link).toHaveAttribute("href", expect.stringContaining("products_template.csv"));
    expect(within(dialog).getByText("Tối đa 500 dòng, 2MB, mã hoá UTF-8")).toBeInTheDocument();
  });
});

describe("AC-CAT-047 xem trước: mọi dòng hợp lệ", () => {
  test("bảng hợp lệ, nút Xác nhận nhập bật", async () => {
    signedInAs(AN);
    stubPreview(() => Promise.resolve(VALID_PREVIEW));
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("3/3 dòng hợp lệ");
    expect(within(dialog).getByRole("button", { name: "Xác nhận nhập" })).toBeEnabled();
  });
});

describe("AC-CAT-048 xem trước: có dòng lỗi", () => {
  test("badge Lỗi, thông báo dưới ô, nút Xác nhận nhập bị khoá", async () => {
    signedInAs(AN);
    stubPreview(() => Promise.resolve(INVALID_PREVIEW));
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("2/3 dòng hợp lệ · 1 dòng lỗi");
    expect(within(dialog).getByText("Danh mục không hợp lệ.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Xác nhận nhập" })).toBeDisabled();
    expect(within(dialog).getByText("Sửa file gốc và tải lại để nhập.")).toBeInTheDocument();
  });
});

describe("AC-CAT-049 xác nhận nhập thành công", () => {
  test("gọi commit, toast, đóng Sheet", async () => {
    signedInAs(AN);
    stubPreview(() => Promise.resolve(VALID_PREVIEW));
    stubCommit(() => Promise.resolve({ created: 3 }));
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("3/3 dòng hợp lệ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận nhập" }));
    const confirm = await screen.findByRole("dialog", { name: "Xác nhận nhập" });
    expect(confirm.textContent).toContain("Nhập 3 sản phẩm mới vào danh mục?");
    await userEvent.click(within(confirm).getByRole("button", { name: "Xác nhận nhập" }));
    await screen.findByText("Đã nhập 3 sản phẩm.");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Nhập sản phẩm từ CSV" }),
      ).not.toBeInTheDocument();
    });
  });
});

describe("AC-CAT-050 commit trả IMPORT_HAS_ERRORS (dữ liệu đổi giữa 2 lần gọi)", () => {
  test("Sheet không đóng, hiện lại lỗi", async () => {
    signedInAs(AN);
    stubPreview(() => Promise.resolve(VALID_PREVIEW));
    stubCommit(() =>
      Promise.reject(
        new ApiError({
          status: 422,
          code: "IMPORT_HAS_ERRORS",
          detail: "Còn dòng lỗi, chưa nhập được dữ liệu nào.",
          ...INVALID_PREVIEW,
        }),
      ),
    );
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("3/3 dòng hợp lệ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận nhập" }));
    const confirm = await screen.findByRole("dialog", { name: "Xác nhận nhập" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Xác nhận nhập" }));
    await within(dialog).findByText(
      "File có dòng bị lỗi (có thể do dữ liệu vừa thay đổi). Kiểm tra lại bên dưới.",
    );
    expect(within(dialog).getByText("2/3 dòng hợp lệ · 1 dòng lỗi")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});

describe("AC-CAT-051 mã hàng đã tồn tại", () => {
  test("preview báo lỗi taken", async () => {
    signedInAs(AN);
    stubPreview(() =>
      Promise.resolve({
        total: 1,
        valid_count: 0,
        invalid_count: 1,
        rows: [
          {
            line: 1,
            data: { sku: "MAYBO3551", name: "X", category: "PC", price: 1 },
            errors: [{ field: "sku", code: "taken", message: "Mã hàng đã tồn tại." }],
          },
        ],
      }),
    );
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("0/1 dòng hợp lệ · 1 dòng lỗi");
    expect(within(dialog).getByText("Mã hàng đã tồn tại.")).toBeInTheDocument();
  });
});

describe("AC-CAT-052 lỗi cấp file", () => {
  const cases: [string, { code: string; detail: string }, string][] = [
    ["EMPTY_FILE", { code: "EMPTY_FILE", detail: "empty" }, "File không có dữ liệu."],
    [
      "MISSING_COLUMNS",
      { code: "MISSING_COLUMNS", detail: "Thiếu cột bắt buộc: price." },
      "File thiếu cột: price.",
    ],
    [
      "TOO_MANY_ROWS",
      { code: "TOO_MANY_ROWS", detail: "too many" },
      "File có hơn 500 dòng, vui lòng chia nhỏ.",
    ],
    ["INVALID_FILE", { code: "INVALID_FILE", detail: "invalid" }, "File không đúng định dạng CSV."],
    ["FILE_TOO_LARGE", { code: "FILE_TOO_LARGE", detail: "too large" }, "File vượt quá 2MB."],
  ];
  for (const [code, body, message] of cases) {
    test(`AC-CAT-052 ${code} → "${message}"`, async () => {
      signedInAs(AN);
      stubPreview(() => Promise.reject(new ApiError({ status: 422, ...body })));
      renderApp("/catalog/products");
      const dialog = await openProductsImport();
      await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
      await within(dialog).findByText(message);
      expect(within(dialog).getByLabelText("Chọn file")).toBeInTheDocument();
    });
  }
});

describe("AC-CAT-053 phần mở rộng không phải .csv", () => {
  test("chặn ngay ở client (kéo-thả bỏ qua kiểm tra accept của trình duyệt), không gọi API", async () => {
    signedInAs(AN);
    const mutateAsync = vi.fn();
    stubPreview(mutateAsync);
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    const dropzone = within(dialog).getByTestId("catalog-import-dropzone");
    const file = new File(["x"], "products.xlsx", { type: "application/vnd.ms-excel" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await within(dialog).findByText("Chỉ chấp nhận file .csv.");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("AC-CAT-054 chọn file khác", () => {
  test("quay lại bước 1, Sheet vẫn mở", async () => {
    signedInAs(AN);
    stubPreview(() => Promise.resolve(VALID_PREVIEW));
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("3/3 dòng hợp lệ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Chọn file khác" }));
    expect(within(dialog).getByLabelText("Chọn file")).toBeInTheDocument();
    expect(within(dialog).queryByText("3/3 dòng hợp lệ")).not.toBeInTheDocument();
  });
});

describe("AC-CAT-055 không có catalog.manage", () => {
  test("Hoa (SALE) không thấy nút Nhập từ CSV", async () => {
    signedInAs(HOA);
    renderApp("/catalog/products");
    await screen.findByRole("heading", { level: 1, name: "Sản phẩm" });
    expect(screen.queryByRole("button", { name: "Nhập từ CSV" })).not.toBeInTheDocument();
  });

  test("Tuấn (TECH_LEAD) không thấy nút Nhập từ CSV trên Dịch vụ", async () => {
    signedInAs(TUAN);
    renderApp("/catalog/services");
    await screen.findByRole("heading", { level: 1, name: "Dịch vụ" });
    expect(screen.queryByRole("button", { name: "Nhập từ CSV" })).not.toBeInTheDocument();
  });
});

describe("AC-CAT-056 nhập dịch vụ từ CSV", () => {
  test("cùng luồng, endpoint /services/import, toast dịch vụ", async () => {
    signedInAs(AN);
    stubPreview(() =>
      Promise.resolve({
        total: 2,
        valid_count: 2,
        invalid_count: 0,
        rows: [
          {
            line: 1,
            data: { code: "DV-A", name: "A", category: "REPAIR", price: 1 },
            errors: null,
          },
          {
            line: 2,
            data: { code: "DV-B", name: "B", category: "REPAIR", price: 1 },
            errors: null,
          },
        ],
      }),
    );
    stubCommit(() => Promise.resolve({ created: 2 }));
    renderApp("/catalog/services");
    await screen.findByRole("heading", { level: 1, name: "Dịch vụ" });
    await userEvent.click(await screen.findByRole("button", { name: "Nhập từ CSV" }));
    const dialog = await screen.findByRole("dialog", { name: "Nhập dịch vụ từ CSV" });
    expect(within(dialog).getByRole("link", { name: "Tải file mẫu" })).toHaveAttribute(
      "href",
      expect.stringContaining("services_template.csv"),
    );
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile("services_ok.csv"));
    await within(dialog).findByText("2/2 dòng hợp lệ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận nhập" }));
    const confirm = await screen.findByRole("dialog", { name: "Xác nhận nhập" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Xác nhận nhập" }));
    await screen.findByText("Đã nhập 2 dịch vụ.");
  });
});

describe("AC-CAT-057 điện thoại: thẻ thay vì bảng", () => {
  test("bước xem trước hiện danh sách thẻ", async () => {
    mockViewport(false);
    signedInAs(AN);
    stubPreview(() => Promise.resolve(INVALID_PREVIEW));
    renderApp("/catalog/products");
    const dialog = await openProductsImport();
    await userEvent.upload(within(dialog).getByLabelText("Chọn file"), csvFile());
    await within(dialog).findByText("2/3 dòng hợp lệ · 1 dòng lỗi");
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Dòng 2")).toBeInTheDocument();
  });
});
