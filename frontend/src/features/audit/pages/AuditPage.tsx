import { History } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { DateField } from "../../../components/ui/DateField";
import { defaultMonthToDateRange } from "../../../lib/dateRange";
import { useMe } from "../../me/api";
import { useAuditEvents, useEmployeeDirectory, type AuditEventFilters } from "../api";
import { AuditEventList } from "../components/AuditEventList";
import { BUSINESS_AREA_LABELS } from "../labels";

const PAGE_SIZE = 20;
const EMPTY_FILTERS: AuditEventFilters = {
  businessArea: "",
  actorId: "",
  occurredFrom: "",
  occurredTo: "",
  limit: PAGE_SIZE,
  offset: 0,
};
/** Mặc định đầu tháng hiện tại → hôm nay (quyết định 2026-10-20) — "Xoá lọc" vẫn về EMPTY_FILTERS
 * (không lọc ngày) chứ không phải về mặc định này. */
function defaultFilters(): AuditEventFilters {
  const { from, to } = defaultMonthToDateRange();
  return { ...EMPTY_FILTERS, occurredFrom: from, occurredTo: to };
}

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

/** Nhật ký hệ thống (M1-05, M21-04): Manager-only, filters by business area / actor / date range. */
export function AuditPage() {
  usePageTitle("Nhật ký hệ thống");
  const me = useMe();
  const [filters, setFilters] = useState<AuditEventFilters>(defaultFilters);
  const employees = useEmployeeDirectory();
  // Checked here so a reversed range never reaches the API (whose 422 would read as a load error).
  const rangeInvalid =
    filters.occurredFrom !== "" &&
    filters.occurredTo !== "" &&
    filters.occurredFrom > filters.occurredTo;
  const events = useAuditEvents(filters, { enabled: !rangeInvalid });
  const stale = rangeInvalid || (events.isPlaceholderData && events.isFetching);

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
          label="Nghiệp vụ"
          value={filters.businessArea}
          onChange={(event) => {
            setFilter("businessArea", event.target.value as AuditEventFilters["businessArea"]);
          }}
        >
          <option value="">Tất cả</option>
          {Object.entries(BUSINESS_AREA_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          label="Người thực hiện"
          value={filters.actorId}
          onChange={(event) => {
            setFilter("actorId", event.target.value);
          }}
        >
          <option value="">Tất cả</option>
          {(employees.data ?? []).map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name} ({employee.code})
            </option>
          ))}
        </Select>
        <DateField
          mode="date"
          label="Từ ngày"
          value={filters.occurredFrom}
          onChange={(value) => {
            setFilter("occurredFrom", value);
          }}
        />
        <DateField
          mode="date"
          label="Đến ngày"
          value={filters.occurredTo}
          error={rangeInvalid ? "Từ ngày không được sau Đến ngày." : undefined}
          onChange={(value) => {
            setFilter("occurredTo", value);
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

      {rangeInvalid && !events.data ? null : events.isPending ? (
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
          {/* Stale rows while a new filter loads (or a reversed range is shown) must not read as a match. */}
          <div
            aria-busy={stale || undefined}
            className={stale ? "opacity-50 transition-opacity" : "transition-opacity"}
          >
            <AuditEventList items={events.data.items} />
          </div>
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
