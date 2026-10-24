import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";

type Order = components["schemas"]["OrderDetail"];
type Customer = components["schemas"]["CustomerOut"];
type OrderLine = components["schemas"]["OrderLineOut"];
type Product = components["schemas"]["ProductOut"];

const meId = "9d1f0c2e-0000-4000-8000-000000000003";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const haId = "a0000000-0000-4000-8000-000000000011";
const orderId = "b0000000-0000-4000-8000-000000000020";
const customerId = "e0000000-0000-4000-8000-000000000007";

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
    "customer.read": all,
    "catalog.read": all,
    "profile.manage": self,
  },
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: customerId,
    code: "KH00001",
    type: "COMPANY",
    name: "Cty Sáng Tạo Mới",
    contact_person: null,
    contact_person_phone: null,
    phone: "0909123456",
    email: null,
    tax_code: null,
    address: "12 Lê Lợi, Q1, TP.HCM",
    note: null,
    founded_date: null,
    director_name: null,
    director_phone: null,
    it_contact_name: null,
    it_contact_phone: null,
    date_of_birth: null,
    gender: null,
    occupation: null,
    created_by: meId,
    version: 1,
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
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
    subtotal: 0,
    discount_amount: 0,
    vat_amount: 0,
    total: 0,
    payment_status: "UNPAID",
    payment_method: null,
    csat_rating: null,
    csat_comment: null,
    csat_recorded_by: null,
    csat_recorded_at: null,
    revision_no: 0,
    created_by: hoaId,
    version: 1,
    lines: [],
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: false,
    has_pending_revision_request: false,
    ...overrides,
  };
}

function dellProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "f0000000-0000-4000-8000-000000000040",
    sku: "LCD-DELL22",
    name: "Màn hình Dell 22 inch",
    category: "MONITOR",
    brand: "Dell",
    price: 2_500_000,
    cost_price: 2_000_000,
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
    id: "c0000000-0000-4000-8000-000000000030",
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
    cost_price_snapshot: null,
    credited_employee_id: null,
    credited_employee_name: null,
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

async function openForm(title = "Tạo đơn mới") {
  return screen.findByRole("heading", { level: 1, name: title });
}

describe("AC-ORD-024 mở trang tạo đơn", () => {
  test("hiện đủ trường thông tin đơn và CTA Thêm dòng hàng ở trạng thái rỗng", async () => {
    signedInAs(hoaId, HOA);
    renderApp("/orders/new");
    await openForm();

    expect(screen.getByLabelText("Phòng phụ trách")).toBeInTheDocument();
    expect(screen.getByLabelText("Địa chỉ thi công")).toBeInTheDocument();
    expect(screen.getByLabelText("Mô tả công việc")).toBeInTheDocument();
    expect(screen.getByLabelText("Ngày hẹn")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Độ ưu tiên" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Bình thường" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Tìm khách hàng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Khách lẻ" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có dòng hàng nào.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm dòng hàng" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeInTheDocument();
  });
});

const HELPER_BOTH = "Cần chọn khách hàng và thêm ít nhất 1 dòng hàng để lưu đơn.";
const HELPER_CUSTOMER = "Cần chọn khách hàng.";
const HELPER_LINE = "Cần thêm ít nhất 1 dòng hàng.";

async function addDellLine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
  const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
  await user.type(within(sheet).getByLabelText("Tìm sản phẩm"), "dell");
  await user.click(await within(sheet).findByRole("button", { name: /Màn hình Dell 22 inch/ }));
  expect(await screen.findByText("Màn hình Dell 22 inch")).toBeInTheDocument();
}

async function pickExistingCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tìm khách hàng"), "sáng tạo");
  await user.click(await screen.findByRole("option", { name: /Cty Sáng Tạo Mới/ }));
}

