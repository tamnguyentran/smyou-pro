import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, HOA, signedInAs, TUAN, type Person } from "../dispatch/testFixtures";

type Dashboard = components["schemas"]["DashboardOut"];
type CardItems = components["schemas"]["DashboardCardItemsOut"];
type OrderRow = components["schemas"]["DashboardOrderRow"];
type TaskRow = components["schemas"]["DashboardTaskRow"];
type StaffRow = components["schemas"]["DashboardStaffRow"];
type FeedbackRow = components["schemas"]["DashboardFeedbackRow"];
type CareStaffRow = components["schemas"]["DashboardCareStaffRow"];

const ORDER_SUMMARY: NonNullable<Dashboard["order_summary"]> = {
  scope: "own",
  counts_by_status: {
    DRAFT: 0,
    PENDING_DISPATCH: 3,
    IN_PROGRESS: 0,
    AWAITING_CONFIRMATION: 0,
    COMPLETED: 0,
    REVISION: 0,
    CANCELLED: 0,
  },
  overdue_count: 0,
};
const DISPATCH_SUMMARY: NonNullable<Dashboard["dispatch_summary"]> = {
  pending_dispatch_count: 0,
  in_progress_order_count: 0,
  needs_assignee_count: 2,
  overdue_task_count: 2,
};

function orderRow(n: number, overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    order_id: `b0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    order_code: `DH2610-00${String(10 + n)}`,
    customer_name: `Khách hàng ${String(n)}`,
    customer_phone: "0901234567",
    created_by_name: "Lê Thị Hoa",
    status: "PENDING_DISPATCH",
    created_at: "2026-10-29T03:00:00Z",
    total: 12_500_000,
    ...overrides,
  };
}

function taskRow(n: number, overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    task_id: `d0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    task_code: `DH2610-0012-T${String(n)}`,
    task_title: `Lắp camera ${String(n)}`,
    order_id: "b0000000-0000-4000-8000-000000000041",
    order_code: "DH2610-0012",
    customer_name: "Công ty TNHH Phát Đạt",
    assignee_names: ["Trần Minh Khoa"],
    due_at: "2026-10-28T02:00:00Z",
    status: "ACCEPTED",
    assignment_status: null,
    ...overrides,
  };
}

function orderItems(
  card: string,
  label: string,
  items: OrderRow[],
  total = items.length,
): CardItems {
  return { card, label, kind: "order", total, page: 1, page_size: 20, order_items: items };
}

function mockDashboard(data: Dashboard) {
  server.use(http.get("/api/v1/dashboard", () => HttpResponse.json(data)));
}

