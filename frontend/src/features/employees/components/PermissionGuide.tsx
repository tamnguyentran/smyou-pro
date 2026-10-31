import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { visibleMenu } from "../../../app/menu";
import { Select } from "../../../components/ui/Select";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import matrix from "../permissionMatrix.json";
import { CAPABILITY_LABELS, SCOPE_LABELS } from "../permissionLabels";
import { widestScope } from "../permissionScope";

interface Matrix {
  roles: Record<string, string>;
  scopes: string[];
  groups: {
    label: string;
    capabilities: { id: string; roles: Record<string, string | undefined> }[];
  }[];
}
/** Generated from spec/permissions.yaml by `make contract` (AC-EMP-080) — never edit by hand. */
const MATRIX: Matrix = matrix;
const ROLES = Object.keys(MATRIX.roles);

const PRINCIPLES = [
  <>
    Mỗi nhân viên có một hoặc nhiều <strong>vai trò</strong>. Vai trò quyết định{" "}
    <strong>quyền</strong> (được làm gì) và <strong>phạm vi</strong> (trên dữ liệu nào).
  </>,
  <>
    Có nhiều vai trò thì được <strong>cộng gộp</strong> quyền; phạm vi rộng hơn được ưu tiên (Tất cả
    &gt; Của mình / Được giao).
  </>,
  "Tick Quản lý chung sẽ tự kèm Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật và không thể đồng thời là Nhân viên kỹ thuật.",
  "Menu chỉ hiện mục mà người dùng có quyền. Quyền được kiểm tra lại ở máy chủ mỗi lần thao tác, nên ẩn menu không phải là cách duy nhất chặn truy cập.",
  "Dữ liệu ngoài phạm vi sẽ báo “không tìm thấy”; thiếu quyền sẽ báo “không có quyền”.",
  "Hệ thống luôn giữ ít nhất 1 Quản lý chung đang hoạt động. Tài khoản bị khoá không đăng nhập được; mở khoá thì quyền trở lại như cũ.",
];
const FLOW = [
  "Quản lý chung thêm nhân viên & tick vai trò",
  "Hệ thống tính quyền = hợp quyền các vai trò",
  "Nhân viên đăng nhập, menu hiện theo quyền",
  "Mỗi thao tác, máy chủ kiểm tra quyền + phạm vi",
  "Mọi đổi vai trò/khoá/mở khoá được ghi Nhật ký hệ thống",
];
const MANAGER_NOTE =
  "Gồm cả quyền của Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật (tự kèm)";
const SCOPE_HELP =
  "Tất cả = mọi bản ghi · Của mình = bản ghi mình tạo (đơn, khách hàng) hoặc dòng hàng ghi doanh số cho mình (báo cáo doanh thu) · Được giao = đơn/đầu việc mình đang hoặc từng được giao · Bản thân = chỉ dữ liệu của chính mình.";

/** "Parent › Child" labels of the menu the role would see (same projection as the app menu). */
function screensOf(role: string): string[] {
  const capabilities = Object.fromEntries(
    MATRIX.groups.flatMap((g) =>
      g.capabilities.filter((c) => widestScope(c.roles, role)).map((c) => [c.id, true]),
    ),
  );
  return visibleMenu(capabilities).flatMap((item) =>
    item.children.length
      ? item.children.map((child) => `${item.label} › ${child.label}`)
      : [item.label],
  );
}

const label = (capability: string) => CAPABILITY_LABELS[capability] ?? capability;

