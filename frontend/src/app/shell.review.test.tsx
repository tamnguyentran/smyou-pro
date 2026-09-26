import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../lib/sessionHint";
import { server } from "../test/msw";
import { renderApp } from "../test/renderApp";

// Review M1-03a (round 1): reproductions of the confirmed findings.
const id = "7d1f0c2e-0000-4000-8000-000000000010";
interface P {
  code: string;
  full_name: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const TUAN: P = {
  code: "NV010",
  full_name: "Phạm Quốc Tuấn",
  roles: ["TECH_LEAD"],
  capabilities: {
    "dashboard.read": ["all"],
    "task.manage": ["all"],
    "kpi.read": ["all"],
    "profile.manage": ["self"],
  },
};
const HOA: P = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": ["own"],
    "order.create": ["all"],
    "customer.manage": ["all"],
    "profile.manage": ["self"],
  },
};
const session = (p: P) => ({
  employee: { id, code: p.code, full_name: p.full_name, roles: p.roles },
  must_change_password: false,
});
const me = (p: P, counters: Record<string, number> = {}) => ({
  employee: {
    id,
    code: p.code,
    full_name: p.full_name,
    email: "x@smyou.vn",
    title: null,
    department: "TECHNICAL",
  },
  roles: p.roles,
  capabilities: p.capabilities,
  counters,
});

function signedInAs(p: P, counters: Record<string, number> = {}) {
  let meCalls = 0;
  server.use(
    http.post("/api/v1/auth/refresh", () => HttpResponse.json(session(p))),
    http.get("/api/v1/me", () => {
      meCalls += 1;
      return HttpResponse.json(me(p, counters));
    }),
  );
  markSignedIn();
  return () => meCalls;
}

function mockViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

describe("Review M1-03a", () => {
  test("AC-SYS-044 /me được tải lại khi quay lại cửa sổ (spec §4), với cấu hình query thật của app", async () => {
    const meCalls = signedInAs(TUAN, { pending_dispatch_count: 1 });
    renderApp("/");
    await screen.findByRole("navigation", { name: "Menu chính" });
    expect(meCalls()).toBe(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(meCalls()).toBe(2);
    });
  });

  test("AC-SYS-038 nhóm tự mở khi chuyển tới trang con sau lần tải đầu; mục đang chọn có nền brand", async () => {
    mockViewport(true);
    signedInAs(TUAN);
    const router = renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    const group = within(nav).getByRole("button", { name: "Điều phối kỹ thuật" });
    expect(group).toHaveAttribute("aria-expanded", "false");

    await act(() => router.navigate("/dispatch/queue"));

    await waitFor(() => {
      expect(group).toHaveAttribute("aria-expanded", "true");
    });
    const queue = within(nav).getByRole("link", { name: "Đơn chờ điều phối" });
    expect(queue).toHaveAttribute("aria-current", "page");
    expect(queue).toHaveClass("bg-brand", "text-white");
    expect(screen.getByRole("complementary")).toHaveClass("w-72");
  });

  test("AC-SYS-044 /me lỗi khi đang ở trang nghiệp vụ → trang hiện lỗi + Thử lại, tiêu đề đúng", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session(TUAN))),
      http.get("/api/v1/me", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ status: 503 }, { status: 503 })
          : HttpResponse.json(me(TUAN));
      }),
    );
    markSignedIn();
    renderApp("/dispatch/queue");

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByText("Không tải được thông tin tài khoản."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Đơn chờ điều phối" }),
    ).toBeInTheDocument();

    await userEvent.setup().click(within(main).getByRole("button", { name: "Thử lại" }));
    expect(await within(main).findByText("Tính năng đang được phát triển.")).toBeInTheDocument();
  });

  test("AC-SYS-037 badge được đọc là '4 mục' trong tên của liên kết", async () => {
    signedInAs(TUAN, { pending_dispatch_count: 4 });
    renderApp("/dispatch/queue");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(
      await within(nav).findByRole("link", { name: "Đơn chờ điều phối 4 mục" }),
    ).toBeInTheDocument();
  });

  test("AC-SYS-039 menu trượt có nút Đóng menu; đóng xong focus về nút Mở menu", async () => {
    mockViewport(false);
    signedInAs(HOA);
    renderApp("/");
    const user = userEvent.setup();
    const open = await screen.findByRole("button", { name: "Mở menu" });

    await user.click(open);
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    await user.click(within(dialog).getByRole("button", { name: "Đóng menu" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    });
    expect(open).toHaveFocus();
  });

  test("AC-SYS-044 đang tải /me: khung (header + main) vẫn hiện, không có spinner toàn trang", async () => {
    mockViewport(false);
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session(TUAN))),
      http.get("/api/v1/me", async () => {
        await delay("infinite");
        return HttpResponse.json(me(TUAN));
      }),
    );
    markSignedIn();
    renderApp("/dispatch/board");

    expect(await screen.findByRole("button", { name: "Mở menu" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  test("AC-SYS-045 mọi nút trong menu trượt (nhóm đã mở) đều có tên", async () => {
    mockViewport(false);
    signedInAs(HOA);
    renderApp("/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mở menu" }));
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    await user.click(await within(dialog).findByRole("button", { name: "Đơn hàng" }));

    for (const control of [
      ...within(dialog).getAllByRole("button"),
      ...within(dialog).getAllByRole("link"),
    ]) {
      expect(control).toHaveAccessibleName();
    }
  });

  test("AC-SYS-038 KTV (không có hành động chính) → không có nút tạo ở thanh trên", async () => {
    mockViewport(true);
    signedInAs({
      ...TUAN,
      roles: ["TECHNICIAN"],
      capabilities: { "dashboard.read": ["self"], "profile.manage": ["self"] },
    });
    renderApp("/");
    await screen.findByRole("navigation", { name: "Menu chính" });
    expect(screen.queryByRole("link", { name: /^Tạo/ })).not.toBeInTheDocument();
  });
});
