import { Copy, Target } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { DateField } from "../../../components/ui/DateField";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { ApiError } from "../../auth/errors";
import { useActiveDepartments } from "../../departments/api";
import { useMe } from "../../me/api";
import { useDeleteKpiTarget, useKpiTargets, type KpiTargetRow } from "../api";
import { CopyTargetsSheet } from "../components/CopyTargetsSheet";
import { KpiTargetList } from "../components/KpiTargetList";
import { currentMonth, monthLabel } from "../month";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải chỉ tiêu"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** M21-01b: chỉ Manager (`kpi_target.manage`) đặt chỉ tiêu "Thu nhập thuần" theo tháng. */
export function KpiTargetsPage() {
  usePageTitle("Thiết lập doanh thu KPI");
  const me = useMe();
  const toast = useToast();
  const [month, setMonth] = useState(() => currentMonth());
  const [departmentId, setDepartmentId] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState<KpiTargetRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);
  const [appliedQ, setAppliedQ] = useState(debouncedQ);
  if (appliedQ !== debouncedQ) {
    // Reset to page 1 only when the debounced term lands, so no stale-term request fires.
    setAppliedQ(debouncedQ);
    setOffset(0);
  }
  const allowed = me.data ? "kpi_target.manage" in me.data.capabilities : false;
  const departments = useActiveDepartments(allowed);
  const remove = useDeleteKpiTarget();
  const targets = useKpiTargets({
    month: allowed ? month : "",
    department_id: departmentId,
    q: debouncedQ,
    limit: PAGE_SIZE,
    offset,
  });
  const page = targets.data;
  if (
    page &&
    !targets.isPlaceholderData &&
    page.items.length === 0 &&
    page.total > 0 &&
    offset >= page.total
  ) {
    // The list shrank under us (e.g. someone deactivated an employee): fall back to the last page.
    setOffset(Math.floor((page.total - 1) / PAGE_SIZE) * PAGE_SIZE);
  }

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
  if (!allowed) return <ForbiddenPage />;

  const closeDelete = () => {
    setDeleting(null);
    setDeleteError(null);
  };
  const runDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ row: deleting, month });
      toast("Đã xoá chỉ tiêu");
      closeDelete();
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? (error.problem.detail ?? "Không xoá được.") : "Không xoá được.",
      );
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-body">Chỉ tiêu thu nhập thuần theo tháng cho từng nhân viên</p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <DateField
            mode="month"
            label="Tháng"
            value={month}
            hint={`Tháng ${monthLabel(month)}`}
            onChange={(next) => {
              if (!next) return;
              setMonth(next);
              setOffset(0);
            }}
          />
          <Select
            label="Phòng ban"
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Tất cả phòng ban</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <TextField
            label="Tìm"
            placeholder="Tên, SĐT hoặc email"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </div>
        <Button
          variant="secondary"
          className="lg:mt-7"
          icon={<Copy aria-hidden="true" className="size-4" />}
          onClick={() => {
            setCopying(true);
          }}
        >
          Copy sang tháng sau
        </Button>
      </div>

      {targets.isPending ? (
        <Waiting />
      ) : targets.isError ? (
        <EmptyState
          icon={Target}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void targets.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : targets.data.total === 0 ? (
        <EmptyState icon={Target} message="Không có nhân viên phù hợp" />
      ) : (
        <>
          <KpiTargetList
            items={targets.data.items}
            month={month}
            onDelete={(row) => {
              setDeleteError(null);
              setDeleting(row);
            }}
          />
          <Pagination
            total={targets.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {copying ? (
        <CopyTargetsSheet
          month={month}
          onClose={() => {
            setCopying(false);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onClose={closeDelete}
          title="Xoá chỉ tiêu"
          message={`Xoá chỉ tiêu tháng ${monthLabel(month)} của ${deleting.employee_name}?`}
          confirmLabel="Xoá chỉ tiêu"
          onConfirm={() => void runDelete()}
          loading={remove.isPending}
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
