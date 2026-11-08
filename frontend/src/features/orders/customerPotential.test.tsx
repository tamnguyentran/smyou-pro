import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

// M21-05b: khối "Tiềm năng sử dụng dịch vụ" trên `/orders/:id` (KTV tới đây từ "Việc của tôi" → Chi tiết).

type Order = components["schemas"]["OrderDetail"];
type PotentialNote = components["schemas"]["CustomerPotentialNoteOut"];

const khangId = "a0000000-0000-4000-8000-000000000021";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const orderId = "b0000000-0000-4000-8000-000000000105";
const minhPhatId = "c0000000-0000-4000-8000-000000000105";

const KHANG: Person = {
  code: "NV021",
  full_name: "Trần Minh Khang",
  email: "khang.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: {
    "dashboard.read": ["all"],
    "order.read": ["assigned"],
    "customer.potential.record": ["assigned"],
    "profile.manage": ["self"],
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": ["all"],
    "order.read": ["all"],
    "customer.read": ["all"],
    "profile.manage": ["self"],
  },
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    code: "DH2611-0005",
    status: "IN_PROGRESS",
    division_id: null,
    division_name: null,
    customer_id: minhPhatId,
    customer_name: "Công ty TNHH Minh Phát",
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
    version: 3,
    lines: [],
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

