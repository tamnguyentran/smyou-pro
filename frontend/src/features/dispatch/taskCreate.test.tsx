import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { DON_I, meBody, signedInAs, TUAN, tuanId } from "./testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];
type OrderLineOut = components["schemas"]["OrderLineOut"];
type EmployeeOut = components["schemas"]["EmployeeOut"];
type ServiceOut = components["schemas"]["ServiceOut"];

const khoaId = "a0000000-0000-4000-8000-000000000081";
const minhId = "a0000000-0000-4000-8000-000000000082";
const svcCam = "c0000000-0000-4000-8000-000000000001";
const svcMuc = "c0000000-0000-4000-8000-000000000002";
const taskId = "d0000000-0000-4000-8000-000000000001";

function line(overrides: Partial<OrderLineOut> = {}): OrderLineOut {
  return {
    id: "e0000000-0000-4000-8000-000000000001",
    item_type: "SERVICE",
    product_id: null,
    service_id: svcCam,
    name_snapshot: "Lắp đặt camera",
    sku_snapshot: null,
    specs_snapshot: null,
    unit_snapshot: "cái",
    quantity: "4",
    unit_price: 1000000,
    catalog_price_snapshot: 1000000,
    price_fixed: false,
    vat_rate: "10",
    line_discount: 0,
    line_gross: 4000000,
    line_vat: 400000,
    line_total: 4400000,
    warranty_months_snapshot: null,
    is_gift: false,
    note: null,
    position: 1,
    ...overrides,
  };
}

const SERVICE_LINES: OrderLineOut[] = [
  line(),
  line({
    id: "e0000000-0000-4000-8000-000000000002",
    service_id: svcMuc,
    name_snapshot: "Bơm mực máy in",
    quantity: "2",
    position: 2,
  }),
  line({
    id: "e0000000-0000-4000-8000-000000000003",
    item_type: "PRODUCT",
    service_id: null,
    product_id: "f0000000-0000-4000-8000-000000000001",
    name_snapshot: "Màn hình Dell 22 inch",
    quantity: "1",
    position: 3,
  }),
];

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: DON_I.id,
    code: DON_I.code,
    status: "PENDING_DISPATCH",
    division: "SECURITY",
    customer_id: null,
    customer_name: "Công ty TNHH Minh Phát",
    customer_phone: "0932068787",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "Lắp 4 camera tầng 1",
    priority: "URGENT",
    requested_date: "2026-10-12",
    payment_method: null,
    payment_status: "UNPAID",
    subtotal: 10000000,
    discount_amount: 0,
    vat_amount: 1800000,
    total: 11800000,
    revision_no: 0,
    version: 7,
    created_by: "a0000000-0000-4000-8000-000000000010",
    allowed_commands: [],
    can_edit_contact: true,
    can_edit_lines_after_submit: true,
    lines: SERVICE_LINES,
    ...overrides,
  };
}

function technician(id: string, code: string, full_name: string): EmployeeOut {
  return {
    id,
    code,
    full_name,
    email: `${code.toLowerCase()}@smyou.vn`,
    phone: null,
    title: null,
    department: "TECHNICAL",
    roles: ["TECHNICIAN"],
    is_active: true,
    is_locked: false,
    must_change_password: false,
    version: 1,
  };
}
const KHOA = technician(khoaId, "NV081", "Trần Minh Khoa");
const MINH = technician(minhId, "NV082", "Đỗ Văn Minh");

function service(id: string, code: string, hours: string | null): ServiceOut {
  return {
    id,
    code,
    name: code,
    category: "SECURITY",
    unit: "cái",
    price: 1000000,
    price_fixed: false,
    vat_rate: "10",
    default_estimated_hours: hours,
    description: null,
    is_active: true,
    version: 1,
  };
}

