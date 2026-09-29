import { zodResolver } from "@hookform/resolvers/zod";
import { Hammer, Lock, Package, PenLine } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";
import { cn } from "../../../lib/cn";
import { formatCurrency } from "../../../lib/format";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { ApiError } from "../../auth/errors";
import { productImageUrl, useProducts, type Product } from "../../products/api";
import { ProductImage } from "../../products/components/ProductList";
import { useServices, type Service } from "../../services/api";
import { UNIT_LABELS, UNIT_ORDER } from "../../services/schemas";
import { useAddLine, type OrderLineCreateBody } from "../api";
import { fieldErrors } from "../errors";
import { customLineSchema, type CustomLineFormValues } from "../schemas";
import type { RunOrderWrite } from "./writeQueue";
import { VatChipField } from "./VatChipField";

type Tab = "PRODUCT" | "SERVICE" | "CUSTOM";
const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "PRODUCT", label: "Sản phẩm", icon: Package },
  { id: "SERVICE", label: "Dịch vụ", icon: Hammer },
  { id: "CUSTOM", label: "Tự do", icon: PenLine },
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

function CustomLineForm({
  pending,
  serverErrors,
  onSubmit,
}: {
  pending: boolean;
  serverErrors: Record<string, string>;
  onSubmit: (values: CustomLineFormValues) => void;
}) {
  const { register, handleSubmit, formState, control, setValue } = useForm<CustomLineFormValues>({
    resolver: zodResolver(customLineSchema) as Resolver<CustomLineFormValues>,
    defaultValues: { name: "", unit: UNIT_ORDER[0], quantity: 1, unit_price: 0, vat_rate: 8 },
  });
  const vatRate = useWatch({ control, name: "vat_rate" });

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4">
      <TextField
        label="Tên"
        error={formState.errors.name?.message ?? serverErrors.name}
        {...register("name")}
      />
      <Select label="Đơn vị" error={formState.errors.unit?.message} {...register("unit")}>
        {UNIT_ORDER.map((unit) => (
          <option key={unit} value={unit}>
            {UNIT_LABELS[unit]}
          </option>
        ))}
      </Select>
      <TextField
        label="Số lượng"
        type="number"
        step="any"
        error={formState.errors.quantity?.message}
        {...register("quantity")}
      />
      <TextField
        label="Đơn giá"
        type="number"
        error={formState.errors.unit_price?.message ?? serverErrors.unit_price}
        {...register("unit_price")}
      />
      <VatChipField
        value={vatRate}
        onChange={(value) => {
          setValue("vat_rate", value, { shouldValidate: true });
        }}
      />
      <Button type="submit" loading={pending}>
        Thêm
      </Button>
    </form>
  );
}

/** AC-ORD-026/030/033: 3-tab Sheet to add a line — products/services add on click, "Tự do" needs the
 * form below submitted. `runOrderWrite` silently creates the draft on the very first line (spec §8)
 * and queues this add behind any other in-flight order write (see writeQueue.ts). */
export function AddLineSheet({
  onClose,
  runOrderWrite,
}: {
  onClose: () => void;
  runOrderWrite: RunOrderWrite;
}) {
  const [tab, setTab] = useState<Tab>("PRODUCT");
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const addLine = useAddLine();

  async function addCatalogLine(body: Omit<OrderLineCreateBody, "version">) {
    setError(null);
    try {
      await runOrderWrite((order) =>
        addLine.mutateAsync({ id: order.id, body: { ...body, version: order.version } }),
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? null) : null);
      if (!(err instanceof ApiError)) setError("Không thực hiện được. Vui lòng thử lại.");
    }
  }

  async function addCustomLine(values: CustomLineFormValues) {
    setServerErrors({});
    try {
      await runOrderWrite((order) =>
        addLine.mutateAsync({
          id: order.id,
          body: {
            version: order.version,
            item_type: "CUSTOM",
            name: values.name,
            unit: values.unit as OrderLineCreateBody["unit"],
            quantity: values.quantity,
            unit_price: values.unit_price,
            vat_rate: values.vat_rate,
            is_gift: false,
            line_discount: 0,
          },
        }),
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setServerErrors(fieldErrors(err));
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
            });
          }}
        />
      ) : null}
      {tab === "CUSTOM" ? (
        <CustomLineForm
          pending={addLine.isPending}
          serverErrors={serverErrors}
          onSubmit={(values) => void addCustomLine(values)}
        />
      ) : null}
    </Sheet>
  );
}
