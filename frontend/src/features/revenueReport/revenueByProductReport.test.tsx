import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

type ProductRevenueRow = components["schemas"]["ProductRevenueRowOut"];
type RevenueLine = components["schemas"]["RevenueLineOut"];

const anId = "a0000000-0000-4000-8000-000000000001";
const securityGroupId = "a2222222-2222-4222-8222-222222222222";
const officeGroupId = "a1111111-1111-4111-8111-111111111111";
const cameraId = "c0000000-0000-4000-8000-000000000501";

const AN: Person = {
  code: "NV001",
  full_name: "Nguyễn Văn An",
  email: "an.nguyen@smyou.vn",
  roles: ["MANAGER"],
  capabilities: {
    "dashboard.read": ["all"],
    "report.revenue.read": ["all"],
    "catalog.read": ["all"],
  },
};

const PAGE_TITLE = "Doanh thu theo nhóm & sản phẩm/dịch vụ";

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
  vi.useRealTimers();
});

function groupRow(overrides: Partial<ProductRevenueRow> = {}): ProductRevenueRow {
  return {
    key: `group:${securityGroupId}`,
    label: "Thiết bị an ninh",
    code: null,
    item_type: null,
    unit: null,
    quantity: null,
    order_count: 2,
    subtotal_revenue: 12_000_000,
    profit: 3_000_000,
    ...overrides,
  };
}

function itemRow(overrides: Partial<ProductRevenueRow> = {}): ProductRevenueRow {
  return {
    key: `product:${cameraId}`,
    label: "Camera Dahua 2MP",
    code: "CAM-DH-2MP",
    item_type: "PRODUCT",
    unit: "cái",
    quantity: "4",
    order_count: 2,
    subtotal_revenue: 8_000_000,
    profit: 2_000_000,
    ...overrides,
  };
}

function revenueLine(overrides: Partial<RevenueLine> = {}): RevenueLine {
  return {
    id: "d0000000-0000-4000-8000-000000000040",
    order_id: "b0000000-0000-4000-8000-000000000020",
    order_code: "DH2609-0010",
    line_name: "Camera Dahua 2MP",
    quantity: "2",
    line_total: 4_000_000,
    profit: 1_000_000,
    order_created_at: "2026-09-10T02:00:00Z",
    order_completed_at: "2026-09-12T02:00:00Z",
    ...overrides,
  };
}

/** Trả `groupRows` cho `mode=group` (mặc định) và `itemRows` cho `mode=item`. */
function mockReport(
  {
    groupRows = [groupRow()],
    itemRows = [itemRow()],
  }: {
    groupRows?: ProductRevenueRow[];
    itemRows?: ProductRevenueRow[];
  } = {},
  onRequest?: (search: string) => void,
) {
  server.use(
    http.get("/api/v1/reports/revenue-by-product", ({ request }) => {
      const url = new URL(request.url);
      onRequest?.(url.search);
      const mode = url.searchParams.get("mode") === "item" ? "item" : "group";
      const items = mode === "item" ? itemRows : groupRows;
      const revenue = items.reduce((sum, row) => sum + row.subtotal_revenue, 0);
      const profit = items.reduce((sum, row) => sum + (row.profit ?? 0), 0);
      return HttpResponse.json({
        from: "2026-09-01",
        to: "2026-09-15",
        mode,
        items,
        summary: { subtotal_revenue: revenue, profit },
        total: items.length,
      });
    }),
    http.get("/api/v1/product-service-groups", () =>
      HttpResponse.json({
        items: [
          { id: officeGroupId, name: "Thiết bị văn phòng", is_active: true, version: 1 },
          { id: securityGroupId, name: "Thiết bị an ninh", is_active: true, version: 1 },
        ],
        limit: 100,
        offset: 0,
        total: 2,
      }),
    ),
  );
}

function columnHeaders() {
  return within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .map((th) => th.textContent);
}