function RoleList({ role }: { role: string }) {
  const screensId = useId();
  return (
    <div className="space-y-4">
      {role === "MANAGER" ? <p className="text-sm text-muted">{MANAGER_NOTE}</p> : null}
      <div className="space-y-2">
        <h4 id={screensId} className="text-sm font-semibold text-heading">
          Màn hình được vào
        </h4>
        <ul aria-labelledby={screensId} className="space-y-1 text-sm text-body">
          {screensOf(role).map((screen) => (
            <li key={screen}>{screen}</li>
          ))}
        </ul>
      </div>
      {MATRIX.groups.map((group) => {
        const held = group.capabilities.filter((c) => widestScope(c.roles, role));
        if (!held.length) return null;
        return (
          <div key={group.label} className="space-y-2">
            <h4 className="text-sm font-semibold text-heading">{group.label}</h4>
            <ul className="space-y-1 text-sm text-body">
              {held.map((c) => (
                <li key={c.id}>
                  {label(c.id)}
                  <span className="text-muted">
                    {" — "}
                    {SCOPE_LABELS[widestScope(c.roles, role) ?? ""]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RoleTable() {
  const cell = "border-b border-line px-3 py-2 align-top";
  const sticky = "sticky left-0 bg-card";
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="text-heading">
            <tr>
              <th scope="col" className={`${cell} ${sticky} min-w-56`}>
                Quyền
              </th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className={`${cell} min-w-32`}>
                  {MATRIX.roles[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-body">
            <tr>
              <th scope="row" className={`${cell} ${sticky} font-semibold text-heading`}>
                Màn hình được vào
              </th>
              {ROLES.map((role) => (
                <td key={role} className={cell}>
                  <ul className="space-y-1">
                    {screensOf(role).map((screen) => (
                      <li key={screen}>{screen}</li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
            {MATRIX.groups.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-sidebar-sub">
                  <th
                    scope="row"
                    colSpan={ROLES.length + 1}
                    className={`${cell} font-semibold text-heading`}
                  >
                    {group.label}
                  </th>
                </tr>
                {group.capabilities.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" className={`${cell} ${sticky} font-normal`}>
                      {label(c.id)}
                    </th>
                    {ROLES.map((role) => {
                      const scope = widestScope(c.roles, role);
                      return (
                        <td key={role} className={`${cell} ${scope ? "" : "text-muted"}`}>
                          {scope ? SCOPE_LABELS[scope] : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">* Cột Quản lý chung: {MANAGER_NOTE}.</p>
    </div>
  );
}

/** "Cách phân quyền hoạt động" (M17-05): principles, flow, and rights per role generated from
 * spec/permissions.yaml + menu.json — read-only documentation, nothing here grants anything. */
export function PermissionGuide({ id }: { id: string }) {
  const titleId = useId();
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const [role, setRole] = useState("MANAGER");
  const heading = "text-base font-semibold text-heading";
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="space-y-6 rounded-2xl border border-line bg-card p-4 lg:p-6"
    >
      <h2 id={titleId} className="text-lg font-semibold text-heading">
        Cách phân quyền hoạt động
      </h2>

      <div className="space-y-2">
        <h3 className={heading}>Nguyên tắc</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-body">
          {PRINCIPLES.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <h3 className={heading}>Luồng phân quyền</h3>
        <ol className="flex flex-col gap-1 lg:flex-row lg:items-stretch">
          {FLOW.map((step, index) => (
            <li key={step} className="flex flex-col items-center gap-1 lg:flex-1 lg:flex-row">
              <span className="flex w-full flex-1 items-start gap-2 rounded-xl bg-sidebar-sub p-3 text-sm text-body">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                  {index + 1}
                </span>
                {step}
              </span>
              {index < FLOW.length - 1 ? (
                <>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted lg:hidden" />
                  <ChevronRight aria-hidden="true" className="hidden size-4 text-muted lg:block" />
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <h3 className={heading}>Quyền theo vai trò</h3>
        {desktop ? (
          <RoleTable />
        ) : (
          <>
            <Select
              label="Vai trò"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {MATRIX.roles[r]}
                </option>
              ))}
            </Select>
            <RoleList role={role} />
          </>
        )}
        <p className="text-xs text-muted">{SCOPE_HELP}</p>
      </div>
    </section>
  );
}