/** Giờ hợp lệ: luôn ở tương lai so với lúc chạy test (không phụ thuộc đồng hồ máy). */
function localInput(offsetDays: number, hhmm = "09:00") {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hhmm}`;
}

interface Calls {
  orders: number;
  me: number;
  employees: string[];
  posts: unknown[];
}

function stubQueue({
  order = detail(),
  services = [service(svcCam, "DV-LAPCAM", "2.00"), service(svcMuc, "DV-BOMMUC", "0.50")],
  servicesFail = false,
  post,
}: {
  order?: OrderDetail;
  services?: ServiceOut[];
  servicesFail?: boolean;
  post?: Parameters<typeof http.post>[1];
} = {}): Calls {
  const calls: Calls = { orders: 0, me: 0, employees: [], posts: [] };
  signedInAs(tuanId, TUAN, { pending_dispatch_count: 4 });
  server.use(
    http.get("/api/v1/me", () => {
      calls.me += 1;
      return HttpResponse.json(
        meBody(tuanId, TUAN, { pending_dispatch_count: calls.posts.length > 0 ? 3 : 4 }),
      );
    }),
    http.get("/api/v1/orders", () => {
      calls.orders += 1;
      return HttpResponse.json({
        items: calls.posts.length > 0 ? [] : [DON_I],
        total: calls.posts.length > 0 ? 0 : 1,
        limit: 20,
        offset: 0,
      });
    }),
    http.get("/api/v1/orders/:id", () => HttpResponse.json(order)),
    http.get("/api/v1/employees", ({ request }) => {
      calls.employees.push(new URL(request.url).search);
      return HttpResponse.json({ items: [KHOA, MINH], total: 2, limit: 100, offset: 0 });
    }),
    http.get("/api/v1/services/:id", ({ params }) => {
      if (servicesFail) return HttpResponse.json({ status: 500 }, { status: 500 });
      const found = services.find((s) => s.id === params.id);
      return found ? HttpResponse.json(found) : HttpResponse.json({ status: 404 }, { status: 404 });
    }),
    http.post(
      "/api/v1/orders/:id/tasks",
      post ??
        (async ({ request }) => {
          calls.posts.push(await request.json());
          return HttpResponse.json({ id: taskId, code: "DV2610-0001" });
        }),
    ),
  );
  return calls;
}

/** Mở panel bằng cách bấm nút mã đơn trong hàng đợi; trả về user + dialog. */
async function openPanel(): Promise<{ user: UserEvent; dialog: HTMLElement }> {
  renderApp("/dispatch/queue");
  const user = userEvent.setup();
  const code = await screen.findByRole("button", { name: DON_I.code });
  await user.click(code);
  const dialog = await screen.findByRole("dialog", { name: `Tạo đầu việc — ${DON_I.code}` });
  return { user, dialog };
}

async function fillValidForm(user: UserEvent, dialog: HTMLElement, due = localInput(3)) {
  await user.clear(within(dialog).getByLabelText("Tiêu đề đầu việc"));
  await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "Lắp đặt 4 camera tầng 1");
  await user.clear(within(dialog).getByLabelText("Số giờ ước tính"));
  await user.type(within(dialog).getByLabelText("Số giờ ước tính"), "9");
  await user.type(within(dialog).getByLabelText("Hạn hoàn thành"), due);
  await user.click(within(dialog).getByRole("checkbox", { name: /Trần Minh Khoa/ }));
  await user.click(within(dialog).getByRole("checkbox", { name: /Đỗ Văn Minh/ }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Panel tạo đầu việc", () => {
  test("AC-DSP-019 mở panel: tóm tắt đơn, 6 ô, ưu tiên theo đơn, focus vào tiêu đề", async () => {
    stubQueue();
    const { dialog } = await openPanel();

    expect(within(dialog).getByText("Công ty TNHH Minh Phát")).toBeInTheDocument();
    const phone = within(dialog).getByRole("link", { name: "0932 06 8787" });
    expect(phone).toHaveAttribute("href", "tel:0932068787");
    const map = within(dialog).getByRole("link", { name: "12 Lê Lợi, Q1, TP.HCM" });
    expect(map.getAttribute("href")).toContain(encodeURIComponent("12 Lê Lợi, Q1, TP.HCM"));
    expect(within(dialog).getByText("Lắp 4 camera tầng 1")).toBeInTheDocument();
    expect(within(dialog).getByText("12/10/2026")).toBeInTheDocument();

    for (const label of [
      "Tiêu đề đầu việc",
      "Mô tả",
      "Số giờ ước tính",
      "Hạn hoàn thành",
      "Mức ưu tiên",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByText("Giao cho kỹ thuật viên")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Mức ưu tiên")).toHaveValue("URGENT");
    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveFocus();
  });

  test("AC-DSP-020 gợi ý số giờ = Σ(giờ mặc định × số lượng) của dòng dịch vụ, sửa được", async () => {
    const calls = stubQueue();
    const { user, dialog } = await openPanel();

    const hours = within(dialog).getByLabelText("Số giờ ước tính");
    await waitFor(() => {
      expect(hours).toHaveValue("9");
    });
    expect(within(dialog).getByText("Gợi ý 9 giờ từ dịch vụ trong đơn.")).toBeInTheDocument();

    await user.clear(hours);
    await user.type(hours, "6");
    await user.type(within(dialog).getByLabelText("Hạn hoàn thành"), localInput(3));
    await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "Lắp đặt 4 camera tầng 1");
    await user.click(within(dialog).getByRole("checkbox", { name: /Trần Minh Khoa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(calls.posts[0]).toMatchObject({ estimated_hours: 6 });
  });

  test("AC-DSP-020 đơn chỉ có sản phẩm → ô trống, không có dòng gợi ý", async () => {
    stubQueue({ order: detail({ lines: [SERVICE_LINES[2] as OrderLineOut] }) });
    const { dialog } = await openPanel();

    expect(within(dialog).getByLabelText("Số giờ ước tính")).toHaveValue("");
    expect(within(dialog).queryByText(/^Gợi ý/)).not.toBeInTheDocument();
  });

  test("AC-DSP-020 mọi dịch vụ không khai giờ mặc định → ô trống", async () => {
    stubQueue({
      services: [service(svcCam, "DV-LAPCAM", null), service(svcMuc, "DV-BOMMUC", null)],
    });
    const { dialog } = await openPanel();

    await waitFor(() => {
      expect(within(dialog).queryByText(/^Gợi ý/)).not.toBeInTheDocument();
    });
    expect(within(dialog).getByLabelText("Số giờ ước tính")).toHaveValue("");
  });

  test("AC-DSP-020 lỗi GET /services → ô trống, form vẫn gửi được", async () => {
    const calls = stubQueue({ servicesFail: true });
    const { user, dialog } = await openPanel();

    expect(within(dialog).getByLabelText("Số giờ ước tính")).toHaveValue("");
    expect(within(dialog).queryByText(/^Gợi ý/)).not.toBeInTheDocument();

    await fillValidForm(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
  });

  test("AC-DSP-021 danh sách KTV đang hoạt động, đếm số người đã chọn", async () => {
    const calls = stubQueue();
    const { user, dialog } = await openPanel();

    await waitFor(() => {
      expect(calls.employees[0]).toBe("?role=TECHNICIAN&is_active=true&limit=100");
    });
    const khoa = within(dialog).getByRole("checkbox", { name: /Trần Minh Khoa/ });
    expect(within(dialog).getByText(/NV081/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Nguyễn Thị Lan/)).not.toBeInTheDocument();
    expect(khoa.closest("label")?.className).toContain("min-h-11");

    await user.click(khoa);
    await user.click(within(dialog).getByRole("checkbox", { name: /Đỗ Văn Minh/ }));
    expect(within(dialog).getByText("Đã chọn 2 kỹ thuật viên")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: /Đỗ Văn Minh/ }));
    expect(within(dialog).getByText("Đã chọn 1 kỹ thuật viên")).toBeInTheDocument();
  });

  test("AC-DSP-022 gửi đúng body, chặn bấm đúp, toast, đóng panel, refetch hàng đợi + badge", async () => {
    let resolvePost: ((value: unknown) => void) | undefined;
    const calls = stubQueue({
      post: async ({ request }) => {
        calls.posts.push(await request.json());
        await new Promise((resolve) => {
          resolvePost = resolve;
        });
        return HttpResponse.json({ id: taskId, code: "DV2610-0001" });
      },
    });
    const { user, dialog } = await openPanel();
    const due = localInput(3);
    await fillValidForm(user, dialog, due);

    const submit = within(dialog).getByRole("button", { name: "Tạo đầu việc" });
    await user.click(submit);
    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]).toEqual({
      version: 7,
      title: "Lắp đặt 4 camera tầng 1",
      description: null,
      estimated_hours: 9,
      due_at: `${due}:00+07:00`,
      priority: "URGENT",
      assignee_ids: [khoaId, minhId],
    });

    const ordersBefore = calls.orders;
    const meBefore = calls.me;
    resolvePost?.(undefined);
    expect(
      await screen.findByText("Đã tạo đầu việc DV2610-0001 và giao cho 2 kỹ thuật viên."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(calls.orders).toBeGreaterThan(ordersBefore);
      expect(calls.me).toBeGreaterThan(meBefore);
    });
    expect(await screen.findByText("Không có đơn nào chờ điều phối.")).toBeInTheDocument();
  });

  test("AC-DSP-023 ô trống/sai → lỗi dưới từng ô, không gọi POST", async () => {
    const calls = stubQueue({ order: detail({ lines: [] }) });
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    expect(await within(dialog).findByText("Nhập tiêu đề đầu việc.")).toBeInTheDocument();
    expect(within(dialog).getByText("Nhập số giờ ước tính.")).toBeInTheDocument();
    expect(within(dialog).getByText("Chọn hạn hoàn thành.")).toBeInTheDocument();
    expect(within(dialog).getByText("Chọn ít nhất 1 kỹ thuật viên.")).toBeInTheDocument();
    expect(calls.posts).toHaveLength(0);

    await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "a".repeat(201));
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    expect(await within(dialog).findByText("Tiêu đề tối đa 200 ký tự.")).toBeInTheDocument();

    const hoursMessage = "Số giờ phải từ 0,25 đến 200 và là bội số của 0,25.";
    for (const value of ["0", "201", "1,3", "0,251"]) {
      await user.clear(within(dialog).getByLabelText("Số giờ ước tính"));
      await user.type(within(dialog).getByLabelText("Số giờ ước tính"), value);
      await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
      expect(await within(dialog).findByText(hoursMessage)).toBeInTheDocument();
    }

    await user.type(within(dialog).getByLabelText("Hạn hoàn thành"), localInput(-1));
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    expect(
      await within(dialog).findByText("Hạn hoàn thành không được ở quá khứ."),
    ).toBeInTheDocument();
    expect(calls.posts).toHaveLength(0);
  });

  test("AC-DSP-024 409 GUARD_FAILED order_in_dispatchable_state → Alert + refetch hàng đợi", async () => {
    const calls = stubQueue({
      post: () =>
        HttpResponse.json(
          {
            status: 409,
            code: "GUARD_FAILED",
            guard: "order_in_dispatchable_state",
            detail: "Đơn không ở trạng thái có thể điều phối đầu việc.",
          },
          { status: 409 },
        ),
    });
    const { user, dialog } = await openPanel();
    await fillValidForm(user, dialog);
    const ordersBefore = calls.orders;
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    expect(
      await within(dialog).findByText("Đơn không ở trạng thái có thể điều phối đầu việc."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.orders).toBeGreaterThan(ordersBefore);
    });
  });

  test("AC-DSP-024 409 guard KTV bị khoá → panel vẫn mở, dữ liệu đã nhập còn nguyên", async () => {
    stubQueue({
      post: () =>
        HttpResponse.json(
          {
            status: 409,
            code: "GUARD_FAILED",
            guard: "assignees_are_active_technicians",
            detail: "Người được giao phải là kỹ thuật viên đang hoạt động.",
          },
          { status: 409 },
        ),
    });
    const { user, dialog } = await openPanel();
    await fillValidForm(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    expect(
      await within(dialog).findByText("Người được giao phải là kỹ thuật viên đang hoạt động."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveValue(
      "Lắp đặt 4 camera tầng 1",
    );
    expect(within(dialog).getByText("Đã chọn 2 kỹ thuật viên")).toBeInTheDocument();
  });

  test("AC-DSP-024 lỗi không có detail → thông báo chung", async () => {
    stubQueue({ post: () => HttpResponse.json({ status: 500 }, { status: 500 }) });
    const { user, dialog } = await openPanel();
    await fillValidForm(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    expect(
      await within(dialog).findByText("Không tạo được đầu việc. Vui lòng thử lại."),
    ).toBeInTheDocument();
  });

  test("AC-DSP-025 409 STALE_VERSION → banner + Tải lại, giữ dữ liệu, gửi lại với version mới", async () => {
    const posts: unknown[] = [];
    let version = 7;
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 1 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [DON_I], total: 1, limit: 20, offset: 0 }),
      ),
      http.get("/api/v1/orders/:id", () => HttpResponse.json(detail({ version }))),
      http.get("/api/v1/employees", () =>
        HttpResponse.json({ items: [KHOA, MINH], total: 2, limit: 100, offset: 0 }),
      ),
      http.get("/api/v1/services/:id", ({ params }) =>
        HttpResponse.json(service(String(params.id), "DV", "2.00")),
      ),
      http.post("/api/v1/orders/:id/tasks", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        posts.push(body);
        if (body.version !== version) {
          return HttpResponse.json(
            {
              status: 409,
              code: "STALE_VERSION",
              detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({ id: taskId, code: "DV2610-0002" });
      }),
    );

    const { user, dialog } = await openPanel();
    await fillValidForm(user, dialog);
    version = 8; // Hoa vừa sửa liên hệ đơn này ở tab khác
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));

    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveValue(
      "Lắp đặt 4 camera tầng 1",
    );
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    await waitFor(() => {
      expect(posts).toHaveLength(2);
    });
    expect(posts[1]).toMatchObject({ version: 8 });
    expect(
      await screen.findByText("Đã tạo đầu việc DV2610-0002 và giao cho 2 kỹ thuật viên."),
    ).toBeInTheDocument();
  });

  test("AC-DSP-026 nút dính đáy chừa safe-area, Esc đóng panel và trả focus về hàng vừa bấm", async () => {
    stubQueue();
    const { user, dialog } = await openPanel();

    // M4-01d: hàng nút nằm trong footer của Sheet (ngoài vùng cuộn, chừa safe-area).
    const actions = within(dialog).getByTestId("task-create-actions");
    expect(within(dialog).getByTestId("sheet-footer")).toContainElement(actions);
    expect(within(dialog).getByTestId("sheet-footer").className).toContain(
      "env(safe-area-inset-bottom)",
    );
    expect(within(dialog).getByRole("button", { name: "Đóng" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: DON_I.code })).toHaveFocus();
  });
});
