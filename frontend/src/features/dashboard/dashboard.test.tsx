import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, HOA, signedInAs, TUAN, type Person } from "../dispatch/testFixtures";

type Dashboard = components["schemas"]["DashboardOut"];
type MyAssignmentOut = components["schemas"]["MyAssignmentOut"];

const ducId = "a0000000-0000-4000-8000-000000000082";
const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["self"] },
};

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

function mockDashboard(data: Dashboard) {
  server.use(http.get("/api/v1/dashboard", () => HttpResponse.json(data)));
}

function assignment(overrides: Partial<MyAssignmentOut> = {}): MyAssignmentOut {
  return {
    assignment_id: "c0000000-0000-4000-8000-000000000001",
    assignment_status: "ACCEPTED",
    task_id: "d0000000-0000-4000-8000-000000000011",
    task_code: "DH2610-0012-T1",
    task_title: "Lắp 4 camera ngoài trời",
    task_description: null,
    estimated_hours: "3.50",
    due_at: "2026-10-09T02:00:00Z",
    priority: "NORMAL",
    order_id: "b0000000-0000-4000-8000-000000000041",
    order_code: "DH2610-0012",
    order_version: 3,
    customer_name: "Công ty TNHH Phát Đạt",
    customer_phone: "0932068787",
    service_address: "45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM",
    completion_note: null,
    actual_hours: null,
    ...overrides,
  };
}

