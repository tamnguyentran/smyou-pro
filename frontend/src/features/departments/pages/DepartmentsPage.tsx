import { Network, Plus } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { ApiError } from "../../auth/errors";
import { useMe } from "../../me/api";
import {
  useDepartments,
  useSetDepartmentActive,
  type Department,
  type DepartmentFilters,
} from "../api";
import { DepartmentFormSheet } from "../components/DepartmentFormSheet";
import { DepartmentList } from "../components/DepartmentList";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách phòng ban"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** M17-02a: chỉ Manager (`employee.manage`) quản lý danh sách "Phòng ban". */
export function DepartmentsPage() {
  usePageTitle("Phòng ban");
  const me = useMe();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [isActive, setIsActive] = useState<DepartmentFilters["is_active"]>("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [toggling, setToggling] = useState<Department | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);
  const setActive = useSetDepartmentActive();
  const departments = useDepartments({
    q: debouncedQ,
    is_active: isActive,
    limit: PAGE_SIZE,
    offset,
  });

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
  if (!("employee.manage" in me.data.capabilities)) return <ForbiddenPage />;

  const startToggle = (department: Department) => {
    setEditing(null);
    setToggleError(null);
    setToggling(department);
  };
  const closeToggle = () => {
    setToggling(null);
    setToggleError(null);
  };
  const runToggle = async () => {
    if (!toggling) return;
    const active = !toggling.is_active;
    try {
      await setActive.mutateAsync({ department: toggling, active });
      toast(active ? "Đã mở lại hoạt động phòng ban." : "Đã ngừng hoạt động phòng ban.");
      closeToggle();
    } catch (error) {
      setToggleError(
        error instanceof ApiError && error.problem.code === "STALE_VERSION"
          ? "Dữ liệu đã thay đổi, vui lòng tải lại."
          : error instanceof ApiError
            ? (error.problem.detail ?? "Không thực hiện được.")
            : "Không thực hiện được.",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Tìm kiếm"
            placeholder="Tên phòng ban…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
          />
          <Select
            label="Trạng thái"
            value={isActive}
            onChange={(event) => {
              setIsActive(event.target.value as DepartmentFilters["is_active"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Ngừng hoạt động</option>
          </Select>
        </div>
        <Button
          icon={<Plus aria-hidden="true" className="size-4" />}
          onClick={() => {
            setEditing("new");
          }}
        >
          Thêm phòng ban
        </Button>
      </div>

      {departments.isPending ? (
        <Waiting />
      ) : departments.isError ? (
        <EmptyState
          icon={Network}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void departments.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : departments.data.items.length === 0 ? (
        <EmptyState icon={Network} message="Chưa có phòng ban nào." />
      ) : (
        <>
          <DepartmentList
            items={departments.data.items}
            onEdit={setEditing}
            onToggle={startToggle}
          />
          <Pagination
            total={departments.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {editing ? (
        <DepartmentFormSheet
          key={editing === "new" ? "new" : editing.id}
          department={editing === "new" ? undefined : editing}
          onClose={() => {
            setEditing(null);
          }}
          onToggle={startToggle}
        />
      ) : null}
      {toggling ? (
        <ConfirmDialog
          open
          onClose={closeToggle}
          title={toggling.is_active ? "Ngừng hoạt động" : "Mở lại hoạt động"}
          message={
            toggling.is_active
              ? `Ngừng hoạt động phòng ban "${toggling.name}"? Có thể mở lại bất cứ lúc nào.`
              : `Mở lại hoạt động phòng ban "${toggling.name}"?`
          }
          confirmLabel={toggling.is_active ? "Ngừng hoạt động" : "Mở lại hoạt động"}
          onConfirm={() => void runToggle()}
          loading={setActive.isPending}
          error={toggleError}
        />
      ) : null}
    </div>
  );
}
