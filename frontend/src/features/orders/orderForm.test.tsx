import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";

type Order = components["schemas"]["OrderDetail"];
type Customer = components["schemas"]["CustomerOut"];

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
    phone: "0909123456",
    email: null,
    tax_code: null,
    address: "12 Lê Lợi, Q1, TP.HCM",
    note: null,
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
    revision_no: 0,
    created_by: hoaId,
    version: 1,
    lines: [],
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
});

describe("AC-ORD-034 lưu nháp", () => {
  test("lần đầu POST /orders, đổi URL, toast; lần sau PATCH không tạo trùng", async () => {
    signedInAs(hoaId, HOA);
    let posts = 0;
    let patches = 0;
    server.use(
      http.post("/api/v1/orders", () => {
        posts += 1;
        return HttpResponse.json(order(), { status: 201 });
      }),
      http.patch("/api/v1/orders/:id", async ({ request }) => {
        patches += 1;
        const body = (await request.json()) as { service_address?: string; version: number };
        return HttpResponse.json(order({ service_address: body.service_address, version: 2 }));
      }),
    );
    const router = renderApp("/orders/new");
    await openForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(await screen.findByText("Đã lưu nháp DH2609-0001.")).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orders/${orderId}`);
    });
    expect(posts).toBe(1);

    await user.type(screen.getByLabelText("Địa chỉ thi công"), "12 Lê Lợi");
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    await waitFor(() => {
      expect(patches).toBe(1);
    });
    expect(posts).toBe(1);
  });
});

describe("AC-ORD-035 409 STALE_VERSION", () => {
  test("hiện banner đỏ + nút Tải lại, cảnh báo trước khi mất thay đổi chưa lưu", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders/:id", () => HttpResponse.json(order())),
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
  test("hiện thông báo, không cho sửa, không gọi PATCH/thêm dòng", async () => {
    signedInAs(hoaId, HOA);
    let patched = false;
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(order({ status: "PENDING_DISPATCH" })),
      ),
      http.patch("/api/v1/orders/:id", () => {
        patched = true;
        return HttpResponse.json(order());
      }),
    );
    renderApp(`/orders/${orderId}`);

    expect(
      await screen.findByText("Đơn DH2609-0001 đã được gửi, không thể sửa ở đây."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về Tổng quan" })).toBeInTheDocument();
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

describe("AC-ORD-038 bố cục 390px/1440px", () => {
  test("nút Lưu nháp dính đáy; khung 2 cột luôn có sẵn trong DOM cho breakpoint lg", async () => {
    signedInAs(hoaId, HOA);
    renderApp("/orders/new");
    await openForm();

    expect(screen.getByTestId("draft-order-save-bar").className).toMatch(/sticky/);
    expect(screen.getByTestId("draft-order-layout").className).toMatch(/lg:grid-cols-2/);
  });
});
