import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ToastProvider, useToast } from "../components/ui/Toast";
import { markSignedIn } from "../lib/sessionHint";
import { server } from "../test/msw";
import { renderApp } from "../test/renderApp";
import { primaryAction, secondSlot, visibleMenu } from "./menu";

// Review M1-03b (round 1).
const id = "7d1f0c2e-0000-4000-8000-000000000007";
const HA_ME = {
  employee: {
    id,
    code: "NV007",
    full_name: "Phạm Thu Hà",
    email: "ha.pham@smyou.vn",
    title: null,
    department: "SALES",
  },
  roles: ["SALE", "TECHNICIAN"],
  capabilities: {
    "dashboard.read": ["own", "self"],
    "assignment.respond": ["self"],
    "order.create": ["all"],
    "customer.manage": ["all"],
    "profile.manage": ["self"],
  },
  counters: {},
};

function signedIn(meHandler: () => Response) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: "NV007", full_name: "Phạm Thu Hà", roles: HA_ME.roles },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", meHandler),
  );
  markSignedIn();
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
});

const caps = (...names: string[]) => Object.fromEntries(names.map((n) => [n, ["all"]]));

describe("Review M1-03b", () => {
  test.each([
    [["SALE", "TECH_LEAD"], caps("order.create", "task.manage"), "Bảng đầu việc", "Tạo đầu việc"],
    [["MANAGER", "TECHNICIAN"], caps("order.create", "assignment.respond"), "Đơn hàng", "Tạo đơn"],
    [
      ["TECHNICIAN", "TECH_LEAD"],
      caps("assignment.respond", "task.manage"),
      "Bảng đầu việc",
      "Tạo đầu việc",
    ],
    [["TECHNICIAN"], caps("assignment.respond"), "Việc của tôi", null],
  ])("AC-SYS-047 ưu tiên Q28 cho %j", (roles, capabilities, slot, action) => {
    expect(secondSlot(roles, visibleMenu(capabilities))?.label).toBe(slot);
    expect(primaryAction(roles)?.label ?? null).toBe(action);
  });

  test("AC-SYS-047 thanh cố định ở đáy, chừa vùng an toàn; + có vòng focus quanh nút tròn", async () => {
    mockViewport(false);
    signedIn(() => HttpResponse.json(HA_ME));
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Điều hướng nhanh" });
    expect(nav).toHaveClass("fixed", "bottom-0", "pb-[env(safe-area-inset-bottom)]");
    const plus = await within(nav).findByRole("link", { name: "Tạo đơn" });
    expect(plus).toHaveClass("size-14", "rounded-full");
    expect(within(nav).getByRole("link", { name: "Đơn hàng" })).toHaveAttribute("href", "/orders");
    expect(within(nav).getByRole("link", { name: "Tổng quan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Đơn hàng" })).not.toHaveAttribute("aria-current");
  });

  test("AC-SYS-048 ô vẫn được chọn ở trang con (vd /orders/new thuộc Đơn hàng)", async () => {
    mockViewport(false);
    signedIn(() => HttpResponse.json(HA_ME));
    renderApp("/orders/new");
    const nav = await screen.findByRole("navigation", { name: "Điều hướng nhanh" });
    // /orders/new is the + action; the "Đơn hàng" slot (/orders) stays highlighted below it
    expect(await within(nav).findByRole("link", { name: "Đơn hàng" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("AC-SYS-049 /me lỗi ở trang Cá nhân → báo lỗi + Thử lại, vẫn đăng xuất được", async () => {
    mockViewport(false);
    let calls = 0;
    signedIn(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ status: 503 }, { status: 503 })
        : HttpResponse.json(HA_ME);
    });
    renderApp("/ca-nhan");
    await screen.findByRole("heading", { level: 1, name: "Cá nhân" });
    const main = screen.getByRole("main");
    expect(
      await within(main).findByText("Không tải được thông tin tài khoản."),
    ).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();

    await userEvent.setup().click(within(main).getByRole("button", { name: "Thử lại" }));
    expect(await within(main).findByText("ha.pham@smyou.vn")).toBeInTheDocument();
  });

  test("AC-SYS-049 desktop: tên ở chân sidebar dẫn tới trang Cá nhân", async () => {
    mockViewport(true);
    signedIn(() => HttpResponse.json(HA_ME));
    const router = renderApp("/");
    const sidebar = await screen.findByRole("complementary");
    await userEvent.setup().click(within(sidebar).getByRole("link", { name: /Phạm Thu Hà/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/ca-nhan");
    });
  });
});

function ToastTrigger() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast("Đã đổi mật khẩu.");
      }}
    >
      Hiện thông báo
    </button>
  );
}

test("AC-SYS-048 thông báo nổi nằm trên thanh dưới đáy ở điện thoại (không che)", async () => {
  render(
    <ToastProvider>
      <ToastTrigger />
    </ToastProvider>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Hiện thông báo" }));
  expect(await screen.findByRole("status")).toHaveClass("bottom-24", "lg:bottom-4");
});
