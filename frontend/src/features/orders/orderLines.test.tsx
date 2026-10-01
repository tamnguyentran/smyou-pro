import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";

type Order = components["schemas"]["OrderDetail"];
type OrderLine = components["schemas"]["OrderLineOut"];
type Product = components["schemas"]["ProductOut"];

const hoaId = "a0000000-0000-4000-8000-000000000010";
const orderId = "b0000000-0000-4000-8000-000000000020";
const dellLineId = "c0000000-0000-4000-8000-000000000030";
const pcLineId = "c0000000-0000-4000-8000-000000000031";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const own = ["own"];
const self = ["self"];
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "order.create": all,
    "order.edit_draft": own,
    "customer.read": all,
    "catalog.read": all,
    "profile.manage": self,
  },
};

function signedInAsHoa() {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id: hoaId, code: HOA.code, full_name: HOA.full_name, roles: HOA.roles },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: hoaId,
          code: HOA.code,
          full_name: HOA.full_name,
          email: HOA.email,
          title: null,
          department: "SALES",
        },
        roles: HOA.roles,
        capabilities: HOA.capabilities,
        counters: {},
      }),
    ),
  );
  markSignedIn();
}

function dellProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "f0000000-0000-4000-8000-000000000040",
    sku: "LCD-DELL22",
    name: "Màn hình Dell 22 inch",
    category: "MONITOR",
    brand: "Dell",
    price: 2_500_000,
    price_fixed: true,
    unit: "CAI",
    vat_rate: "8",
    specs: null,
    warranty_months: 24,
    image_attachment_id: null,
    is_active: true,
    version: 1,
    ...overrides,
  };
}

function orderLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: dellLineId,
    position: 1,
    item_type: "PRODUCT",
    product_id: dellProduct().id,
    service_id: null,
    sku_snapshot: "LCD-DELL22",
    name_snapshot: "Màn hình Dell 22 inch",
    unit_snapshot: "CAI",
    specs_snapshot: null,
    warranty_months_snapshot: 24,
    catalog_price_snapshot: 2_500_000,
    price_fixed: true,
    vat_rate: "8",
    quantity: "1",
    unit_price: 2_500_000,
    is_gift: false,
    line_discount: 0,
    line_gross: 2_500_000,
    line_vat: 200_000,
    line_total: 2_700_000,
    note: null,
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  const lines = overrides.lines ?? [orderLine()];
  return {
    id: orderId,
    code: "DH2609-0001",
    status: "DRAFT",
    division: null,
    customer_id: null,
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    customer_tax_code: null,
    service_address: "",
    work_description: "",
    priority: "NORMAL",
    requested_date: null,
    subtotal: lines.reduce((sum, l) => sum + l.line_gross, 0),
    discount_amount: lines.reduce((sum, l) => sum + l.line_discount, 0),
    vat_amount: lines.reduce((sum, l) => sum + l.line_vat, 0),
    total: lines.reduce((sum, l) => sum + l.line_total, 0),
    payment_status: "UNPAID",
    payment_method: null,
    revision_no: 0,
    created_by: hoaId,
    version: 1,
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    ...overrides,
    lines,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openExisting(fixture: Order) {
  server.use(http.get("/api/v1/orders/:id", () => HttpResponse.json(fixture)));
  renderApp(`/orders/${orderId}`);
  return screen.findByRole("heading", { level: 1, name: fixture.code });
}

describe("AC-ORD-026 thêm dòng sản phẩm từ tìm kiếm", () => {
  test("tạo nháp ngầm khi chưa có id, thêm dòng chỉ 1 vòng loading", async () => {
    signedInAsHoa();
    let posts = 0;
    let lastProductQuery = "";
    server.use(
      http.post("/api/v1/orders", () => {
        posts += 1;
        return HttpResponse.json(order({ lines: [] }), { status: 201 });
      }),
      http.get("/api/v1/products", ({ request }) => {
        lastProductQuery = new URL(request.url).search;
        return HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 });
      }),
      http.post("/api/v1/orders/:id/lines", () => HttpResponse.json(order(), { status: 201 })),
      // react-query's background refetch for the freshly-created id, once the URL swaps from
      // "/orders/new" to "/orders/:id" — must agree with the POST responses above, not the empty
      // draft, or a refetch that lands after addLine's response would wipe the line back out.
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order())),
    );
    renderApp("/orders/new");
    await screen.findByRole("heading", { level: 1, name: "Tạo đơn mới" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.type(within(sheet).getByLabelText("Tìm sản phẩm"), "dell");
    await waitFor(() => {
      expect(lastProductQuery).toContain("q=dell");
    });
    await user.click(await within(sheet).findByRole("button", { name: /Màn hình Dell 22 inch/ }));

    await waitFor(() => {
      expect(posts).toBe(1);
    });
    expect(await screen.findByText("Màn hình Dell 22 inch")).toBeInTheDocument();
  });
});

