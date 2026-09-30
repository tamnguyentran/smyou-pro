import { formatCurrency } from "../../../lib/format";
import type { Order } from "../api";
import { DIVISION_LABELS, PRIORITY_LABELS, type Division, type Priority } from "../schemas";
import { ReadOnlyField } from "./ReadOnlyField";

/** Tab "Thông tin" của OrderDetailTabs — luôn chỉ đọc (sửa liên hệ sau khi gửi thuộc M3-04). */
export function OrderInfoTab({ order }: { order: Order }) {
  return (
    <div className="space-y-4">
      <ReadOnlyField label="Khách hàng" value={order.customer_name ?? "Khách lẻ"} />
      <ReadOnlyField
        label="Phòng phụ trách"
        value={order.division ? DIVISION_LABELS[order.division as Division] : ""}
      />
      <ReadOnlyField label="Địa chỉ thi công" value={order.service_address} />
      <ReadOnlyField label="Mô tả công việc" value={order.work_description} />
      <ReadOnlyField label="Độ ưu tiên" value={PRIORITY_LABELS[order.priority as Priority]} />
      <ReadOnlyField label="Ngày hẹn" value={order.requested_date ?? ""} />
      <ReadOnlyField label="Tổng cộng" value={formatCurrency(order.total)} />
    </div>
  );
}
