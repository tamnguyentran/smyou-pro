import { Inbox } from "lucide-react";
import { Sheet } from "../../../components/ui/Sheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { formatCurrency } from "../../../lib/format";
import { useOrder } from "../../orders/api";

/** AC-RPT-012: drilldown cấp 2 — dòng hàng chi tiết của 1 đơn, đọc từ `OrderDetail.lines`
 * (không có route `/orders/{id}/lines` riêng). Chỉ đọc — không nút sửa/xoá (không tái dùng
 * `OrderLinesSection`, component đó gắn liền hook ghi dữ liệu). */
export function OrderLinesDrilldownSheet({
  orderCode,
  orderId,
  onClose,
}: {
  orderCode: string;
  orderId: string;
  onClose: () => void;
}) {
  const order = useOrder(orderId);

  return (
    <Sheet open title={`Đơn ${orderCode}`} onClose={onClose}>
      {order.isPending ? (
        <p className="py-8 text-center text-sm text-muted">Đang tải…</p>
      ) : order.isError ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được chi tiết đơn."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void order.refetch();
              }}
            >
              Tải lại
            </Button>
          }
        />
      ) : order.data.lines.length === 0 ? (
        <EmptyState icon={Inbox} message="Đơn chưa có dòng hàng." />
      ) : (
        <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
          <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
            <tr>
              {["Sản phẩm/dịch vụ", "SL", "Đơn giá", "Giảm giá", "VAT", "Thành tiền"].map(
                (heading) => (
                  <th key={heading} scope="col" className="px-3 py-2">
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {order.data.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-2 text-heading">{line.name_snapshot}</td>
                <td className="px-3 py-2 text-body">{line.quantity}</td>
                <td className="px-3 py-2 text-right text-body">
                  {formatCurrency(line.unit_price)}
                </td>
                <td className="px-3 py-2 text-right text-body">
                  {formatCurrency(line.line_discount)}
                </td>
                <td className="px-3 py-2 text-right text-body">{formatCurrency(line.line_vat)}</td>
                <td className="px-3 py-2 text-right text-body">
                  {formatCurrency(line.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}
