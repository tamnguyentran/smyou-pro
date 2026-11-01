import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defaultMonthToDateRange } from "../../lib/dateRange";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";

type OrderSummary = components["schemas"]["OrderSummary"];

interface Person {
  id: string;
  code: string;
  full_name: string;
  roles: string[];
  capabilities: Record<string, string[]>;
}
const all = ["all"];
const HOA: Person = {
  id: "a0000000-0000-4000-8000-000000000010",
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  roles: ["SALE"],
  capabilities: { "dashboard.read": all, "order.read": all, "order.create": all },
};
const HUNG_ID = "a0000000-0000-4000-8000-000000000011";
const LAN: Person = {
  id: "a0000000-0000-4000-8000-000000000020",
  code: "NV020",
  full_name: "Võ Thị Lan",
  roles: ["CUSTOMER_CARE"],
  capabilities: {
    "dashboard.read": all,
    "order.read": all,
    "order.create": all,
    "customer_care.manage_feedback": all,
  },
};
const AN: Person = {
  id: "a0000000-0000-4000-8000-000000000001",
  code: "NV001",
  full_name: "Nguyễn Văn An",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": all, "order.read": all, "order.create": all },
};
const MINH: Person = {
  id: "a0000000-0000-4000-8000-000000000030",
  code: "NV030",
  full_name: "Trần Văn Minh",
  roles: ["TECH_LEAD"],
  capabilities: { "dashboard.read": all, "order.read": all, "task.manage": all },
};
const MANAGER_SALE: Person = { ...AN, roles: ["MANAGER", "SALE"] };

function summary(overrides: Partial<OrderSummary>): OrderSummary {
  return {
    id: "b0000000-0000-4000-8000-000000000020",
    code: "DH2610-0011",
    status: "PENDING_DISPATCH",
    division_id: null,
    division_name: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    priority: "NORMAL",
    requested_date: null,
    total: 3300000,
    created_by: HOA.id,
    created_by_name: HOA.full_name,
    created_at: "2026-10-30T03:00:00Z",
    revision_no: 0,
    csat_rating: null,
    ...overrides,
  };
}

const HOA_ORDERS = [
  summary({ id: "b0000000-0000-4000-8000-000000000011", code: "DH2610-0011" }),
  summary({ id: "b0000000-0000-4000-8000-000000000012", code: "DH2610-0012" }),
];
const HUNG_ORDER = summary({
  id: "b0000000-0000-4000-8000-000000000013",
  code: "DH2610-0013",
  created_by: HUNG_ID,
  created_by_name: "Trần Văn Hùng",
});

function signedInAs(person: Person) {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: {
          id: person.id,
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
          id: person.id,
          code: person.code,
          full_name: person.full_name,
          email: `${person.code.toLowerCase()}@smyou.vn`,
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

/** Ghi lại mọi query `GET /orders`; `mine=true` → chỉ đơn của Hoa, ngược lại cả đơn của Hùng. */
function recordOrders(total?: number) {
  const queries: string[] = [];
  server.use(
    http.get("/api/v1/orders", ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      const items =
        url.searchParams.get("mine") === "true" ? HOA_ORDERS : [...HOA_ORDERS, HUNG_ORDER];
      return HttpResponse.json({
        items,
        total: total ?? items.length,
        limit: 20,
        offset: Number(url.searchParams.get("offset") ?? 0),
      });
    }),
  );
  return queries;
}

/** Ghi lại mọi query `GET /orders/csat-summary`; có `created_by` → số của riêng Lan. */
function recordCsatSummary() {
  const queries: string[] = [];
  server.use(
    http.get("/api/v1/orders/csat-summary", ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      const none = url.searchParams.has("created_by") ? 1 : 7;
      return HttpResponse.json({ "5": 0, "4": 0, "3": 0, "2": 0, "1": 0, none });
    }),
  );
  return queries;
}

