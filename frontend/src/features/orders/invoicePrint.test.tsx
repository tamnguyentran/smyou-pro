import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import type { components } from "../../lib/api/schema";
import printCss from "../../styles/index.css?raw";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { InvoicePrint } from "./components/InvoicePrint";

type Order = components["schemas"]["OrderDetail"];
type OrderLine = components["schemas"]["OrderLineOut"];
type InvoicePrintData = components["schemas"]["OrderInvoicePrint"];

const thuyId = "a0000000-0000-4000-8000-000000000005";
const orderId = "b0000000-0000-4000-8000-000000000012";
const all = ["all"];

interface Person {
  code: string;
  full_name: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const THUY: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Thu Thủy",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "order.print": all,
    "order.create": all,
    "order.edit_draft": ["own"],
    "customer.read": all,
    "catalog.read": all,
    "catalog.read_cost": all,
    "profile.manage": ["self"],
  },
};

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    position: 1,
    item_type: "PRODUCT",
    product_id: "f0000000-0000-4000-8000-000000000001",
    service_id: null,
    sku_snapshot: "HOPMUC3053",
    name_snapshot: "HOP MUC SMYOU 107A (W1107A)",
    unit_snapshot: "CAI",
    specs_snapshot: null,
    warranty_months_snapshot: null,
    catalog_price_snapshot: 550_000,
    cost_price_snapshot: null,
    credited_employee_id: null,
    credited_employee_name: null,
    added_by_id: null,
    added_by_name: null,
    added_on_site: false,
    can_edit_on_site: false,
    price_fixed: false,
    vat_rate: "0",
    quantity: "1",
    unit_price: 550_000,
    is_gift: false,
    line_discount: 0,
    line_gross: 550_000,
    line_vat: 0,
    line_total: 550_000,
    note: null,
    ...overrides,
  };
}

const GIFT = line({
  id: "c0000000-0000-4000-8000-000000000002",
  position: 2,
  sku_snapshot: "LT9601",
  name_snapshot: "VO HOP MUC SMYOU",
  catalog_price_snapshot: 0,
  unit_price: 0,
  is_gift: true,
  line_gross: 0,
  line_total: 0,
  note: "Quà tặng",
});

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    code: "DH2609-0012",
    status: "IN_PROGRESS",
    division_id: "g1",
    division_name: "Máy in",
    customer_id: null,
    customer_name: "KHÁCH LẺ - BP MÁY IN",
    customer_phone: "0903667344",
    customer_email: "khachle@example.com",
    customer_tax_code: "0312345678",
    service_address: "45 Nguyễn Huệ, Q1, TP.HCM",
    work_description: "ANH THANH TUẤN - 0903.667.344",
    priority: "NORMAL",
    requested_date: null,
    subtotal: 550_000,
    discount_amount: 0,
    vat_amount: 0,
    total: 550_000,
    payment_status: "UNPAID",
    payment_method: null,
    csat_rating: null,
    csat_comment: null,
    csat_recorded_by: null,
    csat_recorded_at: null,
    revision_no: 0,
    created_by: thuyId,
    version: 3,
    lines: [line(), GIFT],
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_add_lines_on_site: false,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: false,
    has_pending_revision_request: false,
    ...overrides,
  };
}

// Backend nhúng logo dạng data URL (Sale không có quyền đọc /attachments).
const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function printData(overrides: Partial<InvoicePrintData> = {}): InvoicePrintData {
  return {
    company: {
      name: "CÔNG TY TNHH SMYOU",
      tax_code: "0309390732",
      address: "8C/A-9C/A Nguyễn Ảnh Thủ, Khu Phố 1, P. Trung Mỹ Tây, TP.HCM",
      phone: "0932068787",
      fax: "02862533978",
      email: "kimyensmyou@gmail.com",
      website: "http://smyou.vn",
      logo_url: LOGO_DATA_URL,
    },
    issuer_name: "Nguyễn Thị Thu Thủy",
    // 24/09/2026 10:00 giờ VN.
    printed_at: "2026-09-24T03:00:00Z",
    slip_no: "24-XBH24092026",
    ...overrides,
  };
}