/** Records the `card` path param + query of every `/items` call. */
function mockItems(body: CardItems | ((page: number) => CardItems)) {
  const calls: { card: string; page: string | null }[] = [];
  server.use(
    http.get("/api/v1/dashboard/cards/:card/items", ({ params, request }) => {
      const page = new URL(request.url).searchParams.get("page");
      calls.push({ card: String(params.card), page });
      return HttpResponse.json(typeof body === "function" ? body(Number(page ?? "1")) : body);
    }),
  );
  return calls;
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

/** First render loads the lazy dashboard route; the 1s default flakes under a full parallel run. */
const COLD_START = { timeout: 3000 };

async function openTile(name: RegExp, section?: string) {
  const scope = section
    ? within(
        (await screen.findByRole("heading", { name: section }, COLD_START)).closest(
          "section",
        ) as HTMLElement,
      )
    : screen;
  const tile = await scope.findByRole("button", { name }, COLD_START);
  await userEvent.setup().click(tile);
  return tile;
}

const createObjectURL = vi.fn(() => "blob:card-export");
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createObjectURL.mockClear();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = vi.fn();
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Popup chi tiết thẻ Tổng quan (M18-01a)", () => {
  test("AC-DASH-077 desktop: Hoa bấm 'Chờ điều phối' → popup bảng, không chuyển trang, có 'Xuất Excel', mã đơn link chi tiết", async () => {
    signedInAs("hoa-id", HOA);
    mockDashboard({ order_summary: ORDER_SUMMARY });
    const calls = mockItems(
      orderItems("order.PENDING_DISPATCH", "Chờ điều phối", [
        orderRow(1),
        orderRow(2),
        orderRow(3),
      ]),
    );
    const router = renderApp("/");

    await openTile(/Chờ điều phối/);

    const dialog = await screen.findByRole("dialog", { name: "Chờ điều phối (3)" }, COLD_START);
    expect(router.state.location.pathname).toBe("/");
    expect(calls[0]?.card).toBe("order.PENDING_DISPATCH");
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Mã đơn", "Khách hàng", "SĐT", "Người tạo", "Ngày tạo", "Tổng tiền"]);
    expect(within(dialog).getByRole("button", { name: /Xuất Excel/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "DH2610-0011" })).toHaveAttribute(
      "href",
      "/orders/b0000000-0000-4000-8000-000000000001",
    );
    expect(within(dialog).getAllByText("29/10/2026 10:00")).toHaveLength(3);
    expect(within(dialog).getAllByText(/12\.500\.000/)).toHaveLength(3);
  });

  test("AC-DASH-078 mobile: sheet từ dưới, danh sách thẻ, không có 'Xuất Excel'", async () => {
    mobile();
    signedInAs("hoa-id", HOA);
    mockDashboard({ order_summary: ORDER_SUMMARY });
    mockItems(orderItems("order.PENDING_DISPATCH", "Chờ điều phối", [orderRow(1), orderRow(2)]));
    renderApp("/");

    await openTile(/Chờ điều phối/);

    const dialog = await screen.findByRole("dialog", { name: "Chờ điều phối (2)" });
    await within(dialog).findByText("DH2610-0011");
    expect(within(dialog).queryByRole("table")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Xuất Excel/ })).toBeNull();
    expect(within(dialog).getByTestId("sheet-panel").className).toContain("bottom-0");
    const card = within(dialog).getAllByRole("listitem")[0] as HTMLElement;
    expect(within(card).getByText("DH2610-0011")).toBeInTheDocument();
    expect(within(card).getByText("Khách hàng 1")).toBeInTheDocument();
    expect(within(card).getByText("29/10/2026 10:00")).toBeInTheDocument();
  });

  test("AC-DASH-079 Tuấn desktop bấm 'Quá hạn' (Điều phối) → 'Đầu việc quá hạn (n)', cột đầu việc, hạn tô urgent", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({ dispatch_summary: DISPATCH_SUMMARY });
    const calls = mockItems({
      card: "dispatch.overdue_tasks",
      label: "Đầu việc quá hạn",
      kind: "task",
      total: 2,
      page: 1,
      page_size: 20,
      task_items: [taskRow(1), taskRow(2, { assignee_names: [] })],
    });
    renderApp("/");

    await openTile(/Quá hạn/, "Điều phối");

    const dialog = await screen.findByRole("dialog", { name: "Đầu việc quá hạn (2)" });
    expect(calls[0]?.card).toBe("dispatch.overdue_tasks");
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Mã đầu việc", "Đầu việc", "Mã đơn", "Khách hàng", "KTV", "Hạn"]);
    expect(within(dialog).getByText("Trần Minh Khoa")).toBeInTheDocument();
    const due = within(dialog).getAllByText("28/10/2026 09:00")[0] as HTMLElement;
    expect(due.className).toContain("text-urgent-fg");
  });

  test("AC-DASH-080 An (MANAGER, không task.manage) bấm 'Cần giao lại' → danh sách chỉ đọc, link đơn, không link /dispatch/board", async () => {
    signedInAs("an-id", AN);
    mockDashboard({ dispatch_summary: DISPATCH_SUMMARY });
    mockItems({
      card: "dispatch.needs_assignee",
      label: "Cần giao lại",
      kind: "task",
      total: 1,
      page: 1,
      page_size: 20,
      task_items: [taskRow(1, { status: "NEEDS_ASSIGNEE", assignee_names: [] })],
    });
    renderApp("/");

    await openTile(/Cần giao lại/, "Điều phối");

    const dialog = await screen.findByRole("dialog", { name: "Cần giao lại (1)" });
    await within(dialog).findByText("Lắp camera 1");
    expect(within(dialog).getByRole("link", { name: "DH2610-0012" })).toHaveAttribute(
      "href",
      "/orders/b0000000-0000-4000-8000-000000000041",
    );
    const hrefs = within(dialog)
      .queryAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/dispatch"))).toBe(false);
  });

  test("AC-DASH-081 'Xuất Excel': gọi /export đúng thẻ, 'Đang xuất…' + vô hiệu khi đang tải, tải file; lỗi mạng → toast", async () => {
    signedInAs("hoa-id", HOA);
    mockDashboard({ order_summary: ORDER_SUMMARY });
    mockItems(orderItems("order.PENDING_DISPATCH", "Chờ điều phối", [orderRow(1)]));
    const exported: string[] = [];
    server.use(
      http.get("/api/v1/dashboard/cards/:card/export", async ({ params }) => {
        exported.push(String(params.card));
        await delay(50);
        return new HttpResponse("﻿Mã đơn\n", {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="tong-quan-cho-dieu-phoi-2026-10-30.csv"',
          },
        });
      }),
    );
    renderApp("/");
    await openTile(/Chờ điều phối/);
    const dialog = await screen.findByRole("dialog", { name: "Chờ điều phối (1)" });
    const user = userEvent.setup();

    await user.click(within(dialog).getByRole("button", { name: /Xuất Excel/ }));
    const busy = await within(dialog).findByRole("button", { name: /Đang xuất…/ });
    expect(busy).toBeDisabled();
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    expect(exported).toEqual(["order.PENDING_DISPATCH"]);
    expect(anchorClick).toHaveBeenCalled();
    expect(await within(dialog).findByRole("button", { name: /Xuất Excel/ })).toBeEnabled();

    server.use(http.get("/api/v1/dashboard/cards/:card/export", () => HttpResponse.error()));
    await user.click(within(dialog).getByRole("button", { name: /Xuất Excel/ }));
    expect(await screen.findByText("Không xuất được file, vui lòng thử lại.")).toBeInTheDocument();
  });

  test("AC-DASH-082 đang tải: skeleton 3 dòng; rỗng: EmptyState + ẩn 'Xuất Excel'; lỗi: thông báo + 'Thử lại'", async () => {
    signedInAs("hoa-id", HOA);
    mockDashboard({ order_summary: ORDER_SUMMARY });
    let mode: "slow" | "empty" | "error" = "slow";
    server.use(
      http.get("/api/v1/dashboard/cards/:card/items", async () => {
        if (mode === "slow") {
          await delay(100);
          return HttpResponse.json(orderItems("order.DRAFT", "Nháp", []));
        }
        if (mode === "error") return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
        return HttpResponse.json(orderItems("order.DRAFT", "Nháp", []));
      }),
    );
    renderApp("/");
    const user = userEvent.setup();

    await openTile(/Nháp/);
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByTestId("card-detail-skeleton-row")).toHaveLength(3);
    expect(await within(dialog).findByText("Không có dữ liệu")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Xuất Excel/ })).toBeNull();
    await user.keyboard("{Escape}");

    mode = "error";
    await openTile(/Nháp/);
    dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Không tải được danh sách.")).toBeInTheDocument();
    mode = "empty";
    await user.click(within(dialog).getByRole("button", { name: "Thử lại" }));
    expect(await within(dialog).findByText("Không có dữ liệu")).toBeInTheDocument();
  });

  test("AC-DASH-083 total=45: Pagination 20 dòng/trang; Esc và nút 'Đóng' (≥44px) đóng popup, focus về thẻ vừa bấm", async () => {
    signedInAs("an-id", AN);
    mockDashboard({
      order_summary: {
        ...ORDER_SUMMARY,
        scope: "all",
        counts_by_status: { ...ORDER_SUMMARY.counts_by_status, COMPLETED: 45 },
      },
    });
    const calls = mockItems((page) => ({
      ...orderItems(
        "order.COMPLETED",
        "Hoàn tất",
        Array.from({ length: page < 3 ? 20 : 5 }, (_, i) =>
          orderRow(i + 1, { order_code: `DH-P${String(page)}-${String(i + 1)}` }),
        ),
        45,
      ),
      page,
    }));
    renderApp("/");
    const user = userEvent.setup();

    const tile = await openTile(/Hoàn tất/);
    const dialog = await screen.findByRole("dialog", { name: "Hoàn tất (45)" });
    await within(dialog).findByText("DH-P1-1");
    expect(within(dialog).getByText("1–20 / 45")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Trang sau" }));
    await within(dialog).findByText("DH-P2-1");
    expect(within(dialog).getByText("21–40 / 45")).toBeInTheDocument();
    expect(calls.map((c) => c.page)).toEqual(["1", "2"]);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(tile);

    await user.click(tile);
    const reopened = await screen.findByRole("dialog");
    const close = within(reopened).getByRole("button", { name: /Đóng/ });
    expect(close.className).toContain("size-11");
    await user.click(close);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(tile);
  });

  test("AC-DASH-083 đang tải trang 2: vẫn giữ tiêu đề có số, Pagination và dòng trang 1 (không nháy skeleton)", async () => {
    signedInAs("an-id", AN);
    mockDashboard({
      order_summary: {
        ...ORDER_SUMMARY,
        scope: "all",
        counts_by_status: { ...ORDER_SUMMARY.counts_by_status, COMPLETED: 45 },
      },
    });
    server.use(
      http.get("/api/v1/dashboard/cards/:card/items", async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
        if (page > 1) await delay(300);
        return HttpResponse.json({
          ...orderItems(
            "order.COMPLETED",
            "Hoàn tất",
            Array.from({ length: 20 }, (_, i) =>
              orderRow(i + 1, { order_code: `DH-P${String(page)}-${String(i + 1)}` }),
            ),
            45,
          ),
          page,
        });
      }),
    );
    renderApp("/");
    const user = userEvent.setup();

    await openTile(/Hoàn tất/);
    const dialog = await screen.findByRole("dialog", { name: "Hoàn tất (45)" });
    await within(dialog).findByText("DH-P1-1");
    await user.click(within(dialog).getByRole("button", { name: "Trang sau" }));

    expect(screen.getByRole("dialog", { name: "Hoàn tất (45)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Trang trước" })).toBeInTheDocument();
    expect(within(dialog).queryAllByTestId("card-detail-skeleton-row")).toHaveLength(0);
    await within(dialog).findByText("DH-P2-1");
  });

  test("AC-DASH-084 bàn phím: Tab tới thẻ 'Chờ điều phối' (<button>, aria-haspopup) + Enter mở popup", async () => {
    signedInAs("hoa-id", HOA);
    mockDashboard({ order_summary: ORDER_SUMMARY });
    mockItems(orderItems("order.PENDING_DISPATCH", "Chờ điều phối", [orderRow(1)]));
    const router = renderApp("/");

    const tile = await screen.findByRole("button", { name: /Chờ điều phối/ });
    expect(tile.tagName).toBe("BUTTON");
    expect(tile.getAttribute("aria-haspopup")).toBe("dialog");
    expect(tile.className).toContain("focus-visible:ring-2");
    tile.focus();
    await userEvent.setup().keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "Chờ điều phối (1)" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});

