import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["self"] },
};

const ZERO_SUMMARY = {
  pending_count: 0,
  active_count: 0,
  done_today_count: 0,
  not_started_count: 0,
  overdue_count: 0,
  awaiting_confirmation_count: 0,
};

// M18-01b: mọi thẻ khối "Việc của tôi" là <button> mở popup (không còn link tới /my-tasks, /orders).
test("AC-DASH-052 cả 3 thẻ mới có giá trị 0 vẫn hiện và bấm được (mở popup)", async () => {
  signedInAs("a0000000-0000-4000-8000-000000000082", DUC);
  server.use(
    http.get("/api/v1/dashboard", () => HttpResponse.json({ my_task_summary: ZERO_SUMMARY })),
  );
  renderApp("/");

  for (const name of [/Chưa thực hiện/, /Quá hạn chưa hoàn thành/, /Chờ KH xác nhận/]) {
    const tile = await screen.findByRole("button", { name });
    expect(tile.getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(tile).getByText("0")).toBeInTheDocument();
  }
  expect(screen.queryAllByRole("link", { name: /Chờ nhận|Đang làm|Đã xong hôm nay/ })).toHaveLength(
    0,
  );
});
