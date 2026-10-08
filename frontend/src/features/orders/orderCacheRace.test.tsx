import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createQueryClient } from "../../app/queryClient";
import { markSignedIn } from "../../lib/sessionHint";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import { ORDER_KEY, useUpdateOrder } from "./api";
import type { PropsWithChildren } from "react";
import type { components } from "../../lib/api/schema";

type Order = components["schemas"]["OrderDetail"];
type OrderLine = components["schemas"]["OrderLineOut"];
type Product = components["schemas"]["ProductOut"];

const hoaId = "a0000000-0000-4000-8000-000000000010";
const orderId = "b0000000-0000-4000-8000-000000000042";
const dellLineId = "c0000000-0000-4000-8000-000000000030";
const inkLineId = "c0000000-0000-4000-8000-000000000031";

const HOA = {
  code: "NV005",
  full_name: "Nguyễn Thị Hoa",
  email: "hoa.nguyen@smyou.vn",
  roles: ["SALE"],
  capabilities: {
    "dashboard.read": ["all"],
    "order.read": ["all"],
    "order.create": ["all"],
    "order.edit_draft": ["own"],
    "customer.read": ["all"],
    "catalog.read": ["all"],
    "profile.manage": ["self"],
  },
};

function signedInAsHoa() {
  server.use(
    http.post("/api/v1/auth/refresh", () =>
      HttpResponse.json({
        employee: { id: hoaId, code: HOA.code, full_name: HOA.full_name, roles: HOA.roles },
        must_change_password: false,
      }),
    ),
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        employee: {
          id: hoaId,
          code: HOA.code,
          full_name: HOA.full_name,
          email: HOA.email,
          title: null,
          department: "SALES",
        },
        roles: HOA.roles,
        capabilities: HOA.capabilities,
        counters: {},
      }),
    ),
  );
  markSignedIn();
}

function dellProduct(): Product {
  return {
    id: "f0000000-0000-4000-8000-000000000040",
    sku: "LCD-DELL22",
    name: "Màn hình Dell 22 inch",
    category: "MONITOR",
    brand: "Dell",
    price: 2_500_000,
    price_fixed: true,
    unit: "CAI",
    vat_rate: "8",
    specs: null,
    warranty_months: 24,
    image_attachment_id: null,
    is_active: true,
    version: 1,
  };
}

function dellLine(): OrderLine {
  return {
    id: dellLineId,
    position: 1,
    item_type: "PRODUCT",
    product_id: dellProduct().id,
    service_id: null,
    sku_snapshot: "LCD-DELL22",
    name_snapshot: "Màn hình Dell 22 inch",
    unit_snapshot: "CAI",
    specs_snapshot: null,
    warranty_months_snapshot: 24,
    catalog_price_snapshot: 2_500_000,
    price_fixed: true,
    vat_rate: "8",
    quantity: "1",
    unit_price: 2_500_000,
    is_gift: false,
    line_discount: 0,
    line_gross: 2_500_000,
    line_vat: 200_000,
    line_total: 2_700_000,
    note: null,
  };
}

/** Dòng dịch vụ "Bơm mực máy in" — chỉ xuất hiện trong bản chụp mới hơn của AC-ORD-121. */
function inkLine(): OrderLine {
  return {
    ...dellLine(),
    id: inkLineId,
    position: 2,
    item_type: "SERVICE",
    product_id: null,
    service_id: "f0000000-0000-4000-8000-000000000041",
    sku_snapshot: "DV-BOMMUC",
    name_snapshot: "Bơm mực máy in",
    unit_snapshot: "LAN",
    warranty_months_snapshot: null,
    catalog_price_snapshot: 790_000,
    unit_price: 790_000,
    line_gross: 790_000,
    line_vat: 63_200,
    line_total: 853_200,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  const lines = overrides.lines ?? [];
  return {
    id: orderId,
    code: "DH2610-0042",
    status: "DRAFT",
    division: null,
    customer_id: null,
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    customer_tax_code: null,
    service_address: "",
    work_description: "",
    priority: "NORMAL",
    requested_date: null,
    subtotal: lines.reduce((sum, line) => sum + line.line_gross, 0),
    discount_amount: lines.reduce((sum, line) => sum + line.line_discount, 0),
    vat_amount: lines.reduce((sum, line) => sum + line.line_vat, 0),
    total: lines.reduce((sum, line) => sum + line.line_total, 0),
    payment_status: "UNPAID",
    payment_method: null,
    revision_no: 0,
    created_by: hoaId,
    version: 1,
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    ...overrides,
    lines,
  };
}

function staleVersionProblem() {
  return HttpResponse.json(
    {
      status: 409,
      code: "STALE_VERSION",
      detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
    },
    { status: 409 },
  );
}

/** Cổng chặn phản hồi `GET /orders/{id}` để test tự quyết định lúc nó về — tái hiện race M3-07 một
 * cách tất định (không sleep, không phụ thuộc thứ tự tình cờ của network). */
function createGate() {
  let release!: () => void;
  const passed = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    passed,
    release: () => {
      release();
    },
  };
}

