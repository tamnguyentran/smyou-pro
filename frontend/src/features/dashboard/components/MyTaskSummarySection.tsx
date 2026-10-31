import { useState } from "react";
import { ORDER_STATUS_LABEL } from "../../orders/orderStatus";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { StatTile } from "./StatTile";

type MyTaskSummary = NonNullable<Dashboard["my_task_summary"]>;

/** AC-DASH-020/021 (M7-02d): tình trạng đầu việc của chính KTV — cùng 3 nhóm "Chờ nhận"/"Đang
 * làm"/"Đã xong" đã dùng ở "Việc của tôi" (`MyTasksPage`), "Đã xong" chỉ tính trong ngày.
 * M18-01b (AC-DASH-100/101): bấm thẻ mở popup chỉ đọc (chỉ việc của chính người xem); thao tác
 * nhận/bắt đầu vẫn ở trang "Việc của tôi" (Q119). Thẻ cuối dùng chung
 * `ORDER_STATUS_LABEL.AWAITING_CONFIRMATION` để đổi nhãn 1 nơi là khớp mọi nơi. */
export function MyTaskSummarySection({ summary }: { summary: MyTaskSummary }) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  const tiles = [
    { card: "mine.pending", label: "Chờ nhận", value: summary.pending_count, tone: "urgent" },
    { card: "mine.active", label: "Đang làm", value: summary.active_count, tone: "in_progress" },
    {
      card: "mine.done_today",
      label: "Đã xong hôm nay",
      value: summary.done_today_count,
      tone: "completed",
    },
    {
      card: "mine.not_started",
      label: "Chưa thực hiện",
      value: summary.not_started_count,
      tone: "review",
    },
    {
      card: "mine.overdue",
      label: "Quá hạn chưa hoàn thành",
      value: summary.overdue_count,
      tone: "urgent",
    },
    {
      card: "mine.awaiting_confirmation",
      label: ORDER_STATUS_LABEL.AWAITING_CONFIRMATION,
      value: summary.awaiting_confirmation_count,
      tone: "review",
    },
  ] as const;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Đầu việc của tôi</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((tile) => (
          <StatTile
            key={tile.card}
            label={tile.label}
            value={tile.value}
            tone={tile.tone}
            onClick={() => {
              setOpen({ card: tile.card, label: tile.label });
            }}
          />
        ))}
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