describe("Báo cáo doanh thu theo nhóm & sản phẩm/dịch vụ", () => {
  test("AC-RPT-153 mặc định: radio Nhóm SP/DV, đầu tháng→hôm nay, Đã hoàn tất, nhóm Tất cả; bảng 4 cột", async () => {
    vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport(
      {
        groupRows: [
          groupRow(),
          groupRow({
            key: "ungrouped",
            label: "Chưa phân nhóm",
            order_count: 1,
            subtotal_revenue: 500_000,
            profit: null,
          }),
        ],
      },
      (search) => {
        requests.push(search);
      },
    );
    renderApp("/reports/revenue-by-product");

    await screen.findByRole("heading", { name: PAGE_TITLE });
    const viewBy = screen.getByRole("radiogroup", { name: "Xem theo" });
    expect(within(viewBy).getByRole("radio", { name: "Nhóm SP/DV" })).toBeChecked();
    expect(within(viewBy).getByRole("radio", { name: "Từng sản phẩm/dịch vụ" })).not.toBeChecked();
    await waitFor(() => {
      expect(requests).toContain("?mode=group&from=2026-09-01&to=2026-09-15&status=COMPLETED");
    });
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("01/09/2026");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("15/09/2026");
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("COMPLETED");
    expect(screen.getByRole("combobox", { name: "Nhóm SP/DV" })).toHaveValue("");
    await screen.findByText("Thiết bị an ninh", { selector: "button" });
    expect(columnHeaders()).toEqual(["Nhóm SP/DV", "Số đơn", "Doanh thu", "Lợi nhuận"]);
    const cells = (name: RegExp) =>
      within(screen.getByRole("row", { name }))
        .getAllByRole("cell")
        .map((td) => td.textContent);
    expect(cells(/Thiết bị an ninh/)).toEqual([
      "Thiết bị an ninh",
      "2",
      "12.000.000 ₫",
      "3.000.000 ₫",
    ]);
    expect(cells(/Chưa phân nhóm/)).toEqual(["Chưa phân nhóm", "1", "500.000 ₫", "—"]);
    // Mock tính tổng từ các dòng: 12.500.000; lợi nhuận null tính là 0 → 3.000.000.
    expect(cells(/Tổng cộng/)).toEqual(["Tổng cộng", "12.500.000 ₫", "3.000.000 ₫"]);
    // Cột số căn phải đúng như ô giá trị.
    const numeric = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .filter((th) => th.textContent !== "Nhóm SP/DV");
    for (const th of numeric) expect(th).toHaveClass("text-right");
  });

  test("AC-RPT-154 chọn 'Từng sản phẩm/dịch vụ' → gọi mode=item, đổi cột, URL có mode=item, giữ bộ lọc", async () => {
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport({}, (search) => {
      requests.push(search);
    });
    const router = renderApp("/reports/revenue-by-product");
    const user = userEvent.setup();

    await screen.findByText("Thiết bị an ninh", { selector: "button" });
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "NOT_COMPLETED");
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Nhóm SP/DV" }),
      securityGroupId,
    );
    const from = screen.getByLabelText("Từ ngày");
    await user.clear(from);
    await user.type(from, "01082026");
    await user.click(screen.getByRole("radio", { name: "Từng sản phẩm/dịch vụ" }));

    await screen.findByText("Camera Dahua 2MP", { selector: "button" });
    const last = new URLSearchParams(requests.at(-1));
    expect(last.get("mode")).toBe("item");
    expect(last.get("from")).toBe("2026-08-01");
    expect(last.get("status")).toBe("NOT_COMPLETED");
    expect(last.get("group_id")).toBe(securityGroupId);
    expect(columnHeaders()).toEqual([
      "Mã",
      "Tên",
      "Loại",
      "ĐVT",
      "Số lượng",
      "Số đơn",
      "Doanh thu",
      "Lợi nhuận",
    ]);
    const camera = screen.getByRole("row", { name: /Camera Dahua 2MP/ });
    expect(within(camera).getByText("CAM-DH-2MP")).toBeInTheDocument();
    expect(within(camera).getByText("Sản phẩm")).toBeInTheDocument();
    expect(within(camera).getByText("cái")).toBeInTheDocument();
    expect(router.state.location.search).toContain("mode=item");
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("01/08/2026");
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("NOT_COMPLETED");
    expect(screen.getByRole("combobox", { name: "Nhóm SP/DV" })).toHaveValue(securityGroupId);
  });

  test("AC-RPT-154 loại hiển thị Sản phẩm / Dịch vụ / Tự nhập; lợi nhuận null → '—'", async () => {
    signedInAs(anId, AN);
    mockReport({
      itemRows: [
        itemRow(),
        itemRow({
          key: "service:c0000000-0000-4000-8000-000000000502",
          label: "Lắp đặt camera",
          code: "DV-LD-CAM",
          item_type: "SERVICE",
          unit: "lần",
          subtotal_revenue: 1_000_000,
          profit: 500_000,
        }),
        itemRow({
          key: "custom:Dây cáp mạng",
          label: "Dây cáp mạng",
          code: null,
          item_type: "CUSTOM",
          unit: "mét",
          subtotal_revenue: 200_000,
          profit: null,
        }),
      ],
    });
    renderApp("/reports/revenue-by-product?mode=item");

    await screen.findByText("Camera Dahua 2MP", { selector: "button" });
    expect(
      within(screen.getByRole("row", { name: /Lắp đặt camera/ })).getByText("Dịch vụ"),
    ).toBeInTheDocument();
    const custom = screen.getByRole("row", { name: /Dây cáp mạng/ });
    expect(within(custom).getByText("Tự nhập")).toBeInTheDocument();
    expect(within(custom).getAllByText("—").length).toBeGreaterThan(0);
  });

  test("AC-RPT-155 mở ?mode=item → radio 'Từng sản phẩm/dịch vụ' được chọn ngay, gọi mode=item", async () => {
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport({}, (search) => {
      requests.push(search);
    });
    renderApp("/reports/revenue-by-product?mode=item");

    await screen.findByRole("heading", { name: PAGE_TITLE });
    expect(screen.getByRole("radio", { name: "Từng sản phẩm/dịch vụ" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Nhóm SP/DV" })).not.toBeChecked();
    await waitFor(() => {
      expect(requests[0]).toContain("mode=item");
    });
    expect(requests.some((search) => search.includes("mode=group"))).toBe(false);
  });

  test("AC-RPT-156 bấm dòng Camera Dahua 2MP → chi tiết dòng hàng (Mã đơn, Tên hàng, Số lượng, Doanh thu, Lợi nhuận)", async () => {
    signedInAs(anId, AN);
    mockReport();
    const linesRequests: string[] = [];
    server.use(
      http.get("/api/v1/reports/revenue-by-product/lines", ({ request }) => {
        linesRequests.push(new URL(request.url).search);
        return HttpResponse.json([
          revenueLine({ quantity: "2.00" }),
          revenueLine({
            id: "d0000000-0000-4000-8000-000000000041",
            order_code: "DH2609-0011",
            quantity: "1.50",
            line_total: 3_000_000,
            profit: null,
          }),
        ]);
      }),
    );
    renderApp("/reports/revenue-by-product?mode=item");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Camera Dahua 2MP" }));

    const dialog = await screen.findByRole("dialog", { name: "Camera Dahua 2MP" });
    await waitFor(() => {
      const query = new URLSearchParams(linesRequests[0]);
      expect(query.get("mode")).toBe("item");
      expect(query.get("key")).toBe(`product:${cameraId}`);
      expect(query.get("status")).toBe("COMPLETED");
    });
    expect(
      within(dialog)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Mã đơn", "Tên hàng", "Số lượng", "Doanh thu", "Lợi nhuận"]);
    const cells = (orderCode: string) =>
      within(within(dialog).getByRole("row", { name: new RegExp(orderCode) }))
        .getAllByRole("cell")
        .map((td) => td.textContent);
    await within(dialog).findByText("DH2609-0010");
    // [Mã đơn, Tên hàng (+ dòng phụ mobile), Số lượng, Doanh thu, Lợi nhuận]; số lượng kiểu vi-VN.
    expect(cells("DH2609-0010")).toEqual([
      "DH2609-0010",
      "Camera Dahua 2MPSố lượng 2 · Lợi nhuận 1.000.000 ₫",
      "2",
      "4.000.000 ₫",
      "1.000.000 ₫",
    ]);
    expect(cells("DH2609-0011")).toEqual([
      "DH2609-0011",
      "Camera Dahua 2MPSố lượng 1,5 · Lợi nhuận —",
      "1,5",
      "3.000.000 ₫",
      "—",
    ]);
  });

  test("AC-RPT-157 chế độ sản phẩm + nhóm 'Thiết bị an ninh' → link Xuất Excel đúng mode=item và group_id", async () => {
    signedInAs(anId, AN);
    mockReport();
    renderApp("/reports/revenue-by-product?mode=item");
    const user = userEvent.setup();

    await screen.findByText("Camera Dahua 2MP", { selector: "button" });
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Nhóm SP/DV" }),
      securityGroupId,
    );

    const href = screen.getByRole("link", { name: /Xuất Excel/ }).getAttribute("href") ?? "";
    expect(href).toContain("/api/v1/reports/revenue-by-product/export?");
    const query = new URLSearchParams(href.split("?")[1]);
    expect(query.get("mode")).toBe("item");
    expect(query.get("group_id")).toBe(securityGroupId);
    expect(query.get("status")).toBe("COMPLETED");
  });

  test("AC-RPT-157 nhóm 'Chưa phân nhóm' gửi group_id=ungrouped", async () => {
    signedInAs(anId, AN);
    const requests: string[] = [];
    mockReport({}, (search) => {
      requests.push(search);
    });
    renderApp("/reports/revenue-by-product");
    const user = userEvent.setup();

    await screen.findByText("Thiết bị an ninh", { selector: "button" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Nhóm SP/DV" }), "ungrouped");

    await waitFor(() => {
      expect(new URLSearchParams(requests.at(-1)).get("group_id")).toBe("ungrouped");
    });
    expect(screen.getByRole("link", { name: /Xuất Excel/ }).getAttribute("href")).toContain(
      "group_id=ungrouped",
    );
  });

  test("AC-RPT-158 không có dữ liệu → 'Không có doanh thu trong khoảng thời gian này'", async () => {
    signedInAs(anId, AN);
    mockReport({ groupRows: [] });
    renderApp("/reports/revenue-by-product");

    expect(
      await screen.findByText("Không có doanh thu trong khoảng thời gian này"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("AC-RPT-159 màn 390px: radio xếp dọc, vùng chạm ≥ 44px, bảng chuyển dạng thẻ", async () => {
    mobile();
    signedInAs(anId, AN);
    mockReport();
    renderApp("/reports/revenue-by-product");

    const button = await screen.findByRole("button", { name: /Thiết bị an ninh/ });
    expect(screen.queryByRole("table")).toBeNull();
    expect(button.closest("li")).not.toBeNull();
    const viewBy = screen.getByRole("radiogroup", { name: "Xem theo" });
    expect(viewBy).toHaveClass("flex-col");
    for (const radio of within(viewBy).getAllByRole("radio")) {
      expect(radio.closest("label")).toHaveClass("min-h-11");
    }
    expect(screen.getByText("Tổng cộng")).toBeInTheDocument();
  });
});