describe("AC-ORD-158..166 disable Lưu nháp/Gửi đơn khi thiếu thông tin", () => {
  test("AC-ORD-158 chưa chọn khách, chưa có dòng hàng → Lưu nháp disabled, helper đủ 2 phần", async () => {
    signedInAs(hoaId, HOA);
    renderApp("/orders/new");
    await openForm();

    const saveBtn = screen.getByRole("button", { name: "Lưu nháp" });
    expect(saveBtn).toBeDisabled();
    expect(saveBtn).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(HELPER_BOTH)).toBeInTheDocument();
  });

  test("AC-ORD-159 đã chọn khách, chưa có dòng → disabled, helper chỉ thiếu dòng hàng", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/customers", () =>
        HttpResponse.json({ items: [customer()], total: 1, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await pickExistingCustomer(user);

    const saveBtn = screen.getByRole("button", { name: "Lưu nháp" });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(HELPER_LINE)).toBeInTheDocument();
  });

  test("AC-ORD-160 có 1 dòng hàng, chưa chọn khách → disabled, helper chỉ thiếu khách hàng", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.post("/api/v1/orders", () => HttpResponse.json(order({ lines: [] }), { status: 201 })),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(order({ lines: [orderLine()] }), { status: 201 }),
      ),
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ lines: [orderLine()] }))),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await addDellLine(user);

    const saveBtn = screen.getByRole("button", { name: "Lưu nháp" });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(HELPER_CUSTOMER)).toBeInTheDocument();
  });

  test("AC-ORD-161 đủ khách + dòng hàng → enabled, hết helper, bấm lưu được", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/customers", () =>
        HttpResponse.json({ items: [customer()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [] }), { status: 201 }),
      ),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] }), {
          status: 201,
        }),
      ),
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] })),
      ),
      http.patch("/api/v1/orders/:id", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        return HttpResponse.json(
          order({ customer_id: customerId, lines: [orderLine()], version: body.version + 1 }),
        );
      }),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await pickExistingCustomer(user);
    await addDellLine(user);

    const saveBtn = screen.getByRole("button", { name: "Lưu nháp" });
    expect(saveBtn).not.toBeDisabled();
    expect(screen.queryByText(HELPER_BOTH)).not.toBeInTheDocument();
    expect(screen.queryByText(HELPER_CUSTOMER)).not.toBeInTheDocument();
    expect(screen.queryByText(HELPER_LINE)).not.toBeInTheDocument();

    await user.click(saveBtn);
    expect(await screen.findByText("Đã lưu nháp DH2609-0001.")).toBeInTheDocument();
  });

  test("AC-ORD-162 xoá dòng duy nhất → Lưu nháp quay lại disabled ngay trên UI", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/customers", () =>
        HttpResponse.json({ items: [customer()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [] }), { status: 201 }),
      ),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] }), {
          status: 201,
        }),
      ),
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] })),
      ),
      http.post("/api/v1/orders/:id/lines/:lineId/remove", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [] })),
      ),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await pickExistingCustomer(user);
    await addDellLine(user);
    const row = screen.getByTestId(`order-line-${orderLine().id}`);
    expect(screen.getByRole("button", { name: "Lưu nháp" })).not.toBeDisabled();

    await user.click(within(row).getByRole("button", { name: /Xoá dòng/ }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá dòng hàng" });
    await user.click(within(dialog).getByRole("button", { name: "Xoá" }));

    expect(await screen.findByText("Đã xoá dòng hàng.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();
    expect(screen.getByText(HELPER_LINE)).toBeInTheDocument();
  });

  test("AC-ORD-163 đơn DRAFT thiếu khách/dòng → nút Gửi đơn cũng disabled cùng điều kiện", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["submit", "cancel"] })),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    const submitBtn = screen.getByRole("button", { name: "Gửi đơn" });
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(HELPER_BOTH)).toBeInTheDocument();
  });

  test("AC-ORD-164 đủ điều kiện nhưng allowed_commands không có submit → không hiện nút Gửi đơn", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            customer_id: customerId,
            customer_name: "Cty Sáng Tạo Mới",
            customer_phone: "0909123456",
            lines: [orderLine()],
            allowed_commands: ["cancel"],
          }),
        ),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    expect(screen.queryByRole("button", { name: "Gửi đơn" })).not.toBeInTheDocument();
  });

  test("AC-ORD-165 Khách lẻ chỉ điền tên, thiếu SĐT → vẫn disabled, helper thiếu khách hàng", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order({ lines: [orderLine()] }))),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Khách lẻ" }));
    await user.type(screen.getByLabelText("Tên khách hàng"), "Khách lẻ ABC");

    const saveBtn = screen.getByRole("button", { name: "Lưu nháp" });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(HELPER_CUSTOMER)).toBeInTheDocument();
  });
});

