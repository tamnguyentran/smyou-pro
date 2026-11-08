import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, signedInAs, type Person } from "../dispatch/testFixtures";

type Dashboard = components["schemas"]["DashboardOut"];
type CardItems = components["schemas"]["DashboardCardItemsOut"];

const MAI: Person = {
  code: "NV028",
  full_name: "Vũ Thị Mai",
  email: "mai.csk@smyou.vn",
  roles: ["CUSTOMER_CARE"],
  capabilities: { "dashboard.read": ["all"] },
};

const DASHBOARD: Dashboard = {
  care_summary: { today: 2, month: 8 },
  care_staff_count: 3,
  orders_needing_revision_count: 1,
  care_credited_order_count: 2,
};

const CREDITED: CardItems = {
  card: "care.credited_orders",
  label: "Đơn ghi doanh số",
  kind: "credited_order",
  total: 2,
  page: 1,
  page_size: 20,
  credited_order_items: [
    {
      order_id: "b0000000-0000-4000-8000-0000000000a1",
      order_code: "DH2611-0001",
      customer_name: "Công ty TNHH Minh Phát",
      created_at: "2026-11-05T03:00:00Z",
      status: "IN_PROGRESS",
      credited_total: 3_000_000,
    },
    {
      order_id: "b0000000-0000-4000-8000-0000000000b1",
      order_code: "DH2611-0002",
      customer_name: "Nhà sách Hoàng Gia",
      created_at: "2026-11-06T03:00:00Z",
      status: "COMPLETED",
      credited_total: 500_000,
    },
  ],
};

/** First render loads the lazy dashboard route; the 1s default flakes under a full parallel run. */
const COLD_START = { timeout: 3000 };

function mockApi(dashboard: Dashboard = DASHBOARD) {
  const calls: string[] = [];
  server.use(
    http.get("/api/v1/dashboard", () => HttpResponse.json(dashboard)),
    http.get("/api/v1/dashboard/cards/:card/items", ({ params }) => {
      calls.push(String(params.card));
      return HttpResponse.json(CREDITED);
    }),
  );
  return calls;
}

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

async function careGrid() {
  const section = (
    await screen.findByRole("heading", { name: "Chăm sóc khách hàng (tháng này)" }, COLD_START)
  ).closest("section") as HTMLElement;
  return section.querySelector(".grid") as HTMLElement;
}

function classes(el: Element) {
  return el.className.split(" ");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Thẻ 'Đơn ghi doanh số' khối CSKH (M21-03)", () => {
  test("AC-DASH-129 Mai (CSKH): thẻ thứ 4 'Đơn ghi doanh số' gợi ý 'Của tôi'; lưới 2 cột → md:grid-cols-4, không thẻ trọn hàng", async () => {
    signedInAs("mai-id", MAI);
    mockApi();
    renderApp("/");

    const grid = await careGrid();
    expect(classes(grid)).toEqual(expect.arrayContaining(["grid-cols-2", "md:grid-cols-4"]));
    expect(classes(grid)).not.toContain("md:grid-cols-3");
    const tiles = within(grid).getAllByRole("button");
    expect(tiles.map((tile) => tile.querySelector("p")?.textContent)).toEqual([
      "Lượt gọi CSKH",
      "NV đã gọi điện CSKH",
      "Đơn hàng phải sửa",
      "Đơn ghi doanh số",
    ]);
    for (const tile of tiles) {
      expect(tile.className).not.toContain("col-span-2");
      expect(classes(tile)).toContain("h-full");
    }
    const credited = tiles[3] as HTMLElement;
    expect(within(credited).getByText("2")).toBeInTheDocument();
    expect(within(credited).getByText("Của tôi")).toBeInTheDocument();
  });

  test("AC-DASH-129 An (Manager): gợi ý 'Của CSKH'", async () => {
    signedInAs("an-id", AN);
    mockApi();
    renderApp("/");

    const grid = await careGrid();
    const credited = within(grid).getByRole("button", { name: /Đơn ghi doanh số/ });
    expect(within(credited).getByText("Của CSKH")).toBeInTheDocument();
  });

  test("AC-DASH-129 không có khoá care_credited_order_count → giữ 3 thẻ như M20-10", async () => {
    signedInAs("an-id", AN);
    mockApi({ ...DASHBOARD, care_credited_order_count: undefined });
    renderApp("/");

    const grid = await careGrid();
    expect(classes(grid)).toContain("md:grid-cols-3");
    expect(within(grid).getAllByRole("button")).toHaveLength(3);
    expect(within(grid).queryByText("Đơn ghi doanh số")).not.toBeInTheDocument();
  });

  test("AC-DASH-130 Mai bấm thẻ (desktop) → popup 'Đơn ghi doanh số (2)', bảng có Trạng thái + Doanh số ghi cho CSKH, nút 'Xuất Excel'", async () => {
    signedInAs("mai-id", MAI);
    const calls = mockApi();
    renderApp("/");
    const user = userEvent.setup();

    const grid = await careGrid();
    await user.click(within(grid).getByRole("button", { name: /Đơn ghi doanh số/ }));

    const dialog = await screen.findByRole("dialog", { name: "Đơn ghi doanh số (2)" });
    expect(calls).toEqual(["care.credited_orders"]);
    const headers = within(dialog)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Mã đơn",
      "Khách hàng",
      "Ngày tạo",
      "Trạng thái",
      "Doanh số ghi cho CSKH",
    ]);
    const row = within(dialog)
      .getByRole("link", { name: "DH2611-0002" })
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("Hoàn tất")).toBeInTheDocument();
    expect(within(row).getByText("500.000 ₫")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Xuất Excel/ })).toBeInTheDocument();
  });

  test("AC-DASH-130 Mai bấm thẻ (390px) → danh sách thẻ, không có nút 'Xuất Excel'", async () => {
    mobile();
    signedInAs("mai-id", MAI);
    mockApi();
    renderApp("/");
    const user = userEvent.setup();

    const grid = await careGrid();
    await user.click(within(grid).getByRole("button", { name: /Đơn ghi doanh số/ }));

    const dialog = await screen.findByRole("dialog", { name: "Đơn ghi doanh số (2)" });
    expect(within(dialog).getByRole("link", { name: "DH2611-0001" })).toBeInTheDocument();
    expect(within(dialog).getByText(/3\.000\.000 ₫/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Xuất Excel/ })).not.toBeInTheDocument();
  });
});
