import { Hammer, Lock, Package } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";
import { cn } from "../../../lib/cn";
import { formatCurrency } from "../../../lib/format";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import { productImageUrl, useProducts, type Product } from "../../products/api";
import { ProductImage } from "../../products/components/ProductList";
import { useServices, type Service } from "../../services/api";
import { useAddLine, useAddLineAfterSubmit, type OrderLineCreateBody } from "../api";
import type { LineEndpoint } from "./OrderLinesSection";
import { isStaleAfterSubmit, type RunOrderWrite } from "./writeQueue";

type Tab = "PRODUCT" | "SERVICE";
const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "PRODUCT", label: "Sản phẩm", icon: Package },
  { id: "SERVICE", label: "Dịch vụ", icon: Hammer },
];

function CatalogResultRow({
  name,
  price,
  priceFixed,
  image,
  onPick,
}: {
  name: string;
  price: number;
  priceFixed: boolean;
  image?: string | null;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {image !== undefined ? <ProductImage src={image} size="size-10" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-heading">{name}</p>
          <p className="text-sm text-body">{formatCurrency(price)}</p>
        </div>
        {priceFixed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
            <Lock aria-hidden="true" className="size-3.5" />
            Giá cố định
          </span>
        ) : null}
      </button>
    </li>
  );
}

function ProductPicker({ onPick }: { onPick: (product: Product) => void }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const results = useProducts({
    q: debouncedQuery,
    category: "",
    is_active: "true",
    limit: 10,
    offset: 0,
  });
  return (
    <div className="space-y-3">
      <TextField
        label="Tìm sản phẩm"
        placeholder="Tên hoặc mã sản phẩm…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <ul className="space-y-2">
        {(results.data?.items ?? []).map((product) => (
          <CatalogResultRow
            key={product.id}
            name={product.name}
            price={product.price}
            priceFixed={product.price_fixed}
            image={
              product.image_attachment_id ? productImageUrl(product.image_attachment_id) : null
            }
            onPick={() => {
              onPick(product);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function ServicePicker({ onPick }: { onPick: (service: Service) => void }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const results = useServices({
    q: debouncedQuery,
    category: "",
    is_active: "true",
    limit: 10,
    offset: 0,
  });
  return (
    <div className="space-y-3">
      <TextField
        label="Tìm dịch vụ"
        placeholder="Tên hoặc mã dịch vụ…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <ul className="space-y-2">
        {(results.data?.items ?? []).map((service) => (
          <CatalogResultRow
            key={service.id}
            name={service.name}
            price={service.price}
            priceFixed={service.price_fixed}
            onPick={() => {
              onPick(service);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

/** AC-ORD-026/182: 2-tab Sheet to add a line — products/services add on click. `runOrderWrite`
 * silently creates the draft on the very first line (spec §8) and queues this add behind any other
 * in-flight order write (see writeQueue.ts). M15-06 removed the "Tự do" (CUSTOM) tab. */
export function AddLineSheet({
  onClose,
  runOrderWrite,
  lineEndpoint = "draft",
  onStaleVersion,
}: {
  onClose: () => void;
  runOrderWrite: RunOrderWrite;
  lineEndpoint?: LineEndpoint;
  /** AC-ORD-102/103: when given (post-submit mode), a STALE_VERSION closes this sheet and defers to
   * the caller's own tab-level banner instead of this sheet's local error state. */
  onStaleVersion?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("PRODUCT");
  const [error, setError] = useState<string | null>(null);
  // Mặc định "Người nhận doanh số" là người đang thêm dòng hàng — sửa lại được ngay trên dòng vừa
  // thêm (OrderLinesSection), không khoá cố định.
  const me = useMe();
  const defaultCreditedEmployeeId = me.data?.employee.id ?? null;
  const addLineDraft = useAddLine();
  const addLineAfterSubmit = useAddLineAfterSubmit();
  const addLine = lineEndpoint === "after-submit" ? addLineAfterSubmit : addLineDraft;

  async function addCatalogLine(body: Omit<OrderLineCreateBody, "version">) {
    setError(null);
    try {
      await runOrderWrite((order) =>
        addLine.mutateAsync({ id: order.id, body: { ...body, version: order.version } }),
      );
      onClose();
    } catch (err) {
      if (isStaleAfterSubmit(err, lineEndpoint, onStaleVersion)) {
        onStaleVersion?.();
        onClose();
        return;
      }
      setError(err instanceof ApiError ? (err.problem.detail ?? null) : null);
      if (!(err instanceof ApiError)) setError("Không thực hiện được. Vui lòng thử lại.");
    }
  }

  return (
    <Sheet open onClose={onClose} title="Thêm dòng hàng" dismissible={!addLine.isPending}>
      {error ? <Alert>{error}</Alert> : null}
      <div
        role="tablist"
        aria-label="Loại dòng hàng"
        className="mb-4 flex gap-1 border-b border-line"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setError(null);
            }}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-sm font-semibold transition duration-200",
              tab === id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-body",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === "PRODUCT" ? (
        <ProductPicker
          onPick={(product) => {
            void addCatalogLine({
              item_type: "PRODUCT",
              product_id: product.id,
              quantity: 1,
              unit_price: product.price,
              vat_rate: Number(product.vat_rate),
              is_gift: false,
              line_discount: 0,
              credited_employee_id: defaultCreditedEmployeeId,
            });
          }}
        />
      ) : null}
      {tab === "SERVICE" ? (
        <ServicePicker
          onPick={(service) => {
            void addCatalogLine({
              item_type: "SERVICE",
              service_id: service.id,
              quantity: 1,
              unit_price: service.price,
              vat_rate: Number(service.vat_rate),
              is_gift: false,
              line_discount: 0,
              credited_employee_id: defaultCreditedEmployeeId,
            });
          }}
        />
      ) : null}
    </Sheet>
  );
}
