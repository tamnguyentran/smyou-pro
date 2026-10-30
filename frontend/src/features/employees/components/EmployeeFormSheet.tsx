import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
  type Role,
} from "../api";
import { fieldErrors } from "../errors";
import { formatDate } from "../../../lib/format";
import { useActiveDepartments } from "../../departments/api";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  PROFILE_FIELDS,
  USERNAME_MESSAGE,
  USERNAME_PATTERN,
  ROLE_ORDER,
  employeeFormSchema,
  type EmployeeFormValues,
} from "../schemas";
import { StatusBadges } from "./EmployeeList";
import { TemporaryPasswordDialog } from "./TemporaryPasswordDialog";

type ConfirmKind = "deactivate" | "activate" | "reset" | null;
const ROLES_FIELD = "roles";
// M15-01: Manager always comes bundled with Sale/CSKH/QLKT, and can never be Technician too.
const MANAGER_BUNDLE: Role[] = ["SALE", "CUSTOMER_CARE", "TECH_LEAD"];

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
  const managerSelected = selected.has("MANAGER");
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-heading">Vai trò</legend>
      <div className="space-y-1">
        {ROLE_ORDER.map((role) => {
          // Sale/CSKH/QLKT are forced on (and locked) while Manager is ticked; Technician is
          // forced off (and locked) — a Manager can never also be a Technician (M15-01).
          const locked = managerSelected && role !== "MANAGER";
          const checked = role === "TECHNICIAN" && managerSelected ? false : selected.has(role);
          return (
            <label key={role} className="flex min-h-11 items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={() => {
                  if (!locked) onToggle(role);
                }}
                className="size-5 rounded border-line text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              />
              {ROLE_LABELS[role]}
            </label>
          );
        })}
      </div>
      {error ? <p className="mt-1 text-xs font-medium text-urgent-fg">{error}</p> : null}
    </fieldset>
  );
}

const FORM_ID = "employee-form";

/** M17-03a optional profile: blank → null (the server trims too). */
function profileBody(values: EmployeeFormValues) {
  return {
    birth_date: values.birth_date || null,
    birth_place: values.birth_place || null,
    gender: (values.gender || null) as Employee["gender"],
    address: values.address || null,
    id_number: values.id_number || null,
    id_issued_date: values.id_issued_date || null,
    id_issued_place: values.id_issued_place || null,
    marital_status: (values.marital_status || null) as Employee["marital_status"],
  };
}

