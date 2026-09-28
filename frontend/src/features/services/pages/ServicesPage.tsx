import { Hammer, Search, Wrench } from "lucide-react";
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
import { useServices, type Service, type ServiceFilters } from "../api";
import { ServiceFormSheet } from "../components/ServiceFormSheet";
import { ServiceList } from "../components/ServiceList";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../schemas";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách dịch vụ"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** Danh mục dịch vụ (M2-02): Manager manages services; Sale/TECH_LEAD read (catalog.read);
 * everyone else gets the app shell's 403 (the menu entry itself is Manager-only). */
export function ServicesPage() {
  usePageTitle("Dịch vụ");
  const me = useMe();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ServiceFilters["category"]>("");
  const [isActive, setIsActive] = useState<ServiceFilters["is_active"]>("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Service | "new" | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);

  const filters: ServiceFilters = {
    q: debouncedQ,
    category,
    is_active: isActive,
    limit: PAGE_SIZE,
    offset,
  };
  const services = useServices(filters);

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
            placeholder="Mã dịch vụ, tên dịch vụ…"
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
              setCategory(event.target.value as ServiceFilters["category"]);
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
              setIsActive(event.target.value as ServiceFilters["is_active"]);
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
            icon={<Hammer aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSelected("new");
            }}
          >
            Thêm dịch vụ
          </Button>
        ) : null}
      </div>

      {services.isPending ? (
        <Waiting />
      ) : services.isError ? (
        <EmptyState
          icon={Wrench}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void services.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : services.data.items.length === 0 ? (
        <EmptyState icon={Wrench} message="Chưa có dịch vụ phù hợp." />
      ) : (
        <>
          <ServiceList items={services.data.items} onSelect={setSelected} />
          <Pagination
            total={services.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {selected ? (
        <ServiceFormSheet
          key={selected === "new" ? "new" : selected.id}
          onClose={() => {
            setSelected(null);
          }}
          service={selected === "new" ? undefined : selected}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
