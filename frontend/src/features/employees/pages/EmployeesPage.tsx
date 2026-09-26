import { Search, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { ROLE_LABELS } from "../../../app/menu";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useMe } from "../../me/api";
import { useEmployees, type Employee, type EmployeeFilters } from "../api";
import { EmployeeFormSheet } from "../components/EmployeeFormSheet";
import { EmployeeList } from "../components/EmployeeList";

const PAGE_SIZE = 20;

function Waiting() {
  return <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-sidebar-sub" />;
}

function Pagination({
  total,
  limit,
  offset,
  onOffset,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (offset: number) => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="flex items-center justify-between text-sm text-body">
      <p>{`${String(from)}–${String(to)} / ${String(total)}`}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => {
            onOffset(Math.max(0, offset - limit));
          }}
        >
          Trang trước
        </Button>
        <Button
          variant="secondary"
          disabled={to >= total}
          onClick={() => {
            onOffset(offset + limit);
          }}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}

/** Nhân sự & phân quyền (M1-04b): Manager manages employees; TECH_LEAD reads (Q36); everyone else
 * gets the app shell's 403 (the menu entry itself is Manager-only, per permissions.yaml). */
export function EmployeesPage() {
  usePageTitle("Nhân sự & phân quyền");
  const me = useMe();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<EmployeeFilters["role"]>("");
  const [isActive, setIsActive] = useState<EmployeeFilters["is_active"]>("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Employee | "new" | null>(null);
  const debouncedQ = useDebouncedValue(q, 300);

  const filters: EmployeeFilters = { q: debouncedQ, role, is_active: isActive, limit: PAGE_SIZE, offset };
  const employees = useEmployees(filters);

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
  if (!("employee.read" in capabilities)) return <ForbiddenPage />;
  const canManage = "employee.manage" in capabilities;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <TextField
            label="Tìm kiếm"
            placeholder="Tên, mã, email, SĐT…"
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
            label="Vai trò"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as EmployeeFilters["role"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="Trạng thái"
            value={isActive}
            onChange={(event) => {
              setIsActive(event.target.value as EmployeeFilters["is_active"]);
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã khoá</option>
          </Select>
        </div>
        {canManage ? (
          <Button
            icon={<UserPlus aria-hidden="true" className="size-4" />}
            onClick={() => { setSelected("new"); }}
          >
            Thêm nhân viên
          </Button>
        ) : null}
      </div>

      {employees.isPending ? (
        <Waiting />
      ) : employees.isError ? (
        <EmptyState
          icon={Users}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void employees.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : employees.data.items.length === 0 ? (
        <EmptyState icon={Users} message="Chưa có nhân viên phù hợp." />
      ) : (
        <>
          <EmployeeList items={employees.data.items} onSelect={setSelected} />
          <Pagination total={employees.data.total} limit={PAGE_SIZE} offset={offset} onOffset={setOffset} />
        </>
      )}

      {selected ? (
        <EmployeeFormSheet
          key={selected === "new" ? "new" : selected.id}
          onClose={() => { setSelected(null); }}
          employee={selected === "new" ? undefined : selected}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
