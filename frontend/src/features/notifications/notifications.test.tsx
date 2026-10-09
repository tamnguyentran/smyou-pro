import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test } from "vitest";
import type { components } from "../../lib/api/schema";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

type Notification = components["schemas"]["NotificationOut"];
type OrderDetail = components["schemas"]["OrderDetail"];

const id = "7d1f0c2e-0000-4000-8000-000000000060";
const orderId = "b0000000-0000-4000-8000-000000000099";
const SELF = ["self"];

const FULL_CAPS = {
  "dashboard.read": SELF,
  "notification.read": SELF,
  "order.read": SELF,
  "profile.manage": SELF,
};
const NO_NOTIFICATION_CAPS = {
  "dashboard.read": SELF,
  "order.read": SELF,
  "profile.manage": SELF,
};

function meBody(capabilities: Record<string, string[]>, unreadCount: number) {
  return {
    employee: {
      id,
      code: "NV014",
      full_name: "Trần Minh Khoa",
      email: "khoa.tran@smyou.vn",
      title: null,
      department: "TECHNICAL",
    },
    roles: ["TECHNICIAN"],
    capabilities,
    counters: {},
    unread_notifications_count: unreadCount,
  };
}

function signedInAs(capabilities: Record<string, string[]>, unreadCount: number) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: "NV014", full_name: "Trần Minh Khoa", roles: ["TECHNICIAN"] },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () => HttpResponse.json(meBody(capabilities, unreadCount))),
  );
  markSignedIn();
}

function notif(overrides: Partial<Notification> & { id: string }): Notification {
  return {
    type: "TASK_ASSIGNED",
    title: "Bạn được giao đầu việc mới",
    body: "Đầu việc Lắp đặt 4 camera tầng 1 (đơn DH2610-0008).",
    entity_type: "ORDER",
    entity_id: orderId,
    read_at: null,
    created_at: "2026-10-09T03:00:00Z",
    ...overrides,
  };
}

function orderDetail(): OrderDetail {
  return {
    id: orderId,
    code: "DH2610-0008",
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
    created_by: id,
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: false,
    lines: [],
  };
}

afterEach(() => {
  server.resetHandlers();
});

describe("Trang /thong-bao", () => {
  test("AC-NTF-026 AC-NTF-031 giữ đúng thứ tự, phân biệt đã/chưa đọc", async () => {
    signedInAs(FULL_CAPS, 3);
    const items = [
      notif({ id: "n1", title: "Thông báo 1" }),
      notif({ id: "n2", title: "Thông báo 2" }),
      notif({ id: "n3", title: "Thông báo 3" }),
      notif({ id: "n4", title: "Thông báo 4", read_at: "2026-10-09T02:00:00Z" }),
      notif({ id: "n5", title: "Thông báo 5", read_at: "2026-10-09T01:00:00Z" }),
    ];
    server.use(
      http.get("/api/v1/notifications", () =>
        HttpResponse.json({ items, total: items.length, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/thong-bao");

    const titles = await screen.findAllByText(/^Thông báo \d$/);
    expect(titles.map((t) => t.textContent)).toEqual([
      "Thông báo 1",
      "Thông báo 2",
      "Thông báo 3",
      "Thông báo 4",
      "Thông báo 5",
    ]);
    for (const n of ["Thông báo 1", "Thông báo 2", "Thông báo 3"]) {
      expect(screen.getByText(n).closest("a")).toHaveAttribute("data-unread", "true");
    }
    for (const n of ["Thông báo 4", "Thông báo 5"]) {
      expect(screen.getByText(n).closest("a")).toHaveAttribute("data-unread", "false");
    }
  });

  test("AC-NTF-027 danh sách rỗng hiện EmptyState", async () => {
    signedInAs(FULL_CAPS, 0);
    server.use(
      http.get("/api/v1/notifications", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/thong-bao");
    expect(await screen.findByText("Chưa có thông báo.")).toBeInTheDocument();
  });

  test("AC-NTF-028 bấm dòng chưa đọc → đánh dấu đã đọc + điều hướng tới đơn", async () => {
    signedInAs(FULL_CAPS, 1);
    const state = [notif({ id: "n1", title: "Thông báo 1" })];
    const readCalls: string[] = [];
    server.use(
      http.get("/api/v1/notifications", () =>
        HttpResponse.json({ items: state, total: state.length, limit: 20, offset: 0 }),
      ),
      http.post("/api/v1/notifications/:id/read", ({ params }) => {
        const notifId = params.id as string;
        readCalls.push(notifId);
        const item = state.find((n) => n.id === notifId);
        if (item) item.read_at = "2026-10-09T04:00:00Z";
        return HttpResponse.json(item);
      }),
      http.get("/api/v1/orders/:id", () => HttpResponse.json(orderDetail())),
    );
    const router = renderApp("/thong-bao");
    const row = await screen.findByText("Thông báo 1");
    await userEvent.setup().click(row);

    await waitFor(() => {
      expect(readCalls).toEqual(["n1"]);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orders/${orderId}`);
    });

    void router.navigate("/thong-bao");
    await waitFor(() => {
      expect(screen.getByText("Thông báo 1").closest("a")).toHaveAttribute("data-unread", "false");
    });
  });

  test("AC-NTF-029 đánh dấu tất cả đã đọc", async () => {
    signedInAs(FULL_CAPS, 2);
    let allReadCalls = 0;
    server.use(
      http.get("/api/v1/notifications", () =>
        HttpResponse.json({
          items: [notif({ id: "n1" }), notif({ id: "n2" })],
          total: 2,
          limit: 20,
          offset: 0,
        }),
      ),
      http.post("/api/v1/notifications/mark-all-read", () => {
        allReadCalls += 1;
        signedInAs(FULL_CAPS, 0);
        return HttpResponse.json({ count: 2 });
      }),
    );
    renderApp("/thong-bao");
    const button = await screen.findByRole("button", { name: "Đánh dấu tất cả đã đọc" });
    await userEvent.setup().click(button);

    await waitFor(() => {
      expect(allReadCalls).toBe(1);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Đánh dấu tất cả đã đọc" }),
      ).not.toBeInTheDocument();
    });
  });

  test("AC-NTF-030 lỗi tải danh sách → thông báo + Thử lại", async () => {
    signedInAs(FULL_CAPS, 0);
    let calls = 0;
    server.use(
      http.get("/api/v1/notifications", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ status: 500 }, { status: 500 })
          : HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/thong-bao");
    expect(await screen.findByText("Không tải được danh sách thông báo.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có thông báo.")).toBeInTheDocument();
  });

  test("AC-NTF-032 thiếu notification.read → ForbiddenPage", async () => {
    signedInAs(NO_NOTIFICATION_CAPS, 0);
    renderApp("/thong-bao");
    expect(await screen.findByText(/Bạn không có quyền/)).toBeInTheDocument();
  });
});
