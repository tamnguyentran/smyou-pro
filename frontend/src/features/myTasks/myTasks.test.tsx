import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type MyAssignmentOut = components["schemas"]["MyAssignmentOut"];

const khoaId = "a0000000-0000-4000-8000-000000000081";

const KHOA: Person = {
  code: "NV014",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["all"], "assignment.respond": ["self"] },
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

function assignment(overrides: Partial<MyAssignmentOut> = {}): MyAssignmentOut {
  return {
    assignment_id: "c0000000-0000-4000-8000-000000000001",
    assignment_status: "PENDING",
    task_id: "d0000000-0000-4000-8000-000000000011",
    task_code: "DH2610-0012-T1",
    task_title: "Lắp 4 camera ngoài trời",
    task_description: null,
    estimated_hours: "3.50",
    due_at: "2026-10-09T02:00:00Z",
    priority: "NORMAL",
    order_id: "b0000000-0000-4000-8000-000000000041",
    order_code: "DH2610-0012",
    customer_name: "Công ty TNHH Phát Đạt",
    customer_phone: "0932068787",
    service_address: "45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM",
    ...overrides,
  };
}

function mockAssignments(items: MyAssignmentOut[]) {
  server.use(http.get("/api/v1/assignments/me", () => HttpResponse.json({ items })));
}

describe("Việc của tôi", () => {
  test("AC-ASG-008 3 tab lọc đúng nhóm, đếm đúng số lượng", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "PENDING", task_code: "T1" }),
      assignment({ assignment_id: "a2", assignment_status: "ACCEPTED", task_code: "T2" }),
      assignment({ assignment_id: "a3", assignment_status: "IN_PROGRESS", task_code: "T3" }),
      assignment({ assignment_id: "a4", assignment_status: "DONE", task_code: "T4" }),
    ]);
    renderApp("/my-tasks");

    const tabs = await screen.findByRole("tablist", { name: "Việc của tôi" });
    await within(tabs).findByRole("tab", { name: "Chờ nhận (1)" });
    expect(within(tabs).getByRole("tab", { name: "Đang làm (2)" })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Đã xong (1)" })).toBeInTheDocument();

    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.queryByText("T2")).not.toBeInTheDocument();

    await userEvent.setup().click(within(tabs).getByRole("tab", { name: "Đang làm (2)" }));
    expect(screen.getByText("T2")).toBeInTheDocument();
    expect(screen.getByText("T3")).toBeInTheDocument();
    expect(screen.queryByText("T1")).not.toBeInTheDocument();
  });

  test("AC-ASG-009 thẻ hiện đủ thông tin mẫu", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([assignment()]);
    renderApp("/my-tasks");

    await screen.findByText("DH2610-0012-T1");
    expect(screen.getByText("Lắp 4 camera ngoài trời")).toBeInTheDocument();
    expect(screen.getByText("Công ty TNHH Phát Đạt")).toBeInTheDocument();
    expect(screen.getByText("45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM")).toBeInTheDocument();
    expect(screen.getByText("0932 06 8787")).toBeInTheDocument();
    expect(screen.getByText("3.50 giờ")).toBeInTheDocument();
  });

  test("AC-ASG-014 ≥1024px: bảng, vẫn bấm gọi/bản đồ được", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([assignment()]);
    // No matchMedia stub in this test → useMediaQuery falls back to desktop (true).
    renderApp("/my-tasks");

    await screen.findByRole("table");
    for (const heading of ["Mã", "Tiêu đề", "Khách & địa chỉ", "Hạn chót", "Giờ ước tính"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /45 Nguyễn Trãi/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /0932 06 8787/ })).toBeInTheDocument();
  });

  test("AC-ASG-014 <768px: danh sách thẻ, vẫn bấm gọi/bản đồ được", async () => {
    mobile();
    signedInAs(khoaId, KHOA);
    mockAssignments([assignment()]);
    renderApp("/my-tasks");

    await screen.findByText("DH2610-0012-T1");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /45 Nguyễn Trãi/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /0932 06 8787/ })).toBeInTheDocument();
  });

  test("AC-ASG-010 bấm địa chỉ/SĐT mở maps/tel đúng href", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([assignment()]);
    renderApp("/my-tasks");

    const address = "45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM";
    const addressLink = await screen.findByRole("link", {
      name: new RegExp(address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    });
    expect(addressLink).toHaveAttribute(
      "href",
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    );
    expect(addressLink).toHaveAttribute("target", "_blank");

    const phoneLink = screen.getByRole("link", { name: /0932 06 8787/ });
    expect(phoneLink).toHaveAttribute("href", "tel:0932068787");
  });

  test("AC-ASG-011 hạn quá/<24h đỏ, hạn xa màu trung tính", async () => {
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    mobile();
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", task_code: "QUA_HAN", due_at: "2026-10-06T00:00:00Z" }),
      assignment({ assignment_id: "a2", task_code: "GAN_HAN", due_at: "2026-10-07T05:00:00Z" }),
      assignment({ assignment_id: "a3", task_code: "XA_HAN", due_at: "2026-10-10T00:00:00Z" }),
    ]);
    renderApp("/my-tasks");

    await screen.findByText("QUA_HAN");
    const quaHanCard = screen.getByText("QUA_HAN").closest("li");
    const ganHanCard = screen.getByText("GAN_HAN").closest("li");
    const xaHanCard = screen.getByText("XA_HAN").closest("li");
    expect(quaHanCard).not.toBeNull();
    expect(ganHanCard).not.toBeNull();
    expect(xaHanCard).not.toBeNull();
    expect(within(quaHanCard as HTMLElement).getByText(/2026|\//).className).toContain(
      "text-urgent-fg",
    );
    expect(within(ganHanCard as HTMLElement).getByText(/2026|\//).className).toContain(
      "text-urgent-fg",
    );
    expect(within(xaHanCard as HTMLElement).getByText(/2026|\//).className).not.toContain(
      "text-urgent-fg",
    );
    vi.useRealTimers();
  });

  test("AC-ASG-012 tab rỗng hiện trạng thái rỗng tiếng Việt", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([assignment({ assignment_status: "PENDING" })]);
    renderApp("/my-tasks");

    await screen.findByRole("tablist");
    await userEvent.setup().click(screen.getByRole("tab", { name: /Đang làm/ }));
    expect(screen.getByText("Không có đầu việc nào đang làm.")).toBeInTheDocument();
  });

  test("AC-ASG-013 tải/lỗi + Thử lại", async () => {
    signedInAs(khoaId, KHOA);
    server.use(
      http.get("/api/v1/assignments/me", async () => {
        await delay(50);
        return HttpResponse.json({ items: [] });
      }),
    );
    renderApp("/my-tasks");
    await screen.findByRole("group", { name: "Đang tải việc của tôi" });
    await waitFor(() => {
      expect(
        screen.queryByRole("group", { name: "Đang tải việc của tôi" }),
      ).not.toBeInTheDocument();
    });

    server.use(http.get("/api/v1/assignments/me", () => HttpResponse.json(null, { status: 500 })));
    mobile();
    renderApp("/my-tasks");
    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.getByText("Không tải được danh sách đầu việc.")).toBeInTheDocument();

    mockAssignments([assignment({ task_code: "SAU_RETRY" })]);
    await userEvent.setup().click(retry);
    await screen.findByText("SAU_RETRY");
  });
});
