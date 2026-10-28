import { Gift } from "lucide-react";
import { Sheet } from "../../../components/ui/Sheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { formatCurrency, formatDate } from "../../../lib/format";
import { useCustomerGiftReportItems, type CustomerGiftReportFilters } from "../api";

/** AC-GFT-041: drilldown — danh sách từng lần tặng của 1 khách hàng trong khoảng đang lọc. */
export function CustomerGiftDrilldownSheet({
  customerId,
  customerName,
  filters,
  onClose,
}: {
  customerId: string;
  customerName: string;
  filters: Pick<CustomerGiftReportFilters, "from" | "to">;
  onClose: () => void;
}) {
  const items = useCustomerGiftReportItems(customerId, filters);

  return (
    <Sheet open title={customerName} onClose={onClose}>
      {items.isPending ? (
        <p className="py-8 text-center text-sm text-muted">Đang tải…</p>
      ) : items.isError ? (
        <EmptyState
          icon={Gift}
          message="Không tải được danh sách lần tặng."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void items.refetch();
              }}
            >
              Tải lại
            </Button>
          }
        />
      ) : items.data.length === 0 ? (
        <EmptyState icon={Gift} message="Không có lần tặng nào phù hợp." />
      ) : (
        <ul className="space-y-3">
          {items.data.map((item) => (
            <li
              key={item.id}
              className="space-y-1 rounded-2xl border border-line bg-card p-4 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-heading">{item.occasion_name}</span>
                <span className="text-muted">{formatDate(item.performed_date)}</span>
              </div>
              <p className="text-body">
                {item.gift_name} — {item.quantity} × {formatCurrency(item.unit_price)}
                {item.other_cost > 0 ? ` + ${formatCurrency(item.other_cost)}` : ""}
              </p>
              <p className="font-semibold text-heading">{formatCurrency(item.total_amount)}</p>
              <p className="text-xs text-muted">
                Người thực hiện: {item.performed_by.full_name} · Người yêu cầu:{" "}
                {item.requested_by.full_name}
              </p>
              {item.note ? <p className="text-xs text-muted">{item.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
