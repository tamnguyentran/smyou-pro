import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { MyTaskSummarySection } from "./components/MyTaskSummarySection";

const ZERO_SUMMARY = {
  pending_count: 0,
  active_count: 0,
  done_today_count: 0,
  not_started_count: 0,
  overdue_count: 0,
  awaiting_confirmation_count: 0,
};

test("AC-DASH-047 thẻ 'Chưa thực hiện' dẫn tới /my-tasks?focus=not_started", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={{ ...ZERO_SUMMARY, not_started_count: 2 }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /Chưa thực hiện/ }).getAttribute("href")).toBe(
    "/my-tasks?focus=not_started",
  );
});

test("thẻ 'Quá hạn chưa hoàn thành' dẫn tới /my-tasks?focus=overdue", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={{ ...ZERO_SUMMARY, overdue_count: 1 }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /Quá hạn chưa hoàn thành/ }).getAttribute("href")).toBe(
    "/my-tasks?focus=overdue",
  );
});

test("AC-DASH-046 thẻ 'Chưa hoàn tất, cần KH xác nhận' dẫn tới /orders?status=AWAITING_CONFIRMATION", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={{ ...ZERO_SUMMARY, awaiting_confirmation_count: 1 }} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: /Chưa hoàn tất, cần KH xác nhận/ }).getAttribute("href"),
  ).toBe("/orders?status=AWAITING_CONFIRMATION");
});

test("thẻ 'Chờ nhận' dẫn tới /my-tasks", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={{ ...ZERO_SUMMARY, pending_count: 2 }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /Chờ nhận/ }).getAttribute("href")).toBe("/my-tasks");
});

test("thẻ 'Đang làm' dẫn tới /my-tasks?focus=active", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={{ ...ZERO_SUMMARY, active_count: 1 }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /Đang làm/ }).getAttribute("href")).toBe(
    "/my-tasks?focus=active",
  );
});

test("thẻ 'Đã xong hôm nay' dẫn tới /my-tasks?focus=done", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={{ ...ZERO_SUMMARY, done_today_count: 1 }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /Đã xong hôm nay/ }).getAttribute("href")).toBe(
    "/my-tasks?focus=done",
  );
});

test("AC-DASH-052 cả 3 thẻ mới có giá trị 0 vẫn render như link bấm được", () => {
  render(
    <MemoryRouter>
      <MyTaskSummarySection summary={ZERO_SUMMARY} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /Chưa thực hiện/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Quá hạn chưa hoàn thành/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Chưa hoàn tất, cần KH xác nhận/ })).toBeInTheDocument();
});
