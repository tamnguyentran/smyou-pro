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
type AuditEventOut = components["schemas"]["AuditEventOut"];
type Product = components["schemas"]["ProductOut"];

const hoaId = "a0000000-0000-4000-8000-000000000010";
const haId = "a0000000-0000-4000-8000-000000000011";
const khoaId = "a0000000-0000-4000-8000-000000000012";
const anId = "a0000000-0000-4000-8000-000000000013";
const tuanId = "a0000000-0000-4000-8000-000000000014";
const orderId = "b0000000-0000-4000-8000-000000000020";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const own = ["own"];
const assigned = ["assigned"];
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
const HA: Person = {
  code: "NV006",
  full_name: "Trần Thị Hà",
  email: "ha.tran@smyou.vn",
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
const KHOA: Person = {
  code: "NV010",
  full_name: "Lê Văn Khoa",
  email: "khoa.le@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: {
    "dashboard.read": all,
    "order.read": assigned,
    "profile.manage": self,
  },
};
const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "order.create": all,
    "order.edit_draft": all,
    "order.edit_contact": all,
    "order.edit_lines_after_submit": all,
    "customer.read": all,
    "catalog.read": all,
    "profile.manage": self,
  },
};
const TUAN: Person = {
  code: "NV008",
  full_name: "Phạm Quốc Tuấn",
  email: "tuan.pham@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "customer.read": all,
    "catalog.read": all,
    "profile.manage": self,
  },
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    code: "DH2609-0001",
    status: "PENDING_DISPATCH",
    division: null,
    customer_id: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "Lắp đặt camera an ninh",
    priority: "NORMAL",
    requested_date: null,
    subtotal: 0,
    discount_amount: 0,
    vat_amount: 0,
    total: 0,
    payment_status: "UNPAID",
    payment_method: null,
    revision_no: 0,
    created_by: hoaId,
    version: 1,
    lines: [],
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    ...overrides,
  };
}

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: "c0000000-0000-4000-8000-000000000030",
    position: 1,
    item_type: "PRODUCT",
    product_id: "f0000000-0000-4000-8000-000000000050",
    service_id: null,
    sku_snapshot: "LCD-DELL22",
    name_snapshot: "Màn hình Dell 22 inch",
    unit_snapshot: "CAI",
    specs_snapshot: null,
    warranty_months_snapshot: 24,
    catalog_price_snapshot: 3000000,
    price_fixed: true,
    quantity: "1",
    unit_price: 3000000,
    line_discount: 0,
    vat_rate: "10",
    is_gift: false,
    line_gross: 3000000,
    line_vat: 300000,
    line_total: 3300000,
    note: null,
    ...overrides,
  };
}

function pcProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "f0000000-0000-4000-8000-000000000051",
    sku: "PC-I5-12400",
    name: "PC SMYOU CORE I5-12400",
    category: "PC",
    brand: null,
    price: 11_980_000,
    price_fixed: false,
    unit: "CAI",
    vat_rate: "0",
    specs: null,
    warranty_months: 12,
    image_attachment_id: null,
    is_active: true,
    version: 1,
    ...overrides,
  };
}

function historyEvent(overrides: Partial<AuditEventOut> = {}): AuditEventOut {
  return {
    id: "d0000000-0000-4000-8000-000000000040",
    occurred_at: "2026-09-30T03:00:00Z",
    actor: { id: hoaId, code: "NV005", full_name: "Nguyễn Thị Hoa" },
    entity_type: "ORDER",
    entity_id: orderId,
    action: "submit",
    from_status: "DRAFT",
    to_status: "PENDING_DISPATCH",
    data: null,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AC-ORD-064 trang chi tiết", () => {
  test("header mã + badge + khách; tab Thông tin đủ trường; nút Thu hồi/Huỷ đơn hiện theo allowed_commands", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({ allowed_commands: ["recall", "cancel"], requested_date: "2026-11-05" }),
        ),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByText("DH2609-0001")).toBeInTheDocument();
    expect(screen.getByText("Chờ điều phối")).toBeInTheDocument();
    const infoTab = screen.getByRole("tabpanel");
    expect(within(infoTab).getByText("Cty Sáng Tạo Mới")).toBeInTheDocument();
    expect(screen.getByText("12 Lê Lợi, Q1, TP.HCM")).toBeInTheDocument();
    expect(within(infoTab).getByText("05/11/2026")).toBeInTheDocument();
    expect(within(infoTab).queryByText("2026-11-05")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu hồi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ đơn" })).toBeInTheDocument();
  });
});

