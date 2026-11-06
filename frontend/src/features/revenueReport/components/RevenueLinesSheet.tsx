import type { UseQueryResult } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { Sheet } from "../../../components/ui/Sheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { formatCurrency, formatQuantity } from "../../../lib/format";
import { cn } from "../../../lib/cn";
import type { components } from "../../../lib/api/schema";

type RevenueLine = components["schemas"]["RevenueLineOut"];

const PROFIT_TOOLTIP = "Dòng hàng này chưa có giá vốn tại thời điểm tạo đơn.";

/** Drilldown dòng hàng dùng chung: theo nhân viên (M16-05) và theo nhóm/SP-DV (M24-01b). */
export function RevenueLinesSheet({
  title,
  lines,
  onClose,
}: {
  title: string;
  lines: UseQueryResult<RevenueLine[]>;
  onClose: () => void;
}) {
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
                    Số lượng {formatQuantity(line.quantity)} · Lợi nhuận{" "}
                    {line.profit === null ? (
                      <span title={PROFIT_TOOLTIP}>—</span>
                    ) : (
                      formatCurrency(line.profit)
                    )}
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-right text-body md:table-cell">
                  {formatQuantity(line.quantity)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-body">
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