describe("AC-ORD-167..169 điều kiện enable Huỷ đơn (amendment)", () => {
  test("AC-ORD-167 thêm dòng tạo nháp ngầm nhưng chưa Lưu nháp → Huỷ đơn disabled", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.post("/api/v1/orders", () =>
        HttpResponse.json(order({ lines: [], allowed_commands: ["cancel"] }), { status: 201 }),
      ),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(order({ lines: [orderLine()], allowed_commands: ["cancel"] }), {
          status: 201,
        }),
      ),
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ lines: [orderLine()], allowed_commands: ["cancel"] })),
      ),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await addDellLine(user);

    const cancelBtn = screen.getByRole("button", { name: "Huỷ đơn" });
    expect(cancelBtn).toBeDisabled();
    expect(cancelBtn).toHaveAttribute("aria-disabled", "true");

    await user.click(cancelBtn);
    expect(screen.queryByRole("dialog", { name: /Huỷ đơn/ })).not.toBeInTheDocument();
  });

  test("AC-ORD-168 sau khi Lưu nháp thành công → Huỷ đơn enabled ngay trên UI", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/customers", () =>
        HttpResponse.json({ items: [customer()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders", () =>
        HttpResponse.json(
          order({ customer_id: customerId, lines: [], allowed_commands: ["cancel"] }),
          { status: 201 },
        ),
      ),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(
          order({ customer_id: customerId, lines: [orderLine()], allowed_commands: ["cancel"] }),
          { status: 201 },
        ),
      ),
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({ customer_id: customerId, lines: [orderLine()], allowed_commands: ["cancel"] }),
        ),
      ),
      http.patch("/api/v1/orders/:id", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        return HttpResponse.json(
          order({
            customer_id: customerId,
            lines: [orderLine()],
            allowed_commands: ["cancel"],
            version: body.version + 1,
          }),
        );
      }),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await pickExistingCustomer(user);
    await addDellLine(user);

    const cancelBtn = screen.getByRole("button", { name: "Huỷ đơn" });
    expect(cancelBtn).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(await screen.findByText("Đã lưu nháp DH2609-0001.")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Huỷ đơn" })).not.toBeDisabled();
  });

  test("AC-ORD-169 mở lại đơn nháp đã lưu từ trước → Huỷ đơn enabled ngay, không cần Lưu nháp lại", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["submit", "cancel"] })),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    expect(screen.getByRole("button", { name: "Huỷ đơn" })).not.toBeDisabled();
  });
});

describe("AC-ORD-025 tìm khách hoặc Khách lẻ", () => {
  test("tìm theo tên sau 300ms, chọn khách hiện SĐT/địa chỉ tham khảo", async () => {
    signedInAs(hoaId, HOA);
    let lastQuery = "";
    server.use(
      http.get("/api/v1/customers", ({ request }) => {
        lastQuery = new URL(request.url).search;
        return HttpResponse.json({ items: [customer()], total: 1, limit: 20, offset: 0 });
      }),
    );
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Tìm khách hàng"), "sáng tạo");
    expect(lastQuery).not.toContain("q=s%C3%A1ng"); // chưa gọi — đang debounce
    await waitFor(() => {
      expect(lastQuery).toContain("q=");
    });
    await user.click(await screen.findByRole("option", { name: /Cty Sáng Tạo Mới/ }));

    expect(screen.getByText("0909123456")).toBeInTheDocument();
    expect(screen.getByText("12 Lê Lợi, Q1, TP.HCM")).toBeInTheDocument();
  });

  test("bấm + Khách lẻ ẩn ô tìm, hiện tên/SĐT nhập tay", async () => {
    signedInAs(hoaId, HOA);
    renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Khách lẻ" }));
    expect(screen.queryByLabelText("Tìm khách hàng")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tên khách hàng")).toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại")).toBeInTheDocument();
  });

  test("mở lại đơn đã có khách hàng hiện đúng tên trong ô tìm, không rơi vào Khách lẻ", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            customer_id: customerId,
            customer_name: "Cty Sáng Tạo Mới",
            customer_phone: "0909123456",
          }),
        ),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    expect(screen.getByLabelText("Tìm khách hàng")).toHaveValue("Cty Sáng Tạo Mới");
    expect(screen.getByText("0909123456")).toBeInTheDocument();
  });
});

