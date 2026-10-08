import { describe, expect, test } from "vitest";
import { freshestOrder } from "./orderCache";
import type { components } from "../../lib/api/schema";

type Order = components["schemas"]["OrderDetail"];

/** Chỉ `version` là thứ `freshestOrder` quan tâm; các trường còn lại để mặc định cho gọn. */
function order(version: number, overrides: Partial<Order> = {}): Order {
  return {
    id: "b0000000-0000-4000-8000-000000000020",
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
    subtotal: 0,
    discount_amount: 0,
    vat_amount: 0,
    total: 0,
    payment_status: "UNPAID",
    payment_method: null,
    revision_no: 0,
    created_by: "a0000000-0000-4000-8000-000000000010",
    version,
    lines: [],
    allowed_commands: [],
    can_edit_contact: false,
    can_edit_lines_after_submit: false,
    can_upload_confirmation: false,
    can_complete: false,
    can_revise: false,
    ...overrides,
  };
}

describe("AC-ORD-118 freshestOrder — cache của đơn không bao giờ lùi version", () => {
  test("AC-ORD-118 bỏ qua bản cũ hơn, nhận bản mới hơn/bằng/khi chưa có cache", () => {
    const cached = order(2);

    // Bản chụp cũ hơn đang về sau một lệnh ghi → giữ nguyên bản trong cache.
    expect(freshestOrder(cached, order(1))).toBe(cached);

    // Mới hơn: dữ liệu thật sự thay đổi ở server → nhận.
    const newer = order(3);
    expect(freshestOrder(cached, newer)).toBe(newer);

    // Bằng nhau: nhận bản mới đến (không đóng băng cache, giữ hành vi refetch bình thường).
    const same = order(2);
    expect(freshestOrder(cached, same)).toBe(same);

    // Chưa có gì trong cache (lần tải đầu) → nhận.
    const first = order(1);
    expect(freshestOrder(undefined, first)).toBe(first);
  });

  test("AC-ORD-118 không đột biến tham số đầu vào", () => {
    const cached = order(2, { service_address: "12 Lê Lợi, Q1, TP.HCM" });
    const incoming = order(1, { service_address: "Số 7 Nguyễn Huệ, Q.1" });

    freshestOrder(cached, incoming);

    expect(cached.service_address).toBe("12 Lê Lợi, Q1, TP.HCM");
    expect(cached.version).toBe(2);
    expect(incoming.service_address).toBe("Số 7 Nguyễn Huệ, Q.1");
    expect(incoming.version).toBe(1);
  });
});
