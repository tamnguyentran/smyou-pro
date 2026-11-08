import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "../../lib/api/schema";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { signedInAs, type Person } from "../dispatch/testFixtures";

// M27-01b: trang "Chăm sóc KH" (`/customer-care`) — ghi nhận cuộc gọi + danh sách + lọc.

type CareCall = components["schemas"]["CareCallOut"];
type Customer = components["schemas"]["CustomerOut"];

const lanId = "a0000000-0000-4000-8000-000000000018";
const namId = "a0000000-0000-4000-8000-000000000002";
const hoaId = "a0000000-0000-4000-8000-000000000010";
const abcId = "c0000000-0000-4000-8000-000000000271";
const newCustomerId = "c0000000-0000-4000-8000-000000000272";

const all = ["all"];
const LAN: Person = {
  code: "NV018",
  full_name: "Đỗ Thị Lan",
  email: "lan.do@smyou.vn",
  roles: ["CUSTOMER_CARE"],
  capabilities: {
    "dashboard.read": all,
    "order.create": ["own"],
    "customer.read": all,
    "customer.manage": all,
    "employee.lookup": all,
    "customer_care.call.record": all,
    "customer_care.call.read": all,
  },
};
const NAM: Person = {
  code: "NV002",
  full_name: "Phạm Văn Nam",
  email: "nam.pham@smyou.vn",
  roles: ["MANAGER", "CUSTOMER_CARE"],
  capabilities: {
    "dashboard.read": all,
    "order.create": all,
    "customer.read": all,
    "customer.manage": all,
    "employee.lookup": all,
    "customer_care.call.record": all,
    "customer_care.call.read": all,
  },
};
const HOA: Person = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": all,
    "order.create": ["own"],
    "customer.read": all,
    "customer.manage": all,
  },
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: abcId,
    code: "KH00271",
    type: "COMPANY",
    name: "Cty ABC",
    contact_person: null,
    contact_person_phone: null,
    phone: "0909271271",
    email: null,
    tax_code: null,
    address: null,
    note: null,
    founded_date: null,
    director_name: null,
    director_phone: null,
    it_contact_name: null,
    it_contact_phone: null,
    date_of_birth: null,
    gender: null,
    occupation: null,
    version: 1,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  } as Customer;
}

function call(overrides: Partial<CareCall> = {}): CareCall {
  return {
    id: "e0000000-0000-4000-8000-000000000271",
    customer_id: abcId,
    customer_name: "Cty ABC",
    customer_phone: "0909271271",
    caller_id: lanId,
    caller_name: "Đỗ Thị Lan",
    offered: "Camera IP 4MP",
    customer_request: "Báo giá 6 camera",
    called_at: "2026-11-08T02:05:00Z",
    ...overrides,
  };
}

function mockViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** GET /customer-care-calls trả `calls` (đã ghi thêm thì có cả dòng mới); ghi lại query của mỗi lần gọi. */
function stub({ calls = [] as CareCall[], customers = [customer()] } = {}) {
  const queries: URLSearchParams[] = [];
  const state = { calls };
  server.use(
    http.get("/api/v1/customer-care-calls", ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      return HttpResponse.json({
        items: state.calls,
        total: state.calls.length,
        limit: 20,
        offset: 0,
      });
    }),
    http.get("/api/v1/customers", () =>
      HttpResponse.json({ items: customers, total: customers.length }),
    ),
    http.get("/api/v1/employees/lookup", () =>
      HttpResponse.json([
        { id: lanId, code: "NV018", full_name: "Đỗ Thị Lan", phone: null, is_active: true },
      ]),
    ),
  );
  return { queries, state };
}

async function openPage() {
  renderApp("/customer-care");
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Chăm sóc khách hàng" });
  return user;
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Ghi nhận cuộc gọi" }));
  return screen.findByRole("dialog", { name: "Ghi nhận cuộc gọi" });
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText("Khách hàng"), "ABC");
  await user.click(await within(dialog).findByRole("option", { name: /Cty ABC/ }));
}

