import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../lib/sessionHint";
import { server } from "../test/msw";
import { renderApp } from "../test/renderApp";

type Scopes = Record<string, string[]>;
interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Scopes;
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
const session = (p: Person) => ({
  employee: { id, code: p.code, full_name: p.full_name, roles: p.roles },
  must_change_password: false,
});
const me = (p: Person, counters: Record<string, number> = {}) => ({
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
  counters,
});

function signedInAs(p: Person, counters: Record<string, number> = {}) {
  server.use(
    http.post("/api/v1/auth/refresh", () => HttpResponse.json(session(p))),
    http.get("/api/v1/me", () => HttpResponse.json(me(p, counters))),
    http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
  );
  markSignedIn();
}

async function mainMenu() {
  return screen.findByRole("navigation", { name: "Menu chính" });
}

/** Level-1 labels, then (after opening every group) level-2 labels per group. */
async function menuStructure() {
  const nav = await mainMenu();
  const user = userEvent.setup();
  const top = Array.from(
    nav.querySelectorAll(":scope > ul > li > :is(a, button) [data-menu-label]"),
  ).map((el) => el.textContent);
  const groups: Record<string, string[]> = {};
  for (const button of within(nav).queryAllByRole("button", { expanded: false })) {
    await user.click(button);
  }
  for (const group of Array.from(nav.querySelectorAll(":scope > ul > li"))) {
    const label = group.querySelector("[data-menu-label]")?.textContent ?? "";
    const children = Array.from(group.querySelectorAll(":scope > ul [data-menu-label]")).map(
      (el) => el.textContent,
    );
    if (children.length) groups[label] = children;
  }
  return { top, groups };
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

describe("Khung ứng dụng — menu theo vai trò", () => {
  test.each([
    [
      "An (Manager)",
      AN,
      [
        "Tổng quan",
        "Đơn hàng",
        "Danh mục",
        "Nhân sự & phân quyền",
        "Báo cáo KPI",
        "Nhật ký hệ thống",
      ],
      {
        "Đơn hàng": ["Danh sách đơn", "Tạo đơn mới", "Khách hàng"],
        "Danh mục": ["Sản phẩm", "Dịch vụ"],
      },
    ],
    [
      "Hoa (Sale)",
      HOA,
      ["Tổng quan", "Đơn hàng"],
      { "Đơn hàng": ["Danh sách đơn", "Tạo đơn mới", "Khách hàng"] },
    ],
    [
      "Tuấn (QLKT)",
      TUAN,
      ["Tổng quan", "Điều phối kỹ thuật", "Báo cáo KPI"],
      {
        "Điều phối kỹ thuật": [
          "Đơn chờ điều phối",
          "Bảng đầu việc",
          "Lịch & tải việc",
          "Đơn cần chỉnh sửa",
        ],
      },
    ],
    ["Khoa (KTV)", KHOA, ["Tổng quan", "Việc của tôi", "Báo cáo KPI"], {}],
  ])("AC-SYS-035 menu của %s đúng bảng PERMISSIONS", async (_, person, top, groups) => {
    signedInAs(person);
    renderApp("/");

    const structure = await menuStructure();
    expect(structure.top).toEqual(top);
    expect(structure.groups).toEqual(groups);
  });

  test("AC-SYS-036 người 2 vai trò thấy hợp menu và mọi nhãn vai trò", async () => {
    signedInAs(HA);
    renderApp("/");

    const structure = await menuStructure();
    expect(structure.top).toEqual(["Tổng quan", "Việc của tôi", "Đơn hàng", "Báo cáo KPI"]);
    expect(structure.groups).toEqual({
      "Đơn hàng": ["Danh sách đơn", "Tạo đơn mới", "Khách hàng"],
    });
    expect(screen.getAllByText("Nhân viên kinh doanh · Nhân viên kỹ thuật").length).toBeGreaterThan(
      0,
    );
  });

  test("AC-SYS-037 badge từ counters: ẩn khi 0, 99+ khi lớn, có nhãn đọc màn hình", async () => {
    signedInAs(TUAN, { pending_dispatch_count: 4, revision_count: 0 });
    renderApp("/dispatch/queue");

    const nav = await mainMenu();
    const queue = await within(nav).findByRole("link", { name: /Đơn chờ điều phối/ });
    const badge = await within(queue).findByText("4");
    expect(badge).toHaveAttribute("aria-label", "4 mục");
    const revisions = within(nav).getByRole("link", { name: /Đơn cần chỉnh sửa/ });
    expect(within(revisions).queryByText("0")).not.toBeInTheDocument();
  });

  test("AC-SYS-037 số lớn hơn 99 hiện 99+", async () => {
    signedInAs(TUAN, { pending_dispatch_count: 150 });
    renderApp("/dispatch/queue");

    const nav = await mainMenu();
    const queue = await within(nav).findByRole("link", { name: /Đơn chờ điều phối/ });
    expect(await within(queue).findByText("99+")).toHaveAttribute("aria-label", "150 mục");
  });

  test("AC-SYS-038 desktop: mục đang chọn, nhóm tự mở và thu/mở được, nút hành động chính", async () => {
    mockViewport(true);
    signedInAs(TUAN);
    renderApp("/dispatch/board");

    const nav = await mainMenu();
    const board = await within(nav).findByRole("link", { name: "Bảng đầu việc" });
    expect(board).toHaveAttribute("aria-current", "page");
    const group = within(nav).getByRole("button", { name: "Điều phối kỹ thuật" });
    expect(group).toHaveAttribute("aria-expanded", "true");

    await userEvent.setup().click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).queryByRole("link", { name: "Bảng đầu việc" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1, name: "Bảng đầu việc" })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Tạo đầu việc" });
    expect(cta).toHaveAttribute("href", "/dispatch/queue");
    expect(screen.queryByRole("button", { name: "Mở menu" })).not.toBeInTheDocument();
  });

  test("AC-SYS-039 mobile: menu trượt mở/đóng bằng chọn mục, lớp phủ, Esc; Tab không thoát", async () => {
    mockViewport(false);
    signedInAs(HOA);
    const router = renderApp("/");
    const user = userEvent.setup();

    const open = await screen.findByRole("button", { name: "Mở menu" });
    expect(screen.queryByRole("navigation", { name: "Menu chính" })).not.toBeInTheDocument();

    // Esc closes and returns focus to the menu button
    await user.click(open);
    expect(await screen.findByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    });
    expect(open).toHaveFocus();

    // Tab stays inside the open drawer
    await user.click(open);
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    for (let i = 0; i < 15; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }

    // The overlay closes it
    await user.click(screen.getByTestId("drawer-overlay"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    });

    // Choosing an item navigates and closes it
    await user.click(open);
    const drawer = await screen.findByRole("dialog", { name: "Menu" });
    await user.click(within(drawer).getByRole("button", { name: "Đơn hàng" }));
    await user.click(within(drawer).getByRole("link", { name: "Khách hàng" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/customers");
    });
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });

  test("AC-SYS-040 đăng xuất ở chân menu; trang chủ không còn nút đăng xuất tạm", async () => {
    signedInAs(AN);
    const router = renderApp("/");

    expect(await screen.findByText("Xin chào, Nguyễn Văn An")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();

    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).getByText("Nguyễn Văn An")).toBeInTheDocument();
    expect(within(sidebar).getAllByText("Quản lý chung")).toHaveLength(2); // header + footer
    await userEvent.setup().click(within(sidebar).getByRole("button", { name: "Đăng xuất" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
  });
});

describe("Khung ứng dụng — chặn trang & trạng thái", () => {
  test("AC-SYS-041 không có quyền → trang 403 trong khung", async () => {
    signedInAs(KHOA);
    renderApp("/employees");

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(await mainMenu()).toBeInTheDocument();
  });

  test("AC-SYS-042 đường dẫn lạ → trang 404; chưa đăng nhập → trang đăng nhập trước", async () => {
    signedInAs(AN);
    renderApp("/khong-co-trang-nay");
    expect(await screen.findByText("Không tìm thấy trang.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });

  test("AC-SYS-042 chưa đăng nhập mở đường dẫn lạ → về đăng nhập với next", async () => {
    const router = renderApp("/khong-co-trang-nay");
    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe(
      "/khong-co-trang-nay",
    );
  });

  test("AC-SYS-043 mục menu chưa làm → trang đang phát triển", async () => {
    signedInAs(HOA);
    renderApp("/orders");

    expect(await screen.findByRole("heading", { level: 1, name: "Danh sách đơn" })).toBeVisible();
    expect(screen.getByText("Tính năng đang được phát triển.")).toBeInTheDocument();
  });

  test("AC-SYS-044 /me đang tải → skeleton trong menu", async () => {
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session(AN))),
      http.get("/api/v1/me", async () => {
        await delay("infinite");
        return HttpResponse.json(me(AN));
      }),
    );
    markSignedIn();
    renderApp("/");

    const loading = await screen.findByLabelText("Đang tải menu");
    expect(loading).toHaveAttribute("aria-busy", "true");
  });

  test("AC-SYS-044 /me lỗi → thông báo + Thử lại tải lại menu", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => HttpResponse.json(session(AN))),
      http.get("/api/v1/me", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ status: 503 }, { status: 503 })
          : HttpResponse.json(me(AN));
      }),
    );
    markSignedIn();
    renderApp("/");

    expect(await screen.findByText("Không tải được thông tin tài khoản.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    const nav = await mainMenu();
    expect(await within(nav).findByRole("link", { name: "Tổng quan" })).toBeInTheDocument();
  });

  test("AC-SYS-044 /me trả 401 và không làm mới được → về đăng nhập với next", async () => {
    let refreshes = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => {
        refreshes += 1;
        return refreshes === 1
          ? HttpResponse.json(session(AN))
          : HttpResponse.json({ status: 401, code: "UNAUTHENTICATED" }, { status: 401 });
      }),
      http.get("/api/v1/me", () =>
        HttpResponse.json({ status: 401, code: "UNAUTHENTICATED" }, { status: 401 }),
      ),
    );
    markSignedIn();
    const router = renderApp("/dispatch/board");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dang-nhap");
    });
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/dispatch/board");
  });

  test("AC-SYS-045 tiêu đề tab theo trang; nút chỉ có icon đều có nhãn", async () => {
    mockViewport(false);
    signedInAs(TUAN);
    renderApp("/dispatch/board");

    await screen.findByRole("heading", { level: 1, name: "Bảng đầu việc" });
    expect(document.title).toBe("Bảng đầu việc · SMYou Pro");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
  });

  test("AC-SYS-045 trang chủ có tiêu đề Tổng quan", async () => {
    signedInAs(AN);
    renderApp("/");
    await screen.findByText("Xin chào, Nguyễn Văn An");
    expect(document.title).toBe("Tổng quan · SMYou Pro");
  });
});