function signedInAs(id: string, person: Person) {
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
          email: null,
          title: null,
          department: "SALES",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
  );
  markSignedIn();
}

function serveOrder(data: Order) {
  server.use(
    http.get("/api/v1/orders/:id", () => HttpResponse.json(data)),
    http.get("/api/v1/orders/:id/history", () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
    ),
    http.get("/api/v1/orders/:id/confirmation-attachments", () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
    ),
    http.get("/api/v1/product-service-groups", () =>
      HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0 }),
    ),
  );
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

/** Body row `index` (0 = header row) of the only table under `container`. */
function row(container: HTMLElement, index: number): HTMLElement {
  const found = within(container).getAllByRole("row")[index];
  if (!found) throw new Error(`row ${String(index)} missing`);
  return found;
}

afterEach(() => {
  // The browser fires this when the print dialog closes; jsdom never does, so close it here or a
  // sheet printed by one test would still be on <body> in the next.
  window.dispatchEvent(new Event("afterprint"));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AC-ORD-207 nút In trên desktop", () => {
  test("AC-ORD-207 1440px: chi tiết đơn có nút In (icon Printer, cao ≥ 44px)", async () => {
    mockViewport(true);
    signedInAs(thuyId, THUY);
    serveOrder(order());
    renderApp(`/orders/${orderId}`);

    // First app render in this file (cold module graph + refresh → /me → order): allow for a busy CI box.
    const button = await screen.findByRole("button", { name: "In" }, { timeout: 3000 });
    expect(button.className).toMatch(/min-h-11/);
    expect(button.querySelector("svg.lucide-printer")).not.toBeNull();
  });

  test("AC-ORD-207 không có quyền order.print → không có nút In", async () => {
    mockViewport(true);
    const capabilities = { ...THUY.capabilities };
    delete capabilities["order.print"];
    signedInAs(thuyId, { ...THUY, capabilities });
    serveOrder(order());
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByText("DH2609-0012")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "In" })).not.toBeInTheDocument();
  });
});

describe("AC-ORD-208 không render nút In dưới 1024px", () => {
  test("AC-ORD-208 chi tiết đơn ở 390px/768px không có nút In trong DOM", async () => {
    mockViewport(false);
    signedInAs(thuyId, THUY);
    serveOrder(order());
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByText("DH2609-0012")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "In", hidden: true })).not.toBeInTheDocument();
  });

  test("AC-ORD-208 màn sửa đơn nháp ở 390px/768px không có nút In trong DOM", async () => {
    mockViewport(false);
    signedInAs(thuyId, THUY);
    serveOrder(order({ status: "DRAFT", allowed_commands: ["submit", "cancel"] }));
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByRole("button", { name: "Lưu nháp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "In", hidden: true })).not.toBeInTheDocument();
  });

  test("AC-ORD-208 media query đúng mốc desktop của AppShell", async () => {
    const queries: string[] = [];
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        queries.push(query);
        return {
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        };
      }),
    );
    signedInAs(thuyId, THUY);
    serveOrder(order());
    renderApp(`/orders/${orderId}`);

    await screen.findByRole("button", { name: "In" });
    expect(queries).toContain("(min-width: 1024px)");
  });
});

describe("AC-ORD-206 đơn đã huỷ", () => {
  test("AC-ORD-206 chi tiết đơn CANCELLED không hiện nút In", async () => {
    mockViewport(true);
    signedInAs(thuyId, THUY);
    serveOrder(order({ status: "CANCELLED" }));
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByText("DH2609-0012")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "In" })).not.toBeInTheDocument();
  });
});

