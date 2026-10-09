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

const orderId = "b0000000-0000-4000-8000-000000000020";
const orderCode = "DH2610-0020";
const taskId = "d0000000-0000-4000-8000-000000000001";
const taskCode = `${orderCode}-T1`;
const khoaId = "a0000000-0000-4000-8000-000000000081";

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: orderId,
    code: orderCode,
    status: "REVISION",
    division: "SECURITY",
    customer_id: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "Lắp đặt camera an ninh",
    priority: "NORMAL",
    requested_date: null,
    payment_method: null,
    payment_status: "UNPAID",
    subtotal: 3000000,
    discount_amount: 0,
    vat_amount: 300000,
    total: 3300000,
    revision_no: 1,
    version: 7,
    created_by: hoaId,
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
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
    title: "Lắp đặt camera tầng 2",
    status: "DONE",
    estimated_hours: "4.00",
    due_at: "2026-10-05T02:00:00Z",
    priority: "HIGH",
    assignees: [{ employee_id: khoaId, full_name: "Trần Minh Khoa" }],
    ...overrides,
  };
}

function taskDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: taskId,
    code: taskCode,
    order_id: orderId,
    title: "Lắp đặt camera tầng 2",
    description: "Lắp camera tầng 2.",
    origin: "DISPATCH",
    created_in_revision: 0,
    status: "DONE",
    estimated_hours: "4.00",
    due_at: "2026-10-05T02:00:00Z",
    priority: "HIGH",
    cycle: 1,
    reopen_count: 0,
    last_reopened_in_revision: null,
    order_line_ids: null,
    assignees: [
      {
        id: "f0000000-0000-4000-8000-000000000101",
        employee_id: khoaId,
        full_name: "Trần Minh Khoa",
        status: "DONE",
      },
    ],
    created_by: hoaId,
    created_at: "2026-10-01T03:00:00Z",
    order_status: "REVISION",
    order_version: 7,
    ...overrides,
  };
}

interface Calls {
  reopens: Record<string, unknown>[];
}

function stub({
  person = TUAN,
  personId = tuanId,
  order = detail(),
  task = taskDetail(),
  tasksAfter,
  reopenStatus,
}: {
  person?: Person;
  personId?: string;
  order?: OrderDetail;
  task?: TaskDetail;
  tasksAfter?: TaskSummary[];
  reopenStatus?: number;
} = {}): Calls {
  const calls: Calls = { reopens: [] };
  let current = task;
  signedInAs(personId, person);
  server.use(
    http.get("/api/v1/me", () => HttpResponse.json(meBody(personId, person, {}))),
    http.get("/api/v1/orders/:id", () => HttpResponse.json(order)),
    http.get("/api/v1/orders/:id/tasks", () =>
      HttpResponse.json({
        items: calls.reopens.length > 0 && tasksAfter ? tasksAfter : [summary()],
      }),
    ),
    http.get("/api/v1/orders/:orderId/tasks/:taskId", () => HttpResponse.json(current)),
    http.post("/api/v1/orders/:orderId/tasks/:taskId/reopen", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.reopens.push(body);
      if (reopenStatus !== undefined) {
        return HttpResponse.json(
          {
            status: reopenStatus,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: reopenStatus },
        );
      }
      current = {
        ...current,
        status: "PENDING_ACCEPTANCE",
        order_version: current.order_version + 1,
        reopen_count: current.reopen_count + 1,
      };
      return HttpResponse.json(current);
    }),
  );
  return calls;
}

