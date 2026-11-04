import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";

// M19-01b: kỹ thuật viên thêm/sửa/xoá dòng hàng tại hiện trường (`lines-on-site`, M19-01a).

type Order = components["schemas"]["OrderDetail"];
type OrderLine = components["schemas"]["OrderLineOut"];
type Product = components["schemas"]["ProductOut"];
type Service = components["schemas"]["ServiceOut"];

const hoaId = "a0000000-0000-4000-8000-000000000010";
const binhId = "a0000000-0000-4000-8000-000000000016";
const orderId = "b0000000-0000-4000-8000-000000000042";
const hoaLineId = "c0000000-0000-4000-8000-000000000030";
const binhLineId = "c0000000-0000-4000-8000-000000000031";
const SSD = "Ổ cứng SSD Kingston 512GB";

interface Person {
  code: string;
  full_name: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const BINH: Person = {
  code: "NV011",
  full_name: "Nguyễn Văn Bình",
  roles: ["TECHNICIAN"],
  capabilities: {
    "dashboard.read": ["all"],
    "order.read": ["assigned"],
    "order.edit_lines_on_site": ["assigned"],
    "catalog.read": ["all"],
    "profile.manage": ["self"],
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": ["all"],
    "order.read": ["all"],
    "order.edit_lines_after_submit": ["own"],
    "customer.read": ["all"],
    "catalog.read": ["all"],
    "catalog.read_cost": ["all"],
    "profile.manage": ["self"],
  },
};

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
          email: `${person.code}@smyou.vn`,
          title: null,
          department: "TECHNICAL",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
    http.get("/api/v1/orders/:id/history", () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
    ),
  );
  markSignedIn();
}

function hoaLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: hoaLineId,
    position: 1,
    item_type: "PRODUCT",
    product_id: "f0000000-0000-4000-8000-000000000050",
    service_id: null,
    sku_snapshot: "CAM-DAHUA-2MP",
    name_snapshot: "Camera Dahua 2MP",
    unit_snapshot: "CAI",
    specs_snapshot: null,
    warranty_months_snapshot: 24,
    catalog_price_snapshot: 1_000_000,
    cost_price_snapshot: null,
    credited_employee_id: hoaId,
    credited_employee_name: "Nguyễn Thị Hoa",
    added_by_id: hoaId,
    added_by_name: "Nguyễn Thị Hoa",
    added_on_site: false,
    can_edit_on_site: false,
    price_fixed: true,
    quantity: "1",
    unit_price: 1_000_000,
    line_discount: 0,
    vat_rate: "0",
    is_gift: false,
    line_gross: 1_000_000,
    line_vat: 0,
    line_total: 1_000_000,
    note: null,
    ...overrides,
  };
}

function binhLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return hoaLine({
    id: binhLineId,
    position: 2,
    product_id: "f0000000-0000-4000-8000-000000000052",
    sku_snapshot: "SSD-KS-512",
    name_snapshot: SSD,
    catalog_price_snapshot: 1_350_000,
    credited_employee_id: binhId,
    credited_employee_name: "Nguyễn Văn Bình",
    added_by_id: binhId,
    added_by_name: "Nguyễn Văn Bình",
    added_on_site: true,
    can_edit_on_site: true,
    price_fixed: false,
    unit_price: 1_350_000,
    line_gross: 1_350_000,
    line_total: 1_350_000,
    ...overrides,
  });
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    code: "DH2610-0042",
    status: "IN_PROGRESS",
    division_id: null,
    division_name: null,
    customer_id: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "Lắp đặt camera an ninh",
    priority: "NORMAL",
    requested_date: null,
    subtotal: 1_000_000,
    discount_amount: 0,
    vat_amount: 0,
    total: 1_000_000,
    payment_status: "UNPAID",
    payment_method: null,
    csat_rating: null,
    csat_comment: null,
    csat_recorded_by: null,
    csat_recorded_at: null,
    revision_no: 0,
    created_by: hoaId,
    version: 7,
    lines: [hoaLine()],
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_add_lines_on_site: true,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: false,
    has_pending_revision_request: false,
    ...overrides,
  };
}

