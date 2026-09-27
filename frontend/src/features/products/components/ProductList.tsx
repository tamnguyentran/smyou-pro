import { Monitor } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { formatCurrency } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { productImageUrl, type Product } from "../api";
import { CATEGORY_LABELS, type Category } from "../schemas";

/** Reused by ProductFormSheet's read-only/edit detail view. */
export function StatusBadge({ product }: { product: Product }) {
  return (
    <Badge tone={product.is_active ? "completed" : "todo"}>
      {product.is_active ? "Đang kinh doanh" : "Đã ngừng kinh doanh"}
    </Badge>
  );
}

function Thumbnail({ product }: { product: Product }) {
  if (product.image_attachment_id) {
    return (
      <img
        src={productImageUrl(product.image_attachment_id)}
        alt=""
        className="size-12 shrink-0 rounded-xl border border-line object-cover"
      />
    );
  }
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-sidebar-sub">
      <Monitor aria-hidden="true" className="size-5 text-muted" />
    </div>
  );
}

const NAME_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** AC-CAT-012: table on desktop, cards (with thumbnail) on mobile. */
export function ProductList({
  items,
  onSelect,
}: {
  items: Product[];
  onSelect: (product: Product) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã hàng", "Tên", "Danh mục", "Giá", "Trạng thái"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((product) => (
            <tr key={product.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">{product.sku}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(product);
                  }}
                  className={NAME_BUTTON}
                >
                  {product.name}
                </button>
              </td>
              <td className="px-4 py-3 text-body">
                {CATEGORY_LABELS[product.category as Category]}
              </td>
              <td className="px-4 py-3 text-body">{formatCurrency(product.price)}</td>
              <td className="px-4 py-3">
                <StatusBadge product={product} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((product) => (
        <li key={product.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(product);
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Thumbnail product={product} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-heading">{product.name}</p>
                <span className="shrink-0 text-xs font-medium text-muted">{product.sku}</span>
              </div>
              <p className="mt-1 text-sm text-body">{formatCurrency(product.price)}</p>
              <div className="mt-2">
                <StatusBadge product={product} />
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