async function openEditSheet(): Promise<UserEvent> {
  renderApp(`/orders/${orderId}`);
  const user = userEvent.setup();
  await screen.findByText(orderCode);
  await user.click(screen.getByRole("tab", { name: "Đầu việc" }));
  await screen.findByText(taskCode);
  await user.click(screen.getByText("Lắp đặt camera tầng 2"));
  await screen.findByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Mở lại đầu việc (M6-03b)", () => {
  test("AC-DSP-120 task DONE, đơn REVISION → nút Mở lại hiện; An/Hoa (không có task.reopen) chỉ xem", async () => {
    stub();
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
    expect(within(dialog).getByRole("button", { name: "Mở lại" })).toBeInTheDocument();
  });

  test("AC-DSP-120b Hoa (SALE) không có task.reopen → không có nút Mở lại", async () => {
    stub({ person: HOA, personId: hoaId });
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
    expect(within(dialog).queryByRole("button", { name: "Mở lại" })).not.toBeInTheDocument();
  });

  test("AC-DSP-121 task DONE nhưng đơn AWAITING_CONFIRMATION (chưa Chỉnh sửa) → không có nút Mở lại", async () => {
    stub({
      order: detail({ status: "AWAITING_CONFIRMATION" }),
      task: taskDetail({ order_status: "AWAITING_CONFIRMATION" }),
    });
    await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });
    expect(within(dialog).queryByRole("button", { name: "Mở lại" })).not.toBeInTheDocument();
  });

  test("AC-DSP-122 bấm Mở lại → mở ReopenTaskSheet, Xác nhận mở lại disabled khi thiếu lý do hoặc mức độ", async () => {
    stub();
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "Mở lại" }));
    const reopenDialog = await screen.findByRole("dialog", {
      name: `Mở lại đầu việc ${taskCode}?`,
    });
    expect(
      within(reopenDialog).getByText("Hệ thống sẽ ghi nhận lỗi cho (những) người đã làm."),
    ).toBeInTheDocument();
    expect(within(reopenDialog).getByRole("button", { name: "Xác nhận mở lại" })).toBeDisabled();

    await user.type(within(reopenDialog).getByLabelText("Lý do"), "Lắp sai vị trí camera");
    expect(within(reopenDialog).getByRole("button", { name: "Xác nhận mở lại" })).toBeDisabled();

    await user.selectOptions(within(reopenDialog).getByLabelText("Mức độ lỗi"), "MAJOR");
    expect(
      within(reopenDialog).getByRole("button", { name: "Xác nhận mở lại" }),
    ).not.toBeDisabled();
  });

  test("AC-DSP-123 nhập lý do + chọn Nặng, xác nhận → gọi reopen đúng version+reason+severity, toast, task Chờ tiếp nhận", async () => {
    const calls = stub({
      tasksAfter: [summary({ status: "PENDING_ACCEPTANCE" })],
    });
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "Mở lại" }));
    const reopenDialog = await screen.findByRole("dialog", {
      name: `Mở lại đầu việc ${taskCode}?`,
    });
    await user.type(within(reopenDialog).getByLabelText("Lý do"), "Lắp sai vị trí camera");
    await user.selectOptions(within(reopenDialog).getByLabelText("Mức độ lỗi"), "MAJOR");
    await user.click(within(reopenDialog).getByRole("button", { name: "Xác nhận mở lại" }));

    expect(await screen.findByText(`Đã mở lại đầu việc ${taskCode}.`)).toBeInTheDocument();
    expect(calls.reopens).toHaveLength(1);
    expect(calls.reopens[0]).toEqual({
      version: 7,
      reason: "Lắp sai vị trí camera",
      severity: "MAJOR",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: `Mở lại đầu việc ${taskCode}?` }),
      ).not.toBeInTheDocument();
    });
  });

  test("AC-DSP-124 STALE_VERSION ở ReopenTaskSheet → banner đỏ + nút Tải lại", async () => {
    stub({ reopenStatus: 409 });
    const user = await openEditSheet();
    const dialog = screen.getByRole("dialog", { name: `Sửa đầu việc — ${taskCode}` });

    await user.click(within(dialog).getByRole("button", { name: "Mở lại" }));
    const reopenDialog = await screen.findByRole("dialog", {
      name: `Mở lại đầu việc ${taskCode}?`,
    });
    await user.type(within(reopenDialog).getByLabelText("Lý do"), "Lắp sai vị trí camera");
    await user.selectOptions(within(reopenDialog).getByLabelText("Mức độ lỗi"), "MINOR");
    await user.click(within(reopenDialog).getByRole("button", { name: "Xác nhận mở lại" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });
});
