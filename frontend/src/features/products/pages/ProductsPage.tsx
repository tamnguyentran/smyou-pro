import { Monitor, Package, Search } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useMe } from "../../me/api";
import { useProducts, type Product, type ProductFilters } from "../api";
import { ProductFormSheet } from "../components/ProductFormSheet";
import { ProductList } from "../components/ProductList";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../schemas";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách sản phẩm"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** Danh mục sản phẩm (M2-01b): Manager manages products; Sale/TECH_LEAD read (catalog.read);
 * everyone else gets the app shell's 403 (the menu entry itself is Manager-only). */
export function ProductsPage() {
  usePageTitle("Sản phẩm");
  const me = useMe();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ProductFilters["category"]>("");
  const [isActive, setIsActive] = useState<ProductFilters["is_active"]>("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Product | "new" | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);

  const filters: ProductFilters = {
    q: debouncedQ,
    category,
    is_active: isActive,
    limit: PAGE_SIZE,
    offset,
  };
  const products = useProducts(filters);

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting />;
  const capabilities = me.data.capabilities;
  if (!("catalog.read" in capabilities)) return <ForbiddenPage />;
  const canManage = "catalog.manage" in capabilities;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <TextField
            label="Tìm kiếm"
            placeholder="Mã hàng, tên sản phẩm…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
            trailing={
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
              >
                <Search className="size-4" />
              </span>
            }
          />
          <Select
            label="Danh mục"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as ProductFilters["category"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            {CATEGORY_ORDER.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            label="Trạng thái"
            value={isActive}
            onChange={(event) => {
              setIsActive(event.target.value as ProductFilters["is_active"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang kinh doanh</option>
            <option value="false">Đã ngừng kinh doanh</option>
          </Select>
        </div>
        {canManage ? (
          <Button
            icon={<Monitor aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSelected("new");
            }}
          >
            Thêm sản phẩm
          </Button>
        ) : null}
      </div>

      {products.isPending ? (
        <Waiting />
      ) : products.isError ? (
        <EmptyState
          icon={Package}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void products.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : products.data.items.length === 0 ? (
        <EmptyState icon={Package} message="Chưa có sản phẩm phù hợp." />
      ) : (
        <>
          <ProductList items={products.data.items} onSelect={setSelected} />
          <Pagination
            total={products.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {selected ? (
        <ProductFormSheet
          key={selected === "new" ? "new" : selected.id}
          onClose={() => {
            setSelected(null);
          }}
          product={selected === "new" ? undefined : selected}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
