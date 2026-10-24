import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type CareSummary = NonNullable<Dashboard["care_summary"]>;

/** AC-DASH-060…065 (M16-03): 3 thẻ thống kê CSKH — chèn trước khối "Top 10 khách hàng"/"Phản hồi
 * – đánh giá từ khách hàng" (M15-04), cùng điều kiện vai trò. Thẻ đầu gộp 2 số (hôm nay/tháng
 * này) trong 1 ô vì cùng 1 chỉ số "KH đã chăm sóc", khác 2 thẻ sau chỉ có 1 số. */
export function CskhStatsSection({
  careSummary,
  careStaffCount,
  ordersNeedingRevisionCount,
}: {
  careSummary: CareSummary;
  careStaffCount: number;
  ordersNeedingRevisionCount: number;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Chăm sóc khách hàng (tháng này)</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-medium text-muted">Khách hàng đã chăm sóc</p>
          <p className="text-2xl font-bold text-heading">{careSummary.month}</p>
          <p className="text-sm text-body">Hôm nay: {careSummary.today}</p>
        </div>
        <StatTile label="NV đã gọi điện CSKH" value={careStaffCount} />
        <StatTile label="Đơn hàng phải sửa" value={ordersNeedingRevisionCount} tone="urgent" />
      </div>
    </section>
  );
}
