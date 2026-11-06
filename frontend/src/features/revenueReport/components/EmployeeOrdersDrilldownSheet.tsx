import type { RevenueFilters } from "../api";
import { useEmployeeLines } from "../employeeApi";
import { RevenueLinesSheet } from "./RevenueLinesSheet";

/** M16-05 (AC-RPT-064): drilldown — liệt kê DÒNG HÀNG của 1 nhân viên (hoặc nhóm "Chưa gán"),
 * thay cho danh sách đơn (M15-10a) vì trục tính đã đổi sang `order_lines.credited_employee_id`. */
export function EmployeeOrdersDrilldownSheet({
  selector,
  title,
  filters,
  onClose,
}: {
  selector: { employeeId: string } | { unassigned: true };
  title: string;
  filters: Pick<RevenueFilters, "from" | "to" | "status">;
  onClose: () => void;
}) {
  const lines = useEmployeeLines(selector, filters);

  return <RevenueLinesSheet title={title} lines={lines} onClose={onClose} />;
}
