import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";

const all = ["all"];
const self = ["self"];

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": all,
    "audit.read": all,
    "employee.read": all,
    "employee.manage": all,
    "profile.manage": self,
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Lê Thị Hoa",
  email: "hoa.le@smyou.vn",
  roles: ["SALE"],
  capabilities: { "dashboard.read": ["own"], "profile.manage": self },
};
const BINH_EMPLOYEE = {
  id: "b0000000-0000-4000-8000-000000000002",
  code: "NV002",
  full_name: "Lê Văn Bình",
  email: "binh.le@smyou.vn",
  phone: null,
  department: "MANAGEMENT",
  title: null,
  roles: ["MANAGER"],
  is_active: true,
  is_locked: false,
  must_change_password: false,
  version: 1,
};

interface AuditEventOut {
  id: string;
  occurred_at: string;
  actor: { id: string; code: string; full_name: string } | null;
  entity_type: string;
  entity_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  data: Record<string, unknown> | null;
}

function auditEvent(overrides: Partial<AuditEventOut> = {}): AuditEventOut {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-20T01:00:00+07:00",
    actor: { id: "an", code: "NV001", full_name: "Nguyễn Văn An" },
    entity_type: "EMPLOYEE",
    entity_id: "e0000000-0000-4000-8000-000000000005",
    action: "deactivate",
    from_status: "ACTIVE",
    to_status: "INACTIVE",
    data: null,
    ...overrides,
  };
}

function page(items: AuditEventOut[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

function signedInAs(
  person: Person,
  auditHandler?: Parameters<typeof http.get>[1],
  employeesHandler?: Parameters<typeof http.get>[1],
) {
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
          email: person.email,
          title: null,
          department: "MANAGEMENT",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
    ...(auditHandler ? [http.get("/api/v1/audit-events", auditHandler)] : []),
    http.get(
      "/api/v1/employees",
      employeesHandler ??
        (() => HttpResponse.json({ items: [BINH_EMPLOYEE], total: 1, limit: 100, offset: 0 })),
    ),
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

async function openAudit() {
  return screen.findByRole("heading", { level: 1, name: "Nhật ký hệ thống" });
}

describe("AC-SYS-072 danh sách nhật ký (máy tính)", () => {
  test("bảng có đủ cột; actor null hiện Hệ thống; nhãn hành động tiếng Việt", async () => {
    mockViewport(true);
    signedInAs(AN, () =>
      HttpResponse.json(
        page([
          auditEvent({ actor: null, action: "login_failed", from_status: null, to_status: null }),
        ]),
      ),
    );
    renderApp("/audit");
    await openAudit();

    const table = await screen.findByRole("table");
    for (const heading of [
      "Thời gian",
      "Người thực hiện",
      "Đối tượng",
      "Hành động",
      "Trước → Sau",
    ]) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
    expect(within(table).getByText("Hệ thống")).toBeInTheDocument();
    expect(within(table).getByText("Đăng nhập sai")).toBeInTheDocument();
  });
});

describe("AC-SYS-073 danh sách nhật ký (điện thoại)", () => {
  test("thẻ xếp dọc, không phải bảng; không cuộn ngang", async () => {
    mockViewport(false);
    signedInAs(AN, () => HttpResponse.json(page([auditEvent()])));
    renderApp("/audit");
    await openAudit();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByText("Khoá")).toBeInTheDocument();
  });
});

describe("AC-SYS-074 bộ lọc", () => {
  test("chọn người thực hiện gọi lại API với actor_id; Xoá lọc trả về danh sách đầy đủ", async () => {
    let lastQuery = "";
    signedInAs(AN, ({ request }) => {
      lastQuery = new URL(request.url).search;
      return HttpResponse.json(page([auditEvent()]));
    });
    renderApp("/audit");
    await openAudit();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Người thực hiện"), BINH_EMPLOYEE.id);
    await waitFor(() => {
      expect(lastQuery).toContain(`actor_id=${BINH_EMPLOYEE.id}`);
    });

    await user.click(screen.getByRole("button", { name: "Xoá lọc" }));
    await waitFor(() => {
      expect(lastQuery).not.toContain("actor_id=");
    });
  });
});

describe("AC-SYS-075 trống", () => {
  test("không có dòng khớp bộ lọc hiện EmptyState", async () => {
    signedInAs(AN, () => HttpResponse.json(page([])));
    renderApp("/audit");
    await openAudit();

    expect(await screen.findByText("Chưa có nhật ký nào khớp với bộ lọc.")).toBeInTheDocument();
  });
});

describe("AC-SYS-076 phân quyền", () => {
  test("Sale không có audit.read: vào URL trực tiếp thấy trang 403", async () => {
    signedInAs(HOA);
    renderApp("/audit");

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
