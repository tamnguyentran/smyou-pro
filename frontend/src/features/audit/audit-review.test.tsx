import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { AuditEventOut } from "./api";

// Review M1-05: defects and gaps found by the independent reviewers.

const all = ["all"];
const self = ["self"];
const AN = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": all,
    "audit.read": all,
    "employee.read": all,
    "employee.manage": all,
    "profile.manage": self,
  },
};
const HOA = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};
const KHOA_ID = "e0000000-0000-4000-8000-000000000014";
const KHOA_EMPLOYEE = {
  id: KHOA_ID,
  code: "NV014",
  full_name: "Trần Minh Khoa",
  email: "khoa.tran@smyou.vn",
  phone: null,
  department: "TECHNICAL",
  title: null,
  roles: ["TECHNICIAN"],
  is_active: false,
  is_locked: false,
  must_change_password: false,
  version: 2,
};

function event(overrides: Partial<AuditEventOut> = {}): AuditEventOut {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-19T18:05:00Z",
    actor: { id: "an", code: "NV001", full_name: "Nguyễn Văn An" },
    entity_type: "EMPLOYEE",
    entity_id: KHOA_ID,
    action: "deactivate",
    from_status: "ACTIVE",
    to_status: "INACTIVE",
    data: null,
    ...overrides,
  };
}

function signedInAs(person: typeof AN | typeof HOA, auditHandler?: Parameters<typeof http.get>[1]) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: {
          id: "self",
          code: person.code,
          full_name: person.full_name,
          roles: person.roles,
        },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: "self",
          code: person.code,
          full_name: person.full_name,
          email: "x@smyou.vn",
          title: null,
          department: "MANAGEMENT",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
    http.get("/api/v1/employees", () =>
      HttpResponse.json({ items: [KHOA_EMPLOYEE], total: 1, limit: 100, offset: 0 }),
    ),
    ...(auditHandler ? [http.get("/api/v1/audit-events", auditHandler)] : []),
  );
  markSignedIn();
}

function desktop() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AC-SYS-072 hàng nhật ký nói rõ đối tượng và trạng thái bằng tiếng Việt", () => {
  test("Đối tượng hiện tên + mã nhân viên bị tác động; Trước → Sau là badge tiếng Việt", async () => {
    desktop();
    signedInAs(AN, () => HttpResponse.json({ items: [event()], total: 1, limit: 20, offset: 0 }));
    renderApp("/audit");

    const table = await screen.findByRole("table", { name: "Nhật ký hệ thống" });
    expect(
      await within(table).findByText("Nhân viên · Trần Minh Khoa (NV014)"),
    ).toBeInTheDocument();
    expect(within(table).getByText("Đang hoạt động")).toBeInTheDocument();
    expect(within(table).getByText("Đã khoá")).toBeInTheDocument();
    expect(within(table).queryByText(/ACTIVE/)).not.toBeInTheDocument();
    expect(within(table).getByText("20/09/2026 01:05")).toBeInTheDocument();
  });
});