function ssdProduct(): Product {
  return {
    id: "f0000000-0000-4000-8000-000000000052",
    sku: "SSD-KS-512",
    name: SSD,
    category: "STORAGE",
    brand: "Kingston",
    price: 1_350_000,
    cost_price: null,
    price_fixed: false,
    unit: "CAI",
    vat_rate: "0",
    specs: null,
    warranty_months: 36,
    image_attachment_id: null,
    is_active: true,
    version: 1,
  };
}

function problem(status: number, code: string, detail: string, guard?: string) {
  return HttpResponse.json({ status, code, detail, ...(guard ? { guard } : {}) }, { status });
}

async function openLinesTab() {
  renderApp(`/orders/${orderId}`);
  await screen.findByText("DH2610-0042");
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
  return user;
}

describe("AC-ORD-236 KTV thêm dòng hàng tại hiện trường", () => {
  test("nút Thêm dòng hàng ≥44px → Sheet → chọn SSD gọi lines-on-site (không gọi lines-after-submit), toast", async () => {
    signedInAs(binhId, BINH);
    let onSiteBody: Record<string, unknown> | undefined;
    let afterSubmitCalls = 0;
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order())),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [ssdProduct()], total: 1, limit: 10, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-on-site", async ({ request }) => {
        onSiteBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(order({ version: 8, lines: [hoaLine(), binhLine()] }), {
          status: 201,
        });
      }),
      http.post("/api/v1/orders/:id/lines-after-submit", () => {
        afterSubmitCalls += 1;
        return HttpResponse.json(order(), { status: 201 });
      }),
    );
    const user = await openLinesTab();

    const addButton = screen.getByRole("button", { name: "Thêm dòng hàng" });
    expect(addButton.className).toContain("min-h-11");
    await user.click(addButton);
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(await within(sheet).findByRole("button", { name: new RegExp(SSD) }));

    await waitFor(() => {
      expect(onSiteBody).toBeDefined();
    });
    expect(onSiteBody).toMatchObject({ version: 7, product_id: ssdProduct().id });
    expect(onSiteBody).not.toHaveProperty("credited_employee_id");
    expect(afterSubmitCalls).toBe(0);
    expect(await screen.findByText(/Đã thêm dòng hàng/)).toBeInTheDocument();
  });
});

describe("AC-ORD-237 KTV chưa được thêm/sửa dòng", () => {
  test.each([
    ["phân công còn PENDING", order({ can_add_lines_on_site: false })],
    [
      "đơn AWAITING_CONFIRMATION",
      order({
        status: "AWAITING_CONFIRMATION",
        can_add_lines_on_site: false,
        lines: [hoaLine(), binhLine({ can_edit_on_site: false })],
      }),
    ],
  ])("%s → không có nút Thêm, không dòng nào sửa/xoá được", async (_label, detail) => {
    signedInAs(binhId, BINH);
    server.use(http.get("/api/v1/orders/:id", () => HttpResponse.json(detail)));
    await openLinesTab();

    expect(screen.queryByRole("button", { name: "Thêm dòng hàng" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Số lượng")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xoá dòng/ })).not.toBeInTheDocument();
  });
});

describe("AC-ORD-238 chỉ dòng KTV tự thêm mới sửa/xoá được", () => {
  test("dòng Bình có ô nhập + nút Xoá + huy hiệu + chữ Ghi doanh số; dòng Hoa chỉ đọc", async () => {
    signedInAs(binhId, BINH);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ lines: [hoaLine(), binhLine()] })),
      ),
    );
    await openLinesTab();

    const hoaRow = screen.getByTestId(`order-line-${hoaLineId}`);
    expect(within(hoaRow).queryByLabelText("Số lượng")).not.toBeInTheDocument();
    expect(within(hoaRow).queryByRole("button", { name: /Xoá dòng/ })).not.toBeInTheDocument();
    expect(within(hoaRow).queryByText(/KTV thêm/)).not.toBeInTheDocument();

    const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
    expect(within(binhRow).getByLabelText("Số lượng")).toBeInTheDocument();
    expect(within(binhRow).getByLabelText("Giảm giá")).toBeInTheDocument();
    expect(within(binhRow).getByRole("button", { name: `Xoá dòng ${SSD}` })).toBeInTheDocument();
    expect(within(binhRow).getByText("KTV thêm · Nguyễn Văn Bình")).toBeInTheDocument();
    expect(within(binhRow).getByText("Ghi doanh số: Nguyễn Văn Bình")).toBeInTheDocument();
    expect(within(binhRow).queryByLabelText("Người nhận doanh số")).not.toBeInTheDocument();
  });
});