describe("AC-ORD-034 lưu nháp", () => {
  test("dòng đầu tiên tạo nháp ngầm (POST /orders, đổi URL); Lưu nháp sau đó PATCH, không tạo trùng", async () => {
    signedInAs(hoaId, HOA);
    let posts = 0;
    let patches = 0;
    server.use(
      http.get("/api/v1/customers", () =>
        HttpResponse.json({ items: [customer()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders", () => {
        posts += 1;
        return HttpResponse.json(order({ customer_id: customerId, lines: [] }), { status: 201 });
      }),
      http.get("/api/v1/products", () =>
        HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/orders/:id/lines", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] }), {
          status: 201,
        }),
      ),
      // react-query's background refetch for the id we just navigated to (same order route, no
      // remount); it agrees with the POST/PATCH responses below, like a real server would. A late
      // refetch carrying an older snapshot is M3-07's case (AC-ORD-119) and is ignored there.
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] })),
      ),
      http.patch("/api/v1/orders/:id", async ({ request }) => {
        patches += 1;
        const body = (await request.json()) as { service_address?: string; version: number };
        return HttpResponse.json(
          order({
            customer_id: customerId,
            lines: [orderLine()],
            service_address: body.service_address,
            version: 2,
          }),
        );
      }),
    );
    const router = renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await pickExistingCustomer(user);
    await addDellLine(user);
    expect(posts).toBe(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orders/${orderId}`);
    });

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(await screen.findByText("Đã lưu nháp DH2609-0001.")).toBeInTheDocument();
    expect(patches).toBe(1);
    expect(posts).toBe(1);

    await user.type(screen.getByLabelText("Địa chỉ thi công"), "12 Lê Lợi");
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    await waitFor(() => {
      expect(patches).toBe(2);
    });
    expect(posts).toBe(1);
  });
});

describe("AC-ORD-035 409 STALE_VERSION", () => {
  test("hiện banner đỏ + nút Tải lại, cảnh báo trước khi mất thay đổi chưa lưu", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ customer_id: customerId, lines: [orderLine()] })),
      ),
      http.patch("/api/v1/orders/:id", () =>
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
    await openForm("DH2609-0001");
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Địa chỉ thi công"), "12 Lê Lợi");
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    const reload = screen.getByRole("button", { name: "Tải lại" });
    await user.click(reload);
    expect(
      await screen.findByText(
        "Bạn có thay đổi chưa lưu. Tải lại sẽ mất các thay đổi này, tiếp tục?",
      ),
    ).toBeInTheDocument();
  });
});

describe("AC-ORD-036 đơn không còn DRAFT", () => {
  test("hiện trang chi tiết (OrderDetailTabs), không cho sửa, không gọi PATCH/thêm dòng", async () => {
    signedInAs(hoaId, HOA);
    let patched = false;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ status: "PENDING_DISPATCH", allowed_commands: [] })),
      ),
      http.patch("/api/v1/orders/:id", () => {
        patched = true;
        return HttpResponse.json(order());
      }),
    );
    renderApp(`/orders/${orderId}`);

    expect(await screen.findByRole("tab", { name: "Thông tin" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Địa chỉ thi công")).not.toBeInTheDocument();
    expect(patched).toBe(false);
  });
});

describe("AC-ORD-037 phân quyền own/all trên đơn nháp", () => {
  test("Hà (SALE khác) chỉ xem, không có nút sửa", async () => {
    signedInAs(haId, HA);
    server.use(http.get("/api/v1/orders/:id", () => HttpResponse.json(order())));
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    expect(screen.queryByRole("button", { name: "Thêm dòng hàng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu nháp" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Địa chỉ thi công")).not.toBeInTheDocument();
  });

  test("An (MANAGER) mở cùng đơn → đầy đủ quyền sửa", async () => {
    signedInAs("a0000000-0000-4000-8000-000000000001", AN);
    server.use(http.get("/api/v1/orders/:id", () => HttpResponse.json(order())));
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    expect(screen.getByRole("button", { name: "Thêm dòng hàng" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeInTheDocument();
    expect(screen.getByLabelText("Địa chỉ thi công")).toBeInTheDocument();
  });
});

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

describe("AC-ORD-038 bố cục 390px/1440px", () => {
  test("nút Lưu nháp dính đáy; khung 2 cột luôn có sẵn trong DOM cho breakpoint lg", async () => {
    signedInAs(hoaId, HOA);
    renderApp("/orders/new");
    await openForm();

    expect(screen.getByTestId("draft-order-save-bar").className).toMatch(/sticky/);
    expect(screen.getByTestId("draft-order-layout").className).toMatch(/lg:grid-cols-2/);
  });

  test("mobile: tạo đơn mới mặc định mở Section 1", async () => {
    mockViewport(false);
    signedInAs(hoaId, HOA);
    renderApp("/orders/new");
    await openForm();

    expect(screen.getByLabelText("Địa chỉ thi công")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thông tin đơn" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("mobile: mở lại đơn đã lưu mặc định thu gọn Section 1, bấm để mở", async () => {
    mockViewport(false);
    signedInAs(hoaId, HOA);
    server.use(http.get("/api/v1/orders/:id", () => HttpResponse.json(order())));
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    const toggle = screen.getByRole("button", { name: "Thông tin đơn" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Địa chỉ thi công")).not.toBeVisible();

    const user = userEvent.setup();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Địa chỉ thi công")).toBeVisible();
  });

  test("desktop: Section 1 luôn hiện, không phụ thuộc trạng thái accordion", async () => {
    mockViewport(true);
    signedInAs(hoaId, HOA);
    server.use(http.get("/api/v1/orders/:id", () => HttpResponse.json(order())));
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");

    expect(screen.getByLabelText("Địa chỉ thi công")).toBeVisible();
  });
});

describe("AC-ORD-061 gửi đơn", () => {
  test("xác nhận → submit → chuyển sang trang chi tiết (badge Chờ điều phối)", async () => {
    signedInAs(hoaId, HOA);
    let submitted = false;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            customer_id: customerId,
            lines: [orderLine()],
            allowed_commands: ["submit", "cancel"],
          }),
        ),
      ),
      http.post("/api/v1/orders/:id/submit", () => {
        submitted = true;
        return HttpResponse.json(
          order({
            status: "PENDING_DISPATCH",
            allowed_commands: ["recall", "cancel"],
            version: 2,
          }),
        );
      }),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Gửi đơn" }));
    const dialog = await screen.findByRole("dialog", { name: "Gửi đơn?" });
    expect(
      within(dialog).getByText("Gửi đơn DH2609-0001 tới Quản lý kỹ thuật?"),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Gửi đơn" }));

    expect(await screen.findByText("Đã gửi đơn DH2609-0001.")).toBeInTheDocument();
    expect(submitted).toBe(true);
    expect(await screen.findByRole("tab", { name: "Thông tin" })).toBeInTheDocument();
    expect(screen.getByText("Chờ điều phối")).toBeInTheDocument();
  });
});

describe("AC-ORD-062 guard gửi đơn", () => {
  test.each([
    ["customer_present", "Đơn cần có khách hàng trước khi gửi."],
    ["has_lines_or_description", "Đơn cần có ít nhất 1 dòng hàng hoặc mô tả công việc."],
    ["service_address_present", "Đơn cần có địa chỉ thi công."],
  ])("guard=%s → toast lỗi đúng nội dung, vẫn ở lại form", async (guard, message) => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(
          order({
            customer_id: customerId,
            lines: [orderLine()],
            allowed_commands: ["submit", "cancel"],
          }),
        ),
      ),
      http.post("/api/v1/orders/:id/submit", () =>
        HttpResponse.json(
          { status: 409, code: "GUARD_FAILED", detail: message, guard },
          { status: 409 },
        ),
      ),
    );
    renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Gửi đơn" }));
    const dialog = await screen.findByRole("dialog", { name: "Gửi đơn?" });
    await user.click(within(dialog).getByRole("button", { name: "Gửi đơn" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Địa chỉ thi công")).toBeInTheDocument();
  });
});

describe("AC-ORD-063 huỷ đơn nháp", () => {
  test("nhập lý do ≥5 ký tự mới bấm được Xác nhận huỷ → cancel → về /orders", async () => {
    signedInAs(hoaId, HOA);
    let cancelled = false;
    let sentReason = "";
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ allowed_commands: ["submit", "cancel"] })),
      ),
      http.post("/api/v1/orders/:id/cancel", async ({ request }) => {
        cancelled = true;
        const body = (await request.json()) as { reason?: string };
        sentReason = body.reason ?? "";
        return HttpResponse.json(order({ status: "CANCELLED", allowed_commands: [], version: 2 }));
      }),
    );
    const router = renderApp(`/orders/${orderId}`);
    await openForm("DH2609-0001");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    const dialog = await screen.findByRole("dialog", { name: `Huỷ đơn DH2609-0001?` });
    const confirmBtn = within(dialog).getByRole("button", { name: "Xác nhận huỷ" });
    expect(confirmBtn).toBeDisabled();

    const textarea = within(dialog).getByRole("textbox");
    await user.type(textarea, "Huỷ");
    expect(confirmBtn).toBeDisabled();
    // AC-ORD-063 boundary: đúng 4 ký tự vẫn khoá, đúng 5 ký tự thì mở (không phải 6).
    await user.type(textarea, "1");
    expect(confirmBtn).toBeDisabled();
    await user.type(textarea, "2");
    expect(confirmBtn).not.toBeDisabled();
    await user.clear(textarea);
    await user.type(textarea, "Huỷ vì khách đổi ý không mua nữa");
    expect(confirmBtn).not.toBeDisabled();
    await user.click(confirmBtn);

    expect(await screen.findByText("Đã huỷ đơn DH2609-0001.")).toBeInTheDocument();
    expect(cancelled).toBe(true);
    expect(sentReason.length).toBeGreaterThanOrEqual(5);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/orders");
    });
  });
});