describe("AC-ORD-065 thu hồi", () => {
  test("xác nhận → recall → hiện lại DraftOrderForm đúng dữ liệu", async () => {
    signedInAs(hoaId, HOA);
    let recalled = false;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["recall", "cancel"] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/recall", () => {
        recalled = true;
        return HttpResponse.json(
          order({ status: "DRAFT", allowed_commands: ["submit", "cancel"], version: 2 }),
        );
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thu hồi" }));
    const dialog = await screen.findByRole("dialog", { name: "Thu hồi đơn?" });
    expect(
      within(dialog).getByText("Thu hồi đơn DH2609-0001 về Nháp để sửa tiếp?"),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Thu hồi" }));

    expect(await screen.findByText("Đã thu hồi đơn DH2609-0001.")).toBeInTheDocument();
    expect(recalled).toBe(true);
    expect(await screen.findByLabelText("Địa chỉ thi công")).toHaveValue("12 Lê Lợi, Q1, TP.HCM");
  });

  test("409 STALE_VERSION → banner đỏ + nút Tải lại (như huỷ đơn, AC-ORD-070)", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["recall", "cancel"] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/recall", () =>
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
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thu hồi" }));
    const dialog = await screen.findByRole("dialog", { name: "Thu hồi đơn?" });
    await user.click(within(dialog).getByRole("button", { name: "Thu hồi" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Thu hồi đơn?" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => {
      expect(
        screen.queryByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
      ).not.toBeInTheDocument();
    });
  });
});

describe("AC-ORD-066 tab dòng hàng", () => {
  test("hiện đúng danh sách dòng chỉ đọc, không có nút thêm/sửa/xoá; tổng tiền theo VAT", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            allowed_commands: ["recall", "cancel"],
            lines: [
              line(),
              line({
                id: "c0000000-0000-4000-8000-000000000031",
                item_type: "CUSTOM",
                product_id: null,
                sku_snapshot: null,
                name_snapshot: "Công tháo dỡ tủ mạng cũ",
                price_fixed: false,
                catalog_price_snapshot: null,
                warranty_months_snapshot: null,
                unit_price: 200000,
                line_gross: 200000,
                line_total: 220000,
                line_vat: 20000,
              }),
            ],
            subtotal: 3200000,
            vat_amount: 320000,
            total: 3520000,
          }),
        ),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));

    expect(await screen.findByText("Màn hình Dell 22 inch")).toBeInTheDocument();
    expect(screen.getByText("Công tháo dỡ tủ mạng cũ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm dòng hàng" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Xoá dòng/)).not.toBeInTheDocument();
    expect(screen.getByTestId("order-totals")).toBeInTheDocument();
  });
});