/** Nhãn cấp 2 của nhóm "Đơn hàng" trong menu chính (mở nhóm nếu đang đóng). */
async function ordersMenuLinks(user: ReturnType<typeof userEvent.setup>) {
  const nav = await screen.findByRole("navigation", { name: "Menu chính" });
  const group = within(nav).getByRole("button", { name: "Đơn hàng" });
  if (group.getAttribute("aria-expanded") === "false") await user.click(group);
  return within(group.closest("li") as HTMLElement).getAllByRole("link");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Menu Chăm sóc KH", () => {
  test.each([
    ["Lan (CSKH)", lanId, LAN],
    ["Nam (Quản lý)", namId, NAM],
  ])(
    "AC-CUS-070 %s thấy 'Chăm sóc KH' ngay sau 'Khách hàng', icon PhoneCall",
    async (_, id, person) => {
      signedInAs(id, person);
      stub();
      const user = await openPage();

      const links = await ordersMenuLinks(user);
      const labels = links.map((link) => link.textContent);
      const index = labels.indexOf("Chăm sóc KH");
      expect(index).toBeGreaterThan(0);
      expect(labels[index - 1]).toBe("Khách hàng");
      const item = links[index] as HTMLElement;
      expect(item).toHaveAttribute("href", "/customer-care");
      expect(item.querySelector("svg.lucide-phone-call")).not.toBeNull();
    },
  );

  test("AC-CUS-070 Hoa (Sale) không thấy 'Chăm sóc KH'; vào thẳng /customer-care → 403", async () => {
    signedInAs(hoaId, HOA);
    stub();
    renderApp("/customer-care");
    const user = userEvent.setup();

    expect(await screen.findByText("Bạn không có quyền truy cập trang này.")).toBeInTheDocument();
    const labels = (await ordersMenuLinks(user)).map((link) => link.textContent);
    expect(labels).toContain("Khách hàng");
    expect(labels).not.toContain("Chăm sóc KH");
  });
});

