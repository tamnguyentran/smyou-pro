import { History } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import { useEmployees } from "../../employees/api";
import { useMe } from "../../me/api";
import { useAuditEvents, type AuditEventFilters } from "../api";
import { AuditEventList } from "../components/AuditEventList";

const PAGE_SIZE = 20;
const EMPTY_FILTERS: AuditEventFilters = {
  entityType: "",
  actorId: "",
  occurredFrom: "",
  occurredTo: "",
  limit: PAGE_SIZE,
  offset: 0,
};

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải nhật ký"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** Nhật ký hệ thống (M1-05): Manager-only, filters by entity type / actor / date range. */
export function AuditPage() {
  usePageTitle("Nhật ký hệ thống");
  const me = useMe();
  const [filters, setFilters] = useState<AuditEventFilters>(EMPTY_FILTERS);
  const employees = useEmployees({ q: "", role: "", is_active: "", limit: 100, offset: 0 });
  const events = useAuditEvents(filters);

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
  if (!("audit.read" in me.data.capabilities)) return <ForbiddenPage />;

  function setFilter<K extends keyof AuditEventFilters>(key: K, value: AuditEventFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, offset: 0 }));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Loại đối tượng"
          value={filters.entityType}
          onChange={(event) => {
            setFilter("entityType", event.target.value as AuditEventFilters["entityType"]);
          }}
        >
          <option value="">Tất cả</option>
          <option value="EMPLOYEE">Nhân viên</option>
        </Select>
        <Select
          label="Người thực hiện"
          value={filters.actorId}
          onChange={(event) => {
            setFilter("actorId", event.target.value);
          }}
        >
          <option value="">Tất cả</option>
          {(employees.data?.items ?? []).map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name} ({employee.code})
            </option>
          ))}
        </Select>
        <TextField
          type="date"
          label="Từ ngày"
          value={filters.occurredFrom}
          onChange={(event) => {
            setFilter("occurredFrom", event.target.value);
          }}
        />
        <TextField
          type="date"
          label="Đến ngày"
          value={filters.occurredTo}
          onChange={(event) => {
            setFilter("occurredTo", event.target.value);
          }}
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          setFilters(EMPTY_FILTERS);
        }}
      >
        Xoá lọc
      </Button>

      {events.isPending ? (
        <Waiting />
      ) : events.isError ? (
        <EmptyState
          icon={History}
          message="Không tải được nhật ký."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void events.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : events.data.items.length === 0 ? (
        <EmptyState icon={History} message="Chưa có nhật ký nào khớp với bộ lọc." />
      ) : (
        <>
          <AuditEventList items={events.data.items} />
          <Pagination
            total={events.data.total}
            limit={PAGE_SIZE}
            offset={filters.offset}
            onOffset={(offset) => {
              setFilters((prev) => ({ ...prev, offset }));
            }}
          />
        </>
      )}
    </div>
  );
}
