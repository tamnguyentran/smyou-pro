import { Inbox } from "lucide-react";
import { Sheet } from "../../../components/ui/Sheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { formatCurrency } from "../../../lib/format";
import { useCustomerLines, type RevenueFilters } from "../api";

const PROFIT_TOOLTIP = "Dòng hàng này chưa có giá vốn tại thời điểm tạo đơn.";

/** M16-06 (AC-RPT-071): drilldown — liệt kê DÒNG HÀNG của 1 (khách hàng × người bán hoặc nhóm
 * "Chưa gán"), thay cho danh sách đơn (M15-09a) vì trục tính đã đổi sang `order_lines.
 * credited_employee_id`. */
export function OrdersDrilldownSheet({
  customerId,
  customerName,
  selector,
  sellerLabel,
  filters,
  onClose,
}: {
  customerId: string;
  customerName: string;
  selector: { sellerId: string } | { unassigned: true };
  sellerLabel: string;
  filters: Pick<RevenueFilters, "from" | "to" | "status">;
  onClose: () => void;
}) {
  const lines = useCustomerLines(customerId, selector, filters);

  return (
    <Sheet open title={`${customerName} — Người bán: ${sellerLabel}`} onClose={onClose}>
      {lines.isPending ? (
        <p className="py-8 text-center text-sm text-muted">Đang tải…</p>
      ) : lines.isError ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được danh sách dòng hàng."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void lines.refetch();
              }}
            >
              Tải lại
            </Button>
          }
        />
      ) : lines.data.length === 0 ? (
        <EmptyState icon={Inbox} message="Không có dòng hàng phù hợp." />
      ) : (
        <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
          <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
            <tr>
              {["Mã đơn", "Tên hàng", "Số lượng", "Doanh thu", "Lợi nhuận"].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.data.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-2 text-heading">{line.order_code}</td>
                <td className="px-3 py-2 text-body">{line.line_name}</td>
                <td className="px-3 py-2 text-right text-body">{line.quantity}</td>
                <td className="px-3 py-2 text-right text-body">
                  {formatCurrency(line.line_total)}
                </td>
                <td className="px-3 py-2 text-right text-body">
                  {line.profit === null ? (
                    <span title={PROFIT_TOOLTIP}>—</span>
                  ) : (
                    formatCurrency(line.profit)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}