describe("AC-ORD-067 tab lịch sử", () => {
  test("submit→recall→submit (3 sự kiện, đang PENDING_DISPATCH): timeline mới nhất trước", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["recall", "cancel"] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({
          items: [
            historyEvent({
              id: "e3",
              action: "submit",
              from_status: "DRAFT",
              to_status: "PENDING_DISPATCH",
              occurred_at: "2026-09-30T05:00:00Z",
            }),
            historyEvent({
              id: "e2",
              action: "recall",
              from_status: "PENDING_DISPATCH",
              to_status: "DRAFT",
              occurred_at: "2026-09-30T04:00:00Z",
            }),
            historyEvent({
              id: "e1",
              action: "submit",
              from_status: "DRAFT",
              to_status: "PENDING_DISPATCH",
              occurred_at: "2026-09-30T03:00:00Z",
            }),
          ],
          total: 3,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }));

    const history = await screen.findByLabelText("Lịch sử đơn");
    const items = within(history).getAllByText(/^(Thu hồi|Gửi đơn)$/);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Gửi đơn");
    expect(items[1]).toHaveTextContent("Thu hồi");
    expect(items[2]).toHaveTextContent("Gửi đơn");
    expect(screen.getAllByText("Nguyễn Thị Hoa").length).toBeGreaterThan(0);
  });

  test("hành động ngoài submit/recall/cancel (create, add_line, ...) vẫn hiện nhãn tiếng Việt", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["recall", "cancel"] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({
          items: [
            historyEvent({
              id: "e5",
              action: "add_line",
              from_status: null,
              to_status: null,
              occurred_at: "2026-09-30T02:00:00Z",
            }),
            historyEvent({
              id: "e4",
              action: "create",
              from_status: null,
              to_status: "DRAFT",
              occurred_at: "2026-09-30T01:00:00Z",
            }),
          ],
          total: 2,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }));

    const history = await screen.findByLabelText("Lịch sử đơn");
    expect(within(history).queryByText("create")).not.toBeInTheDocument();
    expect(within(history).queryByText("add_line")).not.toBeInTheDocument();
    expect(within(history).getByText("Tạo đơn")).toBeInTheDocument();
    expect(within(history).getByText("Thêm dòng hàng")).toBeInTheDocument();
  });

  test("lỗi tải lịch sử → thông báo lỗi + nút Thử lại (khác với chưa có lịch sử)", async () => {
    signedInAs(hoaId, HOA);
    let calls = 0;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["recall", "cancel"] })),
      ),
      http.get("/api/v1/orders/:id/history", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ status: 503 }, { status: 503 });
        return HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 });
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }));

    expect(await screen.findByText("Không tải được lịch sử.")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có lịch sử thay đổi.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có lịch sử thay đổi.")).toBeInTheDocument();
  });
});

describe("AC-ORD-068 phân quyền xem", () => {
  test("Hà (SALE khác, allowed_commands=[]) xem đủ 3 tab, không có nút hành động", async () => {
    signedInAs(haId, HA);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ allowed_commands: [] }))),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByRole("tab", { name: "Thông tin" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dòng hàng" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lịch sử" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thu hồi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Huỷ đơn" })).not.toBeInTheDocument();
  });

  test("Khoa (TECHNICIAN, chưa có assignment) → 404", async () => {
    signedInAs(khoaId, KHOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          { status: 404, code: "NOT_FOUND", detail: "Không tìm thấy." },
          { status: 404 },
        ),
      ),
    );
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByText("Không tìm thấy trang.")).toBeInTheDocument();
  });
});

describe("AC-ORD-070 409 STALE_VERSION khi huỷ", () => {
  test("banner đỏ + nút Tải lại, mất nhập liệu lý do đang dở", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["recall", "cancel"] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/cancel", () =>
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
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    const dialog = await screen.findByRole("dialog", { name: "Huỷ đơn DH2609-0001?" });
    await user.type(within(dialog).getByRole("textbox"), "Khách đổi ý");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận huỷ" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Huỷ đơn DH2609-0001?" }),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    const reopened = await screen.findByRole("dialog", { name: "Huỷ đơn DH2609-0001?" });
    expect(within(reopened).getByRole("textbox")).toHaveValue("");
  });
});

