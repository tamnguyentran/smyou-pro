import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ROLE_LABELS } from "../../../app/menu";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { useSession } from "../../auth/api";
import { ApiError } from "../../auth/errors";
import {
  EMPLOYEES_KEY,
  useActivateEmployee,
  useCreateEmployee,
  useDeactivateEmployee,
  useResetPassword,
  useSetRoles,
  useUpdateEmployee,
  type Employee,
  type EmployeeCreateBody,
  type EmployeeUpdateBody,
  type Role,
} from "../api";
import { fieldErrors } from "../errors";
import {
  DEPARTMENT_LABELS,
  ROLE_ORDER,
  employeeFormSchema,
  type EmployeeFormValues,
} from "../schemas";
import { TemporaryPasswordDialog } from "./TemporaryPasswordDialog";

type ConfirmKind = "deactivate" | "activate" | "reset" | null;
const ROLES_FIELD = "roles";

function rolesErrorFrom(errors: Record<string, string>): string | null {
  const entry = Object.entries(errors).find(
    ([k]) => k === ROLES_FIELD || k.startsWith(`${ROLES_FIELD}.`),
  );
  return entry?.[1] ?? null;
}

function RoleField({
  selected,
  onToggle,
  readOnly,
  error,
}: {
  selected: Set<Role>;
  onToggle: (role: Role) => void;
  readOnly: boolean;
  error: string | null;
}) {
  if (readOnly) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-medium text-heading">Vai trò</p>
        <div className="flex flex-wrap gap-1">
          {ROLE_ORDER.filter((role) => selected.has(role)).map((role) => (
            <Badge key={role} tone="neutral">
              {ROLE_LABELS[role]}
            </Badge>
          ))}
        </div>
      </div>
    );
  }
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-heading">Vai trò</legend>
      <div className="space-y-1">
        {ROLE_ORDER.map((role) => (
          <label key={role} className="flex min-h-11 items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={selected.has(role)}
              onChange={() => {
                onToggle(role);
              }}
              className="size-5 rounded border-line text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs font-medium text-urgent-fg">{error}</p> : null}
    </fieldset>
  );
}

/** Create or edit an employee (AC-EMP-014/015); read-only detail view for TECH_LEAD (AC-EMP-017);
 * roles and account state (khoá/mở/cấp lại mật khẩu, AC-EMP-016) live in the same sheet. */