describe("AC-ORD-239 KTV sửa số lượng và xoá dòng mình thêm", () => {
  test("PATCH lines-on-site {version, quantity 2} → tổng theo server; Xoá → POST .../remove", async () => {
    signedInAs(binhId, BINH);
    let patchBody: Record<string, unknown> | undefined;
    let removed = 0;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ lines: [hoaLine(), binhLine()], total: 2_350_000 })),
      ),
      http.patch("/api/v1/orders/:id/lines-on-site/:lineId", async ({ request, params }) => {
        expect(params.lineId).toBe(binhLineId);
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          order({
            version: 8,
            subtotal: 3_700_000,
            total: 3_700_000,
            lines: [
              hoaLine(),
              binhLine({ quantity: "2", line_gross: 2_700_000, line_total: 2_700_000 }),
            ],
          }),
        );
      }),
      http.post("/api/v1/orders/:id/lines-on-site/:lineId/remove", ({ params }) => {
        expect(params.lineId).toBe(binhLineId);
        removed += 1;
        return HttpResponse.json(order({ version: 9, lines: [hoaLine()] }));
      }),
    );
    const user = await openLinesTab();
    const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
    const qty = within(binhRow).getByLabelText("Số lượng");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.tab();

    await waitFor(() => {
      expect(patchBody).toBeDefined();
    });
    expect(patchBody?.version).toBe(7);
    expect(patchBody?.quantity).toBe(2);
    expect(await screen.findByText("Tổng cộng: 3.700.000 ₫")).toBeInTheDocument();

    await user.click(within(binhRow).getByRole("button", { name: `Xoá dòng ${SSD}` }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
    expect(within(dialog).getByText(`Xoá dòng ${SSD} khỏi đơn?`)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

    await waitFor(() => {
      expect(removed).toBe(1);
    });
    expect(await screen.findByText(/Đã xoá dòng hàng/)).toBeInTheDocument();
    expect(screen.queryByTestId(`order-line-${binhLineId}`)).not.toBeInTheDocument();
  });
});