const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["self"], "order.read_prices": ["assigned"] },
};
const TASK_SUMMARY: NonNullable<Dashboard["task_summary"]> = {
  counts_by_status: {
    NEEDS_ASSIGNEE: 1,
    PENDING_ACCEPTANCE: 1,
    ACCEPTED: 1,
    IN_PROGRESS: 4,
    DONE: 1,
    CANCELLED: 1,
  },
};
const STAFF_SUMMARY: NonNullable<Dashboard["staff_summary"]> = {
  active_technician_count: 3,
  counts_by_status: { IN_PROGRESS: 1, NOT_STARTED: 1, IDLE: 1 },
  pending_acceptance_count: 1,
};
const MY_TASK_SUMMARY: NonNullable<Dashboard["my_task_summary"]> = {
  pending_count: 1,
  active_count: 2,
  done_today_count: 1,
  not_started_count: 1,
  overdue_count: 1,
  awaiting_confirmation_count: 1,
};

function staffRow(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    employee_id: "a0000000-0000-4000-8000-000000000015",
    employee_code: "NV015",
    full_name: "Võ Thành Minh",
    phone: "0912345678",
    open_assignment_count: 0,
    in_progress_assignment_count: 0,
    ...overrides,
  };
}

describe("Popup chi tiết khối Đầu việc / Nhân sự / Việc của tôi (M18-01b)", () => {
  test("AC-DASH-098 Tuấn desktop bấm 'Đang thực hiện' (khối Đầu việc) → popup đầu việc, cột KTV, Excel, không link /dispatch", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({ task_summary: TASK_SUMMARY });
    const calls = mockItems({
      card: "task.IN_PROGRESS",
      label: "Đang thực hiện",
      kind: "task",
      total: 4,
      page: 1,
      page_size: 20,
      task_items: [1, 2, 3, 4].map((n) => taskRow(n, { status: "IN_PROGRESS" })),
    });
    const router = renderApp("/");

    await openTile(/Đang thực hiện/, "Đầu việc theo trạng thái");

    const dialog = await screen.findByRole("dialog", { name: "Đang thực hiện (4)" });
    expect(router.state.location.pathname).toBe("/");
    expect(calls[0]?.card).toBe("task.IN_PROGRESS");
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Mã đầu việc", "Đầu việc", "Mã đơn", "Khách hàng", "KTV", "Hạn"]);
    expect(within(dialog).getByRole("button", { name: /Xuất Excel/ })).toBeInTheDocument();
    const hrefs = within(dialog)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/orders/b0000000-0000-4000-8000-000000000041");
    expect(hrefs.some((h) => h.startsWith("/dispatch"))).toBe(false);
  });

  test("AC-DASH-099 An (MANAGER) bấm 'Chờ giao việc' (khối Nhân sự) → popup nhân viên, không link", async () => {
    signedInAs("an-id", AN);
    mockDashboard({ staff_summary: STAFF_SUMMARY });
    const calls = mockItems({
      card: "staff.IDLE",
      label: "Chờ giao việc",
      kind: "staff",
      total: 1,
      page: 1,
      page_size: 20,
      staff_items: [staffRow()],
    });
    renderApp("/");

    await openTile(/Chờ giao việc/, "Nhân sự kỹ thuật (3 đang hoạt động)");

    const dialog = await screen.findByRole("dialog", { name: "Chờ giao việc (1)" });
    expect(calls[0]?.card).toBe("staff.IDLE");
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Mã NV", "Họ tên", "SĐT", "Số việc đang mở", "Số việc đang làm"]);
    expect(within(dialog).getByText("Võ Thành Minh")).toBeInTheDocument();
    expect(within(dialog).getByText("NV015")).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
  });

  test("AC-DASH-100 Đức mobile bấm 'Quá hạn chưa hoàn thành' → sheet, thẻ đầu việc, hạn urgent, nhãn phân công, không Excel", async () => {
    mobile();
    signedInAs("duc-id", DUC);
    mockDashboard({ my_task_summary: MY_TASK_SUMMARY });
    const calls = mockItems({
      card: "mine.overdue",
      label: "Quá hạn chưa hoàn thành",
      kind: "task",
      total: 1,
      page: 1,
      page_size: 20,
      task_items: [taskRow(1, { assignment_status: "ACCEPTED" })],
    });
    renderApp("/");

    await openTile(/Quá hạn chưa hoàn thành/, "Đầu việc của tôi");

    const dialog = await screen.findByRole("dialog", { name: "Quá hạn chưa hoàn thành (1)" });
    expect(calls[0]?.card).toBe("mine.overdue");
    expect(within(dialog).getByTestId("sheet-panel").className).toContain("bottom-0");
    expect(within(dialog).queryByRole("table")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Xuất Excel/ })).toBeNull();
    const card = within(dialog).getAllByRole("listitem")[0] as HTMLElement;
    expect(within(card).getByText("Lắp camera 1")).toBeInTheDocument();
    expect(within(card).getByText(/DH2610-0012-T1/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "DH2610-0012" })).toBeInTheDocument();
    expect(within(card).getByText("28/10/2026 09:00").className).toContain("text-urgent-fg");
    expect(within(card).getByText("Đã nhận")).toBeInTheDocument();
    expect(within(card).queryByText("Trần Minh Khoa")).toBeNull();
  });

  test("AC-DASH-100 Đức desktop: thẻ 'Việc của tôi' ẩn cột KTV, có cột Trạng thái (nhãn phân công)", async () => {
    signedInAs("duc-id", DUC);
    mockDashboard({ my_task_summary: MY_TASK_SUMMARY });
    mockItems({
      card: "mine.active",
      label: "Đang làm",
      kind: "task",
      total: 2,
      page: 1,
      page_size: 20,
      task_items: [
        taskRow(1, { assignment_status: "ACCEPTED" }),
        taskRow(2, { assignment_status: "IN_PROGRESS" }),
      ],
    });
    renderApp("/");

    await openTile(/Đang làm/, "Đầu việc của tôi");

    const dialog = await screen.findByRole("dialog", { name: "Đang làm (2)" });
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Mã đầu việc",
      "Đầu việc",
      "Mã đơn",
      "Khách hàng",
      "Hạn",
      "Trạng thái",
    ]);
    expect(within(dialog).getByText("Đã nhận")).toBeInTheDocument();
    expect(within(dialog).getByText("Đang làm")).toBeInTheDocument();
  });

  test("AC-DASH-101 Đức desktop bấm 'Chờ KH xác nhận' → popup dòng đơn, cột như popup đơn, URL không đổi", async () => {
    signedInAs("duc-id", DUC);
    mockDashboard({ my_task_summary: MY_TASK_SUMMARY });
    const calls = mockItems(
      orderItems("mine.awaiting_confirmation", "Chờ KH xác nhận", [
        orderRow(1, { status: "AWAITING_CONFIRMATION" }),
      ]),
    );
    const router = renderApp("/");

    await openTile(/Chờ KH xác nhận/, "Đầu việc của tôi");

    const dialog = await screen.findByRole("dialog", { name: "Chờ KH xác nhận (1)" });
    expect(calls[0]?.card).toBe("mine.awaiting_confirmation");
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Mã đơn", "Khách hàng", "SĐT", "Người tạo", "Ngày tạo", "Tổng tiền"]);
    expect(router.state.location.pathname).toBe("/");
  });

  test("AC-DASH-102 bàn phím: 16 thẻ là <button aria-haspopup> có focus ring; Enter mở, Esc đóng + trả focus", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({ task_summary: TASK_SUMMARY, staff_summary: STAFF_SUMMARY });
    const calls = mockItems({
      card: "staff.IN_PROGRESS",
      label: "Đang làm",
      kind: "staff",
      total: 1,
      page: 1,
      page_size: 20,
      staff_items: [staffRow({ in_progress_assignment_count: 1, open_assignment_count: 1 })],
    });
    renderApp("/");

    const sections = [
      await screen.findByRole("heading", { name: "Đầu việc theo trạng thái" }),
      await screen.findByRole("heading", { name: "Nhân sự kỹ thuật (3 đang hoạt động)" }),
    ];
    const tiles = sections.flatMap((h) =>
      within(h.closest("section") as HTMLElement).getAllByRole("button"),
    );
    expect(tiles).toHaveLength(10);
    for (const tile of tiles) {
      expect(tile.tagName).toBe("BUTTON");
      expect(tile.getAttribute("aria-haspopup")).toBe("dialog");
      expect(tile.className).toContain("focus-visible:ring-2");
    }

    const staffTile = within(sections[1]?.closest("section") as HTMLElement).getByRole("button", {
      name: /Đang làm/,
    });
    staffTile.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Đang làm (1)" })).toBeInTheDocument();
    expect(calls[0]?.card).toBe("staff.IN_PROGRESS");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(staffTile);
  });

  test.each([
    {
      who: "Tuấn",
      person: TUAN,
      dashboard: { task_summary: TASK_SUMMARY } satisfies Dashboard,
      section: "Đầu việc theo trạng thái",
      tile: /Đang thực hiện/,
      card: "task.IN_PROGRESS",
      label: "Đang thực hiện",
    },
    {
      who: "Đức",
      person: DUC,
      dashboard: { my_task_summary: MY_TASK_SUMMARY } satisfies Dashboard,
      section: "Đầu việc của tôi",
      tile: /Quá hạn chưa hoàn thành/,
      card: "mine.overdue",
      label: "Quá hạn chưa hoàn thành",
    },
  ])(
    "AC-DASH-102 bàn phím $who thẻ $card: Enter mở popup, Esc đóng + trả focus về thẻ",
    async ({ person, dashboard, section, tile: name, card, label }) => {
      signedInAs("kb-id", person);
      mockDashboard(dashboard);
      const calls = mockItems({
        card,
        label,
        kind: "task",
        total: 1,
        page: 1,
        page_size: 20,
        task_items: [taskRow(1)],
      });
      renderApp("/");

      const heading = await screen.findByRole("heading", { name: section }, COLD_START);
      const tile = within(heading.closest("section") as HTMLElement).getByRole("button", { name });
      tile.focus();
      const user = userEvent.setup();
      await user.keyboard("{Enter}");
      expect(await screen.findByRole("dialog", { name: `${label} (1)` })).toBeInTheDocument();
      expect(calls[0]?.card).toBe(card);
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(document.activeElement).toBe(tile);
    },
  );

  test("AC-DASH-102 Đức: 6 thẻ 'Việc của tôi' đều là <button aria-haspopup>", async () => {
    signedInAs("duc-id", DUC);
    mockDashboard({ my_task_summary: MY_TASK_SUMMARY });
    renderApp("/");

    const heading = await screen.findByRole("heading", { name: "Đầu việc của tôi" });
    const tiles = within(heading.closest("section") as HTMLElement).getAllByRole("button");
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      expect(tile.getAttribute("aria-haspopup")).toBe("dialog");
    }
  });
});

