import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type ReportRow = components["schemas"]["CustomerGiftReportRowOut"];
type GiftItem = components["schemas"]["CustomerGiftOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const ducId = "a0000000-0000-4000-8000-000000000084";
const kh1Id = "c0000000-0000-4000-8000-000000000001";
const empId = "a0000000-0000-4000-8000-000000000010";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: { "dashboard.read": ["all"], "report.customer_gift.read": ["all"] },
};
const DUC: Person = {
  code: "NV017",
  full_name: "Nguyễn Văn Đức",
  email: "duc.nguyen@smyou.vn",
  roles: ["TECHNICIAN"],
  capabilities: { "dashboard.read": ["all"] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    customer_id: kh1Id,
    customer_code: "KH00001",
    customer_name: "Cty Sáng Tạo Mới",
    contact_person: "Nguyễn Văn A",
    gift_count: 2,
    total_cost: 1_500_000,
    ...overrides,
  };
}

function giftItem(overrides: Partial<GiftItem> = {}): GiftItem {
  return {
    id: "d0000000-0000-4000-8000-000000000040",
    customer_id: kh1Id,
    occasion_name: "Tết 2027",
    performed_date: "2027-01-20",
    gift_name: "Giỏ quà Tết",
    quantity: 2,
    unit_price: 500000,
    other_cost: 50000,
    total_amount: 1050000,
    note: null,
    performed_by: { id: empId, code: "NV005", full_name: "Nguyễn Thị Hoa" },
    requested_by: { id: empId, code: "NV005", full_name: "Nguyễn Thị Hoa" },
    created_by: empId,
    version: 1,
    created_at: "2027-01-20T02:00:00Z",
    updated_at: "2027-01-20T02:00:00Z",
    ...overrides,
  };
}

function mockReport(items: ReportRow[], onRequest?: (search: string) => void) {
  server.use(
    http.get("/api/v1/reports/customer-gifts", ({ request }) => {
      onRequest?.(new URL(request.url).search);
      return HttpResponse.json({
        from: "2026-09-01",
        to: "2026-09-30",
        items,
        total: items.length,
      });
    }),
  );
}

describe("Báo cáo chi phí quà tặng KH", () => {
  test("AC-GFT-040 mở trang → bảng hiện đúng cột, mặc định đầu tháng→hôm nay", async () => {
    vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport([row()], (search) => {
      requests.push(search);
    });
    renderApp("/reports/customer-gifts");

    await screen.findByRole("heading", { name: "Chi phí quà tặng KH" });
    await waitFor(() => {
      expect(requests).toContain("?from=2026-09-01&to=2026-09-15");
    });
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("2026-09-15");
    expect(screen.getByText("KH00001")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("AC-GFT-041 bấm 1 dòng → drilldown hiện đúng danh sách lần tặng", async () => {
    signedInAs(anId, AN);
    mockReport([row()]);
    const itemsRequests: string[] = [];
    server.use(
      http.get("/api/v1/reports/customer-gifts/:customerId/items", ({ request }) => {
        itemsRequests.push(new URL(request.url).search);
        return HttpResponse.json([giftItem()]);
      }),
    );
    renderApp("/reports/customer-gifts");
    const user = userEvent.setup();

    await screen.findByText("Cty Sáng Tạo Mới");
    await user.click(screen.getByRole("button", { name: "Cty Sáng Tạo Mới" }));

    const dialog = await screen.findByRole("dialog", { name: "Cty Sáng Tạo Mới" });
    await waitFor(() => {
      expect(itemsRequests.length).toBe(1);
    });
    expect(within(dialog).getByText("Tết 2027")).toBeInTheDocument();
    expect(within(dialog).getByText(/Giỏ quà Tết/)).toBeInTheDocument();
  });

  test("AC-GFT-042 bấm 'Xuất Excel' → link trỏ đúng endpoint export kèm filter hiện tại", async () => {
    vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
    signedInAs(anId, AN);
    mockReport([row()]);
    renderApp("/reports/customer-gifts");

    await screen.findByText("Cty Sáng Tạo Mới");
    const exportLink = screen.getByRole("link", { name: "Xuất Excel" });
    expect(exportLink).toHaveAttribute(
      "href",
      "/api/v1/reports/customer-gifts/export?from=2026-09-01&to=2026-09-15",
    );
  });

  test("AC-GFT-043 Đức (TECHNICIAN, không có report.customer_gift.read) mở URL trực tiếp → 403", async () => {
    signedInAs(ducId, DUC);
    renderApp("/reports/customer-gifts");

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
  });
});
