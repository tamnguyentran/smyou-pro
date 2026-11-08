import { useState } from "react";
import { cn } from "../../../lib/cn";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { StatTile } from "./StatTile";

type CareSummary = NonNullable<Dashboard["care_summary"]>;

/** AC-DASH-060…065 (M16-03): 3 thẻ thống kê CSKH — chèn trước khối "Top 10 khách hàng"/"Phản hồi
 * – đánh giá từ khách hàng" (M15-04), cùng điều kiện vai trò. Thẻ đầu gộp 2 số (hôm nay/tháng
 * này) trong 1 ô vì cùng 1 chỉ số "Lượt gọi CSKH", khác 2 thẻ sau chỉ có 1 số.
 * M18-01c (AC-DASH-116/117): bấm thẻ mở popup; ô 2 số mở danh sách theo tháng (Q120).
 * M20-10: điện thoại — thẻ đầu trọn hàng 1, 2 thẻ còn lại chung hàng 2 (không thẻ lẻ).
 * M21-03 (AC-DASH-129/130): thẻ thứ 4 "Đơn ghi doanh số" khi API trả khoá đếm (Manager/CSKH) —
 * 4 thẻ chẵn nên 2×2 ở điện thoại, 1 hàng từ `md:`.
 * M27-02b (AC-DASH-136): thẻ đầu đổi tên "Lượt gọi CSKH" — đếm recheck đơn + cuộc gọi "Chăm sóc KH". */
export function CskhStatsSection({
  careSummary,
  careStaffCount,
  ordersNeedingRevisionCount,
  creditedOrderCount,
  managerView,
}: {
  careSummary: CareSummary;
  careStaffCount: number;
  ordersNeedingRevisionCount: number;
  creditedOrderCount?: number;
  managerView: boolean;
}) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  const show = (card: string, label: string) => () => {
    setOpen({ card, label });
  };
  const hasCredited = creditedOrderCount !== undefined;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Chăm sóc khách hàng (tháng này)</h2>
      <div
        className={cn("grid grid-cols-2 gap-3", hasCredited ? "md:grid-cols-4" : "md:grid-cols-3")}
      >
        <StatTile
          label="Lượt gọi CSKH"
          value={careSummary.month}
          hint={`Hôm nay: ${String(careSummary.today)}`}
          onClick={show("care.customers", "Lượt gọi CSKH")}
          className={hasCredited ? undefined : "col-span-2 md:col-span-1"}
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
        {hasCredited ? (
          <StatTile
            label="Đơn ghi doanh số"
            value={creditedOrderCount}
            hint={managerView ? "Của CSKH" : "Của tôi"}
            onClick={show("care.credited_orders", "Đơn ghi doanh số")}
          />
        ) : null}
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