describe("Tổng quan", () => {
  test("AC-DASH-010 mobile 390px: Hoa (SALE) thấy 7 thẻ trạng thái đơn, thẻ 0 vẫn hiện", async () => {
    mobile();
    signedInAs("hoa-id", HOA);
    mockDashboard({
      order_summary: {
        scope: "own",
        counts_by_status: {
          DRAFT: 2,
          PENDING_DISPATCH: 3,
          IN_PROGRESS: 1,
          AWAITING_CONFIRMATION: 0,
          COMPLETED: 0,
          REVISION: 0,
          CANCELLED: 0,
        },
      },
    });
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    for (const [label, value] of [
      ["Nháp", "2"],
      ["Chờ điều phối", "3"],
      ["Đang thực hiện", "1"],
      ["Hoàn thành, chờ KH xác nhận", "0"],
      ["Hoàn tất", "0"],
      ["Chỉnh sửa", "0"],
      ["Đã huỷ", "0"],
    ] as const) {
      const tile = (await screen.findByText(label)).closest("div") as HTMLElement;
      expect(within(tile).getByText(value)).toBeInTheDocument();
    }
  });

  test("AC-DASH-011 desktop 1440px: Tuấn (TECH_LEAD) thấy 3 thẻ điều phối, 'Quá hạn' tông urgent khi > 0", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      dispatch_summary: {
        pending_dispatch_count: 4,
        needs_assignee_count: 3,
        overdue_task_count: 2,
      },
    });
    renderApp("/");

    await screen.findByText("Chờ điều phối");
    const overdueValue = (await screen.findByText("2")).closest("div") as HTMLElement;
    expect(overdueValue.className).toContain("urgent");
    const pendingDispatchTile = screen.getByText("4").closest("div") as HTMLElement;
    expect(pendingDispatchTile.className).not.toContain("urgent");
  });

  test("AC-DASH-011b 'Quá hạn' tông trung tính khi = 0", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      dispatch_summary: {
        pending_dispatch_count: 0,
        needs_assignee_count: 0,
        overdue_task_count: 0,
      },
    });
    renderApp("/");

    await screen.findByText("Quá hạn");
    const [firstZeroTile] = screen.getAllByText("0");
    const overdueValue = (firstZeroTile as HTMLElement).closest("div") as HTMLElement;
    expect(overdueValue.className).not.toContain("urgent");
  });

  test("AC-DASH-012 Đức (TECHNICIAN), today_tasks rỗng: icon + câu trung tính, không CTA", async () => {
    signedInAs(ducId, DUC);
    mockDashboard({ today_tasks: [] });
    renderApp("/");

    expect(await screen.findByText("Không có việc nào đến hạn hôm nay.")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("button")).not.toBeInTheDocument();
  });

  test("AC-DASH-013 Đức, 2 việc hôm nay (1 quá hạn): hạn chót quá hạn hiện màu đỏ", async () => {
    signedInAs(ducId, DUC);
    mockDashboard({
      today_tasks: [
        assignment({
          assignment_id: "a-overdue",
          task_code: "DH2610-0012-T2",
          due_at: "2020-01-01T02:00:00Z",
        }),
        assignment({ assignment_id: "a-today", task_code: "DH2610-0012-T1" }),
      ],
    });
    renderApp("/");

    const overdueCard = (await screen.findByText("DH2610-0012-T2")).closest("li") as HTMLElement;
    expect(within(overdueCard).getByText(/2020|\//).className).toContain("text-urgent-fg");
  });

  test("AC-DASH-021 (M7-02d) Đức (TECHNICIAN) thấy khối 'Đầu việc của tôi' đúng 3 số", async () => {
    signedInAs(ducId, DUC);
    mockDashboard({
      my_task_summary: { pending_count: 2, active_count: 3, done_today_count: 1 },
      today_tasks: [],
    });
    renderApp("/");

    expect(await screen.findByText("Đầu việc của tôi")).toBeInTheDocument();
    const pendingTile = (await screen.findByText("Chờ nhận")).closest("div") as HTMLElement;
    expect(within(pendingTile).getByText("2")).toBeInTheDocument();
    const activeTile = screen.getByText("Đang làm").closest("div") as HTMLElement;
    expect(within(activeTile).getByText("3")).toBeInTheDocument();
    const doneTile = screen.getByText("Đã xong hôm nay").closest("div") as HTMLElement;
    expect(within(doneTile).getByText("1")).toBeInTheDocument();
  });

  test("AC-DASH-014 An (MANAGER): thấy cả khối đơn + khối điều phối, có tiêu đề phụ rõ ràng", async () => {
    signedInAs("an-id", AN);
    mockDashboard({
      order_summary: {
        scope: "all",
        counts_by_status: {
          DRAFT: 1,
          PENDING_DISPATCH: 1,
          IN_PROGRESS: 1,
          AWAITING_CONFIRMATION: 1,
          COMPLETED: 1,
          REVISION: 1,
          CANCELLED: 1,
        },
      },
      dispatch_summary: {
        pending_dispatch_count: 1,
        needs_assignee_count: 1,
        overdue_task_count: 1,
      },
    });
    renderApp("/");

    expect(await screen.findByText("Đơn theo trạng thái")).toBeInTheDocument();
    expect(screen.getByText("Điều phối")).toBeInTheDocument();
  });

  test("AC-DASH-016 Tuấn (TECH_LEAD) thấy 6 thẻ đầu việc theo trạng thái, 'Cần giao lại' tông urgent khi > 0", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      task_summary: {
        counts_by_status: {
          NEEDS_ASSIGNEE: 2,
          PENDING_ACCEPTANCE: 1,
          ACCEPTED: 3,
          IN_PROGRESS: 4,
          DONE: 5,
          CANCELLED: 0,
        },
      },
    });
    renderApp("/");

    expect(await screen.findByText("Đầu việc theo trạng thái")).toBeInTheDocument();
    const needsAssigneeTile = (await screen.findByText("2")).closest("div") as HTMLElement;
    expect(needsAssigneeTile.className).toContain("urgent");
    for (const [label, value] of [
      ["Chờ tiếp nhận", "1"],
      ["Đã tiếp nhận", "3"],
      ["Đang thực hiện", "4"],
      ["Hoàn thành", "5"],
      ["Đã huỷ", "0"],
    ] as const) {
      const tile = (await screen.findByText(label)).closest("div") as HTMLElement;
      expect(within(tile).getByText(value)).toBeInTheDocument();
    }
  });

  test("AC-DASH-017 Tuấn (TECH_LEAD) thấy khối nhân sự 3 nhóm, đúng số và tông màu", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      staff_summary: {
        active_technician_count: 5,
        counts_by_status: { IN_PROGRESS: 2, NOT_STARTED: 1, IDLE: 2 },
      },
    });
    renderApp("/");

    expect(await screen.findByText("Nhân sự kỹ thuật (5 đang hoạt động)")).toBeInTheDocument();
    const inProgressTile = (await screen.findByText("Đang làm")).closest("div") as HTMLElement;
    expect(within(inProgressTile).getByText("2")).toBeInTheDocument();
    expect(inProgressTile.className).toContain("in_progress");
    const notStartedTile = screen.getByText("Chưa thực hiện").closest("div") as HTMLElement;
    expect(within(notStartedTile).getByText("1")).toBeInTheDocument();
    expect(notStartedTile.className).toContain("review");
    const idleTile = screen.getByText("Chưa có đầu việc").closest("div") as HTMLElement;
    expect(within(idleTile).getByText("2")).toBeInTheDocument();
    expect(idleTile.className).toContain("urgent");
  });

  test("AC-DASH-015 lỗi tải API: trạng thái lỗi chung + nút Tải lại hoạt động", async () => {
    signedInAs("an-id", AN);
    let calls = 0;
    server.use(
      http.get("/api/v1/dashboard", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 })
          : HttpResponse.json({ order_summary: null, dispatch_summary: null, today_tasks: null });
      }),
    );
    renderApp("/");

    const reloadButton = await screen.findByRole("button", { name: "Tải lại" });
    await userEvent.setup().click(reloadButton);
    await waitFor(() => {
      expect(calls).toBe(2);
    });
  });
});