const LINH: Person = {
  code: "NV023",
  full_name: "Phan Thị Linh",
  email: "linh.csk@smyou.vn",
  roles: ["CUSTOMER_CARE"],
  capabilities: { "dashboard.read": ["all"] },
};
const MINH_PHAT_ID = "c0000000-0000-4000-8000-000000000012";
const HOANG_GIA_ID = "c0000000-0000-4000-8000-000000000031";
const CUSTOMER_SECTIONS: Dashboard = {
  care_summary: { today: 1, month: 3 },
  care_staff_count: 2,
  orders_needing_revision_count: 2,
  feedback_summary: { "5": 3, "4": 2, "3": 1, "2": 1, "1": 0, none: 1 },
  top_customers: [
    {
      customer_id: MINH_PHAT_ID,
      customer_code: "KH0012",
      customer_name: "Công ty TNHH Minh Phát",
      order_count: 3,
      total_revenue: 18_500_000,
    },
    {
      customer_id: HOANG_GIA_ID,
      customer_code: "KH0031",
      customer_name: "Nhà sách Hoàng Gia",
      order_count: 1,
      total_revenue: 4_000_000,
    },
  ],
};

function feedbackRow(n: number, overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    order_id: `b0000000-0000-4000-8000-0000000000${String(40 + n)}`,
    order_code: `DH2610-00${String(40 + n)}`,
    customer_name: "Công ty TNHH Minh Phát",
    customer_phone: "0912345678",
    csat_rating: 5,
    csat_comment: "Lắp camera gọn gàng",
    recorded_by_name: "Phan Thị Linh",
    recorded_at: "2026-10-28T07:05:00Z",
    completed_at: "2026-10-27T03:00:00Z",
    ...overrides,
  };
}