describe("AC-ORD-027 dòng giá cố định", () => {
  test("đơn giá khoá readonly + icon Lock; đổi số lượng cập nhật tổng ngay theo response server", async () => {
    signedInAsHoa();
    server.use(
      http.patch("/api/v1/orders/:id/lines/:lineId", () =>
        HttpResponse.json(
          order({
            lines: [
              orderLine({
                quantity: "2",
                // Cố ý khác con số client tự tính (5.000.000 gross · 8% VAT = 5.400.000) để chứng
                // minh dòng hiện đúng số server trả về, không phải chỉ hiện lại preview của chính nó.
                line_gross: 5_000_000,
                line_vat: 400_500,
                line_total: 5_400_500,
              }),
            ],
          }),
        ),
      ),
    );
    await openExisting(order());
    const row = screen.getByTestId(`order-line-${dellLineId}`);

    const priceInput = within(row).getByLabelText("Đơn giá");
    expect(priceInput).toHaveAttribute("readonly");
    // "Giá cố định" appears twice on purpose: next to the item name, and on the price field itself
    // (AC-ORD-027's "ô 'Đơn giá' ... icon Lock + tooltip 'Giá cố định'").
    expect(within(row).getAllByTitle("Giá cố định")).toHaveLength(2);

    const user = userEvent.setup();
    const qty = within(row).getByLabelText("Số lượng");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.tab();
    expect(await within(row).findByText("5.400.500 ₫")).toBeInTheDocument();
  });
});

describe("AC-ORD-028 giảm giá và VAT theo dòng", () => {
  test("sửa giảm giá và đổi VAT cập nhật tổng dòng theo response", async () => {
    signedInAsHoa();
    const pcLine = orderLine({
      id: pcLineId,
      product_id: "pc-id",
      name_snapshot: "PC SMYOU CORE I5-12400",
      sku_snapshot: "PC-I5-12400",
      price_fixed: false,
      vat_rate: "0",
      quantity: "1",
      unit_price: 11_980_000,
      catalog_price_snapshot: 11_980_000,
      line_gross: 11_980_000,
      line_discount: 0,
      line_vat: 0,
      line_total: 11_980_000,
    });
    server.use(
      http.patch("/api/v1/orders/:id/lines/:lineId", async ({ request }) => {
        const body = (await request.json()) as { line_discount?: number; vat_rate?: number };
        if (body.vat_rate === 8) {
          return HttpResponse.json(
            order({
              lines: [
                {
                  ...pcLine,
                  vat_rate: "8",
                  line_discount: 180_000,
                  // Cố ý lệch với số client tự tính (11.800.000 × 8% = 944.000 → 12.744.000) để chứng
                  // minh dòng hiện đúng số server trả về, không phải chỉ hiện lại preview client.
                  line_vat: 944_500,
                  line_total: 12_744_500,
                },
              ],
            }),
          );
        }
        return HttpResponse.json(
          order({
            // Cố ý lệch với số client tự tính (11.980.000 - 180.000 = 11.800.000).
            lines: [{ ...pcLine, line_discount: 180_000, line_total: 11_800_500 }],
          }),
        );
      }),
    );
    await openExisting(order({ lines: [pcLine] }));
    const row = screen.getByTestId(`order-line-${pcLineId}`);
    const user = userEvent.setup();

    const discount = within(row).getByLabelText("Giảm giá");
    await user.clear(discount);
    await user.type(discount, "180000");
    await user.tab();
    expect(await within(row).findByText("11.800.500 ₫")).toBeInTheDocument();

    await user.click(within(row).getByRole("radio", { name: "8%" }));
    expect(await within(row).findByText("12.744.500 ₫")).toBeInTheDocument();

    await user.click(within(row).getByRole("radio", { name: "Khác" }));
    const vatOther = within(row).getByLabelText("VAT khác (%)");
    await user.type(vatOther, "150");
    expect(await within(row).findByText("VAT phải trong khoảng 0-100.")).toBeInTheDocument();

    await user.clear(vatOther);
    await user.type(vatOther, "8.567");
    expect(await within(row).findByText("VAT tối đa 2 chữ số thập phân.")).toBeInTheDocument();
  });
});

