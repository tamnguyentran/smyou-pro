import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import {
  anId,
  AN,
  hoaId,
  HOA,
  KHOA_TECH,
  meBody,
  signedInAs,
  TUAN,
  tuanId,
  type Person,
} from "./testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];
type OrderLineOut = components["schemas"]["OrderLineOut"];
type TaskSummary = components["schemas"]["TaskSummary"];
type EmployeeOut = components["schemas"]["EmployeeOut"];

const orderId = "b0000000-0000-4000-8000-000000000020";
const orderCode = "DH2610-0008";
const khoaId = "a0000000-0000-4000-8000-000000000081";
const minhId = "a0000000-0000-4000-8000-000000000082";

/** Dòng sản phẩm: panel tạo đầu việc không gọi `GET /services/{id}` nên không cần gợi ý số giờ. */
const PRODUCT_LINE: OrderLineOut = {
  id: "e0000000-0000-4000-8000-000000000001",
  item_type: "PRODUCT",
  product_id: "f0000000-0000-4000-8000-000000000001",
  service_id: null,
  name_snapshot: "Màn hình Dell 22 inch",
  sku_snapshot: "LCD-DELL22",
  specs_snapshot: null,
  unit_snapshot: "cái",
  quantity: "1",
  unit_price: 3000000,
  catalog_price_snapshot: 3000000,
  price_fixed: false,
  vat_rate: "10",
  line_discount: 0,
  line_gross: 3000000,
  line_vat: 300000,
  line_total: 3300000,
  warranty_months_snapshot: 12,
  is_gift: false,
  note: null,
  position: 1,
};

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: orderId,
    code: orderCode,
    status: "IN_PROGRESS",
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
    subtotal: 3000000,
    discount_amount: 0,
    vat_amount: 300000,
    total: 3300000,
    revision_no: 0,
    version: 7,
    created_by: hoaId,
    allowed_commands: [],
    can_edit_contact: true,
    can_edit_lines_after_submit: true,
    can_upload_confirmation: false,
    can_complete: false,
    lines: [PRODUCT_LINE],
    ...overrides,
  };
}

function task(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: "d0000000-0000-4000-8000-000000000001",
    code: `${orderCode}-T1`,
    title: "Lắp đặt 4 camera tầng 1",
    status: "PENDING_ACCEPTANCE",
    estimated_hours: "4.00",
    due_at: "2026-10-05T02:00:00Z", // 09:00 giờ VN
    priority: "HIGH",
    assignees: [
      { employee_id: khoaId, full_name: "Trần Minh Khoa" },
      { employee_id: minhId, full_name: "Đỗ Văn Minh" },
    ],
    ...overrides,
  };
}

const T1 = task();
const T2 = task({
  id: "d0000000-0000-4000-8000-000000000002",
  code: `${orderCode}-T2`,
  title: "Kiểm tra đầu ghi",
  status: "IN_PROGRESS",
  estimated_hours: "0.25",
  due_at: "2026-10-06T07:30:00Z", // 14:30 giờ VN
  priority: "NORMAL",
  assignees: [{ employee_id: khoaId, full_name: "Trần Minh Khoa" }],
});
const T3 = task({
  id: "d0000000-0000-4000-8000-000000000003",
  code: `${orderCode}-T3`,
  title: "Nghiệm thu với khách",
  status: "PENDING_ACCEPTANCE",
  estimated_hours: "1.50",
  assignees: [{ employee_id: khoaId, full_name: "Trần Minh Khoa" }],
});

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