/**
 * Dựng đúng bối cảnh race: `POST /orders` trả `version = 1`, `POST .../lines` trả `version = 2`,
 * còn `GET /orders/{id}` (do `useOrder` bật lên khi form vừa có `id`) bị giữ lại và chỉ trả
 * `snapshot` khi test gọi `release()`. `PATCH` cư xử như optimistic concurrency thật: chỉ nhận đúng
 * `version` server đang giữ, sai thì 409 `STALE_VERSION`.
 */
function startRace(snapshot: Order) {
  const gate = createGate();
  const state = { getDone: false, patchedVersions: [] as number[], serverVersion: 1 };
  server.use(
    http.post("/api/v1/orders", () => HttpResponse.json(order({ version: 1 }), { status: 201 })),
    http.get("/api/v1/products", () =>
      HttpResponse.json({ items: [dellProduct()], total: 1, limit: 20, offset: 0 }),
    ),
    http.post("/api/v1/orders/:id/lines", () => {
      state.serverVersion = 2;
      return HttpResponse.json(order({ version: 2, lines: [dellLine()] }), { status: 201 });
    }),
    http.get("/api/v1/orders/:id", async () => {
      await gate.passed;
      state.getDone = true;
      // Bản chụp này đến *sau* khi lệnh thêm dòng đã ghi `version = 2` vào cache.
      if (snapshot.version > state.serverVersion) state.serverVersion = snapshot.version;
      return HttpResponse.json(snapshot);
    }),
    http.patch("/api/v1/orders/:id", async ({ request }) => {
      const body = (await request.json()) as { version: number };
      state.patchedVersions.push(body.version);
      if (body.version !== state.serverVersion) return staleVersionProblem();
      state.serverVersion += 1;
      return HttpResponse.json(
        order({ version: state.serverVersion, lines: snapshot.lines, code: snapshot.code }),
      );
    }),
  );
  return { gate, state };
}

/** Thêm dòng `LCD-DELL22` từ sheet — bước này tạo nháp ngầm rồi mới `POST .../lines` (AC-ORD-026). */
async function addDellLine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Thêm dòng hàng" }));
  const sheet = await screen.findByRole("dialog", { name: "Thêm dòng hàng" });
  await user.type(within(sheet).getByLabelText("Tìm sản phẩm"), "dell");
  await user.click(await within(sheet).findByRole("button", { name: /Màn hình Dell 22 inch/ }));
  // Dòng hiện ra = phản hồi `POST .../lines` (version 2) đã nằm trong cache.
  expect(await screen.findByText("Màn hình Dell 22 inch")).toBeInTheDocument();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AC-ORD-119/120 phản hồi GET cũ không ghi đè bản chụp mới hơn", () => {
  test("AC-ORD-119 Lưu nháp sau khi GET cũ về vẫn gửi version mới nhất, không bị 409 oan", async () => {
    signedInAsHoa();
    const { gate, state } = startRace(order({ version: 1 }));
    renderApp("/orders/new");
    await screen.findByRole("heading", { level: 1, name: "Tạo đơn mới" });
    const user = userEvent.setup();

    await addDellLine(user);
    gate.release();
    await waitFor(() => {
      expect(state.getDone).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));

    expect(await screen.findByText("Đã lưu nháp DH2610-0042.")).toBeInTheDocument();
    expect(state.patchedVersions).toEqual([2]);
    expect(
      screen.queryByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).not.toBeInTheDocument();
  });

  test("AC-ORD-120 dòng hàng vừa thêm và tổng tiền không bị bản chụp cũ xoá đi", async () => {
    signedInAsHoa();
    const { gate, state } = startRace(order({ version: 1 }));
    renderApp("/orders/new");
    await screen.findByRole("heading", { level: 1, name: "Tạo đơn mới" });
    const user = userEvent.setup();

    await addDellLine(user);
    // Giữ đúng node DOM của dòng hàng: nếu form quay lại trạng thái chờ ("Đang tải đơn hàng")
    // rồi vẽ lại, node này bị tháo và node mới khác tham chiếu → chứng minh "vòng loading thứ hai".
    const lineNode = screen.getByText("Màn hình Dell 22 inch");
    gate.release();
    await waitFor(() => {
      expect(state.getDone).toBe(true);
    });
    // Một tương tác nữa để React xử lý xong mọi cập nhật do phản hồi GET cũ sinh ra.
    await user.click(screen.getByRole("button", { name: "Thông tin đơn" }));

    expect(screen.getByText("Màn hình Dell 22 inch")).toBe(lineNode);
    expect(screen.queryByLabelText("Đang tải đơn hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Chưa có dòng hàng nào.")).not.toBeInTheDocument();
    const totals = screen.getByTestId("order-totals");
    expect(within(totals).getByText("Tổng cộng: 2.700.000 ₫")).toBeInTheDocument();
  });
});

