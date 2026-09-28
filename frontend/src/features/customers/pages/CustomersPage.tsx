import { Search, UserPlus, Users } from "lucide-react";
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
import { useCustomers, type Customer, type CustomerFilters } from "../api";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { CustomerList } from "../components/CustomerList";
import { TYPE_LABELS, TYPE_ORDER } from "../schemas";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách khách hàng"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** Khách hàng (M3-01): Sale/Manager manage customers (customer.manage, scope all — sổ dùng chung);
 * TECH_LEAD reads (customer.read); everyone else gets the app shell's 403. */
export function CustomersPage() {
  usePageTitle("Khách hàng");
  const me = useMe();
  const [q, setQ] = useState("");
  const [type, setType] = useState<CustomerFilters["type"]>("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Customer | "new" | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);

  const filters: CustomerFilters = { q: debouncedQ, type, limit: PAGE_SIZE, offset };
  const customers = useCustomers(filters);

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
  if (!("customer.read" in capabilities)) return <ForbiddenPage />;
  const canManage = "customer.manage" in capabilities;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Tìm kiếm"
            placeholder="Tên, số điện thoại, mã số thuế…"
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
            label="Loại khách hàng"
            value={type}
            onChange={(event) => {
              setType(event.target.value as CustomerFilters["type"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            {TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        {canManage ? (
          <Button
            icon={<UserPlus aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSelected("new");
            }}
          >
            Thêm khách hàng
          </Button>
        ) : null}
      </div>

      {customers.isPending ? (
        <Waiting />
      ) : customers.isError ? (
        <EmptyState
          icon={Users}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void customers.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : customers.data.items.length === 0 ? (
        <EmptyState icon={Users} message="Chưa có khách hàng phù hợp." />
      ) : (
        <>
          <CustomerList items={customers.data.items} onSelect={setSelected} />
          <Pagination
            total={customers.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {selected ? (
        <CustomerFormSheet
          key={selected === "new" ? "new" : selected.id}
          onClose={() => {
            setSelected(null);
          }}
          customer={selected === "new" ? undefined : selected}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