/** Today in Asia/Ho_Chi_Minh as YYYY-MM-DD — the latest selectable birth/issue date (AC-EMP-066). */
function todayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
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
  const departmentsQuery = useActiveDepartments(!readOnly);
  const activeDepartments = departmentsQuery.data ?? [];
  const departmentPlaceholder = departmentsQuery.isLoading
    ? "Đang tải phòng ban…"
    : departmentsQuery.isError
      ? "Không tải được danh sách phòng ban"
      : "Chọn phòng ban";
  // The current department is always an option (keyed by id, so the selected <option> node survives
  // the list loading); an inactive one stays selectable only for this employee (M17-02b §6).
  const current = employee?.department;
  const departmentOptions =
    current && !activeDepartments.some((d) => d.id === current.id)
      ? [current, ...activeDepartments]
      : activeDepartments;
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
  const [tempPassword, setTempPassword] = useState<{
    name: string;
    username: string;
    password: string;
  } | null>(null);
  const [changeLogin, setChangeLogin] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState<string | null>(null);

  const { register, handleSubmit, formState, setValue } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      full_name: employee?.full_name ?? "",
      username: employee?.username ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      department_id: employee?.department.id ?? "",
      title: employee?.title ?? "",
      ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, employee?.[f] ?? ""])),
    },
  });
  const today = todayInVietnam();
  const fieldError = (name: keyof EmployeeFormValues) =>
    formState.errors[name]?.message ?? serverErrors[name];

  const isSelf = employee !== undefined && session?.employee.id === employee.id;
  const title = employee ? (readOnly ? "Chi tiết nhân viên" : "Sửa nhân viên") : "Thêm nhân viên";
  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [EMPLOYEES_KEY] });
  };

  const toggleRole = (role: Role) => {
    setRolesTouched(true);
    setSelectedRoles((current) => {
      const next = new Set(current);
      if (role === "MANAGER") {
        if (next.has("MANAGER")) {
          next.delete("MANAGER"); // bundled roles stay as-is, now unlocked (M15-01)
        } else {
          next.add("MANAGER");
          for (const bundled of MANAGER_BUNDLE) next.add(bundled);
          next.delete("TECHNICIAN");
        }
        return next;
      }
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
          email: values.email || null,
          phone: values.phone || null,
          ...profileBody(values),
          department_id: values.department_id,
          title: values.title || null,
          roles,
        });
        setTempPassword({
          name: created.employee.full_name,
          username: created.employee.username,
          password: created.temporary_password,
        });
        return;
      }
      let version = employee.version;
      const username = values.username.trim().toLowerCase();
      const usernameChanged = changeLogin && username !== employee.username;
      // Only a new value is validated: generated usernames may be shorter than 3 chars.
      if (usernameChanged && !USERNAME_PATTERN.test(username)) {
        setServerErrors({ username: USERNAME_MESSAGE });
        return;
      }
      const infoChanged =
        usernameChanged ||
        values.full_name !== employee.full_name ||
        (values.email || "") !== (employee.email ?? "") ||
        (values.phone || "") !== (employee.phone ?? "") ||
        PROFILE_FIELDS.some((f) => (values[f] || "") !== (employee[f] ?? "")) ||
        values.department_id !== employee.department.id ||
        (values.title || "") !== (employee.title ?? "");
      if (infoChanged) {
        const updated = await update.mutateAsync({
          id: employee.id,
          body: {
            version,
            full_name: values.full_name,
            ...(usernameChanged ? { username } : {}),
            email: values.email || null,
            phone: values.phone || null,
            ...profileBody(values),
            department_id: values.department_id,
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
        username={tempPassword.username}
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
        wide
        // Esc/overlay must reach only the topmost sheet: while a ConfirmDialog or the reset-password
        // dialog sits on top, this outer one ignores them — both sheets listen on `document`, independently.
        dismissible={
          !(create.isPending || update.isPending || setRolesCommand.isPending) &&
          confirming === null &&
          resetPasswordValue === null
        }
        footer={
          readOnly ? undefined : showReload ? (
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
              form={FORM_ID}
              loading={create.isPending || update.isPending || setRolesCommand.isPending}
            >
              Lưu
            </Button>
          )
        }
      >
        {readOnly ? (
          <div className="space-y-4">
            <dl className="divide-y divide-line">
              {(
                [
                  ["Mã", employee.code],
                  ["Họ và tên", employee.full_name],
                  ["Ngày sinh", employee.birth_date ? formatDate(employee.birth_date) : "—"],
                  ["Nơi sinh", employee.birth_place ?? "—"],
                  ["Giới tính", employee.gender ? GENDER_LABELS[employee.gender] : "—"],
                  ["SĐT", employee.phone ?? "—"],
                  ["Địa chỉ", employee.address ?? "—"],
                  ["Email", employee.email ?? "—"],
                  ["CMND/CCCD", employee.id_number ?? "—"],
                  ["Ngày cấp", employee.id_issued_date ? formatDate(employee.id_issued_date) : "—"],
                  ["Nơi cấp", employee.id_issued_place ?? "—"],
                  [
                    "Tình trạng hôn nhân",
                    employee.marital_status ? MARITAL_STATUS_LABELS[employee.marital_status] : "—",
                  ],
                  ["Phòng ban", employee.department.name],
                  ["Chức danh", employee.title ?? "—"],
                ] as [string, ReactNode][]
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-medium text-heading">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 py-2 text-sm">
                <dt className="text-muted">Trạng thái</dt>
                <dd>
                  <StatusBadges employee={employee} />
                </dd>
              </div>
            </dl>
            <RoleField selected={selectedRoles} onToggle={toggleRole} readOnly error={null} />
          </div>
        ) : (
          <form
            id={FORM_ID}
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="space-y-4"
          >
            {formMessage ? <Alert>{formMessage}</Alert> : null}
            {/* Field order follows the company's paper profile (M17-03a §2); 2 columns from lg. */}
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Mã NV"
                value={employee?.code ?? ""}
                placeholder="Tự sinh khi lưu"
                disabled
                readOnly
              />
              <TextField
                label="Họ và tên"
                error={fieldError("full_name")}
                {...register("full_name")}
              />
              <TextField
                label="Ngày sinh"
                type="date"
                max={today}
                error={fieldError("birth_date")}
                {...register("birth_date")}
              />
              <TextField
                label="Nơi sinh"
                error={fieldError("birth_place")}
                {...register("birth_place")}
              />
              <Select label="Giới tính" error={fieldError("gender")} {...register("gender")}>
                <option value="">—</option>
                {Object.entries(GENDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <TextField label="SĐT" error={serverErrors.phone} {...register("phone")} />
              <TextField label="Địa chỉ" error={fieldError("address")} {...register("address")} />
              <TextField
                label="Email"
                type="email"
                error={fieldError("email")}
                {...register("email")}
              />
              <TextField
                label="CMND/CCCD"
                error={fieldError("id_number")}
                {...register("id_number")}
              />
              <TextField
                label="Ngày cấp"
                type="date"
                max={today}
                error={fieldError("id_issued_date")}
                {...register("id_issued_date")}
              />
              <TextField
                label="Nơi cấp"
                error={fieldError("id_issued_place")}
                {...register("id_issued_place")}
              />
              <Select
                label="Tình trạng hôn nhân"
                error={fieldError("marital_status")}
                {...register("marital_status")}
              >
                <option value="">—</option>
                {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                label="Phòng ban"
                error={formState.errors.department_id?.message ?? serverErrors.department_id}
                {...register("department_id")}
              >
                <option value="">{departmentPlaceholder}</option>
                {departmentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.is_active ? d.name : `${d.name} (ngừng hoạt động)`}
                  </option>
                ))}
              </Select>
              <TextField label="Chức danh" error={serverErrors.title} {...register("title")} />
            </div>
            {employee ? (
              <fieldset className="space-y-3 border-t border-line pt-4">
                <legend className="text-sm font-semibold text-heading">Thông tin đăng nhập</legend>
                <label className="flex min-h-11 items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    checked={changeLogin}
                    onChange={(e) => {
                      setChangeLogin(e.target.checked);
                      if (!e.target.checked) {
                        setValue("username", employee.username);
                        setServerErrors((prev) =>
                          Object.fromEntries(
                            Object.entries(prev).filter(([k]) => k !== "username"),
                          ),
                        );
                      }
                    }}
                    className="size-5 rounded border-line text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                  Thay đổi thông tin đăng nhập
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label="Tên đăng nhập"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={!changeLogin}
                    error={fieldError("username")}
                    {...register("username")}
                  />
                  <p className="flex min-h-11 items-center text-sm text-body md:mt-6">
                    {`Trạng thái: ${employee.is_active ? "Đang hoạt động" : "Đã khoá"}`}
                  </p>
                </div>
              </fieldset>
            ) : null}
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
          username={employee?.username}
          password={resetPasswordValue}
          onClose={() => {
            setResetPasswordValue(null);
          }}
        />
      ) : null}
    </>
  );
}
