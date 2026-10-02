import type { Order } from "./api";

/**
 * AC-ORD-118: bản chụp đơn trong cache không bao giờ lùi `version`.
 *
 * `orders.version` ở server tăng đơn điệu cho mỗi đơn (mọi lệnh ghi đều tăng, kể cả lệnh
 * `task.*`/`assignment.*` — Q62), nên một phản hồi mang `version` nhỏ hơn bản đang có trong cache
 * chắc chắn là bản chụp cũ đang về muộn: bỏ qua nó. Thiếu bảo vệ này, một `GET /orders/{id}` bay
 * song song (observer mới của `useOrder` khi form vừa tạo nháp xong) có thể ghi đè kết quả của lệnh
 * thêm dòng hàng vừa xong → "Lưu nháp" gửi `version` cũ và nhận 409 `STALE_VERSION` oan, đồng thời
 * dòng hàng vừa thêm biến mất khỏi bảng (M3-07).
 *
 * Trả về chính một trong hai tham số, không đột biến tham số nào.
 */
export function freshestOrder(cached: Order | undefined, incoming: Order): Order {
  if (cached !== undefined && cached.version > incoming.version) return cached;
  return incoming;
}
