import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { server } from "../../test/msw";
import { renderApp } from "../../test/renderApp";
import type { components } from "../../lib/api/schema";
import { ApiError } from "../auth/errors";
import { compressImage, validateImageFile } from "../products/imageCompression";
import { AN, HOA, KHOA_TECH, signedInAs, anId, hoaId } from "../dispatch/testFixtures";
import { uploadConfirmationAttachment } from "./uploadConfirmation";

type OrderDetail = components["schemas"]["OrderDetail"];
type ConfirmationAttachment = components["schemas"]["ConfirmationAttachment"];

vi.mock("../products/imageCompression", () => ({
  validateImageFile: vi.fn(),
  compressImage: vi.fn(),
}));
vi.mock("./uploadConfirmation", () => ({
  uploadConfirmationAttachment: vi.fn(),
}));

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
    version: 1,
    created_by: hoaId,
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: true,
    can_complete: false,
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
  items = [] as ConfirmationAttachment[],
}: { order?: OrderDetail; items?: ConfirmationAttachment[] } = {}) {
  server.use(
    http.get("/api/v1/orders/:id", () => HttpResponse.json(order)),
    // `items` is read live on every request (not snapshotted), so a test can push to the same
    // array after a mocked upload resolves and the next refetch (query invalidation) sees it.
    http.get("/api/v1/orders/:id/confirmation-attachments", () => HttpResponse.json({ items })),
  );
  return items;
}

function file(name: string, type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function openAttachmentsTab() {
  renderApp(`/orders/${orderId}`);
  const user = userEvent.setup();
  await screen.findByText(orderCode);
  await user.click(screen.getByRole("tab", { name: "Tệp đính kèm" }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Tab Tệp đính kèm trên trang chi tiết đơn", () => {
  test("AC-CMP-012 chọn ảnh hợp lệ: nén, xem trước, tiến trình, tải xong → hiện trong lưới + toast", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(validateImageFile).mockReturnValue(null);
    vi.mocked(compressImage).mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    let finishUpload: (() => void) | undefined;
    const newAttachment = attachment();
    vi.mocked(uploadConfirmationAttachment).mockImplementation(
      (_id, _blob, onProgress) =>
        new Promise((resolve) => {
          onProgress(50);
          finishUpload = () => {
            onProgress(100);
            resolve(newAttachment);
          };
        }),
    );
    signedInAs(khoaId, KHOA_TECH);
    const items = stub();
    const user = await openAttachmentsTab();

    const input = screen.getByLabelText("Tải ảnh phiếu xác nhận", { exact: false });
    await user.upload(input, file("phieu.jpg", "image/jpeg"));

    expect(await screen.findByText("Đang tải ảnh… 50%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(uploadConfirmationAttachment).toHaveBeenCalled();
    items.push(newAttachment);
    finishUpload?.();
    await waitFor(() => {
      expect(screen.getByText("Đã tải ảnh phiếu xác nhận.")).toBeInTheDocument();
    });
    expect(screen.getByText("Lần chỉnh sửa #0")).toBeInTheDocument();
  });

  test("AC-CMP-013 status khác AWAITING_CONFIRMATION → không hiện control tải lên, vẫn xem lại ảnh cũ", async () => {
    signedInAs(hoaId, HOA);
    stub({
      order: detail({ status: "IN_PROGRESS", can_upload_confirmation: false }),
      items: [attachment()],
    });
    await openAttachmentsTab();

    expect(
      screen.queryByLabelText("Tải ảnh phiếu xác nhận", { exact: false }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Lần chỉnh sửa #0")).toBeInTheDocument();
  });

  test("AC-CMP-013b can_upload_confirmation=false (không có quyền) → không hiện control", async () => {
    signedInAs(anId, AN);
    stub({ order: detail({ can_upload_confirmation: false }) });
    await openAttachmentsTab();

    expect(
      screen.queryByLabelText("Tải ảnh phiếu xác nhận", { exact: false }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Chưa có ảnh phiếu xác nhận.")).toBeInTheDocument();
  });

  test("AC-CMP-014 file > 10MB → lỗi tức thì phía client, không gọi API nén/tải", async () => {
    vi.mocked(validateImageFile).mockReturnValue({
      code: "FILE_TOO_LARGE",
      message: "Ảnh vượt quá 10MB.",
    });
    signedInAs(khoaId, KHOA_TECH);
    stub();
    const user = await openAttachmentsTab();

    const input = screen.getByLabelText("Tải ảnh phiếu xác nhận", { exact: false });
    await user.upload(input, file("big.jpg", "image/jpeg", 11 * 1024 * 1024));

    expect(await screen.findByText("Ảnh vượt quá 10MB.")).toBeInTheDocument();
    expect(compressImage).not.toHaveBeenCalled();
    expect(uploadConfirmationAttachment).not.toHaveBeenCalled();
  });

  test("lỗi từ server khi tải lên → hiện đúng thông báo của server", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(validateImageFile).mockReturnValue(null);
    vi.mocked(compressImage).mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    vi.mocked(uploadConfirmationAttachment).mockRejectedValue(
      new ApiError({ status: 422, code: "FILE_TOO_LARGE", detail: "Ảnh vượt quá 10MB." }),
    );
    signedInAs(khoaId, KHOA_TECH);
    stub();
    const user = await openAttachmentsTab();

    const input = screen.getByLabelText("Tải ảnh phiếu xác nhận", { exact: false });
    await user.upload(input, file("phieu.jpg", "image/jpeg"));

    expect(await screen.findByText("Ảnh vượt quá 10MB.")).toBeInTheDocument();
  });

  test("ảnh bấm vào mở file gốc qua /attachments/{id}", async () => {
    signedInAs(hoaId, HOA);
    stub({ items: [attachment()] });
    await openAttachmentsTab();

    const link = (await screen.findByText("Lần chỉnh sửa #0")).closest("a");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining(`/attachments/${attachment().id}`),
    );
  });
});