describe("AC-ORD-093 sửa liên hệ", () => {
  test("mở Sheet điền sẵn, sửa SĐT + địa chỉ, lưu → PATCH đúng body, toast, tab hiện giá trị mới", async () => {
    signedInAs(hoaId, HOA);
    let patchBody: unknown;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_contact: true, can_edit_lines_after_submit: true })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/contact", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json(
          order({
            can_edit_contact: true,
            can_edit_lines_after_submit: true,
            customer_phone: "0988777666",
            service_address: "20 Nguyễn Huệ, Q1",
            version: 2,
          }),
        );
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sửa liên hệ" }));
    const sheet = await screen.findByRole("dialog", { name: "Sửa liên hệ" });
    expect(within(sheet).getByLabelText("Số điện thoại")).toHaveValue("0909123456");
    await user.clear(within(sheet).getByLabelText("Số điện thoại"));
    await user.type(within(sheet).getByLabelText("Số điện thoại"), "0988777666");
    await user.clear(within(sheet).getByLabelText("Địa chỉ thi công"));
    await user.type(within(sheet).getByLabelText("Địa chỉ thi công"), "20 Nguyễn Huệ, Q1");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã cập nhật liên hệ.")).toBeInTheDocument();
    expect(patchBody).toMatchObject({
      version: 1,
      customer_phone: "0988777666",
      service_address: "20 Nguyễn Huệ, Q1",
      customer_name: "Cty Sáng Tạo Mới",
      customer_email: null,
      customer_tax_code: null,
      work_description: "Lắp đặt camera an ninh",
    });
    expect(screen.queryByRole("dialog", { name: "Sửa liên hệ" })).not.toBeInTheDocument();
    const infoTab = screen.getByRole("tabpanel");
    expect(within(infoTab).getByText("20 Nguyễn Huệ, Q1")).toBeInTheDocument();
    expect(within(infoTab).getByText("0988777666")).toBeInTheDocument();
  });
});

describe("AC-ORD-093/099 sửa liên hệ dùng cùng write queue với sửa dòng hàng", () => {
  test("Lưu liên hệ khi PATCH sửa dòng hàng còn đang chạy → chờ hàng đợi, không PATCH với version cũ", async () => {
    signedInAs(hoaId, HOA);
    let resolveLinePatch: (() => void) | undefined;
    const linePatchGate = new Promise<void>((resolve) => {
      resolveLinePatch = resolve;
    });
    let linePatchBody: unknown;
    let contactPatchBody: unknown;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({ can_edit_contact: true, can_edit_lines_after_submit: true, lines: [line()] }),
        ),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/lines-after-submit/:lineId", async ({ request }) => {
        linePatchBody = await request.json();
        await linePatchGate;
        return HttpResponse.json(
          order({
            can_edit_contact: true,
            can_edit_lines_after_submit: true,
            lines: [line({ quantity: "2" })],
            version: 2,
          }),
        );
      }),
      http.patch("/api/v1/orders/:id/contact", async ({ request }) => {
        contactPatchBody = await request.json();
        return HttpResponse.json(
          order({
            can_edit_contact: true,
            can_edit_lines_after_submit: true,
            customer_phone: "0988777666",
            version: 3,
          }),
        );
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    const row = screen.getByTestId(`order-line-${line().id}`);
    const qty = within(row).getByLabelText("Số lượng");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.tab();
    await waitFor(() => {
      expect(linePatchBody).toBeDefined();
    });

    await user.click(screen.getByRole("tab", { name: "Thông tin" }));
    await user.click(screen.getByRole("button", { name: "Sửa liên hệ" }));
    const sheet = await screen.findByRole("dialog", { name: "Sửa liên hệ" });
    await user.clear(within(sheet).getByLabelText("Số điện thoại"));
    await user.type(within(sheet).getByLabelText("Số điện thoại"), "0988777666");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));

    await Promise.resolve();
    await Promise.resolve();
    expect(contactPatchBody).toBeUndefined();

    resolveLinePatch?.();
    await waitFor(() => {
      expect(contactPatchBody).toBeDefined();
    });
    expect(contactPatchBody).toMatchObject({ version: 2, customer_phone: "0988777666" });
  });
});

