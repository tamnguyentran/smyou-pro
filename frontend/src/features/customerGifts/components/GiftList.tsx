import { formatCurrency, formatDate } from "../../../lib/format";
import type { CustomerGift } from "../api";

/** AC-GFT-021: danh sách bản ghi tặng quà, mobile-first (card), sắp sẵn từ API (`performed_date` giảm dần). */
export function GiftList({
  items,
  onSelect,
}: {
  items: CustomerGift[];
  onSelect?: (gift: CustomerGift) => void;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => {
              onSelect?.(item);
            }}
            className="flex w-full flex-col items-start gap-1 rounded-2xl bg-card p-5 text-left shadow-card transition duration-200 enabled:hover:shadow-card-hover enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-brand enabled:focus-visible:ring-offset-2 disabled:cursor-default"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <p className="truncate font-semibold text-heading">{item.gift_name}</p>
              <span className="shrink-0 text-sm font-semibold text-heading">
                {formatCurrency(item.total_amount)}
              </span>
            </div>
            <p className="text-sm text-body">{item.occasion_name}</p>
            <p className="text-xs text-muted">
              {formatDate(item.performed_date)} · SL {item.quantity} ×{" "}
              {formatCurrency(item.unit_price)}
              {item.other_cost > 0 ? ` + ${formatCurrency(item.other_cost)}` : ""}
            </p>
            <p className="text-xs text-muted">
              Thực hiện: {item.performed_by.full_name} · Yêu cầu: {item.requested_by.full_name}
            </p>
            {item.note ? <p className="text-xs text-muted italic">{item.note}</p> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
