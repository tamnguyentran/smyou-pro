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

  test("AC-ASG-035 nút Tiếp nhận/Từ chối chỉ hiện ở tab Chờ nhận", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "PENDING", task_code: "CHO_NHAN" }),
      assignment({ assignment_id: "a2", assignment_status: "ACCEPTED", task_code: "DANG_LAM" }),
    ]);
    renderApp("/my-tasks");

    await screen.findByText("CHO_NHAN");
    expect(screen.getByRole("button", { name: "Tiếp nhận" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Từ chối" })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("tab", { name: /Đang làm/ }));
    await screen.findByText("DANG_LAM");
    expect(screen.queryByRole("button", { name: "Tiếp nhận" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Từ chối" })).not.toBeInTheDocument();
  });

  test("AC-ASG-036 bấm Tiếp nhận: gọi accept đúng version, toast, thẻ biến mất", async () => {
    signedInAs(khoaId, KHOA);
    const calls: Record<string, unknown>[] = [];
    let accepted = false;
    server.use(
      http.get("/api/v1/assignments/me", () =>
        HttpResponse.json({
          items: accepted
            ? []
            : [assignment({ assignment_id: "a1", task_code: "T1", order_version: 3 })],
        }),
      ),
      http.post("/api/v1/assignments/:id/accept", async ({ request }) => {
        calls.push((await request.json()) as Record<string, unknown>);
        accepted = true;
        await delay(10);
        return HttpResponse.json(
          assignment({ assignment_id: "a1", task_code: "T1", assignment_status: "ACCEPTED" }),
        );
      }),
    );
    renderApp("/my-tasks");

    await screen.findByText("T1");
    const button = screen.getByRole("button", { name: "Tiếp nhận" });
    await userEvent.setup().click(button);

    expect(button).toBeDisabled();
    expect(calls).toEqual([{ version: 3 }]);
    await screen.findByText("Đã tiếp nhận đầu việc.");
    await waitFor(() => {
      expect(screen.queryByText("T1")).not.toBeInTheDocument();
    });
  });

  test("AC-ASG-037 bấm Từ chối: mở Sheet, 5 lý do, Xác nhận disabled tới khi hợp lệ", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([assignment({ assignment_id: "a1", task_code: "T1" })]);
    renderApp("/my-tasks");

    await screen.findByText("T1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Từ chối" }));

    const dialog = await screen.findByRole("dialog", { name: "Từ chối đầu việc T1?" });
    for (const label of [
      "Không đủ thời gian (đang nhiều việc)",
      "Ốm đau / nghỉ phép",
      "Không phù hợp chuyên môn",
      "Địa điểm quá xa / không di chuyển được",
      "Lý do khác",
    ]) {
      expect(within(dialog).getByRole("option", { name: label })).toBeInTheDocument();
    }
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận từ chối" });
    expect(confirm).toBeDisabled();

    const user = userEvent.setup();
    await user.selectOptions(
      within(dialog).getByLabelText("Lý do từ chối"),
      "Địa điểm quá xa / không di chuyển được",
    );
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Lý do chi tiết"), "xa");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Lý do chi tiết"), " quá, không kịp");
    expect(confirm).not.toBeDisabled();
  });

  test("AC-ASG-038 Xác nhận từ chối: gọi reject đúng tham số, toast, thẻ biến mất", async () => {
    signedInAs(khoaId, KHOA);
    const calls: Record<string, unknown>[] = [];
    let rejected = false;
    server.use(
      http.get("/api/v1/assignments/me", () =>
        HttpResponse.json({
          items: rejected
            ? []
            : [assignment({ assignment_id: "a1", task_code: "T1", order_version: 3 })],
        }),
      ),
      http.post("/api/v1/assignments/:id/reject", async ({ request }) => {
        calls.push((await request.json()) as Record<string, unknown>);
        rejected = true;
        return HttpResponse.json(
          assignment({ assignment_id: "a1", task_code: "T1", assignment_status: "REJECTED" }),
        );
      }),
    );
    renderApp("/my-tasks");

    await screen.findByText("T1");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Từ chối" }));
    const dialog = await screen.findByRole("dialog", { name: "Từ chối đầu việc T1?" });
    await user.selectOptions(
      within(dialog).getByLabelText("Lý do từ chối"),
      "Địa điểm quá xa / không di chuyển được",
    );
    await user.type(within(dialog).getByLabelText("Lý do chi tiết"), "Địa chỉ quá xa, không kịp");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận từ chối" }));

    expect(calls).toEqual([
      { version: 3, reason_code: "DISTANCE", reason_text: "Địa chỉ quá xa, không kịp" },
    ]);
    await screen.findByText("Đã từ chối đầu việc.");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("T1")).not.toBeInTheDocument();
    });
  });

  test("AC-ASG-039 STALE_VERSION: Tiếp nhận hiện banner Tải lại; Từ chối hiện trong sheet", async () => {
    signedInAs(khoaId, KHOA);
    let reloaded = false;
    server.use(
      http.get("/api/v1/assignments/me", () =>
        HttpResponse.json({
          items: reloaded
            ? []
            : [assignment({ assignment_id: "a1", task_code: "T1", order_version: 3 })],
        }),
      ),
      http.post("/api/v1/assignments/:id/accept", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: 409 },
        ),
      ),
    );
    renderApp("/my-tasks");

    await screen.findByText("T1");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tiếp nhận" }));

    await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại.");
    reloaded = true;
    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => {
      expect(screen.queryByText("T1")).not.toBeInTheDocument();
    });
  });

  test("AC-ASG-062 tab Đang làm: ACCEPTED có nút Bắt đầu, IN_PROGRESS có nút Báo hoàn thành", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "ACCEPTED", task_code: "T1" }),
      assignment({ assignment_id: "a2", assignment_status: "IN_PROGRESS", task_code: "T2" }),
    ]);
    renderApp("/my-tasks");

    await screen.findByRole("tablist");
    await userEvent.setup().click(screen.getByRole("tab", { name: /Đang làm/ }));
    await screen.findByText("T1");

    const t1Card = screen.getByText("T1").closest("li, tr") as HTMLElement;
    expect(within(t1Card).getByRole("button", { name: "Bắt đầu" })).toBeInTheDocument();
    expect(
      within(t1Card).queryByRole("button", { name: "Báo hoàn thành" }),
    ).not.toBeInTheDocument();

    const t2Card = screen.getByText("T2").closest("li, tr") as HTMLElement;
    expect(within(t2Card).getByRole("button", { name: "Báo hoàn thành" })).toBeInTheDocument();
    expect(within(t2Card).queryByRole("button", { name: "Bắt đầu" })).not.toBeInTheDocument();
  });

  test("AC-ASG-063 bấm Bắt đầu: gọi start đúng version, toast, nhãn+nút đổi", async () => {
    signedInAs(khoaId, KHOA);
    const calls: Record<string, unknown>[] = [];
    let started = false;
    server.use(
      http.get("/api/v1/assignments/me", () =>
        HttpResponse.json({
          items: [
            assignment({
              assignment_id: "a1",
              task_code: "T1",
              order_version: 3,
              assignment_status: started ? "IN_PROGRESS" : "ACCEPTED",
            }),
          ],
        }),
      ),
      http.post("/api/v1/assignments/:id/start", async ({ request }) => {
        calls.push((await request.json()) as Record<string, unknown>);
        started = true;
        return HttpResponse.json(
          assignment({ assignment_id: "a1", task_code: "T1", assignment_status: "IN_PROGRESS" }),
        );
      }),
    );
    renderApp("/my-tasks");

    await screen.findByRole("tablist");
    await userEvent.setup().click(screen.getByRole("tab", { name: /Đang làm/ }));
    await screen.findByText("T1");
    expect(screen.getByText("Đã tiếp nhận")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Bắt đầu" }));

    expect(calls).toEqual([{ version: 3 }]);
    await screen.findByText("Đã bắt đầu đầu việc.");
    await screen.findByText("Đang thực hiện");
    expect(screen.getByRole("button", { name: "Báo hoàn thành" })).toBeInTheDocument();
  });

  test("AC-ASG-064 bấm Báo hoàn thành: mở Sheet, Xác nhận không disabled khi trống", async () => {
    signedInAs(khoaId, KHOA);
    mockAssignments([
      assignment({ assignment_id: "a1", assignment_status: "IN_PROGRESS", task_code: "T1" }),
    ]);
    renderApp("/my-tasks");

    await screen.findByRole("tablist");
    await userEvent.setup().click(screen.getByRole("tab", { name: /Đang làm/ }));
    await screen.findByText("T1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Báo hoàn thành" }));

    const dialog = await screen.findByRole("dialog", { name: "Báo hoàn thành đầu việc T1?" });
    expect(within(dialog).getByLabelText("Ghi chú")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Giờ thực tế")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Xác nhận hoàn thành" })).not.toBeDisabled();
  });

  test("AC-ASG-065 Xác nhận hoàn thành (trống 2 trường): gọi complete, toast, thẻ biến mất", async () => {
    signedInAs(khoaId, KHOA);
    const calls: Record<string, unknown>[] = [];
    let completed = false;
    server.use(
      http.get("/api/v1/assignments/me", () =>
        HttpResponse.json({
          items: completed
            ? []
            : [
                assignment({
                  assignment_id: "a1",
                  task_code: "T1",
                  order_version: 3,
                  assignment_status: "IN_PROGRESS",
                }),
              ],
        }),
      ),
      http.post("/api/v1/assignments/:id/complete", async ({ request }) => {
        calls.push((await request.json()) as Record<string, unknown>);
        completed = true;
        return HttpResponse.json(
          assignment({ assignment_id: "a1", task_code: "T1", assignment_status: "DONE" }),
        );
      }),
    );
    renderApp("/my-tasks");

    await screen.findByRole("tablist");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /Đang làm/ }));
    await screen.findByText("T1");
    await user.click(screen.getByRole("button", { name: "Báo hoàn thành" }));
    const dialog = await screen.findByRole("dialog", { name: "Báo hoàn thành đầu việc T1?" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận hoàn thành" }));

    expect(calls).toEqual([{ version: 3, completion_note: null, actual_hours: null }]);
    await screen.findByText("Đã báo hoàn thành đầu việc.");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("T1")).not.toBeInTheDocument();
    });
  });

  test("AC-ASG-066 STALE_VERSION ở start/complete hiện banner Tải lại", async () => {
    signedInAs(khoaId, KHOA);
    let reloaded = false;
    server.use(
      http.get("/api/v1/assignments/me", () =>
        HttpResponse.json({
          items: reloaded
            ? []
            : [
                assignment({
                  assignment_id: "a1",
                  task_code: "T1",
                  order_version: 3,
                  assignment_status: "ACCEPTED",
                }),
              ],
        }),
      ),
      http.post("/api/v1/assignments/:id/start", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: 409 },
        ),
      ),
    );
    renderApp("/my-tasks");

    await screen.findByRole("tablist");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /Đang làm/ }));
    await screen.findByText("T1");
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));

    await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại.");
    reloaded = true;
    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => {
      expect(screen.queryByText("T1")).not.toBeInTheDocument();
    });
  });
});