describe("AC-ORD-121 bản chụp mới hơn vẫn được nhận", () => {
  test("AC-ORD-121 GET trả version cao hơn cache thì UI đổi theo và Lưu nháp gửi version đó", async () => {
    signedInAsHoa();
    // Người khác (QLKT) thực sự đã sửa đơn: thêm dòng "Bơm mực máy in" và đổi địa chỉ, version 5.
    const newer = order({
      version: 5,
      lines: [dellLine(), inkLine()],
      service_address: "Số 7 Nguyễn Huệ, Q.1",
    });
    const { gate, state } = startRace(newer);
    renderApp("/orders/new");
    await screen.findByRole("heading", { level: 1, name: "Tạo đơn mới" });
    const user = userEvent.setup();

    await addDellLine(user);
    gate.release();

    expect(await screen.findByText("Bơm mực máy in")).toBeInTheDocument();
    const totals = screen.getByTestId("order-totals");
    expect(within(totals).getByText("Tổng cộng: 3.553.200 ₫")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));

    expect(await screen.findByText("Đã lưu nháp DH2610-0042.")).toBeInTheDocument();
    expect(state.patchedVersions).toEqual([5]);
  });
});

describe("AC-ORD-122 409 STALE_VERSION thật vẫn báo và Tải lại được", () => {
  test("AC-ORD-122 banner đỏ, Tải lại nhận version 7, lần lưu sau gửi version 7", async () => {
    signedInAsHoa();
    let gets = 0;
    const patchedVersions: number[] = [];
    server.use(
      http.get("/api/v1/orders/:id", () => {
        gets += 1;
        // Lần đầu: bản đang mở (version 3). Sau khi bấm "Tải lại": bản thật ở server (version 7).
        return HttpResponse.json(
          gets === 1
            ? order({ version: 3, lines: [dellLine()] })
            : order({ version: 7, lines: [dellLine()] }),
        );
      }),
      http.patch("/api/v1/orders/:id", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        patchedVersions.push(body.version);
        if (body.version !== 7) return staleVersionProblem();
        return HttpResponse.json(order({ version: 8, lines: [dellLine()] }));
      }),
    );
    renderApp(`/orders/${orderId}`);
    await screen.findByRole("heading", { level: 1, name: "DH2610-0042" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => {
      expect(
        screen.queryByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));

    expect(await screen.findByText("Đã lưu nháp DH2610-0042.")).toBeInTheDocument();
    expect(patchedVersions).toEqual([3, 7]);
  });
});

describe("AC-ORD-123 phản hồi mutation cũ hơn cũng không ghi đè cache", () => {
  test("AC-ORD-123 useSetOrder giữ version cao hơn khi PATCH trả bản cũ hơn", async () => {
    const patchedVersions: number[] = [];
    server.use(
      http.patch("/api/v1/orders/:id", async ({ request }) => {
        const body = (await request.json()) as { version: number };
        patchedVersions.push(body.version);
        // 409 oan nếu client gửi lại version cũ hơn bản đang có trong cache.
        if (body.version !== 4) return staleVersionProblem();
        // Phản hồi về muộn, mang bản chụp cũ hơn bản một lệnh ghi khác đã đặt vào cache.
        return HttpResponse.json(order({ version: 3, lines: [dellLine()] }));
      }),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData([ORDER_KEY, orderId], order({ version: 4, lines: [dellLine()] }));
    function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    const { result } = renderHook(() => useUpdateOrder(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      id: orderId,
      body: { version: 4, service_address: "12 Lê Lợi, Q1, TP.HCM" },
    });

    expect(queryClient.getQueryData<Order>([ORDER_KEY, orderId])?.version).toBe(4);

    // Lệnh ghi kế tiếp lấy `version` từ cache (đúng như các form đang làm) → vẫn là 4, không 409.
    const cachedVersion = queryClient.getQueryData<Order>([ORDER_KEY, orderId])?.version ?? 0;
    await result.current.mutateAsync({
      id: orderId,
      body: { version: cachedVersion, service_address: "34 Hai Bà Trưng, Q1, TP.HCM" },
    });
    expect(patchedVersions).toEqual([4, 4]);
  });
});
