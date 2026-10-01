import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";

type OrderSummary = components["schemas"]["OrderSummary"];

const hoaId = "a0000000-0000-4000-8000-000000000010";

interface Person {
  code: string;
  full_name: string;
  email: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const self = ["self"];
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "order.create": all,
    "profile.manage": self,
  },
};

function summary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: "b0000000-0000-4000-8000-000000000020",
    code: "DH2609-0001",
    status: "DRAFT",
    division: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    priority: "NORMAL",
    requested_date: null,
    total: 3300000,
    created_by: hoaId,
    created_by_name: "Nguyễn Thị Hoa",
    created_at: "2026-09-30T03:00:00Z",
    ...overrides,
  };
}

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
          department: "MANAGEMENT",
        },
        roles: person.roles,
        capabilities: person.capabilities,
        counters: {},
      }),
    ),
  );
  markSignedIn();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AC-ORD-069 danh sách đơn", () => {
  test("bảng desktop đủ cột, tìm kiếm debounce, lọc trạng thái, bấm dòng điều hướng chi tiết", async () => {
    signedInAs(hoaId, HOA);
    let lastQuery = "";
    server.use(
      http.get("/api/v1/orders", ({ request }) => {
        lastQuery = new URL(request.url).search;
        return HttpResponse.json({
          items: [
            summary({ requested_date: "2026-11-05" }),
            summary({
              id: "b0000000-0000-4000-8000-000000000021",
              code: "DH2609-0002",
              status: "PENDING_DISPATCH",
            }),
            summary({
              id: "b0000000-0000-4000-8000-000000000022",
              code: "DH2609-0003",
              status: "CANCELLED",
            }),
          ],
          total: 3,
          limit: 20,
          offset: 0,
        });
      }),
    );
    const router = renderApp("/orders");
    await screen.findByText("DH2609-0001");

    expect(screen.getByRole("columnheader", { name: "Mã" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Khách" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Trạng thái" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tổng tiền" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Ngày hẹn" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Người tạo" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Chờ điều phối")).toBeInTheDocument();
    expect(within(table).getByText("Đã huỷ")).toBeInTheDocument();
    expect(within(table).getByText("05/11/2026")).toBeInTheDocument();
    expect(within(table).queryByText("2026-11-05")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Tìm kiếm"), "0909");
    await waitFor(() => {
      expect(lastQuery).toContain("q=0909");
    });

    await user.selectOptions(screen.getByLabelText("Trạng thái"), "CANCELLED");
    await waitFor(() => {
      expect(lastQuery).toContain("status=CANCELLED");
    });

    await user.click(screen.getByText("DH2609-0001"));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/orders/b0000000-0000-4000-8000-000000000020");
    });
  });

  test("không kết quả → empty state", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/orders");

    expect(await screen.findByText("Không tìm thấy đơn nào.")).toBeInTheDocument();
  });

  test("lỗi tải danh sách → nút Thử lại tải lại", async () => {
    signedInAs(hoaId, HOA);
    let calls = 0;
    server.use(
      http.get("/api/v1/orders", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ status: 503 }, { status: 503 });
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp("/orders");

    expect(await screen.findByText("Không tải được danh sách.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không tìm thấy đơn nào.")).toBeInTheDocument();
  });

  test("AC-ORD-107 bấm ô khác trong hàng (không phải mã) → điều hướng chi tiết", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [summary()], total: 1, limit: 20, offset: 0 }),
      ),
    );
    const router = renderApp("/orders");
    await screen.findByText("DH2609-0001");

    await userEvent.setup().click(screen.getByText("Cty Sáng Tạo Mới"));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/orders/b0000000-0000-4000-8000-000000000020");
    });
  });

  test("AC-ORD-108 bấm nút mã đơn vẫn điều hướng (không regression)", async () => {
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [summary()], total: 1, limit: 20, offset: 0 }),
      ),
    );
    const router = renderApp("/orders");
    await screen.findByText("DH2609-0001");

    await userEvent.setup().click(screen.getByRole("button", { name: "DH2609-0001" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/orders/b0000000-0000-4000-8000-000000000020");
    });
  });

  test("AC-ORD-109 mobile: thẻ đơn vẫn là 1 nút điều hướng, không đổi", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    signedInAs(hoaId, HOA);
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [summary()], total: 1, limit: 20, offset: 0 }),
      ),
    );
    const router = renderApp("/orders");
    await screen.findByText("DH2609-0001");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("DH2609-0001"));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/orders/b0000000-0000-4000-8000-000000000020");
    });
  });
});
