import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, TUAN, tuanId } from "./testFixtures";

type EmployeeWorkloadItem = components["schemas"]["EmployeeWorkloadItem"];

const khoaId = "a0000000-0000-4000-8000-000000000081";
const minhId = "a0000000-0000-4000-8000-000000000082";
const dungId = "a0000000-0000-4000-8000-000000000083";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function workloadItem(overrides: Partial<EmployeeWorkloadItem> = {}): EmployeeWorkloadItem {
  return {
    employee_id: dungId,
    full_name: "Hồ Văn Dũng",
    open_task_count: 0,
    total_estimated_hours: "0",
    nearest_due_at: null,
    ...overrides,
  };
}

// Fixture spec §3: thứ tự Dũng (0 giờ), Khoa (8 giờ), Minh (9 giờ) — khớp backend thật.
const DUNG = workloadItem();
const KHOA = workloadItem({
  employee_id: khoaId,
  full_name: "Trần Minh Khoa",
  open_task_count: 2,
  total_estimated_hours: "8.00",
  nearest_due_at: "2026-10-05T02:00:00Z",
});
const MINH = workloadItem({
  employee_id: minhId,
  full_name: "Võ Thành Minh",
  open_task_count: 2,
  total_estimated_hours: "9.00",
  nearest_due_at: "2026-10-06T02:00:00Z",
});
const ALL_ROWS = [DUNG, KHOA, MINH];

function mockWorkload(items: EmployeeWorkloadItem[] = ALL_ROWS) {
  server.use(http.get("/api/v1/tasks/workload", () => HttpResponse.json({ items })));
}

describe("Lịch & tải việc", () => {
  test("AC-DSP-101 desktop 1440px: bảng 4 cột đúng thứ tự/số liệu, hạn trống hiện —", async () => {
    signedInAs(tuanId, TUAN);
    mockWorkload();
    renderApp("/dispatch/workload");

    await screen.findByText("Trần Minh Khoa");
    const rows = screen.getAllByRole("row").slice(1); // bỏ header
    expect(rows.map((r) => within(r).getAllByRole("cell").at(0)?.textContent)).toEqual([
      "Hồ Văn Dũng",
      "Trần Minh Khoa",
      "Võ Thành Minh",
    ]);

    const dungRow = screen.getByText("Hồ Văn Dũng").closest("tr") as HTMLElement;
    const cells = within(dungRow).getAllByRole("cell");
    expect(cells.at(1)).toHaveTextContent("0");
    expect(cells.at(3)).toHaveTextContent("—");
  });

  test("AC-DSP-102 mobile 390px: thẻ xếp dọc, đúng thứ tự/số liệu, không phải bảng ngang", async () => {
    mobile();
    signedInAs(tuanId, TUAN);
    mockWorkload();
    renderApp("/dispatch/workload");

    await screen.findByText("Trần Minh Khoa");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const names = screen.getAllByText(/Hồ Văn Dũng|Trần Minh Khoa|Võ Thành Minh/);
    expect(names.map((n) => n.textContent)).toEqual([
      "Hồ Văn Dũng",
      "Trần Minh Khoa",
      "Võ Thành Minh",
    ]);
  });

  test("AC-DSP-103 đang tải: Skeleton đúng khung, aria-busy, không spinner toàn trang", async () => {
    signedInAs(tuanId, TUAN);
    server.use(
      http.get("/api/v1/tasks/workload", async () => {
        await delay(50);
        return HttpResponse.json({ items: [] });
      }),
    );
    renderApp("/dispatch/workload");

    const waiting = await screen.findByLabelText("Đang tải tải việc theo nhân viên");
    expect(waiting).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("AC-DSP-104 lỗi tải: EmptyState + Thử lại gọi lại", async () => {
    signedInAs(tuanId, TUAN);
    let calls = 0;
    server.use(
      http.get("/api/v1/tasks/workload", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ status: 500 }, { status: 500 });
        return HttpResponse.json({ items: ALL_ROWS });
      }),
    );
    renderApp("/dispatch/workload");

    expect(await screen.findByText("Không tải được tải việc theo nhân viên.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Trần Minh Khoa");
    expect(calls).toBe(2);
  });

  test("AC-DSP-105 rỗng: EmptyState không có bảng/thẻ", async () => {
    signedInAs(tuanId, TUAN);
    mockWorkload([]);
    renderApp("/dispatch/workload");

    expect(
      await screen.findByText("Chưa có kỹ thuật viên nào đang hoạt động."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
