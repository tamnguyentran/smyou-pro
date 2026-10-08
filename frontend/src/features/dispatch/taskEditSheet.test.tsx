import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { hoaId, HOA, meBody, signedInAs, TUAN, tuanId, type Person } from "./testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];
type TaskSummary = components["schemas"]["TaskSummary"];
type TaskDetail = components["schemas"]["TaskDetail"];
type TaskAssigneeOut = components["schemas"]["TaskAssigneeOut"];
type EmployeeOut = components["schemas"]["EmployeeOut"];

const orderId = "b0000000-0000-4000-8000-000000000020";
const orderCode = "DH2610-0008";
const taskId = "d0000000-0000-4000-8000-000000000001";
const taskCode = `${orderCode}-T1`;
const khoaId = "a0000000-0000-4000-8000-000000000081";
const minhId = "a0000000-0000-4000-8000-000000000082";
const dungId = "a0000000-0000-4000-8000-000000000083";
const khoaAssignmentId = "f0000000-0000-4000-8000-000000000101";
const minhAssignmentId = "f0000000-0000-4000-8000-000000000102";

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
    can_revise: false,
    lines: [],
    ...overrides,
  };
}

function summary(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: taskId,
    code: taskCode,
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

function taskDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: taskId,
    code: taskCode,
    order_id: orderId,
    title: "Lắp đặt 4 camera tầng 1",
    description: "Lắp 4 camera tầng 1, đấu nối đầu ghi.",
    origin: "DISPATCH",
    created_in_revision: 0,
    status: "PENDING_ACCEPTANCE",
    estimated_hours: "4.00",
    due_at: "2026-10-05T02:00:00Z", // 09:00 giờ VN
    priority: "HIGH",
    cycle: 1,
    reopen_count: 0,
    last_reopened_in_revision: null,
    order_line_ids: null,
    assignees: [
      { id: khoaAssignmentId, employee_id: khoaId, full_name: "Trần Minh Khoa", status: "PENDING" },
      { id: minhAssignmentId, employee_id: minhId, full_name: "Đỗ Văn Minh", status: "PENDING" },
    ],
    created_by: hoaId,
    created_at: "2026-10-01T03:00:00Z",
    order_status: "IN_PROGRESS",
    order_version: 7,
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
  patches: Record<string, unknown>[];
  adds: Record<string, unknown>[];
  removes: { assignmentId: string; body: Record<string, unknown> }[];
  cancels: Record<string, unknown>[];
}

/** Trang chi tiết đơn + tab "Đầu việc" + mọi route mà `TaskEditSheet` gọi. Giữ 1 bản `current`
 * (mô phỏng lưu trữ ở server) để GET chi tiết đọc được dữ liệu sau khi 1 lệnh thành công — tránh
 * "nhấp nháy rồi quay lại cũ" khi `useTask` refetch sau mỗi mutation. */
