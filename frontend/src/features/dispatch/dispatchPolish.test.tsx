import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { isPriority } from "../orders/schemas";
import { DON_I, signedInAs, summary, TUAN, tuanId } from "./testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];
type EmployeeOut = components["schemas"]["EmployeeOut"];

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

function detail(priority: string = DON_I.priority): OrderDetail {
  return {
    id: DON_I.id,
    code: DON_I.code,
    status: "PENDING_DISPATCH",
    division: "SECURITY",
    customer_id: null,
    customer_name: "Công ty TNHH Minh Phát",
    customer_phone: "0932068787",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "Lắp 4 camera tầng 1",
    priority,
    requested_date: "2026-10-12",
    payment_method: null,
    payment_status: "UNPAID",
    subtotal: 10000000,
    discount_amount: 0,
    vat_amount: 1800000,
    total: 11800000,
    revision_no: 0,
    version: 7,
    created_by: "a0000000-0000-4000-8000-000000000010",
    allowed_commands: [],
    can_edit_contact: true,
    can_edit_lines_after_submit: true,
    lines: [],
  } as OrderDetail;
}

function technician(id: string, code: string, full_name: string): EmployeeOut {
  return {
    id,
    code,
    full_name,
    email: `${code.toLowerCase()}@smyou.vn`,
    phone: null,
    title: null,
    department: "TECHNICAL",
    roles: ["TECHNICIAN"],
    is_active: true,
    is_locked: false,
    must_change_password: false,
    version: 1,
  };
}
const HUNG = technician("a0000000-0000-4000-8000-000000000084", "NV004", "Lê Văn Hùng");
const BAO = technician("a0000000-0000-4000-8000-000000000087", "NV007", "Phạm Quốc Bảo");

/** `employeeResponses`: mỗi phần tử là phản hồi của một lần gọi `GET /employees` (cái cuối lặp lại). */
async function openPanel(
  employeeResponses: (EmployeeOut[] | "fail")[],
  orders = [DON_I],
  priority?: string,
) {
  signedInAs(tuanId, TUAN, { pending_dispatch_count: orders.length });
  let calls = 0;
  server.use(
    http.get("/api/v1/orders", () =>
      HttpResponse.json({ items: orders, total: orders.length, limit: 20, offset: 0 }),
    ),
    http.get("/api/v1/orders/:id", () => HttpResponse.json({ ...detail(priority), code: orders[0]?.code ?? "" })),
    http.get("/api/v1/employees", () => {
      const next = employeeResponses[Math.min(calls, employeeResponses.length - 1)];
      calls += 1;
      return next === "fail" || next === undefined
        ? HttpResponse.json({ status: 500 }, { status: 500 })
        : HttpResponse.json({ items: next, total: next.length, limit: 100, offset: 0 });
    }),
    http.get("/api/v1/services/:id", () => HttpResponse.json({ status: 404 }, { status: 404 })),
  );
  renderApp("/dispatch/queue");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: new RegExp(orders[0]?.code ?? "") }));
  const dialog = await screen.findByRole("dialog", { name: `Tạo đầu việc — ${orders[0]?.code ?? ""}` });
  return { user, dialog, calls: () => calls };
}

