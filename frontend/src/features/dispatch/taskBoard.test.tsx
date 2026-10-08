import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, anId, HOA, hoaId, signedInAs, TUAN, tuanId } from "./testFixtures";

type TaskBoardItem = components["schemas"]["TaskBoardItem"];
type EmployeeOut = components["schemas"]["EmployeeOut"];
type OrderDetail = components["schemas"]["OrderDetail"];

const khoaId = "a0000000-0000-4000-8000-000000000081";
const minhId = "a0000000-0000-4000-8000-000000000082";
const orderDId = "b0000000-0000-4000-8000-000000000041";
const orderNId = "b0000000-0000-4000-8000-000000000042";
const orderOId = "b0000000-0000-4000-8000-000000000043";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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

function boardItem(overrides: Partial<TaskBoardItem> = {}): TaskBoardItem {
  return {
    id: "d0000000-0000-4000-8000-000000000011",
    code: "DH2610-D01-T1",
    order_id: orderDId,
    order_code: "DH2610-D01",
    title: "Lắp đặt 4 camera tầng 1",
    status: "PENDING_ACCEPTANCE",
    priority: "HIGH",
    estimated_hours: "4.00",
    due_at: "2026-10-05T02:00:00Z",
    assignees: [{ employee_id: khoaId, full_name: "Trần Minh Khoa" }],
    ...overrides,
  };
}

// Fixture spec §3: Đơn D (T1/T2/T5), Đơn N (T3), Đơn O (T4) — khớp `test_dispatch_board_api.py`.
const T1 = boardItem();
const T2 = boardItem({
  id: "d0000000-0000-4000-8000-000000000012",
  code: "DH2610-D01-T2",
  title: "Kiểm tra đầu ghi",
  status: "IN_PROGRESS",
  priority: "NORMAL",
  due_at: "2026-10-06T02:00:00Z",
  assignees: [
    { employee_id: khoaId, full_name: "Trần Minh Khoa" },
    { employee_id: minhId, full_name: "Đỗ Văn Minh" },
  ],
});
const T3 = boardItem({
  id: "d0000000-0000-4000-8000-000000000013",
  code: "DH2610-N01-T3",
  order_id: orderNId,
  order_code: "DH2610-N01",
  title: "Thay dây mạng tầng 2",
  status: "NEEDS_ASSIGNEE",
  priority: "URGENT",
  due_at: "2026-10-04T02:00:00Z",
  assignees: [],
});
const T4 = boardItem({
  id: "d0000000-0000-4000-8000-000000000014",
  code: "DH2610-O01-T4",
  order_id: orderOId,
  order_code: "DH2610-O01",
  title: "Hướng dẫn sử dụng",
  status: "DONE",
  priority: "LOW",
  due_at: "2026-10-01T02:00:00Z",
  assignees: [{ employee_id: minhId, full_name: "Đỗ Văn Minh" }],
});
const T5 = boardItem({
  id: "d0000000-0000-4000-8000-000000000015",
  code: "DH2610-D01-T5",
  title: "Kiểm tra lại camera cổng",
  status: "CANCELLED",
  priority: "NORMAL",
  due_at: "2026-10-07T02:00:00Z",
  assignees: [],
});
const ALL_TASKS = [T1, T2, T3, T4, T5];

/** Lọc như backend thật (`list_board_tasks`): `server.use` 1 lần, dùng lại cho mọi test lọc. */
function mockBoard(items: TaskBoardItem[] = ALL_TASKS) {
  const queries: string[] = [];
  server.use(
    http.get("/api/v1/tasks", ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      const assigneeId = url.searchParams.get("assignee_id");
      const dueFrom = url.searchParams.get("due_from");
      const dueTo = url.searchParams.get("due_to");
      const filtered = items.filter((t) => {
        if (status && t.status !== status) return false;
        if (priority && t.priority !== priority) return false;
        if (assigneeId && !t.assignees.some((a) => a.employee_id === assigneeId)) return false;
        const date = t.due_at.slice(0, 10);
        if (dueFrom && date < dueFrom) return false;
        if (dueTo && date > dueTo) return false;
        return true;
      });
      return HttpResponse.json({ items: filtered });
    }),
    http.get("/api/v1/employees", () =>
      HttpResponse.json({
        items: [
          technician(khoaId, "NV081", "Trần Minh Khoa"),
          technician(minhId, "NV082", "Đỗ Văn Minh"),
        ],
        total: 2,
      }),
    ),
  );
  return queries;
}