function stubEdit({
  person = TUAN,
  personId = tuanId,
  order = detail(),
  task = taskDetail(),
  tasksAfter,
  patchStatus,
  addStatus,
  removeStatus,
  cancelStatus,
}: {
  person?: Person;
  personId?: string;
  order?: OrderDetail;
  task?: TaskDetail;
  tasksAfter?: TaskSummary[];
  patchStatus?: number;
  addStatus?: number;
  removeStatus?: number;
  cancelStatus?: number;
} = {}): Calls {
  const calls: Calls = { patches: [], adds: [], removes: [], cancels: [] };
  let current = task;
  signedInAs(personId, person);
  server.use(
    http.get("/api/v1/me", () => HttpResponse.json(meBody(personId, person, {}))),
    http.get("/api/v1/orders/:id", () => HttpResponse.json(order)),
    http.get("/api/v1/orders/:id/tasks", () => {
      const mutated =
        calls.patches.length + calls.adds.length + calls.removes.length + calls.cancels.length > 0;
      return HttpResponse.json({ items: mutated && tasksAfter ? tasksAfter : [summary()] });
    }),
    http.get("/api/v1/orders/:orderId/tasks/:taskId", () => HttpResponse.json(current)),
    http.get("/api/v1/employees", () =>
      HttpResponse.json({
        items: [
          technician(khoaId, "NV081", "Trần Minh Khoa"),
          technician(minhId, "NV082", "Đỗ Văn Minh"),
          technician(dungId, "NV083", "Lê Văn Dũng"),
        ],
        total: 3,
        limit: 100,
        offset: 0,
      }),
    ),
    http.patch("/api/v1/orders/:orderId/tasks/:taskId", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.patches.push(body);
      if (patchStatus !== undefined) {
        return HttpResponse.json(
          {
            status: patchStatus,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: patchStatus },
        );
      }
      current = { ...current, ...body, order_version: current.order_version + 1 };
      return HttpResponse.json(current);
    }),
    http.post("/api/v1/orders/:orderId/tasks/:taskId/assignees", async ({ request }) => {
      const body = (await request.json()) as { employee_id: string; version: number };
      calls.adds.push(body);
      if (addStatus !== undefined) {
        return HttpResponse.json({ status: addStatus }, { status: addStatus });
      }
      const names: Record<string, string> = {
        [khoaId]: "Trần Minh Khoa",
        [minhId]: "Đỗ Văn Minh",
        [dungId]: "Lê Văn Dũng",
      };
      const newAssignee: TaskAssigneeOut = {
        id: `f0000000-0000-4000-8000-0000000001${String(90 + calls.adds.length)}`,
        employee_id: body.employee_id,
        full_name: names[body.employee_id] ?? "?",
        status: "PENDING",
      };
      current = {
        ...current,
        assignees: [...current.assignees, newAssignee],
        order_version: current.order_version + 1,
      };
      return HttpResponse.json(current);
    }),
    http.post(
      "/api/v1/orders/:orderId/tasks/:taskId/assignees/:assignmentId/remove",
      async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.removes.push({ assignmentId: String(params.assignmentId), body });
        if (removeStatus !== undefined) {
          return HttpResponse.json({ status: removeStatus }, { status: removeStatus });
        }
        const remaining = current.assignees.filter((a) => a.id !== String(params.assignmentId));
        current = {
          ...current,
          assignees: remaining,
          status: remaining.length === 0 ? "NEEDS_ASSIGNEE" : current.status,
          order_version: current.order_version + 1,
        };
        return HttpResponse.json(current);
      },
    ),
    http.post("/api/v1/orders/:orderId/tasks/:taskId/cancel", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.cancels.push(body);
      if (cancelStatus !== undefined) {
        return HttpResponse.json({ status: cancelStatus }, { status: cancelStatus });
      }
      current = {
        ...current,
        status: "CANCELLED",
        assignees: [],
        order_version: current.order_version + 1,
      };
      return HttpResponse.json(current);
    }),
  );
  return calls;
}

/** Mở trang chi tiết đơn, qua tab "Đầu việc", bấm vào task T1 (desktop: dòng; mobile: thẻ —
 * bấm vào chữ trong đó đều nổi bọt lên đúng handler, khuôn `M3-05-clickable-list-rows.md`). */