describe("AC-ORD-029 Tặng kèm", () => {
  test("bật Tặng kèm khoá đơn giá về 0 và ẩn giảm giá", async () => {
    signedInAsHoa();
    server.use(
      http.patch("/api/v1/orders/:id/lines/:lineId", () =>
        HttpResponse.json(
          order({
            lines: [
              orderLine({
                is_gift: true,
                unit_price: 0,
                line_gross: 0,
                line_vat: 0,
                line_total: 0,
              }),
            ],
          }),
        ),
      ),
    );
    await openExisting(order());
    const row = screen.getByTestId(`order-line-${dellLineId}`);
    const user = userEvent.setup();

    await user.click(within(row).getByLabelText("Tặng kèm"));

    const priceInput = await within(row).findByLabelText("Đơn giá");
    await waitFor(() => {
      expect(priceInput).toHaveValue("0 ₫");
    });
    expect(priceInput).toHaveAttribute("readonly");
    expect(within(row).queryByLabelText("Giảm giá")).not.toBeInTheDocument();
    // "Tặng kèm" appears twice on purpose: the checkbox's own visible text label, and a badge next
    // to the item name (spec's "nhãn 'Tặng kèm' hiện cạnh tên dòng trong bảng").
    expect(within(row).getAllByText("Tặng kèm")).toHaveLength(2);
  });

  test("tắt Tặng kèm trên dòng giá cố định khôi phục lại đúng giá catalog, không kẹt lỗi PRICE_FIXED", async () => {
    signedInAsHoa();
    let lastBody: { is_gift?: boolean; unit_price?: number } | undefined;
    server.use(
      http.patch("/api/v1/orders/:id/lines/:lineId", async ({ request }) => {
        lastBody = (await request.json()) as typeof lastBody;
        if (lastBody?.is_gift) {
          return HttpResponse.json(
            order({
              lines: [
                orderLine({
                  is_gift: true,
                  unit_price: 0,
                  line_gross: 0,
                  line_vat: 0,
                  line_total: 0,
                }),
              ],
            }),
          );
        }
        // Server would reject unit_price=0 on a price-fixed line with 422 PRICE_FIXED — proves the
        // fix actually resends the catalog price, not just that the mock happens to accept anything.
        if (lastBody?.unit_price !== 2_500_000) {
          return HttpResponse.json(
            {
              status: 422,
              code: "PRICE_FIXED",
              detail: "Đơn giá của dòng này cố định theo danh mục.",
            },
            { status: 422 },
          );
        }
        return HttpResponse.json(order({ lines: [orderLine()] }));
      }),
    );
    await openExisting(order());
    const row = screen.getByTestId(`order-line-${dellLineId}`);
    const user = userEvent.setup();

    const giftToggle = within(row).getByLabelText("Tặng kèm");
    await user.click(giftToggle);
    await waitFor(() => {
      expect(giftToggle).toBeChecked();
    });

    await user.click(giftToggle);

    await waitFor(() => {
      expect(giftToggle).not.toBeChecked();
    });
    expect(within(row).queryByText(/PRICE_FIXED|cố định theo danh mục/)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(row).getByLabelText("Đơn giá")).toHaveValue("2.500.000 ₫");
    });
  });
});