describe("AC-ORD-240 lỗi server khi KTV thêm/sửa/xoá", () => {
  const guardMsg = "Bạn chỉ thêm/sửa dòng hàng khi đang nhận hoặc thực hiện đầu việc của đơn này.";
  const lockedMsg = "Đơn đã khoá, không sửa dòng hàng được nữa.";
  const notEditableMsg = "Bạn chỉ sửa/xoá được dòng hàng do chính mình thêm.";

  test.each([
    [409, "GUARD_FAILED", guardMsg, "actor_has_active_work_on_order"],
    [409, "ORDER_LOCKED", lockedMsg, undefined],
    [403, "LINE_NOT_EDITABLE", notEditableMsg, undefined],
  ] as const)("thêm → %i %s: toast message server", async (status, code, msg, guard) => {
    signedInAs(binhId, BINH);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order())),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [ssdProduct()], total: 1, limit: 10, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-on-site", () => problem(status, code, msg, guard)),
    );
    const user = await openLinesTab();
    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(await within(sheet).findByRole("button", { name: new RegExp(SSD) }));

    expect(await screen.findByText(msg)).toBeInTheDocument();
  });

  test.each([
    ["sửa", "PATCH", 409, "ORDER_LOCKED", lockedMsg],
    ["sửa", "PATCH", 403, "LINE_NOT_EDITABLE", notEditableMsg],
    ["xoá", "REMOVE", 409, "ORDER_LOCKED", lockedMsg],
    ["xoá", "REMOVE", 403, "LINE_NOT_EDITABLE", notEditableMsg],
  ] as const)("%s → %s %i %s: toast message server", async (_l, op, status, code, msg) => {
    signedInAs(binhId, BINH);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ lines: [hoaLine(), binhLine()] })),
      ),
      http.patch("/api/v1/orders/:id/lines-on-site/:lineId", () => problem(status, code, msg)),
      http.post("/api/v1/orders/:id/lines-on-site/:lineId/remove", () =>
        problem(status, code, msg),
      ),
    );
    const user = await openLinesTab();
    const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
    if (op === "PATCH") {
      const qty = within(binhRow).getByLabelText("Số lượng");
      await user.clear(qty);
      await user.type(qty, "2");
      await user.tab();
    } else {
      await user.click(within(binhRow).getByRole("button", { name: `Xoá dòng ${SSD}` }));
      const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
      await user.click(within(dialog).getByRole("button", { name: "Xoá" }));
    }
    expect(await screen.findByText(msg)).toBeInTheDocument();
  });

  test.each(["ADD", "PATCH", "REMOVE"] as const)(
    "%s → 409 STALE_VERSION → tải lại đơn + toast 'Đơn vừa được người khác cập nhật…'",
    async (op) => {
      signedInAs(binhId, BINH);
      let gets = 0;
      const stale = () =>
        problem(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.");
      server.use(
        http.get("/api/v1/orders/:id", () => {
          gets += 1;
          return HttpResponse.json(order({ lines: [hoaLine(), binhLine()] }));
        }),
        http.get("/api/v1/products", () =>
          HttpResponse.json({ items: [ssdProduct()], total: 1, limit: 10, offset: 0 }),
        ),
        http.post("/api/v1/orders/:id/lines-on-site", stale),
        http.patch("/api/v1/orders/:id/lines-on-site/:lineId", stale),
        http.post("/api/v1/orders/:id/lines-on-site/:lineId/remove", stale),
      );
      const user = await openLinesTab();
      const getsBefore = gets;
      const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
      if (op === "ADD") {
        await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
        const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
        await user.click(await within(sheet).findByRole("button", { name: new RegExp(SSD) }));
      } else if (op === "PATCH") {
        const qty = within(binhRow).getByLabelText("Số lượng");
        await user.clear(qty);
        await user.type(qty, "2");
        await user.tab();
      } else {
        await user.click(within(binhRow).getByRole("button", { name: `Xoá dòng ${SSD}` }));
        const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
        await user.click(within(dialog).getByRole("button", { name: "Xoá" }));
      }

      expect(
        await screen.findByText("Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới."),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(gets).toBeGreaterThan(getsBefore);
      });
    },
  );
});

describe("AC-ORD-241 Sale chủ đơn xem dòng KTV thêm", () => {
  test("huy hiệu hiện; Hoa sửa dòng đó qua lines-after-submit, có ô chọn Người nhận doanh số", async () => {
    signedInAs(hoaId, HOA);
    let afterSubmitPatch = 0;
    let onSitePatch = 0;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            can_add_lines_on_site: false,
            can_edit_lines_after_submit: true,
            lines: [hoaLine(), binhLine({ can_edit_on_site: false })],
          }),
        ),
      ),
      http.patch("/api/v1/orders/:id/lines-after-submit/:lineId", () => {
        afterSubmitPatch += 1;
        return HttpResponse.json(
          order({
            can_add_lines_on_site: false,
            can_edit_lines_after_submit: true,
            version: 8,
            lines: [hoaLine(), binhLine({ can_edit_on_site: false, quantity: "2" })],
          }),
        );
      }),
      http.patch("/api/v1/orders/:id/lines-on-site/:lineId", () => {
        onSitePatch += 1;
        return HttpResponse.json(order());
      }),
    );
    const user = await openLinesTab();
    const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
    expect(within(binhRow).getByText("KTV thêm · Nguyễn Văn Bình")).toBeInTheDocument();
    expect(within(binhRow).getByLabelText("Người nhận doanh số")).toBeInTheDocument();

    const qty = within(binhRow).getByLabelText("Số lượng");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.tab();
    await waitFor(() => {
      expect(afterSubmitPatch).toBe(1);
    });
    expect(onSitePatch).toBe(0);
  });
});