describe("Trang Chăm sóc khách hàng (/customer-care)", () => {
  test("AC-CUS-071 chọn KH, nhập 2 ô, Lưu → POST đúng body, toast, sheet đóng, danh sách có dòng mới", async () => {
    signedInAs(lanId, LAN);
    const { state } = stub();
    let body: unknown = null;
    server.use(
      http.post("/api/v1/customer-care-calls", async ({ request }) => {
        body = await request.json();
        const created = call();
        state.calls = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const user = await openPage();
    expect(await screen.findByText("Chưa có cuộc gọi nào.")).toBeInTheDocument();

    const dialog = await openSheet(user);
    await pickCustomer(user, dialog);
    await user.type(within(dialog).getByLabelText("Chào sản phẩm/dịch vụ"), "Camera IP 4MP");
    await user.type(
      within(dialog).getByLabelText("Ghi nhận yêu cầu của KH (nếu có)"),
      "Báo giá 6 camera",
    );
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã ghi nhận cuộc gọi.")).toBeInTheDocument();
    expect(body).toEqual({
      customer_id: abcId,
      offered: "Camera IP 4MP",
      customer_request: "Báo giá 6 camera",
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Camera IP 4MP")).toBeInTheDocument();
  });

  test("AC-CUS-071 để trống yêu cầu của KH → gửi customer_request null", async () => {
    signedInAs(lanId, LAN);
    stub();
    let body: unknown = null;
    server.use(
      http.post("/api/v1/customer-care-calls", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(call({ customer_request: null }), { status: 201 });
      }),
    );
    const user = await openPage();
    const dialog = await openSheet(user);
    await pickCustomer(user, dialog);
    await user.type(within(dialog).getByLabelText("Chào sản phẩm/dịch vụ"), "Camera IP 4MP");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đã ghi nhận cuộc gọi.")).toBeInTheDocument();
    expect(body).toEqual({ customer_id: abcId, offered: "Camera IP 4MP", customer_request: null });
  });

  test("AC-CUS-072 chưa chọn khách + 'Chào sản phẩm/dịch vụ' trống → 2 lỗi, không gọi API, focus ô khách hàng", async () => {
    signedInAs(lanId, LAN);
    stub();
    let posted = false;
    server.use(
      http.post("/api/v1/customer-care-calls", () => {
        posted = true;
        return HttpResponse.json(call(), { status: 201 });
      }),
    );
    const user = await openPage();
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await within(dialog).findByText("Chọn khách hàng.")).toBeInTheDocument();
    expect(within(dialog).getByText("Nhập sản phẩm/dịch vụ đã chào.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Khách hàng")).toHaveFocus();
    expect(posted).toBe(false);
  });

  test("AC-CUS-072 đã chọn khách, 'Chào sản phẩm/dịch vụ' chỉ có khoảng trắng → lỗi + focus ô đó, không gọi API", async () => {
    signedInAs(lanId, LAN);
    stub();
    let posted = false;
    server.use(
      http.post("/api/v1/customer-care-calls", () => {
        posted = true;
        return HttpResponse.json(call(), { status: 201 });
      }),
    );
    const user = await openPage();
    const dialog = await openSheet(user);
    await pickCustomer(user, dialog);
    await user.type(within(dialog).getByLabelText("Chào sản phẩm/dịch vụ"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await within(dialog).findByText("Nhập sản phẩm/dịch vụ đã chào.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Chọn khách hàng.")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Chào sản phẩm/dịch vụ")).toHaveFocus();
    expect(posted).toBe(false);
  });

  test("AC-CUS-073 'Thêm khách hàng' trong sheet → POST /customers, khách mới được chọn sẵn", async () => {
    signedInAs(lanId, LAN);
    stub({ customers: [] });
    let customerBody: { name?: string; phone?: string } = {};
    let callBody: { customer_id?: string } = {};
    server.use(
      http.post("/api/v1/customers", async ({ request }) => {
        customerBody = (await request.json()) as typeof customerBody;
        return HttpResponse.json(
          {
            ...customer({
              id: newCustomerId,
              name: customerBody.name ?? "",
              phone: customerBody.phone ?? "",
            }),
            duplicate_phone_matches: [],
          },
          { status: 201 },
        );
      }),
      http.post("/api/v1/customer-care-calls", async ({ request }) => {
        callBody = (await request.json()) as typeof callBody;
        return HttpResponse.json(call({ customer_id: newCustomerId }), { status: 201 });
      }),
    );
    const user = await openPage();
    const callDialog = await openSheet(user);

    await user.click(within(callDialog).getByRole("button", { name: "Thêm khách hàng" }));
    const customerDialog = await screen.findByRole("dialog", { name: "Thêm khách hàng" });
    await user.selectOptions(within(customerDialog).getByLabelText("Loại khách hàng"), "Công ty");
    await user.type(within(customerDialog).getByLabelText("Tên khách hàng"), "Cty ABC Mới");
    await user.type(within(customerDialog).getByLabelText("Số điện thoại"), "0909272272");
    await user.click(within(customerDialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(customerBody).toMatchObject({ name: "Cty ABC Mới", phone: "0909272272" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Thêm khách hàng" })).not.toBeInTheDocument();
    });
    const sheet = screen.getByRole("dialog", { name: "Ghi nhận cuộc gọi" });
    expect(within(sheet).getByLabelText("Khách hàng")).toHaveValue("Cty ABC Mới");

    await user.type(within(sheet).getByLabelText("Chào sản phẩm/dịch vụ"), "Camera IP 4MP");
    await user.click(within(sheet).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã ghi nhận cuộc gọi.")).toBeInTheDocument();
    expect(callBody.customer_id).toBe(newCustomerId);
  });

  test("AC-CUS-074 server 422 cho offered → lỗi dưới ô 'Chào sản phẩm/dịch vụ', sheet vẫn mở", async () => {
    signedInAs(lanId, LAN);
    stub();
    server.use(
      http.post("/api/v1/customer-care-calls", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Dữ liệu không hợp lệ",
            status: 422,
            code: "VALIDATION_ERROR",
            detail: "Dữ liệu không hợp lệ.",
            errors: [{ field: "offered", message: "Tối đa 1000 ký tự." }],
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const user = await openPage();
    const dialog = await openSheet(user);
    await pickCustomer(user, dialog);
    const offered = within(dialog).getByLabelText("Chào sản phẩm/dịch vụ");
    await user.type(offered, "Camera IP 4MP");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await within(dialog).findByText("Tối đa 1000 ký tự.")).toBeInTheDocument();
    expect(offered).toHaveAttribute("aria-invalid", "true");
    expect(offered.getAttribute("aria-describedby") ?? "").toContain(
      within(dialog).getByText("Tối đa 1000 ký tự.").id,
    );
    expect(screen.getByRole("dialog", { name: "Ghi nhận cuộc gọi" })).toBeInTheDocument();
    expect(screen.queryByText("Đã ghi nhận cuộc gọi.")).not.toBeInTheDocument();
  });

  test("AC-CUS-075 desktop: bảng đủ cột, yêu cầu trống hiện '—', giờ Asia/Ho_Chi_Minh", async () => {
    mockViewport(true);
    signedInAs(namId, NAM);
    stub({
      calls: [
        call(),
        call({
          id: "e0000000-0000-4000-8000-000000000272",
          customer_name: "Anh Ngọc",
          customer_phone: "0918234567",
          offered: "Máy in màu",
          customer_request: null,
          called_at: "2026-11-07T16:30:00Z",
        }),
      ],
    });
    await openPage();

    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Thời gian", "Khách hàng", "SĐT", "Chào SP/DV", "Yêu cầu của KH", "Người gọi"]);
    const [, first, second] = within(table).getAllByRole("row") as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(
      within(first)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual([
      "08/11/2026 09:05",
      "Cty ABC",
      "0909271271",
      "Camera IP 4MP",
      "Báo giá 6 camera",
      "Đỗ Thị Lan",
    ]);
    const secondCells = within(second)
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(secondCells[0]).toBe("07/11/2026 23:30");
    expect(secondCells[4]).toBe("—");
  });

  test("AC-CUS-075 mobile: thẻ thay cho bảng, yêu cầu trống hiện '—'", async () => {
    mockViewport(false);
    signedInAs(lanId, LAN);
    stub({ calls: [call({ customer_request: null })] });
    await openPage();

    const cards = await screen.findAllByRole("listitem");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = cards.find((li) => li.textContent.includes("Cty ABC")) as HTMLElement;
    expect(card).toHaveTextContent("08/11/2026 09:05");
    expect(card).toHaveTextContent("0909271271");
    expect(card).toHaveTextContent("Camera IP 4MP");
    expect(card).toHaveTextContent("—");
    expect(card).toHaveTextContent("Đỗ Thị Lan");
  });

  test("AC-CUS-076 Lan (CSKH) không có ô 'Người gọi'; tìm + Từ/Đến ngày gọi lại API với q/from/to", async () => {
    signedInAs(lanId, LAN);
    const { queries } = stub({ calls: [call()] });
    const user = await openPage();
    await screen.findByText("Camera IP 4MP");

    expect(screen.queryByLabelText("Người gọi")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Tìm khách hàng"), "0909");
    await user.type(screen.getByLabelText("Từ ngày"), "01/11/2026");
    await user.type(screen.getByLabelText("Đến ngày"), "08/11/2026");

    await waitFor(() => {
      const last = queries.at(-1);
      expect(last?.get("q")).toBe("0909");
      expect(last?.get("from")).toBe("2026-11-01");
      expect(last?.get("to")).toBe("2026-11-08");
      expect(last?.get("limit")).toBe("20");
      // M27-03: Lan mặc định "Chỉ cuộc gọi của tôi" → caller_id = Lan (AC-CUS-081 thay phần cũ).
      expect(last?.get("caller_id")).toBe(lanId);
    });
  });

  test("AC-CUS-076 Nam (Quản lý) có ô 'Người gọi'; chọn người → gọi lại API với caller_id", async () => {
    signedInAs(namId, NAM);
    const { queries } = stub({ calls: [call()] });
    const user = await openPage();
    await screen.findByText("Camera IP 4MP");

    await user.type(screen.getByLabelText("Người gọi"), "Lan");
    await user.click(await screen.findByRole("option", { name: /Đỗ Thị Lan/ }));

    await waitFor(() => {
      expect(queries.at(-1)?.get("caller_id")).toBe(lanId);
    });
  });

  test("AC-CUS-077 chưa có cuộc gọi nào → trạng thái trống", async () => {
    signedInAs(lanId, LAN);
    stub();
    await openPage();

    expect(await screen.findByText("Chưa có cuộc gọi nào.")).toBeInTheDocument();
  });
});