function feedbackItems(card: string, label: string, items: FeedbackRow[]): CardItems {
  return {
    card,
    label,
    kind: "feedback",
    total: items.length,
    page: 1,
    page_size: 20,
    feedback_items: items,
  };
}

function careStaffRow(overrides: Partial<CareStaffRow> = {}): CareStaffRow {
  return {
    employee_id: "a0000000-0000-4000-8000-000000000023",
    employee_code: "NV023",
    full_name: "Phan Thị Linh",
    care_count: 4,
    last_recorded_at: "2026-10-28T07:05:00Z",
    ...overrides,
  };
}

function headersOf(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole("columnheader")
    .map((th) => th.textContent);
}

const CARE = "Chăm sóc khách hàng (tháng này)";
const FEEDBACK = "Phản hồi – đánh giá từ khách hàng (tháng này)";
const TOP = "Top 10 khách hàng (tháng này)";

describe("Popup chi tiết khối CSKH / Phản hồi / Top 10 (M18-01c)", () => {
  test("AC-DASH-116 Linh desktop bấm 'Khách hàng đã chăm sóc' → popup phản hồi, Excel, link đơn, URL không đổi", async () => {
    signedInAs("linh-id", LINH);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      feedbackItems("care.customers", "Khách hàng đã chăm sóc", [
        feedbackRow(1),
        feedbackRow(2, { csat_rating: 3, csat_comment: null, recorded_by_name: "Vũ Thị Mai" }),
        feedbackRow(3, { csat_rating: 4 }),
      ]),
    );
    const router = renderApp("/");

    await openTile(/Khách hàng đã chăm sóc/, CARE);

    const dialog = await screen.findByRole("dialog", { name: "Khách hàng đã chăm sóc (3)" });
    expect(router.state.location.pathname).toBe("/");
    expect(calls[0]?.card).toBe("care.customers");
    expect(headersOf(dialog)).toEqual([
      "Mã đơn",
      "Khách hàng",
      "SĐT",
      "Số sao",
      "Nhận xét",
      "Người ghi nhận",
      "Thời điểm ghi nhận",
    ]);
    expect(within(dialog).getByRole("button", { name: /Xuất Excel/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "DH2610-0041" }).getAttribute("href")).toBe(
      "/orders/b0000000-0000-4000-8000-000000000041",
    );
    expect(within(dialog).getByText("3★")).toBeInTheDocument();
    expect(within(dialog).getByText("Vũ Thị Mai")).toBeInTheDocument();
    expect(within(dialog).getAllByText("28/10/2026 14:05")).toHaveLength(3);
  });

  test("AC-DASH-117 An desktop bấm 'NV đã gọi điện CSKH' → popup nhân viên CSKH, không link", async () => {
    signedInAs("an-id", AN);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems({
      card: "care.staff",
      label: "NV đã gọi điện CSKH",
      kind: "care_staff",
      total: 2,
      page: 1,
      page_size: 20,
      care_staff_items: [
        careStaffRow(),
        careStaffRow({
          employee_id: "a0000000-0000-4000-8000-000000000028",
          employee_code: "NV028",
          full_name: "Vũ Thị Mai",
          care_count: 1,
        }),
      ],
    });
    renderApp("/");

    await openTile(/NV đã gọi điện CSKH/, CARE);

    const dialog = await screen.findByRole("dialog", { name: "NV đã gọi điện CSKH (2)" });
    expect(calls[0]?.card).toBe("care.staff");
    expect(headersOf(dialog)).toEqual(["Mã NV", "Họ tên", "Số KH đã chăm sóc", "Lần ghi gần nhất"]);
    expect(within(dialog).getByText("Phan Thị Linh")).toBeInTheDocument();
    expect(within(dialog).getByText("NV028")).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
  });

  test("AC-DASH-117 An desktop bấm 'Đơn hàng phải sửa' → popup đơn cùng cột M18-01a", async () => {
    signedInAs("an-id", AN);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      orderItems("care.revision_orders", "Đơn hàng phải sửa", [orderRow(1), orderRow(2)]),
    );
    renderApp("/");

    await openTile(/Đơn hàng phải sửa/, CARE);

    const dialog = await screen.findByRole("dialog", { name: "Đơn hàng phải sửa (2)" });
    expect(calls[0]?.card).toBe("care.revision_orders");
    expect(headersOf(dialog)).toEqual([
      "Mã đơn",
      "Khách hàng",
      "SĐT",
      "Người tạo",
      "Ngày tạo",
      "Tổng tiền",
    ]);
  });

  test("AC-DASH-118 An desktop bấm '2★' → popup 'Đánh giá 2★', thẻ giữ tông urgent", async () => {
    signedInAs("an-id", AN);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      feedbackItems("feedback.2", "Đánh giá 2★", [feedbackRow(1, { csat_rating: 2 })]),
    );
    renderApp("/");

    const tile = await openTile(/^2★/, FEEDBACK);

    const dialog = await screen.findByRole("dialog", { name: "Đánh giá 2★ (1)" });
    expect(calls[0]?.card).toBe("feedback.2");
    expect(headersOf(dialog)).toContain("Số sao");
    expect((tile.querySelector("div") as HTMLElement).className).toContain("urgent");
  });

  test("AC-DASH-119 An desktop bấm mã 'KH0012' trong Top 10 → popup đơn của khách, Excel, bảng Top 10 giữ cột", async () => {
    signedInAs("an-id", AN);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      orderItems(`top.${MINH_PHAT_ID}`, "Công ty TNHH Minh Phát (KH0012)", [
        orderRow(1, { status: "COMPLETED", total: 8_000_000 }),
        orderRow(2, { status: "COMPLETED", total: 6_500_000 }),
        orderRow(3, { status: "COMPLETED", total: 4_000_000 }),
      ]),
    );
    const router = renderApp("/");

    const heading = await screen.findByRole("heading", { name: TOP }, COLD_START);
    const section = heading.closest("section") as HTMLElement;
    expect(
      within(within(section).getByRole("table"))
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Mã KH", "Tên", "Số đơn", "Doanh thu"]);
    await userEvent.setup().click(within(section).getByRole("button", { name: /KH0012/ }));

    const dialog = await screen.findByRole("dialog", {
      name: "Công ty TNHH Minh Phát (KH0012) (3)",
    });
    expect(calls[0]?.card).toBe(`top.${MINH_PHAT_ID}`);
    expect(router.state.location.pathname).toBe("/");
    expect(within(dialog).getAllByRole("row")).toHaveLength(4);
    expect(within(dialog).getByRole("button", { name: /Xuất Excel/ })).toBeInTheDocument();
  });

  test("AC-DASH-120 Linh mobile bấm '4★' → sheet, thẻ phản hồi, không Excel", async () => {
    mobile();
    signedInAs("linh-id", LINH);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      feedbackItems("feedback.4", "Đánh giá 4★", [
        feedbackRow(1, { csat_rating: 4, csat_comment: "Kỹ thuật viên đến đúng giờ" }),
      ]),
    );
    renderApp("/");

    await openTile(/^4★/, FEEDBACK);

    const dialog = await screen.findByRole("dialog", { name: "Đánh giá 4★ (1)" });
    expect(calls[0]?.card).toBe("feedback.4");
    expect(within(dialog).getByTestId("sheet-panel").className).toContain("bottom-0");
    expect(within(dialog).queryByRole("table")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Xuất Excel/ })).toBeNull();
    const card = within(dialog).getAllByRole("listitem")[0] as HTMLElement;
    expect(within(card).getByRole("link", { name: "DH2610-0041" })).toBeInTheDocument();
    expect(within(card).getByText("Công ty TNHH Minh Phát")).toBeInTheDocument();
    expect(within(card).getByText(/4★/)).toBeInTheDocument();
    expect(within(card).getByText("Kỹ thuật viên đến đúng giờ").className).toContain(
      "line-clamp-2",
    );
  });

  test("AC-DASH-120 Linh mobile bấm thẻ 'Nhà sách Hoàng Gia' trong Top 10 → sheet đơn, không Excel", async () => {
    mobile();
    signedInAs("linh-id", LINH);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      orderItems(`top.${HOANG_GIA_ID}`, "Nhà sách Hoàng Gia (KH0031)", [
        orderRow(1, { status: "COMPLETED", total: null }),
      ]),
    );
    renderApp("/");

    await openTile(/Nhà sách Hoàng Gia/, TOP);

    const dialog = await screen.findByRole("dialog", { name: "Nhà sách Hoàng Gia (KH0031) (1)" });
    expect(calls[0]?.card).toBe(`top.${HOANG_GIA_ID}`);
    expect(within(dialog).getByTestId("sheet-panel").className).toContain("bottom-0");
    expect(within(dialog).queryByRole("button", { name: /Xuất Excel/ })).toBeNull();
  });

  test("AC-DASH-121 bàn phím: 8 thẻ + nút Top 10 là <button aria-haspopup> có focus ring, ≥44px; Enter mở, Esc trả focus", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard(CUSTOMER_SECTIONS);
    const calls = mockItems(
      feedbackItems("feedback.5", "Đánh giá 5★", [feedbackRow(1), feedbackRow(2), feedbackRow(3)]),
    );
    renderApp("/");

    const sectionOf = async (name: string) =>
      (await screen.findByRole("heading", { name }, COLD_START)).closest("section") as HTMLElement;
    const care = within(await sectionOf(CARE)).getAllByRole("button");
    const feedback = within(await sectionOf(FEEDBACK)).getAllByRole("button");
    const top = within(await sectionOf(TOP)).getAllByRole("button");
    expect(care).toHaveLength(3);
    expect(feedback).toHaveLength(5);
    expect(top).toHaveLength(2);
    for (const button of [...care, ...feedback, ...top]) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("aria-haspopup")).toBe("dialog");
      expect(button.className).toContain("focus-visible:ring-2");
      expect(button.className).toContain("min-h-11");
    }

    const five = feedback[0] as HTMLElement;
    five.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Đánh giá 5★ (3)" })).toBeInTheDocument();
    expect(calls[0]?.card).toBe("feedback.5");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(five);
  });
});
