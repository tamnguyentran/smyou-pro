import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, TUAN } from "../dispatch/testFixtures";

type Dashboard = components["schemas"]["DashboardOut"];

const DASHBOARD: Dashboard = {
  dispatch_summary: {
    pending_dispatch_count: 3,
    in_progress_order_count: 5,
    needs_assignee_count: 1,
    overdue_task_count: 2,
  },
  staff_summary: {
    active_technician_count: 7,
    counts_by_status: { IN_PROGRESS: 2, NOT_STARTED: 3, IDLE: 1 },
    pending_acceptance_count: 1,
  },
};

/** First render loads the lazy dashboard route; the 1s default flakes under a full parallel run. */
const COLD_START = { timeout: 3000 };

async function sectionGrid(heading: RegExp) {
  const section = (await screen.findByRole("heading", { name: heading }, COLD_START)).closest(
    "section",
  ) as HTMLElement;
  const grid = section.querySelector(".grid") as HTMLElement;
  return { section, grid };
}

function tileLabels(grid: HTMLElement) {
  return within(grid)
    .getAllByRole("button")
    .map((tile) => tile.querySelector("p")?.textContent);
}

describe("Lưới 4 thẻ Điều phối + Nhân sự kỹ thuật (M20-01)", () => {
  test("AC-UI-052 Tuấn: lưới 'Điều phối' grid-cols-2 + md:grid-cols-4, không còn md:grid-cols-3, đủ 4 thẻ đúng thứ tự", async () => {
    signedInAs("tuan-id", TUAN);
    server.use(http.get("/api/v1/dashboard", () => HttpResponse.json(DASHBOARD)));
    renderApp("/");

    const { grid } = await sectionGrid(/^Điều phối$/);
    expect(grid.className.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-2", "md:grid-cols-4"]),
    );
    expect(grid.className).not.toContain("md:grid-cols-3");
    expect(tileLabels(grid)).toEqual([
      "Chờ điều phối",
      "Đang thực hiện",
      "Cần giao lại",
      "Quá hạn",
    ]);
  });

  test("AC-UI-053 Tuấn: lưới 'Nhân sự kỹ thuật' grid-cols-2 + md:grid-cols-4, không còn md:grid-cols-3, thứ tự như AC-DASH-042", async () => {
    signedInAs("tuan-id", TUAN);
    server.use(http.get("/api/v1/dashboard", () => HttpResponse.json(DASHBOARD)));
    renderApp("/");

    const { grid } = await sectionGrid(/^Nhân sự kỹ thuật/);
    expect(grid.className.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-2", "md:grid-cols-4"]),
    );
    expect(grid.className).not.toContain("md:grid-cols-3");
    expect(tileLabels(grid)).toEqual([
      "Đang làm",
      "Chưa tiếp nhận",
      "Chưa thực hiện",
      "Chờ giao việc",
    ]);
  });

  test("AC-UI-056 Tuấn bấm 'Quá hạn' (Điều phối) trong lưới mới → vẫn mở popup chi tiết", async () => {
    signedInAs("tuan-id", TUAN);
    server.use(
      http.get("/api/v1/dashboard", () => HttpResponse.json(DASHBOARD)),
      http.get("/api/v1/dashboard/cards/:card/items", () =>
        HttpResponse.json({
          card: "dispatch.overdue_tasks",
          label: "Đầu việc quá hạn",
          kind: "task",
          total: 0,
          page: 1,
          page_size: 20,
          task_items: [],
        }),
      ),
    );
    renderApp("/");

    const { grid } = await sectionGrid(/^Điều phối$/);
    await userEvent.setup().click(within(grid).getByRole("button", { name: /Quá hạn/ }));

    expect(await screen.findByRole("dialog", { name: /Đầu việc quá hạn/ })).toBeInTheDocument();
  });
});