async function openEditSheet(): Promise<UserEvent> {
  renderApp(`/orders/${orderId}`);
  const user = userEvent.setup();
  await screen.findByText(orderCode);
  await user.click(screen.getByRole("tab", { name: "Đầu việc" }));
  await screen.findByText(taskCode);
  await user.click(screen.getByText("Lắp đặt 4 camera tầng 1"));
  await screen.findByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TaskEditSheet — sửa/thêm/gỡ người/huỷ đầu việc", () => {
  test("AC-DSP-058 bấm vào task mở sheet sửa, điền sẵn đúng dữ liệu + badge người được giao", async () => {
    stubEdit();
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveValue(
      "Lắp đặt 4 camera tầng 1",
    );
    expect(within(dialog).getByLabelText("Mô tả")).toHaveValue(
      "Lắp 4 camera tầng 1, đấu nối đầu ghi.",
    );
    expect(within(dialog).getByLabelText("Số giờ ước tính")).toHaveValue("4");
    expect(within(dialog).getByLabelText("Hạn hoàn thành")).toHaveValue("2026-10-05T09:00");
    expect(within(dialog).getByLabelText("Mức ưu tiên")).toHaveValue("HIGH");

    const assigneeList = within(dialog).getByTestId("task-assignees");
    expect(within(assigneeList).getByText("Trần Minh Khoa")).toBeInTheDocument();
    expect(within(assigneeList).getByText("Đỗ Văn Minh")).toBeInTheDocument();
    expect(within(assigneeList).getAllByText("Chờ tiếp nhận")).toHaveLength(2);
  });

  test("AC-DSP-058 bàn phím: Tab tới mã đầu việc rồi Enter mở sheet (desktop)", async () => {
    stubEdit();
    renderApp(`/orders/${orderId}`);
    const user = userEvent.setup();
    await screen.findByText(orderCode);
    await user.click(screen.getByRole("tab", { name: "Đầu việc" }));
    const codeButton = await screen.findByRole("button", { name: taskCode });
    codeButton.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
  });

  test("AC-DSP-059 sửa title, Lưu → PATCH đúng version, toast, sheet không đóng, danh sách cập nhật", async () => {
    const calls = stubEdit({ tasksAfter: [summary({ title: "Lắp đặt 5 camera tầng 1" })] });
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    const titleField = within(dialog).getByLabelText("Tiêu đề đầu việc");
    await user.clear(titleField);
    await user.type(titleField, "Lắp đặt 5 camera tầng 1");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(calls.patches).toHaveLength(1);
    });
    expect(calls.patches[0]).toMatchObject({
      version: 7,
      title: "Lắp đặt 5 camera tầng 1",
      estimated_hours: 4,
      priority: "HIGH",
    });
    expect(await screen.findByText("Đã lưu thay đổi đầu việc.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` })).toBeInTheDocument();
    expect(await screen.findByText("Lắp đặt 5 camera tầng 1")).toBeInTheDocument();
  });

  test("AC-DSP-061 Lưu 409 STALE_VERSION → Alert + Tải lại, refetch điền lại form", async () => {
    const attempts: Record<string, unknown>[] = [];
    let reloaded = false;
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/me", () => HttpResponse.json(meBody(tuanId, TUAN, {}))),
      http.get("/api/v1/orders/:id", () => HttpResponse.json(detail())),
      http.get("/api/v1/orders/:id/tasks", () => HttpResponse.json({ items: [summary()] })),
      http.get("/api/v1/orders/:orderId/tasks/:taskId", () =>
        HttpResponse.json(
          reloaded
            ? taskDetail({ title: "Lắp đặt 4 camera tầng 1 (đã sửa)", order_version: 8 })
            : taskDetail(),
        ),
      ),
      http.get("/api/v1/employees", () =>
        HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0 }),
      ),
      http.patch("/api/v1/orders/:orderId/tasks/:taskId", async ({ request }) => {
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
        return HttpResponse.json(taskDetail({ ...body, order_version: 9 }));
      }),
    );

    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
    const titleField = within(dialog).getByLabelText("Tiêu đề đầu việc");
    await user.clear(titleField);
    await user.type(titleField, "Tiêu đề mới");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(
      await within(dialog).findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();

    reloaded = true;
    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveValue(
        "Lắp đặt 4 camera tầng 1 (đã sửa)",
      );
    });
  });

  test("AC-DSP-062 Thêm người → add_assignee, toast, danh sách có người mới, picker đóng", async () => {
    stubEdit();
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "+ Thêm người" }));
    const candidates = await within(dialog).findByTestId("assignee-candidates");
    await user.click(within(candidates).getByText(/Lê Văn Dũng/));

    expect(await screen.findByText("Đã thêm Lê Văn Dũng vào đầu việc.")).toBeInTheDocument();
    const assigneeList = within(dialog).getByTestId("task-assignees");
    expect(within(assigneeList).getByText("Lê Văn Dũng")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("assignee-candidates")).not.toBeInTheDocument();
  });

  test("AC-DSP-063 picker không hiện người đã được giao, chỉ hiện KTV hoạt động còn lại", async () => {
    stubEdit();
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "+ Thêm người" }));
    const candidates = within(await within(dialog).findByTestId("assignee-candidates"));

    expect(candidates.getByText(/Lê Văn Dũng/)).toBeInTheDocument();
    expect(candidates.queryByText(/Trần Minh Khoa/)).not.toBeInTheDocument();
    expect(candidates.queryByText(/Đỗ Văn Minh/)).not.toBeInTheDocument();
  });

  test("AC-DSP-064 Gỡ → ConfirmDialog → remove, toast, mất khỏi danh sách; hết người active → Cần giao lại", async () => {
    const soloTask = taskDetail({
      assignees: [
        { id: minhAssignmentId, employee_id: minhId, full_name: "Đỗ Văn Minh", status: "PENDING" },
      ],
    });
    const calls = stubEdit({
      task: soloTask,
      tasksAfter: [summary({ status: "NEEDS_ASSIGNEE", assignees: [] })],
    });
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "Gỡ Đỗ Văn Minh" }));
    expect(
      await screen.findByText("Gỡ Đỗ Văn Minh khỏi đầu việc? Không thể hoàn tác."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gỡ" }));

    expect(await screen.findByText("Đã gỡ Đỗ Văn Minh khỏi đầu việc.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Đỗ Văn Minh")).not.toBeInTheDocument();
    expect(calls.removes).toEqual([{ assignmentId: minhAssignmentId, body: { version: 7 } }]);

    await waitFor(() => {
      expect(
        within(screen.getByTestId("order-tasks")).getByText("Cần giao lại"),
      ).toBeInTheDocument();
    });
  });

  test.each(["DONE", "CANCELLED"])(
    "AC-DSP-065 task %s → sheet chỉ xem, ẩn hết nút sửa, form disabled",
    async (status) => {
      stubEdit({ task: taskDetail({ status }) });
      await openEditSheet();
      const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

      expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "+ Thêm người" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Huỷ đầu việc" }),
      ).not.toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: /^Gỡ /i })).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toBeDisabled();
      expect(
        within(dialog).getByText(status === "DONE" ? "Hoàn thành" : "Đã huỷ"),
      ).toBeInTheDocument();
    },
  );

  test("AC-DSP-066 đơn ngoài DISPATCHABLE_STATUSES → sheet chỉ xem dù task chưa xong", async () => {
    stubEdit({
      order: detail({ status: "AWAITING_CONFIRMATION" }),
      task: taskDetail({ order_status: "AWAITING_CONFIRMATION" }),
    });
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "+ Thêm người" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Huỷ đầu việc" })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toBeDisabled();
  });

  test("AC-DSP-067 Huỷ đầu việc → CancelTaskSheet, lý do <5 ký tự vô hiệu, xác nhận → cancel, 2 sheet đóng", async () => {
    const calls = stubEdit({
      tasksAfter: [summary({ status: "CANCELLED", assignees: [] })],
    });
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "Huỷ đầu việc" }));
    const cancelDialog = await screen.findByRole("dialog", { name: `Huỷ đầu việc ${taskCode}?` });
    const reasonField = within(cancelDialog).getByLabelText("Lý do huỷ");
    await user.type(reasonField, "abc");
    expect(within(cancelDialog).getByRole("button", { name: "Xác nhận huỷ" })).toBeDisabled();
    await user.type(reasonField, " không còn cần nữa");
    await user.click(within(cancelDialog).getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await screen.findByText(`Đã huỷ đầu việc ${taskCode}.`)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Đã huỷ")).toBeInTheDocument();
    expect(calls.cancels).toHaveLength(1);
    expect(calls.cancels[0]).toMatchObject({ version: 7, reason: "abc không còn cần nữa" });
  });

  test("AC-DSP-068 không có task.manage → sheet chỉ xem", async () => {
    stubEdit({ person: HOA, personId: hoaId });
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    expect(within(dialog).queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "+ Thêm người" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Huỷ đầu việc" })).not.toBeInTheDocument();
  });

  test("AC-DSP-069 mobile 390px: sheet cuộn dọc, nút ≥44px", async () => {
    mobile();
    stubEdit();
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    expect(screen.getByTestId("sheet-body").className).toContain("overflow-y-auto");
    expect(within(dialog).getByRole("button", { name: "+ Thêm người" }).className).toContain(
      "min-h-11",
    );
    expect(within(dialog).getByRole("button", { name: "Huỷ đầu việc" }).className).toContain(
      "min-h-11",
    );
    expect(within(dialog).getByRole("button", { name: "Gỡ Trần Minh Khoa" }).className).toContain(
      "min-h-11",
    );
  });
});