describe("AC-ORD-030 thêm dòng tự do", () => {
  test("thêm dòng CUSTOM không có badge Giá cố định, đơn giá sửa tự do", async () => {
    signedInAsHoa();
    server.use(
      http.post("/api/v1/orders/:id/lines", async ({ request }) => {
        const body = (await request.json()) as { item_type: string; name: string };
        expect(body.item_type).toBe("CUSTOM");
        return HttpResponse.json(
          order({
            lines: [
              orderLine({
                id: "custom-1",
                item_type: "CUSTOM",
                product_id: null,
                sku_snapshot: null,
                name_snapshot: body.name,
                unit_snapshot: "LAN",
                price_fixed: false,
                catalog_price_snapshot: null,
                vat_rate: "10",
                quantity: "1",
                unit_price: 500_000,
                line_gross: 500_000,
                line_vat: 50_000,
                line_total: 550_000,
              }),
            ],
          }),
          { status: 201 },
        );
      }),
    );
    await openExisting(order({ lines: [] }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(within(sheet).getByRole("tab", { name: "Tự do" }));
    await user.type(within(sheet).getByLabelText("Tên"), "Công tháo dỡ tủ mạng cũ");
    await user.selectOptions(within(sheet).getByLabelText("Đơn vị"), "LAN");
    await user.clear(within(sheet).getByLabelText("Số lượng"));
    await user.type(within(sheet).getByLabelText("Số lượng"), "1");
    await user.type(within(sheet).getByLabelText("Đơn giá"), "500000");
    await user.click(within(sheet).getByRole("radio", { name: "10%" }));
    await user.click(within(sheet).getByRole("button", { name: "Thêm" }));

    const row = await screen.findByTestId("order-line-custom-1");
    expect(within(row).queryByText("Giá cố định")).not.toBeInTheDocument();
    expect(within(row).getByLabelText("Đơn giá")).not.toHaveAttribute("readonly");
  });
});

describe("AC-ORD-031 tổng tiền theo mức VAT", () => {
  test("nhóm theo VAT khớp số server, tổng cộng đúng", async () => {
    signedInAsHoa();
    const dell = orderLine({
      quantity: "2",
      line_gross: 5_000_000,
      line_discount: 0,
      line_vat: 400_000,
      line_total: 5_400_000,
    });
    const bomMuc = orderLine({
      id: "line-bommuc",
      item_type: "SERVICE",
      product_id: null,
      service_id: "svc-id",
      sku_snapshot: null,
      name_snapshot: "Bơm mực máy in",
      unit_snapshot: "LAN",
      price_fixed: true,
      catalog_price_snapshot: 790_000,
      vat_rate: "8",
      quantity: "1",
      unit_price: 790_000,
      line_gross: 790_000,
      line_discount: 0,
      line_vat: 63_200,
      line_total: 853_200,
    });
    await openExisting(order({ lines: [dell, bomMuc] }));

    const totals = screen.getByTestId("order-totals");
    expect(within(totals).getByText(/Tiền hàng chịu VAT 8%.*5\.790\.000 ₫/)).toBeInTheDocument();
    expect(within(totals).getByText(/VAT 8%.*463\.200 ₫/)).toBeInTheDocument();
    expect(within(totals).getByText("Tổng cộng: 6.253.200 ₫")).toBeInTheDocument();
  });
});

describe("AC-ORD-032 xoá dòng", () => {
  test("ConfirmDialog rồi gọi remove, toast, tổng về 0", async () => {
    signedInAsHoa();
    server.use(
      http.post("/api/v1/orders/:id/lines/:lineId/remove", () =>
        HttpResponse.json(order({ lines: [] })),
      ),
    );
    await openExisting(order());
    const row = screen.getByTestId(`order-line-${dellLineId}`);
    const user = userEvent.setup();

    await user.click(within(row).getByRole("button", { name: "Xoá dòng Màn hình Dell 22 inch" }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
    expect(
      within(dialog).getByText("Xoá dòng Màn hình Dell 22 inch? Không thể hoàn tác."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

    expect(await screen.findByText("Đã xoá dòng hàng.")).toBeInTheDocument();
    expect(screen.queryByTestId(`order-line-${dellLineId}`)).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có dòng hàng nào.")).toBeInTheDocument();
  });

  test("xoá dòng thất bại hiện lỗi, không xoá khỏi màn hình", async () => {
    signedInAsHoa();
    server.use(
      http.post("/api/v1/orders/:id/lines/:lineId/remove", () =>
        HttpResponse.json(
          { status: 409, code: "ORDER_NOT_DRAFT", detail: "Đơn không còn ở trạng thái nháp." },
          { status: 409 },
        ),
      ),
    );
    await openExisting(order());
    const row = screen.getByTestId(`order-line-${dellLineId}`);
    const user = userEvent.setup();

    await user.click(within(row).getByRole("button", { name: "Xoá dòng Màn hình Dell 22 inch" }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

    expect(await within(row).findByText("Đơn không còn ở trạng thái nháp.")).toBeInTheDocument();
    expect(screen.getByTestId(`order-line-${dellLineId}`)).toBeInTheDocument();
  });
});

describe("AC-ORD-027/028 lỗi sửa dòng không bị nuốt thầm", () => {
  test("PATCH giảm giá thất bại (409 STALE_VERSION) hiện lỗi và khôi phục giá trị cũ", async () => {
    signedInAsHoa();
    server.use(
      http.patch("/api/v1/orders/:id/lines/:lineId", () =>
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
    await openExisting(order());
    const row = screen.getByTestId(`order-line-${dellLineId}`);
    const user = userEvent.setup();

    const discount = within(row).getByLabelText("Giảm giá");
    await user.clear(discount);
    await user.type(discount, "100000");
    await user.tab();

    expect(
      await within(row).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(within(row).getByLabelText("Giảm giá")).toHaveValue(0);
    });
  });
});

describe("AC-ORD-033 zod chặn trước, lỗi 422 hiện đúng ô", () => {
  test("số lượng 0 bị chặn ở client, không gọi API", async () => {
    signedInAsHoa();
    let called = false;
    server.use(
      http.post("/api/v1/orders/:id/lines", () => {
        called = true;
        return HttpResponse.json(order(), { status: 201 });
      }),
    );
    await openExisting(order({ lines: [] }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(within(sheet).getByRole("tab", { name: "Tự do" }));
    await user.type(within(sheet).getByLabelText("Tên"), "Công lắp đặt");
    await user.clear(within(sheet).getByLabelText("Số lượng"));
    await user.type(within(sheet).getByLabelText("Số lượng"), "0");
    await user.type(within(sheet).getByLabelText("Đơn giá"), "100000");
    await user.click(within(sheet).getByRole("radio", { name: "8%" }));
    await user.click(within(sheet).getByRole("button", { name: "Thêm" }));

    expect(await within(sheet).findByText("Số lượng phải lớn hơn 0.")).toBeInTheDocument();
    expect(called).toBe(false);
    expect(within(sheet).getByLabelText("Tên")).toHaveValue("Công lắp đặt");
  });

  test("lỗi 422 PRICE_FIXED từ server hiện dưới ô Đơn giá, không mất dữ liệu đã nhập", async () => {
    signedInAsHoa();
    server.use(
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "PRICE_FIXED",
            detail: "Đơn giá của dòng này cố định theo danh mục.",
            errors: [
              {
                field: "unit_price",
                code: "price_fixed",
                message: "Đơn giá của dòng này cố định theo danh mục.",
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    await openExisting(order({ lines: [] }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(within(sheet).getByRole("tab", { name: "Tự do" }));
    await user.type(within(sheet).getByLabelText("Tên"), "Công lắp đặt");
    await user.clear(within(sheet).getByLabelText("Số lượng"));
    await user.type(within(sheet).getByLabelText("Số lượng"), "1");
    await user.type(within(sheet).getByLabelText("Đơn giá"), "999000");
    await user.click(within(sheet).getByRole("radio", { name: "8%" }));
    await user.click(within(sheet).getByRole("button", { name: "Thêm" }));

    expect(
      await within(sheet).findByText("Đơn giá của dòng này cố định theo danh mục."),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Tên")).toHaveValue("Công lắp đặt");
    expect(within(sheet).getByLabelText("Đơn giá")).toHaveValue(999000);
  });

  test("lỗi 409 không gắn với ô nào (STALE_VERSION) vẫn hiện ở đầu Sheet, không bị nuốt thầm", async () => {
    signedInAsHoa();
    server.use(
      http.post("/api/v1/orders/:id/lines", () =>
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
    await openExisting(order({ lines: [] }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(within(sheet).getByRole("tab", { name: "Tự do" }));
    await user.type(within(sheet).getByLabelText("Tên"), "Công lắp đặt");
    await user.clear(within(sheet).getByLabelText("Số lượng"));
    await user.type(within(sheet).getByLabelText("Số lượng"), "1");
    await user.type(within(sheet).getByLabelText("Đơn giá"), "999000");
    await user.click(within(sheet).getByRole("radio", { name: "8%" }));
    await user.click(within(sheet).getByRole("button", { name: "Thêm" }));

    expect(
      await within(sheet).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Tên")).toHaveValue("Công lắp đặt");
  });
});