describe("AC-SYS-074 mọi bộ lọc tới API; Xoá lọc về trang đầu", () => {
  test("loại đối tượng, người thực hiện, từ ngày, đến ngày; trang 2 → Xoá lọc → offset 0", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json({ items: [event()], total: 45, limit: 20, offset: 0 });
    });
    renderApp("/audit");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Trang sau" }));
    await waitFor(() => {
      expect(lastQuery).toContain("offset=20");
    });

    await user.selectOptions(screen.getByLabelText("Loại đối tượng"), "EMPLOYEE");
    await user.selectOptions(await screen.findByLabelText("Người thực hiện"), KHOA_ID);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-09-20" } });
    await waitFor(() => {
      expect(lastQuery).toContain("entity_type=EMPLOYEE");
      expect(lastQuery).toContain(`actor_id=${KHOA_ID}`);
      expect(lastQuery).toContain("occurred_from=2026-09-01");
      expect(lastQuery).toContain("occurred_to=2026-09-20");
      expect(lastQuery).toContain("offset=0");
    });

    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => {
      expect(lastQuery).toContain("offset=20");
    });
    await user.click(screen.getByRole("button", { name: "Xoá lọc" }));
    await waitFor(() => {
      expect(lastQuery).toBe("?limit=20&offset=0");
    });
  });

  test("Từ ngày sau Đến ngày: báo lỗi dưới ô, không gửi khoảng ngày sai", async () => {
    const queries: string[] = [];
    signedInAs(AN, ({ request }) => {
      queries.push(new URL(request.url).search);
      return HttpResponse.json({ items: [event()], total: 1, limit: 20, offset: 0 });
    });
    renderApp("/audit");
    await screen.findByLabelText("Từ ngày");

    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-09-19" } });

    expect(await screen.findByText("Từ ngày không được sau Đến ngày.")).toBeInTheDocument();
    expect(queries.some((q) => q.includes("occurred_to=2026-09-19"))).toBe(false);
    expect(screen.queryByText("Không tải được nhật ký.")).not.toBeInTheDocument();
  });
});

describe("AC-SYS-076 mục menu Nhật ký hệ thống chỉ dành cho Manager", () => {
  test("Manager thấy mục menu", async () => {
    desktop();
    signedInAs(AN, () => HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }));
    renderApp("/audit");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).getByRole("link", { name: "Nhật ký hệ thống" })).toBeInTheDocument();
  });

  test("Sale không thấy mục menu", async () => {
    desktop();
    signedInAs(HOA);
    renderApp("/audit");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).queryByRole("link", { name: "Nhật ký hệ thống" })).not.toBeInTheDocument();
  });
});

describe("AC-SYS-072 tra tên đối tượng qua mọi trang danh sách nhân viên (review vòng 2)", () => {
  test("nhân viên thứ 101 (mới tạo, mã lớn nhất) vẫn hiện tên trong nhật ký và trong bộ lọc", async () => {
    desktop();
    const filler = Array.from({ length: 100 }, (_, n) => ({
      ...KHOA_EMPLOYEE,
      id: `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      code: `NV${String(n).padStart(3, "0")}`,
      full_name: `Nhân viên ${String(n)}`,
    }));
    const newest = {
      ...KHOA_EMPLOYEE,
      id: "f0000000-0000-4000-8000-999999999999",
      code: "NV101",
      full_name: "Đỗ Minh Tâm",
    };
    signedInAs(AN, () =>
      HttpResponse.json({
        items: [
          event({ entity_id: newest.id, action: "create", from_status: null, to_status: null }),
        ],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    );
    server.use(
      http.get("/api/v1/employees", ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
        const items = offset === 0 ? filler : [newest];
        return HttpResponse.json({ items, total: 101, limit: 100, offset });
      }),
    );
    renderApp("/audit");

    const table = await screen.findByRole("table", { name: "Nhật ký hệ thống" });
    expect(await within(table).findByText("Nhân viên · Đỗ Minh Tâm (NV101)")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Người thực hiện")).getByRole("option", {
        name: "Đỗ Minh Tâm (NV101)",
      }),
    ).toBeInTheDocument();
  });
});

describe("AC-SYS-074 khoảng ngày ngược trước khi tải xong (review vòng 2)", () => {
  test("không kẹt ở khung đang tải: hiện lỗi ở ô Đến ngày", async () => {
    signedInAs(AN, async () => {
      await new Promise(() => undefined); // first page never arrives
      return HttpResponse.json({});
    });
    renderApp("/audit");
    fireEvent.change(await screen.findByLabelText("Từ ngày"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-09-19" } });

    expect(await screen.findByText("Từ ngày không được sau Đến ngày.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Đang tải nhật ký" })).not.toBeInTheDocument();
  });
});