describe("AC-ORD-094 validate SĐT/email trước khi gửi", () => {
  test("SĐT/email sai định dạng → lỗi inline, Lưu vô hiệu, chưa gọi API", async () => {
    signedInAs(hoaId, HOA);
    let called = false;
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ can_edit_contact: true }))),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/contact", () => {
        called = true;
        return HttpResponse.json(order({ can_edit_contact: true }));
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sửa liên hệ" }));
    const sheet = await screen.findByRole("dialog", { name: "Sửa liên hệ" });
    await user.clear(within(sheet).getByLabelText("Số điện thoại"));
    await user.type(within(sheet).getByLabelText("Số điện thoại"), "123");
    await user.clear(within(sheet).getByLabelText("Email"));
    await user.type(within(sheet).getByLabelText("Email"), "abc");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));

    expect(
      await within(sheet).findByText("Số điện thoại cần 10 chữ số, bắt đầu bằng 0."),
    ).toBeInTheDocument();
    expect(within(sheet).getByText("Email không hợp lệ.")).toBeInTheDocument();
    expect(called).toBe(false);
    expect(within(sheet).getByRole("button", { name: "Lưu" })).toBeDisabled();
  });
});

describe("AC-ORD-095 ẩn nút Sửa liên hệ theo quyền/trạng thái", () => {
  test("Hà (SALE khác, can_edit_contact=false) không thấy nút Sửa liên hệ", async () => {
    signedInAs(haId, HA);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ can_edit_contact: false }))),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    expect(screen.queryByRole("button", { name: "Sửa liên hệ" })).not.toBeInTheDocument();
  });

  test("Tuấn (TECH_LEAD, can_edit_contact=false) không thấy nút Sửa liên hệ", async () => {
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ can_edit_contact: false }))),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    expect(screen.queryByRole("button", { name: "Sửa liên hệ" })).not.toBeInTheDocument();
  });

  test("An (MANAGER) mở đơn COMPLETED (can_edit_contact=false vì trạng thái) → không thấy nút", async () => {
    signedInAs(anId, AN);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({ status: "COMPLETED", can_edit_contact: false, allowed_commands: [] }),
        ),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    expect(screen.queryByRole("button", { name: "Sửa liên hệ" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Cty Sáng Tạo Mới").length).toBeGreaterThan(0);
  });
});

describe("AC-ORD-096 stale version khi sửa liên hệ", () => {
  test("banner + Tải lại trong sheet; bấm Tải lại đóng sheet và tải lại đơn", async () => {
    signedInAs(hoaId, HOA);
    let getCount = 0;
    server.use(
      http.get("/api/v1/orders/:id", () => {
        getCount += 1;
        return HttpResponse.json(order({ can_edit_contact: true }));
      }),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/contact", () =>
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
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sửa liên hệ" }));
    const sheet = await screen.findByRole("dialog", { name: "Sửa liên hệ" });
    await user.clear(within(sheet).getByLabelText("Số điện thoại"));
    await user.type(within(sheet).getByLabelText("Số điện thoại"), "0988777666");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));

    expect(
      await within(sheet).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    const reloadButton = within(sheet).getByRole("button", { name: "Tải lại" });
    expect(getCount).toBe(1);
    await user.click(reloadButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Sửa liên hệ" })).not.toBeInTheDocument();
    });
    expect(getCount).toBe(2);
  });
});

