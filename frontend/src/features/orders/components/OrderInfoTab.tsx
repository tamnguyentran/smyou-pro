import { Pencil } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { formatCurrency, formatDate } from "../../../lib/format";
import type { Order } from "../api";
import { DIVISION_LABELS, PRIORITY_LABELS, type Division, type Priority } from "../schemas";
import { ReadOnlyField } from "./ReadOnlyField";

/** Tab "Thông tin" của OrderDetailTabs — chỉ đọc, trừ nút "Sửa liên hệ" (M3-04b) khi
 * `order.can_edit_contact`; `OrderDetailTabs` quyết định có truyền `onEditContact` hay không. */
export function OrderInfoTab({
  order,
  onEditContact,
}: {
  order: Order;
  onEditContact?: () => void;
}) {
  return (
    <div className="space-y-4">
      {onEditContact ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            icon={<Pencil aria-hidden="true" className="size-4" />}
            onClick={onEditContact}
          >
            Sửa liên hệ
          </Button>
        </div>
      ) : null}
      <ReadOnlyField label="Khách hàng" value={order.customer_name ?? "Khách lẻ"} />
      <ReadOnlyField label="Số điện thoại" value={order.customer_phone ?? ""} />
      <ReadOnlyField label="Email" value={order.customer_email ?? ""} />
      <ReadOnlyField label="Mã số thuế" value={order.customer_tax_code ?? ""} />
      <ReadOnlyField
        label="Phòng phụ trách"
        value={order.division ? DIVISION_LABELS[order.division as Division] : ""}
      />
      <ReadOnlyField label="Địa chỉ thi công" value={order.service_address} />
      <ReadOnlyField label="Mô tả công việc" value={order.work_description} />
      <ReadOnlyField label="Độ ưu tiên" value={PRIORITY_LABELS[order.priority as Priority]} />
      <ReadOnlyField
        label="Ngày hẹn"
        value={order.requested_date ? formatDate(order.requested_date) : ""}
      />
      <ReadOnlyField label="Tổng cộng" value={formatCurrency(order.total)} />
    </div>
  );
}