describe("M20-04 KTV — lỗi giữ sheet/dialog, hiện lỗi bên trong", () => {
  const guardMsg = "Bạn chỉ thêm/sửa dòng hàng khi đang nhận hoặc thực hiện đầu việc của đơn này.";
  const lockedMsg = "Đơn đã khoá, không sửa dòng hàng được nữa.";
  const notEditableMsg = "Bạn chỉ sửa/xoá được dòng hàng do chính mình thêm.";
  const staleDetail = "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.";

  async function openAddSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.type(within(sheet).getByLabelText("Tìm sản phẩm"), "ssd");
    return sheet;
  }

  test.each([
    [409, "GUARD_FAILED", guardMsg, "actor_has_active_work_on_order"],
    [409, "ORDER_LOCKED", lockedMsg, undefined],
    [500, "INTERNAL", "Lỗi máy chủ.", undefined],
  ] as const)(
    "AC-UI-060 AC-UI-063 thêm → %i %s: sheet vẫn mở, giữ ô tìm, Alert trong sheet, không toast",
    async (status, code, msg, guard) => {
      signedInAs(binhId, BINH);
      server.use(
        http.get("/api/v1/orders/:id", () => HttpResponse.json(order())),
        http.get("/api/v1/products", () =>
          HttpResponse.json({ items: [ssdProduct()], total: 1, limit: 10, offset: 0 }),
        ),
        http.post("/api/v1/orders/:id/lines-on-site", () => problem(status, code, msg, guard)),
      );
      const user = await openLinesTab();
      const sheet = await openAddSheet(user);
      await user.click(await within(sheet).findByRole("button", { name: new RegExp(SSD) }));

      const alert = await within(sheet).findByRole("alert");
      expect(alert).toHaveTextContent(msg);
      expect(screen.getByRole("dialog", { name: "Thêm dòng hàng" })).toBeInTheDocument();
      expect(within(sheet).getByLabelText("Tìm sản phẩm")).toHaveValue("ssd");
      expect(screen.getAllByText(msg)).toHaveLength(1);
    },
  );

  test("AC-UI-061 on-site: 409 STALE → tải lại ngầm, sheet vẫn mở + Alert; bấm lại gửi version mới → đóng + toast", async () => {
    signedInAs(binhId, BINH);
    let gets = 0;
    const postedVersions: number[] = [];
    server.use(
      http.get("/api/v1/orders/:id", () => {
        gets += 1;
        return HttpResponse.json(order({ version: gets === 1 ? 1 : 4 }));
      }),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [ssdProduct()], total: 1, limit: 10, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-on-site", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        postedVersions.push(body.version);
        if (body.version !== 4) return problem(409, "STALE_VERSION", staleDetail);
        return HttpResponse.json(order({ version: 5 }), { status: 201 });
      }),
    );
    const user = await openLinesTab();
    const sheet = await openAddSheet(user);
    await user.click(await within(sheet).findByRole("button", { name: new RegExp(SSD) }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới. Vui lòng kiểm tra và bấm Thêm lại.",
    );
    expect(within(sheet).getByLabelText("Tìm sản phẩm")).toHaveValue("ssd");
    await waitFor(() => {
      expect(gets).toBeGreaterThan(1);
    });

    await user.click(await within(sheet).findByRole("button", { name: new RegExp(SSD) }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Thêm dòng hàng" })).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Đã thêm dòng hàng.")).toBeInTheDocument();
    expect(postedVersions).toEqual([1, 4]);
  });

  test.each([
    [403, "LINE_NOT_EDITABLE", notEditableMsg],
    [500, "INTERNAL", "Lỗi máy chủ."],
  ] as const)(
    "AC-UI-062 AC-UI-063 xoá → %i %s: dialog vẫn mở, Alert trong dialog, dòng còn",
    async (status, code, msg) => {
      signedInAs(binhId, BINH);
      server.use(
        http.get("/api/v1/orders/:id", () =>
          HttpResponse.json(order({ lines: [hoaLine(), binhLine()] })),
        ),
        http.post("/api/v1/orders/:id/lines-on-site/:lineId/remove", () =>
          problem(status, code, msg),
        ),
      );
      const user = await openLinesTab();
      const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
      await user.click(within(binhRow).getByRole("button", { name: `Xoá dòng ${SSD}` }));
      const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
      await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(msg);
      expect(screen.getByRole("dialog", { name: "Xoá dòng hàng" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Xoá" })).toBeEnabled();
      expect(screen.getByTestId(`order-line-${binhLineId}`)).toBeInTheDocument();
      expect(screen.getAllByText(msg)).toHaveLength(1);
    },
  );

  test("AC-UI-062 xoá → 409 STALE: tải lại ngầm, dialog vẫn mở với 'bấm Xoá lại'; lần 2 thành công → đóng + toast", async () => {
    signedInAs(binhId, BINH);
    let gets = 0;
    const removedVersions: number[] = [];
    server.use(
      http.get("/api/v1/orders/:id", () => {
        gets += 1;
        return HttpResponse.json(
          order({ lines: [hoaLine(), binhLine()], version: gets === 1 ? 1 : 3 }),
        );
      }),
      http.post("/api/v1/orders/:id/lines-on-site/:lineId/remove", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        removedVersions.push(body.version);
        if (body.version !== 3) return problem(409, "STALE_VERSION", staleDetail);
        return HttpResponse.json(order({ lines: [hoaLine()], version: 4 }));
      }),
    );
    const user = await openLinesTab();
    const binhRow = screen.getByTestId(`order-line-${binhLineId}`);
    await user.click(within(binhRow).getByRole("button", { name: `Xoá dòng ${SSD}` }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới. Vui lòng kiểm tra và bấm Xoá lại.",
    );
    await waitFor(() => {
      expect(gets).toBeGreaterThan(1);
    });

    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));
    expect(await screen.findByText("Đã xoá dòng hàng.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Xoá dòng hàng" })).not.toBeInTheDocument();
    });
    expect(removedVersions).toEqual([1, 3]);
  });
});

