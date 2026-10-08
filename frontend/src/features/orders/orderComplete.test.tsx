import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";
import { AN, KHOA_TECH, signedInAs, anId, hoaId } from "../dispatch/testFixtures";

type OrderDetail = components["schemas"]["OrderDetail"];
type ConfirmationAttachment = components["schemas"]["ConfirmationAttachment"];

const khoaId = "a0000000-0000-4000-8000-000000000081";
const orderId = "b0000000-0000-4000-8000-000000000020";
const orderCode = "DH2610-0020";

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: orderId,
    code: orderCode,
    status: "AWAITING_CONFIRMATION",
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
    version: 5,
    created_by: hoaId,
    allowed_commands: ["complete"],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: true,
    can_complete: true,
    lines: [],
    ...overrides,
  };
}

function attachment(overrides: Partial<ConfirmationAttachment> = {}): ConfirmationAttachment {
  return {
    id: "e0000000-0000-4000-8000-000000000090",
    revision_no: 0,
    mime_type: "image/jpeg",
    size_bytes: 123,
    uploaded_by: khoaId,
    uploaded_by_name: "Trần Minh Khoa",
    created_at: "2026-10-01T03:00:00Z",
    ...overrides,
  };
}

function stub({
  order = detail(),
  items = [attachment()] as ConfirmationAttachment[],
}: { order?: OrderDetail; items?: ConfirmationAttachment[] } = {}) {
  server.use(
    http.get("/api/v1/orders/:id", () => HttpResponse.json(order)),
    http.get("/api/v1/orders/:id/confirmation-attachments", () => HttpResponse.json({ items })),
    http.get("/api/v1/orders/:id/history", () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
    ),
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

describe("Hoàn tất đơn (M6-02)", () => {
  test("AC-ORD-138 mở Sheet với cảnh báo không đảo ngược + nút Xác nhận hoàn tất disabled khi trống", async () => {
    signedInAs(khoaId, KHOA_TECH);
    stub();
    const user = await openOrder();

    await user.click(screen.getByRole("button", { name: "Hoàn tất đơn" }));
    const dialog = await screen.findByRole("dialog", { name: `Hoàn tất đơn ${orderCode}?` });
    expect(within(dialog).getByText(/không thể hoàn tác/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Xác nhận hoàn tất" })).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Tên người ký"), "   ");
    expect(within(dialog).getByRole("button", { name: "Xác nhận hoàn tất" })).toBeDisabled();
  });

  test("AC-ORD-139 nhập tên, xác nhận → gọi API version+tên, thành công → toast + đóng sheet", async () => {
    signedInAs(khoaId, KHOA_TECH);
    let completeBody: unknown;
    stub();
    server.use(
      http.post("/api/v1/orders/:id/complete", async ({ request }) => {
        completeBody = await request.json();
        return HttpResponse.json(detail({ status: "COMPLETED", allowed_commands: [], version: 6 }));
      }),
    );
    const user = await openOrder();

    await user.click(screen.getByRole("button", { name: "Hoàn tất đơn" }));
    const dialog = await screen.findByRole("dialog", { name: `Hoàn tất đơn ${orderCode}?` });
    await user.type(within(dialog).getByLabelText("Tên người ký"), "Lê Thị Mai");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận hoàn tất" }));

    expect(await screen.findByText(`Đã hoàn tất đơn ${orderCode}.`)).toBeInTheDocument();
    expect(completeBody).toEqual({ version: 5, confirmation_signer_name: "Lê Thị Mai" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: `Hoàn tất đơn ${orderCode}?` }),
      ).not.toBeInTheDocument();
    });
  });

  test("AC-ORD-140 chưa có ảnh xác nhận ở revision_no hiện tại → nút Hoàn tất đơn không hiện", async () => {
    signedInAs(khoaId, KHOA_TECH);
    stub({ items: [] });
    await openOrder();

    expect(screen.queryByRole("button", { name: "Hoàn tất đơn" })).not.toBeInTheDocument();
  });

  test("AC-ORD-141 STALE_VERSION khi xác nhận → banner đỏ + nút Tải lại", async () => {
    signedInAs(khoaId, KHOA_TECH);
    stub();
    server.use(
      http.post("/api/v1/orders/:id/complete", () =>
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

    await user.click(screen.getByRole("button", { name: "Hoàn tất đơn" }));
    const dialog = await screen.findByRole("dialog", { name: `Hoàn tất đơn ${orderCode}?` });
    await user.type(within(dialog).getByLabelText("Tên người ký"), "Lê Thị Mai");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận hoàn tất" }));

    expect(
      await screen.findByText("Thông tin đã bị người khác thay đổi. Vui lòng tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });

  test("can_complete=false hoặc allowed_commands thiếu complete → không hiện nút", async () => {
    signedInAs(anId, AN);
    stub({ order: detail({ can_complete: false, allowed_commands: [] }) });
    await openOrder();

    expect(screen.queryByRole("button", { name: "Hoàn tất đơn" })).not.toBeInTheDocument();
  });
});