function note(overrides: Partial<PotentialNote> = {}): PotentialNote {
  return {
    id: "d0000000-0000-4000-8000-000000000105",
    customer_id: minhPhatId,
    order_id: orderId,
    order_code: "DH2611-0005",
    source: "ORDER",
    note: "Muốn lắp thêm 4 camera kho",
    author_id: khangId,
    author_name: "Trần Minh Khang",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockOrder(notes: PotentialNote[], current: Order = order()) {
  server.use(
    http.get("/api/v1/orders/:id", () => HttpResponse.json(current)),
    http.get("/api/v1/orders/:id/history", () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
    ),
    http.get("/api/v1/orders/:id/confirmation-attachments", () => HttpResponse.json({ items: [] })),
    http.get("/api/v1/orders/:id/customer-potential", () => HttpResponse.json(notes)),
  );
}

async function openOrder() {
  renderApp(`/orders/${orderId}`);
  await screen.findByText("DH2611-0005");
  return screen.findByRole("region", { name: "Tiềm năng sử dụng dịch vụ" });
}

describe("Tiềm năng sử dụng dịch vụ trên chi tiết đơn", () => {
  test("AC-CUS-052 KTV, KH chưa có ghi chú → 'Chưa có ghi nhận' + nút 'Ghi tiềm năng' ≥44px", async () => {
    signedInAs(khangId, KHANG);
    mockOrder([]);
    const block = await openOrder();

    expect(await within(block).findByText("Chưa có ghi nhận")).toBeInTheDocument();
    const button = within(block).getByRole("button", { name: "Ghi tiềm năng" });
    expect(button.className).toContain("min-h-11");
  });

  test("AC-CUS-053 nhập ghi chú → Lưu gọi POST, modal đóng, toast, khối hiện ghi chú mới + 'Khang · vừa xong'", async () => {
    signedInAs(khangId, KHANG);
    let notes: PotentialNote[] = [];
    let body: unknown;
    mockOrder(notes);
    server.use(
      http.get("/api/v1/orders/:id/customer-potential", () => HttpResponse.json(notes)),
      http.post("/api/v1/orders/:id/customer-potential", async ({ request }) => {
        body = await request.json();
        const created = note();
        notes = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const block = await openOrder();
    const user = userEvent.setup();

    await user.click(await within(block).findByRole("button", { name: "Ghi tiềm năng" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Tiềm năng sử dụng dịch vụ — Công ty TNHH Minh Phát",
    });
    await user.type(within(dialog).getByRole("textbox"), "Muốn lắp thêm 4 camera kho");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(body).toEqual({ note: "Muốn lắp thêm 4 camera kho" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Đã ghi tiềm năng khách hàng")).toBeInTheDocument();
    expect(await within(block).findByText("Muốn lắp thêm 4 camera kho")).toBeInTheDocument();
    expect(within(block).getByText(/Trần Minh Khang · vừa xong/i)).toBeInTheDocument();
  });

  test("AC-CUS-054 Lưu khi ô trống / > 1000 ký tự → không gọi API, báo lỗi; bộ đếm n/1000", async () => {
    signedInAs(khangId, KHANG);
    let posts = 0;
    mockOrder([]);
    server.use(
      http.post("/api/v1/orders/:id/customer-potential", () => {
        posts += 1;
        return HttpResponse.json(note(), { status: 201 });
      }),
    );
    const block = await openOrder();
    const user = userEvent.setup();

    await user.click(await within(block).findByRole("button", { name: "Ghi tiềm năng" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("0/1000")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Vui lòng nhập nội dung")).toBeInTheDocument();

    const textbox = within(dialog).getByRole("textbox");
    await user.clear(textbox);
    await user.click(textbox);
    await user.paste("a".repeat(1001));
    expect(within(dialog).getByText("1001/1000")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await within(dialog).findByText("Tối đa 1000 ký tự")).toBeInTheDocument();
    expect(posts).toBe(0);

    // Boundary: exactly 1000 characters is accepted.
    await user.type(textbox, "{Backspace}");
    expect(within(dialog).getByText("1000/1000")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    await waitFor(() => {
      expect(posts).toBe(1);
    });
  });

  test("AC-CUS-055 server 409 (đơn đã hoàn tất) → modal giữ mở, hiện lỗi", async () => {
    signedInAs(khangId, KHANG);
    mockOrder([]);
    server.use(
      http.post("/api/v1/orders/:id/customer-potential", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "GUARD_FAILED",
            detail: "Đơn đã hoàn tất hoặc đã huỷ, không thể ghi tiềm năng khách hàng.",
            guard: "order_open_for_potential_note",
          },
          { status: 409 },
        ),
      ),
    );
    const block = await openOrder();
    const user = userEvent.setup();

    await user.click(await within(block).findByRole("button", { name: "Ghi tiềm năng" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "Hỏi giá máy in màu");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(
      await within(dialog).findByText("Đơn đã hoàn tất hoặc huỷ, không ghi thêm được"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("AC-CUS-056 KH có 2 ghi chú → 'Xem lịch sử (2)' liệt kê mới nhất trước: nội dung, người ghi, mã đơn, giờ VN", async () => {
    signedInAs(khangId, KHANG);
    mockOrder([
      note({
        id: "d0000000-0000-4000-8000-000000000002",
        note: "Muốn lắp thêm 4 camera kho",
        created_at: "2026-11-05T02:30:00Z",
      }),
      note({
        id: "d0000000-0000-4000-8000-000000000001",
        order_id: "b0000000-0000-4000-8000-000000000102",
        order_code: "DH2610-0002",
        note: "Hỏi giá máy in màu",
        author_id: "a0000000-0000-4000-8000-000000000022",
        author_name: "Lê Văn Đức",
        created_at: "2026-10-01T09:15:00Z",
      }),
    ]);
    const block = await openOrder();
    const user = userEvent.setup();

    await user.click(await within(block).findByRole("button", { name: "Xem lịch sử (2)" }));
    const items = within(
      within(block).getByRole("list", { name: "Lịch sử tiềm năng" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [newest, oldest] = items as [HTMLElement, HTMLElement];
    expect(newest).toHaveTextContent("Muốn lắp thêm 4 camera kho");
    expect(newest).toHaveTextContent("Trần Minh Khang");
    expect(newest).toHaveTextContent("DH2611-0005");
    expect(newest).toHaveTextContent("05/11/2026 09:30");
    expect(oldest).toHaveTextContent("Hỏi giá máy in màu");
    expect(oldest).toHaveTextContent("Lê Văn Đức");
    expect(oldest).toHaveTextContent("DH2610-0002");
    expect(oldest).toHaveTextContent("01/10/2026 16:15");
  });

  test("AC-CUS-078 ghi chú từ cuộc gọi CSKH hiện 'Cuộc gọi CSKH' thay cho mã đơn", async () => {
    signedInAs(khangId, KHANG);
    mockOrder([
      note({
        id: "d0000000-0000-4000-8000-000000000003",
        order_id: null,
        order_code: null,
        source: "CARE_CALL",
        note: "Báo giá 6 camera",
        author_name: "Nguyễn Thị Lan",
        created_at: "2026-11-06T03:00:00Z",
      }),
      note({ created_at: "2026-11-05T02:30:00Z" }),
    ]);
    const block = await openOrder();
    const user = userEvent.setup();

    await user.click(await within(block).findByRole("button", { name: "Xem lịch sử (2)" }));
    const [call, fromOrder] = within(
      within(block).getByRole("list", { name: "Lịch sử tiềm năng" }),
    ).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(call).toHaveTextContent("Báo giá 6 camera");
    expect(call).toHaveTextContent("Nguyễn Thị Lan · Cuộc gọi CSKH · 06/11/2026 10:00");
    expect(fromOrder).toHaveTextContent("DH2611-0005");
    expect(fromOrder).not.toHaveTextContent("Cuộc gọi CSKH");
  });

  test("AC-CUS-057 Hoa (SALE) thấy khối tiềm năng chỉ đọc, không có nút 'Ghi tiềm năng'", async () => {
    signedInAs(hoaId, HOA);
    mockOrder([note({ created_at: "2026-11-05T02:30:00Z" })]);
    const block = await openOrder();

    expect(await within(block).findByText("Muốn lắp thêm 4 camera kho")).toBeInTheDocument();
    expect(within(block).queryByRole("button", { name: "Ghi tiềm năng" })).not.toBeInTheDocument();
  });

  test.each(["COMPLETED", "CANCELLED"] as const)(
    "AC-CUS-057 KTV có quyền nhưng đơn %s → chỉ đọc, không có nút 'Ghi tiềm năng'",
    async (status) => {
      signedInAs(khangId, KHANG);
      mockOrder([note({ created_at: "2026-11-05T02:30:00Z" })], order({ status }));
      const block = await openOrder();

      expect(await within(block).findByText("Muốn lắp thêm 4 camera kho")).toBeInTheDocument();
      expect(
        within(block).queryByRole("button", { name: "Ghi tiềm năng" }),
      ).not.toBeInTheDocument();
    },
  );
});