describe("AC-ORD-264 (M21-08) KTV chọn DV chưa có giá vốn — lỗi ngay dưới ô chọn", () => {
  const costMissing =
    "Sản phẩm/dịch vụ này chưa có giá vốn trong danh mục nên không thể bán. Vui lòng liên hệ Quản lý cập nhật giá vốn.";
  const install: Service = {
    id: "f0000000-0000-4000-8000-000000000061",
    code: "DV-LD01",
    name: "Lắp đặt camera",
    category: "INSTALLATION",
    unit: "LAN",
    price: 155_555,
    cost_price: null,
    price_fixed: false,
    vat_rate: "8",
    description: null,
    default_estimated_hours: null,
    is_active: true,
    version: 1,
  };

  test("422 ITEM_COST_MISSING: sheet vẫn mở, lỗi role=alert màu lỗi dưới ô Tìm dịch vụ, giữ ô tìm, không toast", async () => {
    signedInAs(binhId, BINH);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order())),
      http.get("/api/v1/services", () =>
        HttpResponse.json({ items: [install], total: 1, limit: 10, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-on-site", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "ITEM_COST_MISSING",
            detail: costMissing,
            errors: [{ field: "service_id", code: "cost_missing", message: costMissing }],
          },
          { status: 422 },
        ),
      ),
    );
    const user = await openLinesTab();

    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(within(sheet).getByRole("tab", { name: "Dịch vụ" }));
    const search = within(sheet).getByLabelText("Tìm dịch vụ");
    await user.type(search, "lắp");
    await user.click(await within(sheet).findByRole("button", { name: /Lắp đặt camera/ }));

    const alert = await within(sheet).findByRole("alert");
    expect(alert).toHaveTextContent(costMissing);
    expect(alert.className).toContain("text-urgent-fg");
    expect(search.getAttribute("aria-describedby")).toContain(alert.id);
    expect(search).toHaveAttribute("aria-invalid", "true");
    expect(search.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(costMissing)).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Thêm dòng hàng" })).toBeInTheDocument();
    expect(search).toHaveValue("lắp");
    expect(screen.queryByText(/Đã thêm dòng hàng/)).not.toBeInTheDocument();
  });
});
