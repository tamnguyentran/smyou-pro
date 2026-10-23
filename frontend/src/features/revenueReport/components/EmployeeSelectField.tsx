import { Select } from "../../../components/ui/Select";
import { useEmployees } from "../../employees/api";

/** Dropdown lọc nhân viên cho báo cáo (AC-RPT-030) — khác `CustomerSearchField`: danh sách nhân
 * viên nhỏ và cố định nên dùng `<select>` liệt kê hết (mặc định sắp theo mã NV ở backend),
 * không cần autocomplete. Rỗng = "Tất cả".
 *
 * SALE/CUSTOMER_CARE có `report.revenue.read` nhưng không có `employee.read` (permissions.yaml) —
 * backend tự giới hạn báo cáo của họ về đúng đơn của mình (scope "own"), nên với nhóm này không
 * gọi `GET /employees` (tránh 403) mà chỉ hiện cố định tên chính họ, không cho đổi. */
export function EmployeeSelectField({
  employeeId,
  onChange,
  canListAll,
  self,
}: {
  employeeId: string;
  onChange: (employeeId: string) => void;
  canListAll: boolean;
  self: { code: string; full_name: string };
}) {
  const employees = useEmployees(
    { q: "", role: "", is_active: "", limit: 100, offset: 0 },
    { enabled: canListAll },
  );

  if (!canListAll) {
    return (
      <Select label="Nhân viên" value="" disabled onChange={() => {}}>
        <option value="">
          {self.code} — {self.full_name}
        </option>
      </Select>
    );
  }

  return (
    <Select
      label="Nhân viên"
      value={employeeId}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">Tất cả</option>
      {(employees.data?.items ?? []).map((employee) => (
        <option key={employee.id} value={employee.id}>
          {employee.code} — {employee.full_name}
        </option>
      ))}
    </Select>
  );
}
