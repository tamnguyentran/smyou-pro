import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../lib/sessionHint";
import { server } from "../test/msw";
import { renderApp } from "../test/renderApp";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const self = ["self"];
const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": all,
    "order.create": all,
    "customer.manage": all,
    "catalog.manage": all,
    "employee.manage": all,
    "kpi.read": all,
    "audit.read": all,
    "profile.manage": self,
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  email: "hoa.le@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": ["own"],
    "order.create": all,
    "customer.manage": all,
    "profile.manage": self,
  },
};
const TUAN: Person = {
  code: "NV010",
  full_name: "Phạm Quốc Tuấn",
  email: "tuan.pham@smyou.vn",
  roles: ["TECH_LEAD"],
  capabilities: {
    "dashboard.read": all,
    "task.manage": all,
    "kpi.read": all,
    "profile.manage": self,
  },
};
const KHOA: Person = {
  code: "NV014",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: {
    "dashboard.read": self,
    "assignment.respond": self,
    "kpi.read": self,
    "profile.manage": self,
  },
};
const HA: Person = {
  code: "NV007",
  full_name: "Phạm Thu Hà",
  email: "ha.pham@smyou.vn",
  roles: ["SALE", "TECHNICIAN"],
  capabilities: {
    "dashboard.read": ["own", "self"],
    "assignment.respond": self,
    "order.create": all,
    "customer.manage": all,
    "kpi.read": self,
    "profile.manage": self,
  },
};

const id = "7d1f0c2e-0000-4000-8000-000000000001";
function signedInAs(p: Person, mustChange = false) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id, code: p.code, full_name: p.full_name, roles: p.roles },
        must_change_password: mustChange,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id,
          code: p.code,
          full_name: p.full_name,
          email: p.email,
          title: null,
          department: "SALES",
        },
        roles: p.roles,
        capabilities: p.capabilities,
        counters: {},
      }),
    ),
    http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
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

async function bottomNav() {
  return screen.findByRole("navigation", { name: "Điều hướng nhanh" });
}

describe("Thanh điều hướng dưới đáy (mobile)", () => {
  test.each([
    ["An (Manager)", AN, ["Tổng quan", "Đơn hàng", "Tạo đơn", "Thông báo", "Cá nhân"]],
    ["Hoa (Sale)", HOA, ["Tổng quan", "Đơn hàng", "Tạo đơn", "Thông báo", "Cá nhân"]],
    ["Tuấn (QLKT)", TUAN, ["Tổng quan", "Bảng đầu việc", "Tạo đầu việc", "Thông báo", "Cá nhân"]],
    ["Khoa (KTV)", KHOA, ["Tổng quan", "Việc của tôi", "Thông báo", "Cá nhân"]],
    ["Hà (Sale + KTV)", HA, ["Tổng quan", "Đơn hàng", "Tạo đơn", "Thông báo", "Cá nhân"]],
  ])("AC-SYS-047 các ô của %s theo vai trò (Q28)", async (_, person, labels) => {
    mockViewport(false);
    signedInAs(person);
    renderApp("/");

    const nav = await bottomNav();
    await waitFor(() => {
      expect(
        within(nav)
          .getAllByRole("link")
          .map((l) => l.textContent),
      ).toEqual(labels);
    });
  });

  test("AC-SYS-047 nút + là hành động chính của vai trò, dẫn tới đúng trang", async () => {
    mockViewport(false);
    signedInAs(TUAN);
    renderApp("/");
    const nav = await bottomNav();
    expect(await within(nav).findByRole("link", { name: "Tạo đầu việc" })).toHaveAttribute(
      "href",
      "/dispatch/queue",
    );
    expect(within(nav).getByRole("link", { name: "Bảng đầu việc" })).toHaveAttribute(
      "href",
      "/dispatch/board",
    );
  });

  test("AC-SYS-048 ô đang chọn có aria-current; nội dung chừa chỗ pb-24; ẩn ở desktop", async () => {
    mockViewport(false);
    signedInAs(HOA);
    renderApp("/orders");
    const nav = await bottomNav();
    expect(await within(nav).findByRole("link", { name: "Đơn hàng" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("main")).toHaveClass("pb-24");
  });

  test("AC-SYS-048 không có thanh dưới đáy ở desktop", async () => {
    mockViewport(true);
    signedInAs(HOA);
    renderApp("/");
    await screen.findByRole("navigation", { name: "Menu chính" });
    expect(screen.queryByRole("navigation", { name: "Điều hướng nhanh" })).not.toBeInTheDocument();
  });
});

describe("Trang Cá nhân và Thông báo", () => {
  test("AC-SYS-049 chạm Cá nhân → thông tin, Đổi mật khẩu, Đăng xuất", async () => {
    mockViewport(false);
    signedInAs(HA);
    const router = renderApp("/");
    const user = userEvent.setup();
    await user.click(await within(await bottomNav()).findByRole("link", { name: "Cá nhân" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/ca-nhan");
    });
    expect(screen.getByRole("heading", { level: 1, name: "Cá nhân" })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(await within(main).findByText("Phạm Thu Hà")).toBeInTheDocument();
    expect(within(main).getByText("NV007")).toBeInTheDocument();
    expect(within(main).getByText("ha.pham@smyou.vn")).toBeInTheDocument();
    expect(within(main).getByText("Nhân viên kinh doanh · Nhân viên kỹ thuật")).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "Đổi mật khẩu" })).toHaveAttribute(
      "href",
      "/doi-mat-khau",
    );

    await user.click(within(main).getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
  });

  test("AC-SYS-049 đổi mật khẩu tự nguyện: không nói 'lần đầu', có Huỷ quay lại", async () => {
    signedInAs(AN);
    const router = renderApp("/ca-nhan");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Đổi mật khẩu" }));

    expect(await screen.findByRole("heading", { name: "Đổi mật khẩu" })).toBeInTheDocument();
    expect(screen.queryByText(/lần đăng nhập đầu tiên/)).not.toBeInTheDocument();
    expect(screen.getByText("Đặt mật khẩu mới cho tài khoản của bạn.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Huỷ" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/ca-nhan");
    });
  });

  test("AC-SYS-049 đổi mật khẩu bắt buộc vẫn không có Huỷ", async () => {
    signedInAs(KHOA, true);
    renderApp("/doi-mat-khau");
    expect(
      await screen.findByText("Đây là lần đăng nhập đầu tiên. Hãy đặt mật khẩu mới chỉ bạn biết."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Huỷ" })).not.toBeInTheDocument();
  });

  test("AC-SYS-050 chạm Thông báo → trang giữ chỗ", async () => {
    mockViewport(false);
    signedInAs(KHOA);
    const router = renderApp("/");
    await userEvent
      .setup()
      .click(await within(await bottomNav()).findByRole("link", { name: "Thông báo" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/thong-bao");
    });
    expect(screen.getByRole("heading", { level: 1, name: "Thông báo" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có thông báo.")).toBeInTheDocument();
  });
});