describe("AC-ORD-209 in đơn nháp đã lưu", () => {
  test("AC-ORD-209 bấm In → gọi API in rồi window.print với dữ liệu đã lưu", async () => {
    mockViewport(true);
    signedInAs(thuyId, THUY);
    serveOrder(order({ status: "DRAFT", allowed_commands: ["submit", "cancel"] }));
    let calls = 0;
    server.use(
      http.get("/api/v1/orders/:id/invoice-print", ({ params }) => {
        calls += 1;
        expect(params.id).toBe(orderId);
        return HttpResponse.json(printData());
      }),
    );
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderApp(`/orders/${orderId}`);
    const user = userEvent.setup();

    const button = await screen.findByRole("button", { name: "In" });
    expect(button).not.toBeDisabled();
    await user.click(button);

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    expect(calls).toBe(1);
    const sheet = screen.getByTestId("invoice-print");
    expect(within(sheet).getByText("HÓA ĐƠN BÁN HÀNG")).toBeInTheDocument();
    expect(within(sheet).getByText("24-XBH24092026")).toBeInTheDocument();
    expect(within(sheet).getByText("HOP MUC SMYOU 107A (W1107A)")).toBeInTheDocument();
  });

  test("AC-ORD-209 lỗi API → toast, không mở hộp thoại in", async () => {
    mockViewport(true);
    signedInAs(thuyId, THUY);
    serveOrder(order());
    server.use(
      http.get("/api/v1/orders/:id/invoice-print", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Error", status: 500, code: "INTERNAL" },
          { status: 500 },
        ),
      ),
    );
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderApp(`/orders/${orderId}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "In" }));

    expect(
      await screen.findByText("Không tải được dữ liệu in. Vui lòng thử lại."),
    ).toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });
});

describe("AC-ORD-210 chưa lưu thì không in", () => {
  test("AC-ORD-210 đơn nháp có thay đổi chưa lưu → nút In vô hiệu + gợi ý", async () => {
    mockViewport(true);
    signedInAs(thuyId, THUY);
    serveOrder(order({ status: "DRAFT", allowed_commands: ["submit", "cancel"] }));
    renderApp(`/orders/${orderId}`);
    const user = userEvent.setup();

    expect(await screen.findByRole("button", { name: "In" })).not.toBeDisabled();
    await user.type(screen.getByLabelText("Địa chỉ thi công"), " (tầng 2)");

    expect(screen.getByRole("button", { name: "In" })).toBeDisabled();
    expect(screen.getByText("Lưu đơn trước khi in")).toBeInTheDocument();
  });

  test("AC-ORD-210 đơn mới chưa lưu lần nào → nút In vô hiệu + gợi ý", async () => {
    mockViewport(true);
    signedInAs(thuyId, THUY);
    serveOrder(order());
    renderApp("/orders/new");

    expect(await screen.findByRole("button", { name: "In" })).toBeDisabled();
    expect(screen.getByText("Lưu đơn trước khi in")).toBeInTheDocument();
  });
});

describe("AC-ORD-211 nội dung bản in", () => {
  test("AC-ORD-211 tiêu đề, khối khách hàng, Số phiếu/Loại tiền, bảng 8 cột và dòng hàng", () => {
    render(<InvoicePrint order={order()} data={printData()} />);
    const sheet = screen.getByTestId("invoice-print");

    expect(within(sheet).getByText("HÓA ĐƠN BÁN HÀNG")).toBeInTheDocument();
    expect(within(sheet).getByText("CÔNG TY TNHH SMYOU")).toBeInTheDocument();
    expect(within(sheet).getByText("24-XBH24092026")).toBeInTheDocument();
    expect(within(sheet).getByText("VND")).toBeInTheDocument();
    expect(within(sheet).getByText("KHÁCH LẺ - BP MÁY IN")).toBeInTheDocument();
    expect(within(sheet).getByText("45 Nguyễn Huệ, Q1, TP.HCM")).toBeInTheDocument();
    expect(within(sheet).getByText("0312345678")).toBeInTheDocument();
    expect(within(sheet).getByText("0903667344")).toBeInTheDocument();
    expect(within(sheet).getByText("khachle@example.com")).toBeInTheDocument();
    expect(within(sheet).getByText("ANH THANH TUẤN - 0903.667.344")).toBeInTheDocument();
    for (const label of [
      "Tên khách hàng",
      "Địa chỉ",
      "Mã số thuế",
      "Điện thoại",
      "Email",
      "Diễn giải",
      "Số phiếu",
      "Loại tiền",
    ]) {
      expect(within(sheet).getByText(`${label}:`)).toBeInTheDocument();
    }

    const table = within(sheet).getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Stt",
      "Mã hàng",
      "Tên hàng",
      "ĐVT",
      "SL",
      "Đơn giá",
      "VAT (%)",
      "Chiết khấu",
      "Thành tiền (Chưa VAT)",
      "Tiền VAT",
      "Thành tiền có VAT",
    ]);
    expect(
      within(row(table, 1))
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9=5x6", "10=7x(9-8)", "11=9-8+10"]);
    expect(
      within(row(table, 2))
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual([
      "1",
      "HOPMUC3053",
      "HOP MUC SMYOU 107A (W1107A)",
      "Cái",
      "1",
      "550.000",
      "0",
      "0",
      "550.000",
      "0",
      "550.000",
    ]);
    expect(
      within(row(table, 3))
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["2", "LT9601", "VO HOP MUC SMYOU", "Cái", "1", "0", "0", "0", "0", "0", "0"]);
  });

  test("AC-ORD-211 Mã hàng/ĐVT/cột số không xuống dòng, Tên hàng được xuống dòng", () => {
    render(<InvoicePrint order={order()} data={printData()} />);
    const table = within(screen.getByTestId("invoice-print")).getByRole("table");
    const cells = within(row(table, 2)).getAllByRole("cell");

    // Cột 2 (Mã hàng), 4 (ĐVT), 5–11 (số) giữ một dòng; cột 3 (Tên hàng) được xuống dòng.
    for (const index of [1, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(cells[index]).toHaveClass("whitespace-nowrap");
    }
    expect(cells[2]).not.toHaveClass("whitespace-nowrap");
  });

  test("AC-ORD-211 số lượng lẻ hiện dấu phẩy", () => {
    render(
      <InvoicePrint
        order={order({ lines: [line({ quantity: "1.5", line_gross: 825_000 })] })}
        data={printData()}
      />,
    );
    const first = row(screen.getByRole("table"), 2);

    expect(within(first).getAllByRole("cell")[4]).toHaveTextContent(/^1,5$/);
    expect(within(first).getAllByRole("cell")[8]).toHaveTextContent(/^825\.000$/);
  });

  test("AC-ORD-211 Chiết khấu trước Thành tiền chưa VAT; Tiền VAT = VAT × (9 − 8); 11 = 9 − 8 + 10", () => {
    render(
      <InvoicePrint
        order={order({
          lines: [
            // 550.000 − 50.000 = 500.000; VAT 8% = 40.000; có VAT = 540.000.
            line({ vat_rate: "8", line_discount: 50_000, line_vat: 40_000, line_total: 540_000 }),
            { ...GIFT, vat_rate: "5.25" },
          ],
        })}
        data={printData()}
      />,
    );
    const table = screen.getByRole("table");
    const cells = (index: number) =>
      within(row(table, index))
        .getAllByRole("cell")
        .map((td) => td.textContent)
        .slice(6);

    expect(cells(2)).toEqual(["8", "50.000", "550.000", "40.000", "540.000"]);
    expect(cells(3)).toEqual(["5,25", "0", "0", "0", "0"]);
  });
});

describe("AC-ORD-212 tổng tiền", () => {
  const value = (label: string) =>
    within(screen.getByTestId("invoice-totals")).getByText(label).parentElement?.lastElementChild
      ?.textContent;

  test("AC-ORD-212 đơn mẫu (không VAT/chiết khấu) vẫn đủ 4 dòng tổng, bằng chữ theo dòng cuối", () => {
    render(<InvoicePrint order={order()} data={printData()} />);

    expect(value("Tổng tiền chưa có VAT:")).toBe("550.000");
    expect(value("Tổng chiết khấu:")).toBe("0");
    expect(value("Tổng tiền VAT:")).toBe("0");
    expect(value("Tổng tiền thanh toán đã có VAT:")).toBe("550.000");
    expect(within(screen.getByTestId("invoice-totals")).getAllByText(/:$/)).toHaveLength(4);
    expect(screen.getByText("Năm trăm năm mươi ngàn đồng")).toBeInTheDocument();
  });

  test("AC-ORD-212 chiết khấu 50.000 + VAT 8% → 550.000 − 50.000 + 40.000 = 540.000", () => {
    render(
      <InvoicePrint
        order={order({
          subtotal: 550_000,
          discount_amount: 50_000,
          vat_amount: 40_000,
          total: 540_000,
        })}
        data={printData()}
      />,
    );

    expect(value("Tổng tiền chưa có VAT:")).toBe("550.000");
    expect(value("Tổng chiết khấu:")).toBe("50.000");
    expect(value("Tổng tiền VAT:")).toBe("40.000");
    expect(value("Tổng tiền thanh toán đã có VAT:")).toBe("540.000");
    expect(screen.getByText("Năm trăm bốn mươi ngàn đồng")).toBeInTheDocument();
  });
});

describe("AC-ORD-214 ngày và chữ ký", () => {
  test("AC-ORD-214 ngày xuất, dòng ngày ký, Người nhận/Người lập + tên người lập", () => {
    render(<InvoicePrint order={order()} data={printData()} />);
    const sheet = screen.getByTestId("invoice-print");

    expect(within(sheet).getByText("Ngày xuất:")).toBeInTheDocument();
    expect(within(sheet).getByText("24/09/2026")).toBeInTheDocument();
    expect(within(sheet).getByText("Ngày 24 tháng 09 năm 2026")).toBeInTheDocument();
    expect(within(sheet).getByText("Người nhận")).toBeInTheDocument();
    expect(within(sheet).getByText("Người lập")).toBeInTheDocument();
    expect(within(sheet).getAllByText("(Ký, ghi rõ họ tên)")).toHaveLength(2);
    expect(within(sheet).getByText("Nguyễn Thị Thu Thủy")).toBeInTheDocument();
  });

  test("AC-ORD-214 ngày theo giờ Việt Nam (23:30 UTC = sáng hôm sau)", () => {
    render(
      <InvoicePrint order={order()} data={printData({ printed_at: "2026-09-23T23:30:00Z" })} />,
    );

    expect(screen.getByText("24/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Ngày 24 tháng 09 năm 2026")).toBeInTheDocument();
  });
});

describe("AC-ORD-215 CSS in A5", () => {
  test("AC-ORD-215 25 dòng hàng: đủ 25 hàng, tiêu đề cột lặp lại (thead table-header-group)", () => {
    const lines = Array.from({ length: 25 }, (_, i) =>
      line({
        id: `c0000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
        position: i + 1,
      }),
    );
    render(<InvoicePrint order={order({ lines })} data={printData()} />);
    const table = screen.getByRole("table");

    // 2 header rows (tiêu đề + đánh số cột) + 25 dòng hàng.
    expect(within(table).getAllByRole("row")).toHaveLength(27);
    expect(table.querySelector("thead")?.className).toMatch(/table-header-group/);
  });

  test("AC-ORD-215 @page A5 ngang; khi in chỉ bản in hiện, ẩn app shell", () => {
    render(<InvoicePrint order={order()} data={printData()} />);

    expect(printCss).toMatch(/@page\s*{[^}]*size:\s*A5 landscape/);
    expect(printCss).toMatch(/@media print/);
    expect(printCss).toMatch(/#root/);
    expect(screen.getByTestId("invoice-print").className).toMatch(/invoice-print/);
  });
});

describe("AC-ORD-216 thiếu logo/Fax", () => {
  test("AC-ORD-216 không logo, không fax → không có ảnh và không có mục Fax", () => {
    const data = printData();
    render(
      <InvoicePrint
        order={order()}
        data={{ ...data, company: { ...data.company, logo_url: null, fax: null } }}
      />,
    );
    const sheet = screen.getByTestId("invoice-print");

    expect(within(sheet).queryByRole("img")).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/Fax/)).not.toBeInTheDocument();
    expect(within(sheet).getByText("CÔNG TY TNHH SMYOU")).toBeInTheDocument();
  });

  test("AC-ORD-216 có logo + fax → hiện ảnh logo và Fax", () => {
    render(<InvoicePrint order={order()} data={printData()} />);
    const sheet = screen.getByTestId("invoice-print");

    expect(within(sheet).getByRole("img")).toHaveAttribute("src", LOGO_DATA_URL);
    expect(within(sheet).getByText(/Fax:\s*02862533978/)).toBeInTheDocument();
  });
});