describe("Đánh bóng UI điều phối (M4-01e)", () => {
  test("AC-DSP-038 GET /employees lỗi → báo lỗi + Thử lại, không báo 'không có KTV'; submit vẫn validate", async () => {
    const { user, dialog } = await openPanel(["fail"]);
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Không tải được danh sách kỹ thuật viên.");
    expect(within(dialog).getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Không có kỹ thuật viên nào đang hoạt động."),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Tạo đầu việc" }));
    expect(await within(dialog).findByText("Chọn ít nhất 1 kỹ thuật viên.")).toBeInTheDocument();
  });

  test("AC-DSP-039 Thử lại gọi lại đúng 1 lần, hiện danh sách, giữ nguyên trường đã nhập", async () => {
    const { user, dialog, calls } = await openPanel(["fail", [HUNG, BAO]]);
    await within(dialog).findByRole("alert");
    await user.type(within(dialog).getByLabelText("Tiêu đề đầu việc"), "Lắp camera cổng sau");
    const before = calls();

    await user.click(within(dialog).getByRole("button", { name: "Thử lại" }));
    expect(await within(dialog).findByRole("checkbox", { name: /NV004/ })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    expect(calls() - before).toBe(1);
    expect(
      within(dialog).queryByText("Không tải được danh sách kỹ thuật viên."),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Tiêu đề đầu việc")).toHaveValue("Lắp camera cổng sau");
  });

  test("AC-DSP-040 danh sách rỗng thành công → 'Không có KTV…', không có lỗi/Thử lại", async () => {
    const { dialog } = await openPanel([[]]);
    expect(
      await within(dialog).findByText("Không có kỹ thuật viên nào đang hoạt động."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  });

  test("AC-DSP-041 thẻ mobile có 'Ngày hẹn:' và 'Người tạo:'", async () => {
    mobile();
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 1 });
    const order = summary({
      code: "DH2609-0003",
      customer_name: "Công ty TNHH Việt Tiến",
      requested_date: "2026-10-05",
      created_by_name: "Nguyễn Thị Mai",
    });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [order], total: 1, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");
    const card = await screen.findByRole("button", { name: /DH2609-0003/ });
    expect(within(card).getByText("Ngày hẹn:")).toBeInTheDocument();
    expect(within(card).getByText("05/10/2026")).toBeInTheDocument();
    expect(within(card).getByText("Người tạo:")).toBeInTheDocument();
    expect(within(card).getByText("Nguyễn Thị Mai")).toBeInTheDocument();
  });

  test("AC-DSP-042 không ngày hẹn, không người tạo → 'Chưa hẹn ngày' và 'Người tạo: —'", async () => {
    mobile();
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 1 });
    const order = summary({ requested_date: null, created_by_name: null });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [order], total: 1, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");
    const card = await screen.findByRole("button", { name: /DH2610-0008/ });
    expect(within(card).getByText("Ngày hẹn:")).toBeInTheDocument();
    expect(within(card).getByText("Chưa hẹn ngày")).toBeInTheDocument();
    expect(within(card).getByText("Người tạo:")).toBeInTheDocument();
    expect(within(card).getByText("—")).toBeInTheDocument();
  });

  test("AC-DSP-043 bảng desktop giữ nguyên cột, không có nhãn 'Ngày hẹn:' trong ô", async () => {
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 1 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [DON_I], total: 1, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");
    await screen.findByRole("table");
    const headings = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headings).toEqual(["Mã", "Khách", "Ưu tiên", "Ngày hẹn", "Tổng tiền", "Người tạo"]);
    expect(screen.queryByText("Ngày hẹn:")).not.toBeInTheDocument();
    expect(screen.queryByText("Người tạo:")).not.toBeInTheDocument();
  });

  test("AC-DSP-045 priority HIGH → ô mặc định 'Cao', huy hiệu thẻ 'Cao'", async () => {
    mobile();
    const high = summary({ priority: "HIGH" });
    const { dialog } = await openPanel([[HUNG]], [high], "HIGH");
    expect(within(dialog).getByLabelText("Mức ưu tiên")).toHaveValue("HIGH");
    expect(screen.getAllByText("Cao").length).toBeGreaterThan(0);
  });

  test("AC-DSP-046 priority lạ 'CRITICAL' → huy hiệu nguyên chuỗi tông neutral, form mặc định NORMAL", async () => {
    mobile();
    const weird = summary({ priority: "CRITICAL" });
    signedInAs(tuanId, TUAN, { pending_dispatch_count: 1 });
    server.use(
      http.get("/api/v1/orders", () =>
        HttpResponse.json({ items: [weird], total: 1, limit: 20, offset: 0 }),
      ),
    );
    renderApp("/dispatch/queue");
    const card = await screen.findByRole("button", { name: /DH2610-0008/ });
    expect(within(card).getByText("CRITICAL").className).toContain("bg-sidebar-sub");
  });

  test("AC-DSP-046 form task với priority lạ mặc định NORMAL", async () => {
    mobile();
    const weird = summary({ priority: "CRITICAL" });
    const { dialog } = await openPanel([[HUNG]], [weird], "CRITICAL");
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Mức ưu tiên")).toHaveValue("NORMAL");
    });
  });

  test("AC-DSP-046 isPriority chỉ nhận 4 giá trị enum", () => {
    for (const value of ["LOW", "NORMAL", "HIGH", "URGENT"]) expect(isPriority(value)).toBe(true);
    for (const value of ["CRITICAL", "", "urgent"]) expect(isPriority(value)).toBe(false);
  });
});

describe("AC-DSP-047 không còn ép kiểu priority", () => {
  test("AC-DSP-047 features/dispatch không chứa 'as Priority'", () => {
    const dir = join(import.meta.dirname, "components");
    const offenders = readdirSync(dir).filter((file) =>
      readFileSync(join(dir, file), "utf8").includes("as Priority"),
    );
    expect(offenders).toEqual([]);
  });
});
