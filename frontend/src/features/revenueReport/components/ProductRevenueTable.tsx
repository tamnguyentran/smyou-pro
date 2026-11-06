import { useMediaQuery } from "../../../lib/useMediaQuery";
import { cn } from "../../../lib/cn";
import { formatCurrency, formatQuantity } from "../../../lib/format";
import type { components } from "../../../lib/api/schema";
import type { ProductRevenueMode, ProductRevenueRow } from "../productApi";

type Summary = components["schemas"]["ProductRevenueSummaryOut"];

const PROFIT_TOOLTIP = "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn.";
const ITEM_TYPE_LABEL: Record<NonNullable<ProductRevenueRow["item_type"]>, string> = {
  PRODUCT: "Sản phẩm",
  SERVICE: "Dịch vụ",
  CUSTOM: "Tự nhập",
};

function Profit({ profit }: { profit: number | null }) {
  if (profit === null) {
    return <span title={PROFIT_TOOLTIP}>—</span>;
  }
  return <>{formatCurrency(profit)}</>;
}

function quantity(row: ProductRevenueRow): string {
  return row.quantity === null ? "—" : formatQuantity(row.quantity);
}

function itemType(row: ProductRevenueRow): string {
  return row.item_type === null ? "—" : ITEM_TYPE_LABEL[row.item_type];
}

/** AC-RPT-153/154/156/159: bảng (desktop) / thẻ (mobile) theo nhóm hoặc từng SP/DV + dòng tổng. */
export function ProductRevenueTable({
  mode,
  rows,
  summary,
  onSelect,
}: {
  mode: ProductRevenueMode;
  rows: ProductRevenueRow[];
  summary: Summary;
  onSelect: (row: ProductRevenueRow) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const item = mode === "item";

  if (desktop) {
    const headings = item
      ? ["Mã", "Tên", "Loại", "ĐVT", "Số lượng", "Số đơn", "Doanh thu", "Lợi nhuận"]
      : ["Nhóm SP/DV", "Số đơn", "Doanh thu", "Lợi nhuận"];
    const numeric = new Set(["Số lượng", "Số đơn", "Doanh thu", "Lợi nhuận"]);
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm tabular-nums">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {headings.map((heading) => (
              <th
                key={heading}
                scope="col"
                className={cn("px-4 py-3", numeric.has(heading) && "text-right")}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-sidebar-sub">
              {item ? (
                <td className="px-4 py-3 font-medium text-heading">{row.code ?? "—"}</td>
              ) : null}
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(row);
                  }}
                  className="min-h-11 rounded text-left font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {row.label}
                </button>
              </td>
              {item ? (
                <>
                  <td className="px-4 py-3 text-body">{itemType(row)}</td>
                  <td className="px-4 py-3 text-body">{row.unit ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-body">{quantity(row)}</td>
                </>
              ) : null}
              <td className="px-4 py-3 text-right text-body">{row.order_count}</td>
              <td className="px-4 py-3 text-right text-body">
                {formatCurrency(row.subtotal_revenue)}
              </td>
              <td className="px-4 py-3 text-right text-body">
                <Profit profit={row.profit} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line bg-sidebar-sub font-semibold text-heading">
          <tr>
            <td colSpan={headings.length - 2} className="px-4 py-3">
              Tổng cộng
            </td>
            <td className="px-4 py-3 text-right">{formatCurrency(summary.subtotal_revenue)}</td>
            <td className="px-4 py-3 text-right">
              <Profit profit={summary.profit} />
            </td>
          </tr>
        </tfoot>
      </table>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => {
                onSelect(row);
              }}
              className="w-full rounded-2xl bg-card p-5 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold break-words text-heading">{row.label}</p>
                {item ? (
                  <span className="shrink-0 text-xs font-medium text-muted">{itemType(row)}</span>
                ) : null}
              </div>
              {item && row.code ? (
                <p className="mt-0.5 text-xs break-all text-muted">{row.code}</p>
              ) : null}
              <dl className="mt-2 space-y-1 text-sm text-body">
                {item ? (
                  <div className="flex justify-between">
                    <dt className="text-muted">Số lượng</dt>
                    <dd>
                      {quantity(row)} {row.unit ?? ""}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted">Số đơn</dt>
                  <dd>{row.order_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Doanh thu</dt>
                  <dd>{formatCurrency(row.subtotal_revenue)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Lợi nhuận</dt>
                  <dd>
                    <Profit profit={row.profit} />
                  </dd>
                </div>
              </dl>
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-line bg-sidebar-sub p-5 text-sm font-semibold text-heading">
        <p>Tổng cộng</p>
        <dl className="mt-1 space-y-1">
          <div className="flex justify-between">
            <dt className="font-normal text-muted">Doanh thu</dt>
            <dd>{formatCurrency(summary.subtotal_revenue)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-normal text-muted">Lợi nhuận</dt>
            <dd>
              <Profit profit={summary.profit} />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