const EMPTY_COLUMNS = [
  "PENDING_ACCEPTANCE",
  "ACCEPTED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
] as const;

describe("Bảng đầu việc", () => {
  test("AC-DSP-082 desktop 1440px: 6 cột đúng thứ tự, đúng dữ liệu, gọi API không lọc", async () => {
    signedInAs(tuanId, TUAN);
    const queries = mockBoard();
    renderApp("/dispatch/board");

    expect(
      await screen.findByRole("heading", { name: "Bảng đầu việc", level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(queries).toHaveLength(1);
    });
    expect(queries[0]).not.toMatch(/status=|priority=|assignee_id=|due_from=|due_to=/);

    await screen.findByText("DH2610-N01-T3");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Cần giao lại (1)",
      "Chờ tiếp nhận (1)",
      "Đã tiếp nhận (0)",
      "Đang thực hiện (1)",
      "Hoàn thành (1)",
      "Đã huỷ (1)",
    ]);

    const needsCol = screen.getByTestId("task-board-column-NEEDS_ASSIGNEE");
    expect(within(needsCol).getByText("DH2610-N01-T3")).toBeInTheDocument();
    expect(within(needsCol).getByRole("heading").className).toContain("text-urgent-fg");
    expect(needsCol.className).toContain("border-urgent-border");

    expect(
      within(screen.getByTestId("task-board-column-PENDING_ACCEPTANCE")).getByText("DH2610-D01-T1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("task-board-column-IN_PROGRESS")).getByText("DH2610-D01-T2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("task-board-column-DONE")).getByText("DH2610-O01-T4"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("task-board-column-CANCELLED")).getByText("DH2610-D01-T5"),
    ).toBeInTheDocument();
  });

  test("AC-DSP-083 lọc ưu tiên URGENT: chỉ cột Cần giao lại còn T3, cột khác EmptyState", async () => {
    signedInAs(tuanId, TUAN);
    const queries = mockBoard();
    renderApp("/dispatch/board");
    await screen.findByText("DH2610-N01-T3");

    await userEvent.setup().click(
      within(screen.getByRole("radiogroup", { name: "Ưu tiên" })).getByRole("radio", {
        name: "Khẩn",
      }),
    );
    await waitFor(() => {
      expect(queries).toContain("?priority=URGENT");
    });

    expect(
      within(screen.getByTestId("task-board-column-NEEDS_ASSIGNEE")).getByText("DH2610-N01-T3"),
    ).toBeInTheDocument();
    for (const status of EMPTY_COLUMNS) {
      expect(
        within(screen.getByTestId(`task-board-column-${status}`)).getByText(
          "Không có đầu việc phù hợp.",
        ),
      ).toBeInTheDocument();
    }
  });

  test("AC-DSP-084 lọc KTV Khoa: chỉ T1 T2 còn lại", async () => {
    signedInAs(tuanId, TUAN);
    const queries = mockBoard();
    renderApp("/dispatch/board");
    await screen.findByText("DH2610-N01-T3");

    await userEvent.setup().selectOptions(screen.getByLabelText("Kỹ thuật viên"), khoaId);
    await waitFor(() => {
      expect(queries).toContain(`?assignee_id=${khoaId}`);
    });

    expect(
      within(screen.getByTestId("task-board-column-PENDING_ACCEPTANCE")).getByText("DH2610-D01-T1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("task-board-column-IN_PROGRESS")).getByText("DH2610-D01-T2"),
    ).toBeInTheDocument();
    for (const status of ["NEEDS_ASSIGNEE", "ACCEPTED", "DONE", "CANCELLED"]) {
      expect(
        within(screen.getByTestId(`task-board-column-${status}`)).getByText(
          "Không có đầu việc phù hợp.",
        ),
      ).toBeInTheDocument();
    }
  });

  test("AC-DSP-085 lọc hạn trùng T2; Xoá lọc quay về không lọc", async () => {
    signedInAs(tuanId, TUAN);
    const queries = mockBoard();
    renderApp("/dispatch/board");
    await screen.findByText("DH2610-N01-T3");

    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-10-06" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-06" } });
    await waitFor(() => {
      expect(queries).toContain("?due_from=2026-10-06&due_to=2026-10-06");
    });

    expect(
      within(screen.getByTestId("task-board-column-IN_PROGRESS")).getByText("DH2610-D01-T2"),
    ).toBeInTheDocument();
    for (const status of [
      "NEEDS_ASSIGNEE",
      "PENDING_ACCEPTANCE",
      "ACCEPTED",
      "DONE",
      "CANCELLED",
    ]) {
      expect(
        within(screen.getByTestId(`task-board-column-${status}`)).getByText(
          "Không có đầu việc phù hợp.",
        ),
      ).toBeInTheDocument();
    }

    await userEvent.setup().click(screen.getByRole("button", { name: "Xoá lọc" }));
    await waitFor(() => {
      const last = queries.at(-1) ?? "";
      expect(last).not.toMatch(/due_from=|due_to=/);
    });
    expect(
      await within(screen.getByTestId("task-board-column-PENDING_ACCEPTANCE")).findByText(
        "DH2610-D01-T1",
      ),
    ).toBeInTheDocument();
  });

  test("AC-DSP-086 bấm thẻ T2 → điều hướng /orders/{order_id}, không mở sheet", async () => {
    signedInAs(tuanId, TUAN);
    mockBoard();
    server.use(
      http.get("/api/v1/orders/:id", () =>
        HttpResponse.json({
          id: orderDId,
          code: "DH2610-D01",
          status: "IN_PROGRESS",
          division: "SECURITY",
          customer_id: null,
          customer_name: "Công ty TNHH Minh Phát",
          customer_phone: "0932068787",
          customer_email: null,
          customer_tax_code: null,
          service_address: "12 Lê Lợi, Q1, TP.HCM",
          work_description: "Lắp 4 camera tầng 1",
          priority: "NORMAL",
          requested_date: null,
          payment_method: null,
          payment_status: "UNPAID",
          subtotal: 0,
          discount_amount: 0,
          vat_amount: 0,
          total: 0,
          revision_no: 0,
          version: 1,
          created_by: hoaId,
          allowed_commands: [],
          can_edit_contact: false,
          can_edit_lines_after_submit: false,
          can_upload_confirmation: false,
          can_complete: false,
          lines: [],
        } satisfies OrderDetail),
      ),
      http.get("/api/v1/orders/:id/history", () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
    );
    const router = renderApp("/dispatch/board");
    await screen.findByText("DH2610-D01-T2");

    await userEvent
      .setup()
      .click(screen.getByText("DH2610-D01-T2").closest("button") as HTMLElement);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orders/${orderDId}`);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("AC-DSP-087 mobile 390px: danh sách thẻ + lọc trạng thái, chọn Cần giao lại chỉ còn T3", async () => {
    mobile();
    signedInAs(tuanId, TUAN);
    const queries = mockBoard();
    renderApp("/dispatch/board");
    await screen.findByText("DH2610-N01-T3");

    expect(screen.queryAllByTestId(/task-board-column-/)).toHaveLength(0);
    const statusGroup = screen.getByRole("radiogroup", { name: "Trạng thái" });
    expect(within(statusGroup).getByRole("radio", { name: "Tất cả" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.setup().click(within(statusGroup).getByRole("radio", { name: "Cần giao lại" }));
    await waitFor(() => {
      expect(queries).toContain("?status=NEEDS_ASSIGNEE");
    });
    expect(await screen.findByText("DH2610-N01-T3")).toBeInTheDocument();
    expect(screen.queryByText("DH2610-D01-T1")).not.toBeInTheDocument();
  });

  test("AC-DSP-088 đang tải desktop: 6 khối skeleton (1/cột), aria-busy", async () => {
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/tasks", async () => {
        await delay(50);
        return HttpResponse.json({ items: [] });
      }),
      http.get("/api/v1/employees", () => HttpResponse.json({ items: [], total: 0 })),
    );
    renderApp("/dispatch/board");

    const waiting = await screen.findByLabelText("Đang tải bảng đầu việc");
    expect(waiting).toHaveAttribute("aria-busy", "true");
    expect(waiting.children).toHaveLength(6);
    await waitFor(() => {
      expect(screen.queryByLabelText("Đang tải bảng đầu việc")).not.toBeInTheDocument();
    });
  });

  test("AC-DSP-088 đang tải mobile: 3 khối skeleton, aria-busy", async () => {
    mobile();
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/tasks", async () => {
        await delay(50);
        return HttpResponse.json({ items: [] });
      }),
      http.get("/api/v1/employees", () => HttpResponse.json({ items: [], total: 0 })),
    );
    renderApp("/dispatch/board");

    const waiting = await screen.findByLabelText("Đang tải bảng đầu việc");
    expect(waiting).toHaveAttribute("aria-busy", "true");
    expect(waiting.children).toHaveLength(3);
    await waitFor(() => {
      expect(screen.queryByLabelText("Đang tải bảng đầu việc")).not.toBeInTheDocument();
    });
  });

  test("AC-DSP-089 lỗi tải mobile: EmptyState + Thử lại gọi lại", async () => {
    mobile();
    signedInAs(tuanId, TUAN);
    let calls = 0;
    server.use(
      http.get("/api/v1/tasks", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ status: 500 }, { status: 500 });
        return HttpResponse.json({ items: [] });
      }),
      http.get("/api/v1/employees", () => HttpResponse.json({ items: [], total: 0 })),
    );
    renderApp("/dispatch/board");

    expect(await screen.findByText("Không tải được bảng đầu việc.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có đầu việc phù hợp.")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  test("AC-DSP-089 lỗi tải desktop: EmptyState + Thử lại gọi lại", async () => {
    signedInAs(tuanId, TUAN);
    let calls = 0;
    server.use(
      http.get("/api/v1/tasks", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ status: 500 }, { status: 500 });
        return HttpResponse.json({ items: [] });
      }),
      http.get("/api/v1/employees", () => HttpResponse.json({ items: [], total: 0 })),
    );
    renderApp("/dispatch/board");

    expect(await screen.findByText("Không tải được bảng đầu việc.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => {
      expect(screen.getAllByText("Không có đầu việc phù hợp.")).toHaveLength(6);
    });
    expect(calls).toBe(2);
  });

  test("AC-DSP-090 desktop: mỗi cột hiện EmptyState khi không có task khớp lọc", async () => {
    signedInAs(tuanId, TUAN);
    mockBoard([]);
    renderApp("/dispatch/board");

    await waitFor(() => {
      expect(screen.getAllByText("Không có đầu việc phù hợp.")).toHaveLength(6);
    });
  });

  test("AC-DSP-090 mobile: toàn danh sách hiện EmptyState khi không có task khớp lọc", async () => {
    mobile();
    signedInAs(tuanId, TUAN);
    mockBoard([]);
    renderApp("/dispatch/board");

    expect(await screen.findByText("Không có đầu việc phù hợp.")).toBeInTheDocument();
  });

  test("AC-DSP-091 Hoa (SALE) và An (MANAGER) không có task.manage → 403, không gọi GET /tasks", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/tasks", () => {
        calls += 1;
        return HttpResponse.json({ items: ALL_TASKS });
      }),
      http.get("/api/v1/employees", () => HttpResponse.json({ items: [], total: 0 })),
    );

    signedInAs(hoaId, HOA);
    renderApp("/dispatch/board");
    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    expect(calls).toBe(0);

    signedInAs(anId, AN);
    renderApp("/dispatch/board");
    await waitFor(() => {
      expect(screen.getAllByText("Bạn không có quyền truy cập trang này.")).toHaveLength(2);
    });
    expect(calls).toBe(0);
  });
});
