import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";
import { HOA, hoaId, meBody, signedInAs, TUAN, tuanId } from "../dispatch/testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];

const orderId = "b0000000-0000-4000-8000-000000000020";
const orderCode = "DH2610-0020";

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: orderId,
    code: orderCode,
    status: "COMPLETED",
    division: null,
    customer_id: null,
    customer_name: "Cty Sáng Tạo Mới",
    customer_phone: "0909123456",
    customer_email: null,
    customer_tax_code: null,
    service_address: "12 Lê Lợi, Q1, TP.HCM",
    work_description: "Lắp đặt camera an ninh",
    priority: "NORMAL",
    requested_date: null,
    payment_method: null,
    payment_status: "UNPAID",
    subtotal: 3000000,
    discount_amount: 0,
    vat_amount: 300000,
    total: 3300000,
    revision_no: 0,
    version: 6,
    created_by: hoaId,
    allowed_commands: ["request_revision"],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: true,
    lines: [],
    ...overrides,
  };
}

function stub(order: OrderDetail = detail()) {
  server.use(
    http.get("/api/v1/orders/:id", () => HttpResponse.json(order)),
    http.get("/api/v1/orders/:id/confirmation-attachments", () => HttpResponse.json({ items: [] })),
    http.get("/api/v1/orders/:id/history", () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
    ),
    http.get("/api/v1/orders/:id/tasks", () => HttpResponse.json({ items: [] })),
  );
}

async function openOrder() {
  renderApp(`/orders/${orderId}`);
  const user = userEvent.setup();
  await screen.findByText(orderCode);
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Chuyển Chỉnh sửa (M6-03b)", () => {
  test("AC-ORD-152 nút Chuyển Chỉnh sửa hiện khi can_revise; Hoa (can_revise=false) không thấy", async () => {
    signedInAs(tuanId, TUAN);
    stub();
    await openOrder();
    expect(screen.getByRole("button", { name: "Chuyển Chỉnh sửa" })).toBeInTheDocument();
  });

  test("AC-ORD-152b Hoa (SALE, can_revise=false) không thấy nút", async () => {
    signedInAs(hoaId, HOA);
    stub(detail({ can_revise: false, allowed_commands: [] }));
    await openOrder();
    expect(screen.queryByRole("button", { name: "Chuyển Chỉnh sửa" })).not.toBeInTheDocument();
  });

  test("AC-ORD-153 mở sheet, nút Xác nhận disabled khi lý do trống/<5 ký tự", async () => {
    signedInAs(tuanId, TUAN);
    stub();
    const user = await openOrder();

    await user.click(screen.getByRole("button", { name: "Chuyển Chỉnh sửa" }));
    const dialog = await screen.findByRole("dialog", {
      name: `Chuyển đơn ${orderCode} sang Chỉnh sửa?`,
    });
    expect(within(dialog).getByText(/không thể hoàn tác/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Xác nhận" })).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Lý do"), "abc ");
    expect(within(dialog).getByRole("button", { name: "Xác nhận" })).toBeDisabled();
  });

  test("AC-ORD-154 nhập lý do hợp lệ, xác nhận → gọi API version+reason, thành công → toast + badge đổi", async () => {
    signedInAs(tuanId, TUAN);
    let reviseBody: unknown;
    stub();
    server.use(
      http.post("/api/v1/orders/:id/revise", async ({ request }) => {
        reviseBody = await request.json();
        return HttpResponse.json(
          detail({
            status: "REVISION",
            revision_no: 1,
            version: 7,
            allowed_commands: [],
            can_revise: false,
          }),
        );
      }),
    );
    const user = await openOrder();

    await user.click(screen.getByRole("button", { name: "Chuyển Chỉnh sửa" }));
    const dialog = await screen.findByRole("dialog", {
      name: `Chuyển đơn ${orderCode} sang Chỉnh sửa?`,
    });
    await user.type(
      within(dialog).getByLabelText("Lý do"),
      "Camera tầng 2 lắp sai vị trí, khách yêu cầu chỉnh",
    );
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));

    expect(
      await screen.findByText(`Đã chuyển đơn ${orderCode} sang Chỉnh sửa.`),
    ).toBeInTheDocument();
    expect(reviseBody).toEqual({
      version: 6,
      reason: "Camera tầng 2 lắp sai vị trí, khách yêu cầu chỉnh",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: `Chuyển đơn ${orderCode} sang Chỉnh sửa?` }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Chuyển Chỉnh sửa" })).not.toBeInTheDocument();
  });

  test("AC-ORD-154 thành công → badge 'Đơn cần chỉnh sửa' trên menu cập nhật (invalidate /me)", async () => {
    signedInAs(tuanId, TUAN, { revision_count: 0 });
    stub();
    server.use(
      http.post("/api/v1/orders/:id/revise", () =>
        HttpResponse.json(
          detail({
            status: "REVISION",
            revision_no: 1,
            version: 7,
            allowed_commands: [],
            can_revise: false,
          }),
        ),
      ),
    );
    const user = await openOrder();
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    await user.click(within(nav).getByRole("button", { name: "Điều phối kỹ thuật" }));
    const revisions = within(nav).getByRole("link", { name: /Đơn cần chỉnh sửa/ });
    expect(within(revisions).queryByText("1")).not.toBeInTheDocument();

    server.use(
      http.get("/api/v1/me", () => HttpResponse.json(meBody(tuanId, TUAN, { revision_count: 1 }))),
    );

    await user.click(screen.getByRole("button", { name: "Chuyển Chỉnh sửa" }));
    const dialog = await screen.findByRole("dialog", {
      name: `Chuyển đơn ${orderCode} sang Chỉnh sửa?`,
    });
    await user.type(
      within(dialog).getByLabelText("Lý do"),
      "Camera tầng 2 lắp sai vị trí, khách yêu cầu chỉnh",
    );
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));

    expect(
      await screen.findByText(`Đã chuyển đơn ${orderCode} sang Chỉnh sửa.`),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(within(revisions).getByText("1")).toBeInTheDocument();
    });
  });

  test("AC-ORD-155 STALE_VERSION khi xác nhận → banner đỏ + nút Tải lại", async () => {
    signedInAs(tuanId, TUAN);
    stub();
    server.use(
      http.post("/api/v1/orders/:id/revise", () =>
        HttpResponse.json(
          {
            status: 409,
            code: "STALE_VERSION",
            detail: "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.",
          },
          { status: 409 },
        ),
      ),
    );
    const user = await openOrder();

    await user.click(screen.getByRole("button", { name: "Chuyển Chỉnh sửa" }));
    const dialog = await screen.findByRole("dialog", {
      name: `Chuyển đơn ${orderCode} sang Chỉnh sửa?`,
    });
    await user.type(
      within(dialog).getByLabelText("Lý do"),
      "Khách yêu cầu chỉnh lại vị trí lắp đặt",
    );
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });
});
