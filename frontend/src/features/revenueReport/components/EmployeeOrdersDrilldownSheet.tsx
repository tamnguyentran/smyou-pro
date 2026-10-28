import { Inbox } from "lucide-react";
import { Sheet } from "../../../components/ui/Sheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { formatCurrency } from "../../../lib/format";
import { cn } from "../../../lib/cn";
import type { RevenueFilters } from "../api";
import { useEmployeeLines } from "../employeeApi";

const PROFIT_TOOLTIP = "Dòng hàng này chưa có giá vốn tại thời điểm tạo đơn.";

/** M16-05 (AC-RPT-064): drilldown — liệt kê DÒNG HÀNG của 1 nhân viên (hoặc nhóm "Chưa gán"),
 * thay cho danh sách đơn (M15-10a) vì trục tính đã đổi sang `order_lines.credited_employee_id`. */
export function EmployeeOrdersDrilldownSheet({
  selector,
  title,
  filters,
  onClose,
}: {
  selector: { employeeId: string } | { unassigned: true };
  title: string;
  filters: Pick<RevenueFilters, "from" | "to" | "status">;
  onClose: () => void;
}) {
  const lines = useEmployeeLines(selector, filters);

  return (
    <Sheet open title={title} onClose={onClose}>
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
              {/* Dưới md: 5 cột tràn ngang ở 390px (axe scrollable-region-focusable) — ẩn Số
                  lượng/Lợi nhuận, đưa 2 giá trị này thành dòng phụ dưới Tên hàng. */}
              {[
                { label: "Mã đơn", className: "" },
                { label: "Tên hàng", className: "" },
                { label: "Số lượng", className: "hidden md:table-cell" },
                { label: "Doanh thu", className: "" },
                { label: "Lợi nhuận", className: "hidden md:table-cell" },
              ].map((heading) => (
                <th key={heading.label} scope="col" className={cn("px-3 py-2", heading.className)}>
                  {heading.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.data.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-2 break-all text-heading md:break-normal">
                  {line.order_code}
                </td>
                <td className="px-3 py-2 text-body">
                  {line.line_name}
                  <span className="mt-0.5 block text-xs text-muted md:hidden">
                    SL {line.quantity} · LN{" "}
                    {line.profit === null ? (
                      <span title={PROFIT_TOOLTIP}>—</span>
                    ) : (
                      formatCurrency(line.profit)
                    )}
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-right text-body md:table-cell">
                  {line.quantity}
                </td>
                <td className="px-3 py-2 text-right text-body">
                  {formatCurrency(line.line_total)}
                </td>
                <td className="hidden px-3 py-2 text-right text-body md:table-cell">
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