const mineCheckbox = () => screen.getByRole("checkbox", { name: "Chỉ đơn của tôi" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("M20-03 'Chỉ đơn của tôi' mặc định theo vai trò", () => {
  test("AC-ORD-243 Hoa (SALE) mở /orders → checkbox tick, request đầu tiên đã có mine=true, chỉ đơn của Hoa", async () => {
    signedInAs(HOA);
    const queries = recordOrders();
    const csatQueries = recordCsatSummary();
    renderApp("/orders");

    expect(await screen.findAllByText("DH2610-0011")).not.toHaveLength(0);
    expect(csatQueries).toHaveLength(0);
    expect(mineCheckbox()).toBeChecked();
    expect(queries[0]).toContain("mine=true");
    expect(queries.every((query) => query.includes("mine=true"))).toBe(true);
    expect(screen.getAllByText("DH2610-0012")).not.toHaveLength(0);
    expect(screen.queryByText("DH2610-0013")).not.toBeInTheDocument();
  });

  test("AC-ORD-244 Lan (CUSTOMER_CARE) mở /orders → tick, mine=true + khoảng ngày mặc định, csat-summary có created_by=<Lan>", async () => {
    signedInAs(LAN);
    const queries = recordOrders();
    const csatQueries = recordCsatSummary();
    renderApp("/orders");

    await waitFor(() => {
      expect(csatQueries).not.toHaveLength(0);
    });
    await screen.findAllByText("DH2610-0011");
    expect(mineCheckbox()).toBeChecked();
    const range = defaultMonthToDateRange();
    expect(queries[0]).toContain("mine=true");
    expect(queries[0]).toContain(`from=${range.from}`);
    expect(queries[0]).toContain(`to=${range.to}`);
    expect(csatQueries[0]).toContain(`created_by=${LAN.id}`);
    expect(csatQueries[0]).toContain(`from=${range.from}`);
    expect(csatQueries[0]).toContain(`to=${range.to}`);
  });

  test.each([
    ["An (MANAGER)", AN],
    ["Minh (TECH_LEAD)", MINH],
  ])("AC-ORD-245 %s mở /orders → checkbox không tick, request không có mine", async (_, person) => {
    signedInAs(person);
    const queries = recordOrders();
    renderApp("/orders");

    expect(await screen.findAllByText("DH2610-0013")).not.toHaveLength(0);
    expect(mineCheckbox()).not.toBeChecked();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => !query.includes("mine"))).toBe(true);
  });

  test("AC-ORD-246 Hoa ở trang 2, bỏ tick → gọi lại không có mine, offset=0, có cả đơn của Hùng", async () => {
    signedInAs(HOA);
    const queries = recordOrders(45);
    renderApp("/orders");
    await screen.findAllByText("DH2610-0011");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => {
      expect(queries.at(-1)).toContain("offset=20");
    });
    expect(queries.at(-1)).toContain("mine=true");

    await user.click(mineCheckbox());

    await waitFor(() => {
      expect(queries.at(-1)).not.toContain("mine");
    });
    expect(queries.at(-1)).toContain("offset=0");
    expect(mineCheckbox()).not.toBeChecked();
    expect(await screen.findAllByText("DH2610-0013")).not.toHaveLength(0);
  });

  test("AC-ORD-247 Hoa (SALE) mở /orders?mine=0 → checkbox không tick, request không có mine", async () => {
    signedInAs(HOA);
    const queries = recordOrders();
    renderApp("/orders?mine=0");

    expect(await screen.findAllByText("DH2610-0013")).not.toHaveLength(0);
    expect(mineCheckbox()).not.toBeChecked();
    expect(queries.every((query) => !query.includes("mine"))).toBe(true);
  });

  test("AC-ORD-248 An (MANAGER) mở /orders?status=PENDING_DISPATCH&mine=1 → tick, chip 'Chờ điều phối', mine=true", async () => {
    signedInAs(AN);
    const queries = recordOrders();
    renderApp("/orders?status=PENDING_DISPATCH&mine=1");

    await screen.findAllByText("DH2610-0011");
    expect(mineCheckbox()).toBeChecked();
    expect(screen.getByRole("radio", { name: "Chờ điều phối" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(queries[0]).toContain("mine=true");
    expect(queries[0]).toContain("status=PENDING_DISPATCH");
  });

  test("AC-ORD-249 Lan bỏ tick → csat-summary gọi lại không có created_by (cùng from/to), thẻ hiện số toàn công ty", async () => {
    signedInAs(LAN);
    recordOrders();
    const csatQueries = recordCsatSummary();
    renderApp("/orders");

    const unrated = await screen.findByRole("button", { name: /chưa đánh giá/i });
    await waitFor(() => {
      expect(unrated).toHaveTextContent("1");
    });

    const user = userEvent.setup();
    await user.click(mineCheckbox());

    await waitFor(() => {
      expect(csatQueries.at(-1)).not.toContain("created_by");
    });
    const range = defaultMonthToDateRange();
    expect(csatQueries.at(-1)).toContain(`from=${range.from}`);
    expect(csatQueries.at(-1)).toContain(`to=${range.to}`);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /chưa đánh giá/i })).toHaveTextContent("7");
    });
  });

  test("AC-ORD-251 người có MANAGER + SALE mở /orders → checkbox không tick, request không có mine (Q128)", async () => {
    signedInAs(MANAGER_SALE);
    const queries = recordOrders();
    renderApp("/orders");

    expect(await screen.findAllByText("DH2610-0013")).not.toHaveLength(0);
    expect(mineCheckbox()).not.toBeChecked();
    expect(queries.every((query) => !query.includes("mine"))).toBe(true);
  });
});