/** Giờ hợp lệ: luôn ở tương lai so với lúc chạy test (không phụ thuộc đồng hồ máy). */
function localInput(offsetDays: number, hhmm = "08:00") {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hhmm}`;
}

function mobile() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

interface Calls {
  tasks: number;
  posts: unknown[];
}

/** Trang chi tiết đơn + `GET /orders/{id}/tasks`. `afterPost` cho phép mô phỏng đơn/danh sách
 * đổi sau khi tạo đầu việc (AC-DSP-032/033), `tasksStatus` mô phỏng lỗi tải (AC-DSP-030). */
function stubDetail({
  person = TUAN,
  personId = tuanId,
  order = detail(),
  orderAfterPost,
  tasks = [T1, T2],
  tasksAfterPost,
  tasksStatus,
  tasksDelayMs,
  orderStatus,
  post,
}: {
  person?: Person;
  personId?: string;
  order?: OrderDetail;
  orderAfterPost?: OrderDetail;
  tasks?: TaskSummary[];
  tasksAfterPost?: TaskSummary[];
  tasksStatus?: number;
  tasksDelayMs?: number;
  orderStatus?: number;
  post?: Parameters<typeof http.post>[1];
} = {}): Calls {
  const calls: Calls = { tasks: 0, posts: [] };
  signedInAs(personId, person);
  server.use(
    http.get("/api/v1/me", () => HttpResponse.json(meBody(personId, person, {}))),
    http.get("/api/v1/orders/:id", () => {
      if (orderStatus !== undefined) {
        return HttpResponse.json(
          { status: orderStatus, code: "NOT_FOUND", detail: "Không tìm thấy." },
          { status: orderStatus },
        );
      }
      const done = calls.posts.length > 0 && orderAfterPost !== undefined;
      return HttpResponse.json(done ? orderAfterPost : order);
    }),
    http.get("/api/v1/orders/:id/tasks", async () => {
      calls.tasks += 1;
      if (tasksDelayMs !== undefined) await delay(tasksDelayMs);
      if (tasksStatus !== undefined) {
        return HttpResponse.json({ status: tasksStatus }, { status: tasksStatus });
      }
      const after = calls.posts.length > 0 && tasksAfterPost !== undefined;
      return HttpResponse.json({ items: after ? tasksAfterPost : tasks });
    }),
    http.get("/api/v1/employees", () =>
      HttpResponse.json({
        items: [
          technician(khoaId, "NV081", "Trần Minh Khoa"),
          technician(minhId, "NV082", "Đỗ Văn Minh"),
        ],
        total: 2,
        limit: 100,
        offset: 0,
      }),
    ),
    http.post(
      "/api/v1/orders/:id/tasks",
      post ??
        (async ({ request }) => {
          calls.posts.push(await request.json());
          return HttpResponse.json({ id: T3.id, code: T3.code, order_id: orderId });
        }),
    ),
  );
  return calls;
}

/** Mở trang chi tiết đơn rồi bấm vào tab "Đầu việc". */
async function openTasksTab(): Promise<UserEvent> {
  renderApp(`/orders/${orderId}`);
  const user = userEvent.setup();
  await screen.findByText(orderCode);
  await user.click(screen.getByRole("tab", { name: "Đầu việc" }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Tab Đầu việc trên trang chi tiết đơn", () => {
  test("AC-DSP-028 thứ tự 4 tab, nạp lười, 2 task đúng thứ tự + định dạng giờ/hạn/người giao", async () => {
    const calls = stubDetail();
    renderApp(`/orders/${orderId}`);
    const user = userEvent.setup();
    await screen.findByText(orderCode);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Thông tin",
      "Dòng hàng",
      "Đầu việc",
      "Tệp đính kèm",
      "Lịch sử",
    ]);
    expect(calls.tasks).toBe(0);

    await user.click(screen.getByRole("tab", { name: "Đầu việc" }));
    await screen.findByText(T1.code);
    expect(calls.tasks).toBe(1);

    const rows = screen.getAllByRole("row").slice(1); // bỏ hàng tiêu đề
    expect(rows).toHaveLength(2);
    const first = within(rows[0] as HTMLElement);
    expect(first.getByText(T1.code)).toBeInTheDocument();
    expect(first.getByText("Lắp đặt 4 camera tầng 1")).toBeInTheDocument();
    expect(first.getByText("Chờ tiếp nhận")).toBeInTheDocument();
    expect(first.getByText("4 giờ")).toBeInTheDocument();
    expect(first.getByText("05/10/2026 09:00")).toBeInTheDocument();
    expect(first.getByText("Trần Minh Khoa, Đỗ Văn Minh")).toBeInTheDocument();
    const second = within(rows[1] as HTMLElement);
    expect(second.getByText(T2.code)).toBeInTheDocument();
    expect(second.getByText("0,25 giờ")).toBeInTheDocument();
    expect(second.getByText("06/10/2026 14:30")).toBeInTheDocument();
    expect(second.getByText("Trần Minh Khoa")).toBeInTheDocument();
  });

  test("AC-DSP-029 badge 6 trạng thái đúng nhãn + tone; trạng thái lạ → neutral + mã gốc", async () => {
    const statuses: [string, string, string][] = [
      ["NEEDS_ASSIGNEE", "Cần giao lại", "bg-urgent-bg"],
      ["PENDING_ACCEPTANCE", "Chờ tiếp nhận", "bg-todo-bg"],
      ["ACCEPTED", "Đã tiếp nhận", "bg-review-bg"],
      ["IN_PROGRESS", "Đang thực hiện", "bg-in_progress-bg"],
      ["DONE", "Hoàn thành", "bg-completed-bg"],
      ["CANCELLED", "Đã huỷ", "bg-todo-bg"],
    ];
    stubDetail({
      tasks: [
        ...statuses.map(([status], index) =>
          task({
            id: `d0000000-0000-4000-8000-00000000010${String(index)}`,
            code: `${orderCode}-T${String(index + 1)}`,
            status,
          }),
        ),
        task({
          id: "d0000000-0000-4000-8000-000000000199",
          code: `${orderCode}-T9`,
          status: "FOO",
        }),
      ],
    });
    await openTasksTab();
    await screen.findByText(`${orderCode}-T1`);

    for (const [, label, tone] of statuses) {
      const badges = screen.getAllByText(label);
      expect(badges.some((badge) => badge.className.includes(tone))).toBe(true);
    }
    expect(screen.getByText("FOO").className).toContain("bg-sidebar-sub");
  });

  test("AC-DSP-030 skeleton aria-busy / empty state / lỗi 500 + Thử lại gọi lại 1 lần", async () => {
    stubDetail({ tasks: [], tasksDelayMs: 60 });
    await openTasksTab();
    expect(screen.getByLabelText("Đang tải danh sách đầu việc")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(await screen.findByText("Chưa có đầu việc nào.")).toBeInTheDocument();
    expect(
      screen.getByText("Quản lý kỹ thuật tạo đầu việc để giao cho kỹ thuật viên."),
    ).toBeInTheDocument();

    cleanup(); // dựng lại trang cho pha thứ hai: lỗi tải danh sách
    server.resetHandlers();
    const failing = stubDetail({ tasksStatus: 500 });
    const user = await openTasksTab();
    expect(await screen.findByText("Không tải được danh sách đầu việc.")).toBeInTheDocument();
    expect(failing.tasks).toBe(1);
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => {
      expect(failing.tasks).toBe(2);
    });
  });

  test.each([
    ["Tuấn (task.manage)", "PENDING_DISPATCH", true, TUAN, tuanId],
    ["Tuấn (task.manage)", "IN_PROGRESS", true, TUAN, tuanId],
    ["Tuấn (task.manage)", "REVISION", true, TUAN, tuanId],
    ["Tuấn (task.manage)", "AWAITING_CONFIRMATION", false, TUAN, tuanId],
    ["Tuấn (task.manage)", "COMPLETED", false, TUAN, tuanId],
    ["Tuấn (task.manage)", "CANCELLED", false, TUAN, tuanId],
    ["Hoa (SALE)", "IN_PROGRESS", false, HOA, hoaId],
    ["An (MANAGER)", "IN_PROGRESS", false, AN, anId],
  ])(
    "AC-DSP-031 nút Tạo đầu việc — %s, đơn %s → hiện: %s",
    async (_who, status, visible, person, personId) => {
      stubDetail({ person, personId, order: detail({ status }) });
      await openTasksTab();
      await screen.findByText(T1.code);

      const button = screen.queryByRole("button", { name: "Tạo đầu việc" });
      if (visible) {
        expect(button).toBeInTheDocument();
      } else {
        expect(button).not.toBeInTheDocument();
      }
      // Ai cũng xem được danh sách đầu việc (capability `order.read`).
      expect(screen.getByText(T2.code)).toBeInTheDocument();
    },
  );

  test("AC-DSP-032 tạo đầu việc từ tab: body đúng, toast, danh sách refetch có T3", async () => {
    const calls = stubDetail({ tasksAfterPost: [T1, T2, T3] });
    const user = await openTasksTab();
    await screen.findByText(T1.code);

    await user.click(screen.getByRole("button", { name: "Tạo đầu việc" }));
    const dialog = await screen.findByRole("dialog", { name: `Tạo đầu việc — ${orderCode}` });
    expect(within(dialog).getByLabelText("Mức ưu tiên")).toHaveValue("URGENT");
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveFocus();
    });

    const due = localInput(3);
    await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "Nghiệm thu với khách");
    await user.type(within(dialog).getByLabelText("Số giờ ước tính"), "1,5");
    await user.type(within(dialog).getByLabelText("Hạn hoàn thành"), due);
    await user.click(within(dialog).getByRole("checkbox", { name: /Trần Minh Khoa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(calls.posts[0]).toMatchObject({
      version: 7,
      title: "Nghiệm thu với khách",
      estimated_hours: 1.5,
      due_at: `${due}:00+07:00`,
      priority: "URGENT",
      assignee_ids: [khoaId],
    });
    expect(
      await screen.findByText(`Đã tạo đầu việc ${T3.code} và giao cho 1 kỹ thuật viên.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(T3.code)).toBeInTheDocument();
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(3);
  });

  test("AC-DSP-033 task đầu tiên: badge header → Đang thực hiện, mất nút Thu hồi/Huỷ đơn", async () => {
    stubDetail({
      order: detail({ status: "PENDING_DISPATCH", allowed_commands: ["recall", "cancel"] }),
      orderAfterPost: detail({ status: "IN_PROGRESS", version: 8, allowed_commands: [] }),
      tasks: [],
      tasksAfterPost: [T1],
    });
    const user = await openTasksTab();
    await screen.findByText("Chưa có đầu việc nào.");
    expect(screen.getByText("Chờ điều phối")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu hồi" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tạo đầu việc" }));
    const dialog = await screen.findByRole("dialog", { name: `Tạo đầu việc — ${orderCode}` });
    await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "Lắp đặt 4 camera tầng 1");
    await user.type(within(dialog).getByLabelText("Số giờ ước tính"), "4");
    await user.type(within(dialog).getByLabelText("Hạn hoàn thành"), localInput(2));
    await user.click(within(dialog).getByRole("checkbox", { name: /Trần Minh Khoa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    expect(await screen.findByText("Đang thực hiện")).toBeInTheDocument();
    expect(screen.queryByText("Chờ điều phối")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thu hồi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Huỷ đơn" })).not.toBeInTheDocument();
    expect(await screen.findByText(T1.code)).toBeInTheDocument();
  });

  test("AC-DSP-034 409 STALE_VERSION: banner + Tải lại, giữ dữ liệu, gửi lại version mới", async () => {
    const attempts: unknown[] = [];
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/me", () => HttpResponse.json(meBody(tuanId, TUAN, {}))),
      // Hoa vừa sửa liên hệ: server đã ở version 8, client chỉ thấy khi tải lại.
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json(detail({ version: attempts.length > 0 ? 8 : 7 })),
      ),
      http.get("/api/v1/orders/:id/tasks", () => HttpResponse.json({ items: [T1, T2] })),
      http.get("/api/v1/employees", () =>
        HttpResponse.json({
          items: [technician(khoaId, "NV081", "Trần Minh Khoa")],
          total: 1,
          limit: 100,
          offset: 0,
        }),
      ),
      http.post("/api/v1/orders/:id/tasks", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        attempts.push(body);
        if (body.version !== 8) {
          return HttpResponse.json(
            {
              status: 409,
              code: "STALE_VERSION",
              detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({ id: T3.id, code: T3.code, order_id: orderId });
      }),
    );

    const user = await openTasksTab();
    await screen.findByText(T1.code);
    await user.click(screen.getByRole("button", { name: "Tạo đầu việc" }));
    const dialog = await screen.findByRole("dialog", { name: `Tạo đầu việc — ${orderCode}` });
    await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "Nghiệm thu với khách");
    await user.type(within(dialog).getByLabelText("Số giờ ước tính"), "2");
    await user.type(within(dialog).getByLabelText("Hạn hoàn thành"), localInput(3));
    await user.click(within(dialog).getByRole("checkbox", { name: /Trần Minh Khoa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));

    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));

    // Dữ liệu đã nhập được giữ sau khi tải lại.
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Tạo đầu việc" })).toBeInTheDocument();
    });
    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveValue("Nghiệm thu với khách");
    expect(within(dialog).getByLabelText("Số giờ ước tính")).toHaveValue("2");

    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    await waitFor(() => {
      expect(attempts).toHaveLength(2);
    });
    expect(attempts[1]).toMatchObject({ version: 8 });
    expect(
      await screen.findByText(`Đã tạo đầu việc ${T3.code} và giao cho 1 kỹ thuật viên.`),
    ).toBeInTheDocument();
  });

  test("AC-DSP-035 KTV được giao xem được tab không có nút tạo; KTV không liên quan → 404", async () => {
    stubDetail({ person: KHOA_TECH, personId: khoaId });
    await openTasksTab();

    expect(await screen.findByText(T1.code)).toBeInTheDocument();
    expect(screen.getByText(T2.code)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo đầu việc" })).not.toBeInTheDocument();

    cleanup(); // dựng lại trang cho KTV không liên quan đơn
    server.resetHandlers();
    const calls = stubDetail({ person: KHOA_TECH, personId: khoaId, orderStatus: 404 });
    renderApp(`/orders/${orderId}`);
    expect(await screen.findByText("Không tìm thấy trang.")).toBeInTheDocument();
    expect(calls.tasks).toBe(0);
  });

  test("AC-DSP-036 mobile thẻ dọc + nút w-full; desktop bảng 6 cột", async () => {
    mobile();
    stubDetail();
    await openTasksTab();
    await screen.findByText(T1.code);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const first = within(cards[0] as HTMLElement);
    expect(first.getByText(T1.code)).toBeInTheDocument();
    expect(first.getByText("Chờ tiếp nhận")).toBeInTheDocument();
    expect(first.getByText(/Số giờ:/)).toBeInTheDocument();
    expect(first.getByText(/Hạn:/)).toBeInTheDocument();
    expect(first.getByText(/Người được giao:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo đầu việc" }).className).toContain("w-full");

    cleanup(); // dựng lại trang ở desktop
    vi.unstubAllGlobals();
    server.resetHandlers();
    stubDetail();
    await openTasksTab();
    await screen.findByText(T1.code);
    for (const heading of [
      "Mã",
      "Tiêu đề",
      "Trạng thái",
      "Số giờ",
      "Hạn hoàn thành",
      "Người được giao",
    ]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
  });
});
