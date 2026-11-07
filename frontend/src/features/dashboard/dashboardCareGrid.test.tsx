import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { AN, signedInAs } from "../dispatch/testFixtures";

type Dashboard = components["schemas"]["DashboardOut"];
type CardItems = components["schemas"]["DashboardCardItemsOut"];

const DASHBOARD: Dashboard = {
  care_summary: { today: 2, month: 8 },
  care_staff_count: 3,
  orders_needing_revision_count: 1,
};

const ITEMS: Record<string, CardItems> = {
  "care.customers": {
    card: "care.customers",
    label: "KH đã gọi",
    kind: "feedback",
    total: 8,
    page: 1,
    page_size: 20,
    feedback_items: [],
  },
  "care.revision_orders": {
    card: "care.revision_orders",
    label: "Đơn hàng phải sửa",
    kind: "order",
    total: 1,
    page: 1,
    page_size: 20,
    order_items: [],
  },
};

/** First render loads the lazy dashboard route; the 1s default flakes under a full parallel run. */
const COLD_START = { timeout: 3000 };

function mockApi() {
  server.use(
    http.get("/api/v1/dashboard", () => HttpResponse.json(DASHBOARD)),
    http.get("/api/v1/dashboard/cards/:card/items", ({ params }) =>
      HttpResponse.json(ITEMS[String(params.card)]),
    ),
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

describe("Lưới mục 'Chăm sóc khách hàng' (M20-10)", () => {
  test("AC-UI-070 An: lưới grid-cols-2 + md:grid-cols-3; thẻ 'KH đã gọi' col-span-2 + md:col-span-1; đủ 3 thẻ đúng thứ tự", async () => {
    signedInAs("an-id", AN);
    mockApi();
    renderApp("/");

    const grid = await careGrid();
    expect(classes(grid)).toEqual(expect.arrayContaining(["grid-cols-2", "md:grid-cols-3"]));
    const tiles = within(grid).getAllByRole("button");
    expect(tiles.map((tile) => tile.querySelector("p")?.textContent)).toEqual([
      "KH đã gọi",
      "NV đã gọi điện CSKH",
      "Đơn hàng phải sửa",
    ]);
    expect(classes(tiles[0] as HTMLElement)).toEqual(
      expect.arrayContaining(["col-span-2", "md:col-span-1"]),
    );
    for (const tile of tiles.slice(1)) expect(tile.className).not.toContain("col-span-2");
    expect(within(tiles[0] as HTMLElement).getByText("Hôm nay: 2")).toBeInTheDocument();
  });

  test("AC-UI-074 An bấm 'Đơn hàng phải sửa' rồi 'KH đã gọi' → popup như M18-01c; vùng bấm phủ cả chiều cao thẻ", async () => {
    signedInAs("an-id", AN);
    mockApi();
    renderApp("/");
    const user = userEvent.setup();

    const grid = await careGrid();
    for (const tile of within(grid).getAllByRole("button")) {
      // Nút và khối nội dung bên trong đều kéo giãn theo ô lưới (grid stretch).
      expect(classes(tile)).toContain("h-full");
      expect(classes(tile.firstElementChild as HTMLElement)).toContain("h-full");
    }

    await user.click(within(grid).getByRole("button", { name: /Đơn hàng phải sửa/ }));
    const revision = await screen.findByRole("dialog", { name: "Đơn hàng phải sửa (1)" });
    await user.keyboard("{Escape}");
    expect(revision).not.toBeInTheDocument();

    await user.click(within(grid).getByRole("button", { name: /KH đã gọi/ }));
    expect(await screen.findByRole("dialog", { name: "KH đã gọi (8)" })).toBeInTheDocument();
  });

  test("AC-UI-075 An: không còn chuỗi 'Khách hàng đã chăm sóc'; thẻ + popup tên 'KH đã gọi'; tiêu đề mục giữ nguyên", async () => {
    signedInAs("an-id", AN);
    mockApi();
    renderApp("/");

    const grid = await careGrid();
    expect(screen.getByRole("heading", { name: "Chăm sóc khách hàng (tháng này)" })).toBeVisible();
    expect(within(grid).getByText("KH đã gọi")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Khách hàng đã chăm sóc");

    await userEvent.setup().click(within(grid).getByRole("button", { name: /KH đã gọi/ }));
    expect(await screen.findByRole("dialog", { name: "KH đã gọi (8)" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Khách hàng đã chăm sóc");
  });
});
