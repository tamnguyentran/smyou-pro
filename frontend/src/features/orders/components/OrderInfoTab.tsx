import { Pencil } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { formatCurrency, formatDate } from "../../../lib/format";
import type { Order } from "../api";
import { PRIORITY_LABELS, type Priority } from "../schemas";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold break-words text-heading sm:text-right">
        {value || "—"}
      </dd>
    </div>
  );
}

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
      <div className="rounded-2xl bg-card p-5 shadow-card lg:p-6">
        <dl className="divide-y divide-line">
          <InfoRow label="Khách hàng" value={order.customer_name ?? "Khách lẻ"} />
          <InfoRow label="Số điện thoại" value={order.customer_phone ?? ""} />
          <InfoRow label="Email" value={order.customer_email ?? ""} />
          <InfoRow label="Mã số thuế" value={order.customer_tax_code ?? ""} />
          <InfoRow label="Phòng phụ trách" value={order.division_name ?? ""} />
          <InfoRow label="Địa chỉ thi công" value={order.service_address} />
          <InfoRow label="Mô tả công việc" value={order.work_description} />
          <InfoRow label="Độ ưu tiên" value={PRIORITY_LABELS[order.priority as Priority]} />
          <InfoRow
            label="Ngày hẹn"
            value={order.requested_date ? formatDate(order.requested_date) : ""}
          />
          <InfoRow label="Tổng cộng" value={formatCurrency(order.total)} />
        </dl>
      </div>
    </div>
  );
}
