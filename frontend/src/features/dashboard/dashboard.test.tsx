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

const lanCskId = "a0000000-0000-4000-8000-000000000090";
const LAN_CSK: Person = {
  code: "NV021",
  full_name: "Đỗ Thị Lan CSKH",
  email: "lan.csk@smyou.vn",
  roles: ["CUSTOMER_CARE"],
  capabilities: { "dashboard.read": ["all"] },
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
        overdue_count: 0,
      },
    });
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    for (const [label, value] of [
      ["Nháp", "2"],
      ["Chờ điều phối", "3"],
      ["Đang thực hiện", "1"],
      ["Chờ KH xác nhận", "0"],
      ["Hoàn tất", "0"],
      ["Chỉnh sửa", "0"],
      ["Đã huỷ", "0"],
    ] as const) {
      const tile = (await screen.findByText(label)).closest("div") as HTMLElement;
      expect(within(tile).getByText(value)).toBeInTheDocument();
    }
  });

  test("AC-DASH-053 nút Làm mới gọi lại GET /dashboard", async () => {
    signedInAs("hoa-id", HOA);
    let calls = 0;
    server.use(
      http.get("/api/v1/dashboard", () => {
        calls += 1;
        return HttpResponse.json({
          order_summary: {
            scope: "own",
            counts_by_status: {
              DRAFT: 0,
              PENDING_DISPATCH: 0,
              IN_PROGRESS: 0,
              AWAITING_CONFIRMATION: 0,
              COMPLETED: 0,
              REVISION: 0,
              CANCELLED: 0,
            },
            overdue_count: 0,
          },
        } satisfies Dashboard);
      }),
    );
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    await waitFor(() => {
      expect(calls).toBe(1);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => {
      expect(calls).toBe(2);
    });
  });

  test("AC-DASH-011 desktop 1440px: Tuấn (TECH_LEAD) thấy 3 thẻ điều phối, 'Quá hạn' tông urgent khi > 0", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      dispatch_summary: {
        pending_dispatch_count: 4,
        in_progress_order_count: 0,
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
        in_progress_order_count: 0,
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

    const empty = await screen.findByText("Không có việc nào đến hạn hôm nay.");
    expect(empty).toBeInTheDocument();
    // "không CTA" nghĩa là card rỗng không có nút riêng — không tính nút "Làm mới" chung của trang.
    const section = empty.closest("section") as HTMLElement;
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
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
      my_task_summary: {
        pending_count: 2,
        active_count: 3,
        done_today_count: 1,
        not_started_count: 0,
        overdue_count: 0,
        awaiting_confirmation_count: 0,
      },
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
        overdue_count: 0,
      },
      dispatch_summary: {
        pending_dispatch_count: 1,
        in_progress_order_count: 1,
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
        pending_acceptance_count: 0,
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
    const idleTile = screen.getByText("Chờ giao việc").closest("div") as HTMLElement;
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

  test("AC-DASH-031 Hoa mobile 390px: thẻ order_summary vẫn vùng chạm ≥44px, lưới 2 cột như cũ", async () => {
    mobile();
    signedInAs("hoa-id", HOA);
    mockDashboard({
      order_summary: {
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
      },
    });
    renderApp("/");

    // M18-01a: thẻ đơn giờ là <button> mở popup (AC-DASH-084), vẫn giữ vùng chạm/lưới cũ.
    const tile = (await screen.findByText("Chờ điều phối")).closest("button") as HTMLElement;
    expect(tile.className).toContain("min-h-11");
    const grid = tile.closest(".grid") as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
  });

  test("AC-DASH-042 (M10-07b) thứ tự 4 thẻ staff_summary: Đang làm, Chưa tiếp nhận, Chưa thực hiện, Chờ giao việc", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      staff_summary: {
        active_technician_count: 3,
        counts_by_status: { IN_PROGRESS: 1, NOT_STARTED: 1, IDLE: 1 },
        pending_acceptance_count: 1,
      },
    });
    renderApp("/");

    await screen.findByText("Nhân sự kỹ thuật (3 đang hoạt động)");
    const labels = screen
      .getAllByText(/^(Đang làm|Chưa tiếp nhận|Chưa thực hiện|Chờ giao việc)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Đang làm", "Chưa tiếp nhận", "Chưa thực hiện", "Chờ giao việc"]);
  });

  test("AC-DASH-051 (M10-07b) in_progress_order_count/pending_acceptance_count = 0 vẫn hiện và bấm được", async () => {
    signedInAs("tuan-id", TUAN);
    mockDashboard({
      dispatch_summary: {
        pending_dispatch_count: 0,
        in_progress_order_count: 0,
        needs_assignee_count: 0,
        overdue_task_count: 0,
      },
      staff_summary: {
        active_technician_count: 0,
        counts_by_status: { IN_PROGRESS: 0, NOT_STARTED: 0, IDLE: 0 },
        pending_acceptance_count: 0,
      },
    });
    renderApp("/");

    // M18-01a: "Đang thực hiện" (khối Điều phối) giờ là <button> mở popup, vẫn bấm được khi = 0.
    const inProgressOrderTile = (await screen.findByText("Đang thực hiện")).closest(
      "button",
    ) as HTMLElement;
    expect(inProgressOrderTile.getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(inProgressOrderTile).getByText("0")).toBeInTheDocument();

    // M18-01b: "Chưa tiếp nhận" (khối Nhân sự) cũng mở popup, vẫn bấm được khi = 0.
    const pendingAcceptanceTile = (await screen.findByText("Chưa tiếp nhận")).closest(
      "button",
    ) as HTMLElement;
    expect(pendingAcceptanceTile.getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(pendingAcceptanceTile).getByText("0")).toBeInTheDocument();
  });

  const TOP_CUSTOMERS = [
    {
      customer_id: "e0000000-0000-4000-8000-000000000001",
      customer_code: "KH001",
      customer_name: "Cty TNHH Phát Đạt",
      order_count: 3,
      total_revenue: 15_000_000,
    },
    {
      customer_id: "e0000000-0000-4000-8000-000000000002",
      customer_code: "KH002",
      customer_name: "Cty Sáng Tạo Mới",
      order_count: 1,
      total_revenue: 5_000_000,
    },
  ];
  const FEEDBACK_SUMMARY = { "5": 3, "4": 2, "3": 1, "2": 1, "1": 1, none: 2 };

  test("AC-DASH-058 desktop 1440px: An (MANAGER) thấy bảng Top 10 khách hàng + 5 thẻ sao có màu đúng mức", async () => {
    signedInAs("an-id", AN);
    mockDashboard({ top_customers: TOP_CUSTOMERS, feedback_summary: FEEDBACK_SUMMARY });
    renderApp("/");

    await screen.findByText("Top 10 khách hàng (tháng này)");
    const table = screen.getByRole("table");
    expect(within(table).getByText("KH001")).toBeInTheDocument();
    expect(within(table).getByText("Cty TNHH Phát Đạt")).toBeInTheDocument();
    expect(within(table).getByText("15.000.000 ₫")).toBeInTheDocument();

    await screen.findByText("Phản hồi – đánh giá từ khách hàng (tháng này)");
    const fiveStarTile = screen.getByText("5★").closest("div") as HTMLElement;
    expect(fiveStarTile.className).toContain("completed");
    const threeStarTile = screen.getByText("3★").closest("div") as HTMLElement;
    expect(threeStarTile.className).toContain("review");
    const oneStarTile = screen.getByText("1★").closest("div") as HTMLElement;
    expect(oneStarTile.className).toContain("urgent");
    expect(screen.queryByText(/chưa đánh giá/i)).not.toBeInTheDocument();

    // AC-DASH-058: 2 khối "cạnh" nhau ở desktop — khác AC-DASH-059 (mobile xếp dọc) — cùng 1
    // container lưới 2 cột từ `lg:` trở lên.
    const topHeading = screen.getByText("Top 10 khách hàng (tháng này)");
    const feedbackHeading = screen.getByText("Phản hồi – đánh giá từ khách hàng (tháng này)");
    expect(topHeading.closest("section")?.parentElement).toBe(
      feedbackHeading.closest("section")?.parentElement,
    );
    expect(topHeading.closest("section")?.parentElement?.className).toContain("lg:grid-cols-2");
  });

  test("AC-DASH-059 mobile 390px: Lan (CUSTOMER_CARE) thấy 2 khối xếp dọc, Top 10 là thẻ không phải bảng", async () => {
    mobile();
    signedInAs(lanCskId, LAN_CSK);
    mockDashboard({ top_customers: TOP_CUSTOMERS, feedback_summary: FEEDBACK_SUMMARY });
    renderApp("/");

    await screen.findByText("Top 10 khách hàng (tháng này)");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("KH001")).toBeInTheDocument();
    expect(
      await screen.findByText("Phản hồi – đánh giá từ khách hàng (tháng này)"),
    ).toBeInTheDocument();
  });

  test("AC-DASH-064 desktop 1440px: An (MANAGER) thấy 3 thẻ CSKH trước khối Top 10/Phản hồi", async () => {
    signedInAs("an-id", AN);
    mockDashboard({
      care_summary: { today: 2, month: 8 },
      care_staff_count: 3,
      orders_needing_revision_count: 2,
      top_customers: TOP_CUSTOMERS,
      feedback_summary: FEEDBACK_SUMMARY,
    });
    renderApp("/");

    const heading = await screen.findByText("Chăm sóc khách hàng (tháng này)");
    const section = heading.closest("section") as HTMLElement;
    expect(within(section).getByText("Khách hàng đã chăm sóc")).toBeInTheDocument();
    expect(within(section).getByText("8")).toBeInTheDocument();
    expect(within(section).getByText("Hôm nay: 2")).toBeInTheDocument();
    expect(within(section).getByText("NV đã gọi điện CSKH")).toBeInTheDocument();
    expect(within(section).getByText("3")).toBeInTheDocument();
    expect(within(section).getByText("Đơn hàng phải sửa")).toBeInTheDocument();
    expect(within(section).getByText("2")).toBeInTheDocument();

    const feedbackHeading = await screen.findByText(
      "Phản hồi – đánh giá từ khách hàng (tháng này)",
    );
    // AC-DASH-064: khối CSKH phải nằm trước khối Top 10/Phản hồi trong DOM.
    expect(
      heading.compareDocumentPosition(feedbackHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("AC-DASH-065 mobile 390px: Lan (CUSTOMER_CARE) thấy 3 thẻ CSKH xếp lưới không vỡ layout", async () => {
    mobile();
    signedInAs(lanCskId, LAN_CSK);
    mockDashboard({
      care_summary: { today: 0, month: 0 },
      care_staff_count: 0,
      orders_needing_revision_count: 0,
      top_customers: TOP_CUSTOMERS,
      feedback_summary: FEEDBACK_SUMMARY,
    });
    renderApp("/");

    await screen.findByText("Chăm sóc khách hàng (tháng này)");
    expect(screen.getByText("Khách hàng đã chăm sóc")).toBeInTheDocument();
    expect(screen.getByText("NV đã gọi điện CSKH")).toBeInTheDocument();
    expect(screen.getByText("Đơn hàng phải sửa")).toBeInTheDocument();
  });
});
