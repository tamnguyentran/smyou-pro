import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

type MyAssignmentOut = components["schemas"]["MyAssignmentOut"];

const khoaId = "a0000000-0000-4000-8000-000000000081";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const KHOA: Person = {
  code: "NV014",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": all, "assignment.respond": all },
};

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
          department: "TECHNICAL",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
  );
  markSignedIn();
}

function assignment(overrides: Partial<MyAssignmentOut> = {}): MyAssignmentOut {
  return {
    assignment_id: "c0000000-0000-4000-8000-000000000001",
    assignment_status: "ACCEPTED",
    task_id: "d0000000-0000-4000-8000-000000000011",
    task_code: "T",
    task_title: "Lắp đặt",
    task_description: null,
    estimated_hours: "3.50",
    due_at: "2026-10-20T00:00:00Z",
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

function mockAssignments(items: MyAssignmentOut[]) {
  server.use(http.get("/api/v1/assignments/me", () => HttpResponse.json({ items })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("/my-tasks đọc `focus` từ URL lúc tải (M10-07c)", () => {
  test("AC-DASH-047 ?focus=not_started: tab Đang làm đã chọn, chỉ hiện ACCEPTED (ẩn IN_PROGRESS)", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "ACCEPTED", task_code: "ACC1" }),
      assignment({
        assignment_id: "a2",
        assignment_status: "IN_PROGRESS",
        task_code: "PROG1",
      }),
    ]);
    renderApp("/my-tasks?focus=not_started");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    expect(within(tabs).getByRole("tab", { name: /Đang làm/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByText("ACC1");
    expect(screen.queryByText("PROG1")).not.toBeInTheDocument();
  });

  test("?focus=active (drill-down từ thẻ 'Đang làm' ở Tổng quan): tab Đang làm đã chọn, không ẩn item nào", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "ACCEPTED", task_code: "ACC1" }),
      assignment({
        assignment_id: "a2",
        assignment_status: "IN_PROGRESS",
        task_code: "PROG1",
      }),
    ]);
    renderApp("/my-tasks?focus=active");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    expect(within(tabs).getByRole("tab", { name: /Đang làm/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByText("ACC1");
    expect(screen.getByText("PROG1")).toBeInTheDocument();
  });

  test("?focus=done (drill-down từ thẻ 'Đã xong hôm nay' ở Tổng quan): tab Đã xong đã chọn", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "DONE", task_code: "DONE1" }),
    ]);
    renderApp("/my-tasks?focus=done");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    expect(within(tabs).getByRole("tab", { name: /Đã xong/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByText("DONE1");
  });

  test("AC-DASH-048 ?focus=overdue: chỉ hiện phân công có due_at đã qua trong số ACCEPTED/IN_PROGRESS", async () => {
    vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({
        assignment_id: "a1",
        assignment_status: "ACCEPTED",
        task_code: "ACC_QUA_HAN",
        due_at: "2026-10-01T00:00:00Z",
      }),
      assignment({
        assignment_id: "a2",
        assignment_status: "IN_PROGRESS",
        task_code: "PROG_QUA_HAN",
        due_at: "2026-10-05T00:00:00Z",
      }),
      assignment({
        assignment_id: "a3",
        assignment_status: "ACCEPTED",
        task_code: "ACC_CHUA_QUA_HAN",
        due_at: "2026-10-20T00:00:00Z",
      }),
      assignment({
        assignment_id: "a4",
        assignment_status: "IN_PROGRESS",
        task_code: "PROG_CHUA_QUA_HAN",
        due_at: "2026-10-20T00:00:00Z",
      }),
    ]);
    renderApp("/my-tasks?focus=overdue");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    expect(within(tabs).getByRole("tab", { name: /Đang làm/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByText("ACC_QUA_HAN");
    expect(screen.getByText("PROG_QUA_HAN")).toBeInTheDocument();
    expect(screen.queryByText("ACC_CHUA_QUA_HAN")).not.toBeInTheDocument();
    expect(screen.queryByText("PROG_CHUA_QUA_HAN")).not.toBeInTheDocument();
  });

  test("AC-DASH-049 không `focus`: tab mặc định Chờ nhận, tab Đang làm vẫn gồm đủ ACCEPTED+IN_PROGRESS (không hồi quy)", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "PENDING", task_code: "PENDING1" }),
      assignment({
        assignment_id: "a2",
        assignment_status: "ACCEPTED",
        task_code: "ACC1",
        due_at: "2026-10-01T00:00:00Z",
      }),
      assignment({
        assignment_id: "a3",
        assignment_status: "IN_PROGRESS",
        task_code: "PROG1",
        due_at: "2026-10-01T00:00:00Z",
      }),
    ]);
    renderApp("/my-tasks");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    expect(within(tabs).getByRole("tab", { name: /Chờ nhận/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByText("PENDING1");

    await userEvent.setup().click(within(tabs).getByRole("tab", { name: /Đang làm/ }));
    expect(await screen.findByText("ACC1")).toBeInTheDocument();
    expect(screen.getByText("PROG1")).toBeInTheDocument();
  });

  test("AC-DASH-047 ?focus=not_started: chuyển tab thủ công rồi quay lại Đang làm thì hết lọc focus (không còn ẩn IN_PROGRESS)", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "PENDING", task_code: "PENDING1" }),
      assignment({ assignment_id: "a2", assignment_status: "ACCEPTED", task_code: "ACC1" }),
      assignment({
        assignment_id: "a3",
        assignment_status: "IN_PROGRESS",
        task_code: "PROG1",
      }),
    ]);
    renderApp("/my-tasks?focus=not_started");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    await screen.findByText("ACC1");
    expect(screen.queryByText("PROG1")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(tabs).getByRole("tab", { name: /Chờ nhận/ }));
    await screen.findByText("PENDING1");
    await user.click(within(tabs).getByRole("tab", { name: /Đang làm/ }));

    expect(await screen.findByText("ACC1")).toBeInTheDocument();
    expect(screen.getByText("PROG1")).toBeInTheDocument();
  });
});