export function EmployeeFormSheet({
  onClose,
  employee: initialEmployee,
  canManage,
}: {
  onClose: () => void;
  employee?: Employee;
  canManage: boolean;
}) {
  // The working copy: updated after every successful command (roles/deactivate/activate/reset),
  // so a second action in the same open sheet uses the fresh `version`, not the one from open time
  // (review round 1: otherwise it looked like STALE_VERSION even though nobody else touched the row).
  const [employee, setEmployee] = useState<Employee | undefined>(initialEmployee);
  const readOnly = employee !== undefined && !canManage;
  const { data: session } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const setRolesCommand = useSetRoles();
  const deactivate = useDeactivateEmployee();
  const activate = useActivateEmployee();
  const resetPassword = useResetPassword();

  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(
    () => new Set((employee?.roles ?? []) as Role[]),
  );
  const [rolesTouched, setRolesTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      full_name: employee?.full_name ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      department: employee?.department ?? "",
      title: employee?.title ?? "",
    },
  });

  const isSelf = employee !== undefined && session?.employee.id === employee.id;
  const title = employee ? (readOnly ? "Chi tiết nhân viên" : "Sửa nhân viên") : "Thêm nhân viên";
  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [EMPLOYEES_KEY] });
  };

  const toggleRole = (role: Role) => {
    setRolesTouched(true);
    setSelectedRoles((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerErrors({});
    setFormMessage(null);
    setShowReload(false);
    if (selectedRoles.size === 0) {
      setRolesTouched(true);
      return;
    }
    const roles = Array.from(selectedRoles);
    try {
      if (!employee) {
        const created = await create.mutateAsync({
          full_name: values.full_name,
          email: values.email,
          phone: values.phone || null,
          department: values.department as EmployeeCreateBody["department"],
          title: values.title || null,
          roles,
        });
        setTempPassword({ name: created.employee.full_name, password: created.temporary_password });
        return;
      }
      let version = employee.version;
      const infoChanged =
        values.full_name !== employee.full_name ||
        values.email !== employee.email ||
        (values.phone || "") !== (employee.phone ?? "") ||
        values.department !== employee.department ||
        (values.title || "") !== (employee.title ?? "");
      if (infoChanged) {
        const updated = await update.mutateAsync({
          id: employee.id,
          body: {
            version,
            full_name: values.full_name,
            email: values.email,
            phone: values.phone || null,
            department: values.department as EmployeeUpdateBody["department"],
            title: values.title || null,
          },
        });
        version = updated.version;
        setEmployee(updated);
      }
      const rolesChanged =
        selectedRoles.size !== employee.roles.length ||
        !employee.roles.every((role) => selectedRoles.has(role as Role));
      if (rolesChanged) {
        const withRoles = await setRolesCommand.mutateAsync({ id: employee.id, version, roles });
        setEmployee(withRoles);
      }
      toast("Đã cập nhật.");
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.problem.code === "STALE_VERSION") setShowReload(true);
        setFormMessage(error.problem.detail ?? "Không thực hiện được. Vui lòng thử lại.");
        setServerErrors(fieldErrors(error));
      } else {
        setFormMessage("Không thực hiện được. Vui lòng thử lại.");
      }
    }
  });

  const runConfirm = async () => {
    if (!employee) return;
    setConfirmError(null);
    try {
      if (confirming === "deactivate") {
        setEmployee(await deactivate.mutateAsync({ id: employee.id, version: employee.version }));
      } else if (confirming === "activate") {
        setEmployee(await activate.mutateAsync({ id: employee.id, version: employee.version }));
      } else if (confirming === "reset") {
        const result = await resetPassword.mutateAsync({
          id: employee.id,
          version: employee.version,
        });
        setEmployee(result.employee);
        setResetPasswordValue(result.temporary_password);
      }
      invalidateList();
      setConfirming(null);
    } catch (error) {
      setConfirmError(
        error instanceof ApiError
          ? (error.problem.detail ?? "Không thực hiện được.")
          : "Không thực hiện được.",
      );
    }
  };

  const confirmRunning = deactivate.isPending || activate.isPending || resetPassword.isPending;

  if (tempPassword) {
    return (
      <TemporaryPasswordDialog
        open
        password={tempPassword.password}
        onClose={() => {
          const name = tempPassword.name;
          setTempPassword(null);
          invalidateList();
          toast(`Đã thêm nhân viên ${name}.`);
          onClose();
        }}
      />
    );
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={title}
        // Esc/overlay must reach only the topmost sheet: while a ConfirmDialog or the reset-password
        // dialog sits on top, this outer one ignores them — both sheets listen on `document`, independently.
        dismissible={
          !(create.isPending || update.isPending || setRolesCommand.isPending) &&
          confirming === null &&
          resetPasswordValue === null
        }
      >
        {readOnly ? (
          <div className="space-y-4">
            <dl className="divide-y divide-line">
              {[
                ["Họ và tên", employee.full_name],
                ["Email", employee.email],
                ["SĐT", employee.phone ?? "—"],
                ["Bộ phận", DEPARTMENT_LABELS[employee.department] ?? employee.department],
                ["Chức danh", employee.title ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium text-heading">{value}</dd>
                </div>
              ))}
            </dl>
            <RoleField selected={selectedRoles} onToggle={toggleRole} readOnly error={null} />
          </div>
        ) : (
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
            {formMessage ? <Alert>{formMessage}</Alert> : null}
            <TextField
              label="Họ và tên"
              error={formState.errors.full_name?.message ?? serverErrors.full_name}
              {...register("full_name")}
            />
            <TextField
              label="Email"
              type="email"
              error={formState.errors.email?.message ?? serverErrors.email}
              {...register("email")}
            />
            <TextField label="SĐT" error={serverErrors.phone} {...register("phone")} />
            <Select
              label="Bộ phận"
              error={formState.errors.department?.message ?? serverErrors.department}
              {...register("department")}
            >
              <option value="">-- Chọn bộ phận --</option>
              {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <TextField label="Chức danh" error={serverErrors.title} {...register("title")} />
            <RoleField
              selected={selectedRoles}
              onToggle={toggleRole}
              readOnly={false}
              error={
                rolesTouched && selectedRoles.size === 0
                  ? "Cần chọn ít nhất một vai trò."
                  : rolesErrorFrom(serverErrors)
              }
            />
            {showReload ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  invalidateList();
                  onClose();
                }}
              >
                Tải lại
              </Button>
            ) : (
              <Button
                type="submit"
                loading={create.isPending || update.isPending || setRolesCommand.isPending}
              >
                Lưu
              </Button>
            )}
            {employee && canManage ? (
              <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                {employee.is_active && !isSelf ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming("deactivate");
                    }}
                  >
                    Khoá tài khoản
                  </Button>
                ) : null}
                {!employee.is_active ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming("activate");
                    }}
                  >
                    Mở khoá
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConfirming("reset");
                  }}
                >
                  Cấp lại mật khẩu
                </Button>
              </div>
            ) : null}
          </form>
        )}
      </Sheet>
      {confirming ? (
        <ConfirmDialog
          open
          onClose={() => {
            setConfirming(null);
            setConfirmError(null);
          }}
          title={
            confirming === "deactivate"
              ? "Khoá tài khoản"
              : confirming === "activate"
                ? "Mở khoá"
                : "Cấp lại mật khẩu"
          }
          message={
            confirming === "deactivate"
              ? "Nhân viên sẽ bị đăng xuất khỏi mọi thiết bị."
              : confirming === "activate"
                ? "Nhân viên sẽ đăng nhập lại được bằng mật khẩu hiện tại."
                : "Mật khẩu cũ sẽ không dùng được nữa."
          }
          confirmLabel={
            confirming === "deactivate"
              ? "Khoá tài khoản"
              : confirming === "activate"
                ? "Mở khoá"
                : "Cấp lại mật khẩu"
          }
          onConfirm={() => void runConfirm()}
          loading={confirmRunning}
          error={confirmError}
        />
      ) : null}
      {resetPasswordValue ? (
        <TemporaryPasswordDialog
          open
          password={resetPasswordValue}
          onClose={() => {
            setResetPasswordValue(null);
          }}
        />
      ) : null}
    </>
  );
}