describe("AC-ORD-097 lỗi field 422 khi sửa liên hệ", () => {
  test("lỗi hiện dưới ô Email, sheet không đóng, dữ liệu khác giữ nguyên", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ can_edit_contact: true }))),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/contact", () =>
        HttpResponse.json(
          {
            status: 422,
            code: "VALIDATION_ERROR",
            detail: "Dữ liệu không hợp lệ.",
            errors: [
              { field: "customer_email", code: "string_too_long", message: "Email quá dài." },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sửa liên hệ" }));
    const sheet = await screen.findByRole("dialog", { name: "Sửa liên hệ" });
    await user.type(within(sheet).getByLabelText("Email"), "a@vi-du-ten-mien-dai.com");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));

    expect(await within(sheet).findByText("Email quá dài.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Sửa liên hệ" })).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Tên khách hàng")).toHaveValue("Cty Sáng Tạo Mới");
  });
});

describe("AC-ORD-098 thêm dòng sau khi gửi", () => {
  test("Thêm dòng hàng hiện khi can_edit_lines_after_submit=true, chọn sản phẩm → POST lines-after-submit", async () => {
    signedInAs(anId, AN);
    let posted = 0;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: true, lines: [line()] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [pcProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-after-submit", () => {
        posted += 1;
        return HttpResponse.json(
          order({
            can_edit_lines_after_submit: true,
            lines: [
              line(),
              line({
                id: "c0000000-0000-4000-8000-000000000032",
                product_id: pcProduct().id,
                sku_snapshot: pcProduct().sku,
                name_snapshot: pcProduct().name,
                catalog_price_snapshot: pcProduct().price,
                price_fixed: false,
                unit_price: pcProduct().price,
                vat_rate: "0",
                line_gross: pcProduct().price,
                line_vat: 0,
                line_total: pcProduct().price,
              }),
            ],
            version: 2,
          }),
          { status: 201 },
        );
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));

    expect(screen.getByRole("button", { name: "Thêm dòng hàng" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(
      await within(sheet).findByRole("button", { name: new RegExp(pcProduct().name) }),
    );

    await waitFor(() => {
      expect(posted).toBe(1);
    });
    expect(await screen.findByText(pcProduct().name)).toBeInTheDocument();
  });
});

describe("AC-ORD-099 sửa số lượng sau khi gửi", () => {
  test("sửa số lượng dòng → PATCH lines-after-submit/{id}, tổng cập nhật theo response", async () => {
    signedInAs(anId, AN);
    let patchedBody: unknown;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: true, lines: [line()] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/lines-after-submit/:lineId", async ({ request }) => {
        patchedBody = await request.json();
        return HttpResponse.json(
          order({
            can_edit_lines_after_submit: true,
            lines: [
              line({
                quantity: "2",
                line_gross: 6_000_000,
                line_vat: 600_000,
                line_total: 6_600_000,
              }),
            ],
            version: 2,
          }),
        );
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    const row = screen.getByTestId(`order-line-${line().id}`);
    const qty = within(row).getByLabelText("Số lượng");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.tab();

    await waitFor(() => {
      expect(patchedBody).toMatchObject({ version: 1, quantity: 2 });
    });
    expect(await within(row).findByText("6.600.000 ₫")).toBeInTheDocument();
  });
});

describe("AC-ORD-100 xoá dòng sau khi gửi", () => {
  test("xác nhận xoá → POST lines-after-submit/{id}/remove, dòng biến mất, toast", async () => {
    signedInAs(anId, AN);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: true, lines: [line()] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-after-submit/:lineId/remove", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: true, lines: [] })),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    const row = screen.getByTestId(`order-line-${line().id}`);
    await user.click(within(row).getByRole("button", { name: `Xoá dòng ${line().name_snapshot}` }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

    expect(await screen.findByText("Đã xoá dòng hàng.")).toBeInTheDocument();
    expect(screen.queryByTestId(`order-line-${line().id}`)).not.toBeInTheDocument();
  });
});

describe("AC-ORD-101 tab dòng hàng chỉ đọc khi không đủ quyền/trạng thái", () => {
  test("Hà (can_edit_lines_after_submit=false) không có nút thêm/sửa/xoá", async () => {
    signedInAs(haId, HA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: false, lines: [line()] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    expect(screen.queryByRole("button", { name: "Thêm dòng hàng" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Số lượng")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Xoá dòng/)).not.toBeInTheDocument();
  });

  test("An mở đơn COMPLETED (can_edit_lines_after_submit=false vì trạng thái) → chỉ đọc", async () => {
    signedInAs(anId, AN);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            status: "COMPLETED",
            can_edit_lines_after_submit: false,
            allowed_commands: [],
            lines: [line()],
          }),
        ),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    expect(screen.queryByRole("button", { name: "Thêm dòng hàng" })).not.toBeInTheDocument();
    expect(screen.getByText(line().name_snapshot)).toBeInTheDocument();
  });
});

describe("AC-ORD-102 422 VAT_REQUIRED_FOR_CUSTOM khi thêm dòng tự do sau khi gửi", () => {
  test("lỗi hiện ở đầu Sheet, sheet vẫn mở, dữ liệu không mất", async () => {
    signedInAs(anId, AN);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: true, lines: [] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines-after-submit", () =>
        HttpResponse.json(
          { status: 422, code: "VAT_REQUIRED_FOR_CUSTOM", detail: "VAT bắt buộc cho dòng tự do." },
          { status: 422 },
        ),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
    const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
    await user.click(within(sheet).getByRole("tab", { name: "Tự do" }));
    await user.type(within(sheet).getByLabelText("Tên"), "Công lắp đặt thêm");
    await user.clear(within(sheet).getByLabelText("Số lượng"));
    await user.type(within(sheet).getByLabelText("Số lượng"), "1");
    await user.type(within(sheet).getByLabelText("Đơn giá"), "200000");
    await user.click(within(sheet).getByRole("radio", { name: "8%" }));
    await user.click(within(sheet).getByRole("button", { name: "Thêm" }));

    expect(await within(sheet).findByText("VAT bắt buộc cho dòng tự do.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Tên")).toHaveValue("Công lắp đặt thêm");
  });
});

describe("AC-ORD-103 stale version khi sửa dòng sau khi gửi", () => {
  test("banner đỏ + nút Tải lại trên tab Dòng hàng (không phải lỗi trong dòng)", async () => {
    signedInAs(anId, AN);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ can_edit_lines_after_submit: true, lines: [line()] })),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:id/lines-after-submit/:lineId", () =>
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
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Dòng hàng" }));
    const row = screen.getByTestId(`order-line-${line().id}`);
    const qty = within(row).getByLabelText("Số lượng");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.tab();

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
    expect(
      within(row).queryByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).not.toBeInTheDocument();
  });
});

describe("AC-ORD-104 nhãn lịch sử mới", () => {
  test("edit_contact/add_line_after_submit/update_line_after_submit/remove_line_after_submit → nhãn tiếng Việt", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ allowed_commands: [] }))),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({
          items: [
            historyEvent({ id: "h1", action: "edit_contact", from_status: null, to_status: null }),
            historyEvent({
              id: "h2",
              action: "add_line_after_submit",
              from_status: null,
              to_status: null,
            }),
            historyEvent({
              id: "h3",
              action: "update_line_after_submit",
              from_status: null,
              to_status: null,
            }),
            historyEvent({
              id: "h4",
              action: "remove_line_after_submit",
              from_status: null,
              to_status: null,
            }),
          ],
          total: 4,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByText("DH2609-0001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }));

    const history = await screen.findByLabelText("Lịch sử đơn");
    expect(within(history).getByText("Sửa liên hệ")).toBeInTheDocument();
    expect(within(history).getByText("Thêm dòng hàng")).toBeInTheDocument();
    expect(within(history).getByText("Sửa dòng hàng")).toBeInTheDocument();
    expect(within(history).getByText("Xoá dòng hàng")).toBeInTheDocument();
    expect(within(history).queryByText("edit_contact")).not.toBeInTheDocument();
  });
});
