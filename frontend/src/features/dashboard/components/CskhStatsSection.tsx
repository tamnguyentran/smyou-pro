import { useState } from "react";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { StatTile } from "./StatTile";

type CareSummary = NonNullable<Dashboard["care_summary"]>;

/** AC-DASH-060…065 (M16-03): 3 thẻ thống kê CSKH — chèn trước khối "Top 10 khách hàng"/"Phản hồi
 * – đánh giá từ khách hàng" (M15-04), cùng điều kiện vai trò. Thẻ đầu gộp 2 số (hôm nay/tháng
 * này) trong 1 ô vì cùng 1 chỉ số "KH đã chăm sóc", khác 2 thẻ sau chỉ có 1 số.
 * M18-01c (AC-DASH-116/117): bấm thẻ mở popup; ô 2 số mở danh sách theo tháng (Q120). */
export function CskhStatsSection({
  careSummary,
  careStaffCount,
  ordersNeedingRevisionCount,
}: {
  careSummary: CareSummary;
  careStaffCount: number;
  ordersNeedingRevisionCount: number;
}) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  const show = (card: string, label: string) => () => {
    setOpen({ card, label });
  };
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Chăm sóc khách hàng (tháng này)</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="Khách hàng đã chăm sóc"
          value={careSummary.month}
          hint={`Hôm nay: ${String(careSummary.today)}`}
          onClick={show("care.customers", "Khách hàng đã chăm sóc")}
        />
        <StatTile
          label="NV đã gọi điện CSKH"
          value={careStaffCount}
          onClick={show("care.staff", "NV đã gọi điện CSKH")}
        />
        <StatTile
          label="Đơn hàng phải sửa"
          value={ordersNeedingRevisionCount}
          tone="urgent"
          onClick={show("care.revision_orders", "Đơn hàng phải sửa")}
        />
      </div>
      <CardDetailDialog
        open={open}
        onClose={() => {
          setOpen(null);
        }}
      />
    </section>
  );
}
