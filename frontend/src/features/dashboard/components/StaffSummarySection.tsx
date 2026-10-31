import { useState } from "react";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { StatTile } from "./StatTile";

type StaffSummary = NonNullable<Dashboard["staff_summary"]>;

/** AC-DASH-011 (M7-02c): đếm KTV đang hoạt động theo 3 nhóm — đúng cách nhóm "Đang làm"/"Chưa
 * thực hiện"/"Chờ giao việc" đã dùng ở `WorkloadList` (M4-04b), nhất quán màu giữa 2 màn.
 * AC-DASH-039/042 (M10-07b): "Chưa tiếp nhận" (đếm theo đầu việc, Q85) chèn giữa "Đang làm" và
 * "Chưa thực hiện". M18-01b (AC-DASH-099): bấm thẻ mở popup — 3 thẻ nhóm liệt kê KTV (Q118),
 * "Chưa tiếp nhận" liệt kê đầu việc; mở được cho cả Quản lý (không cần `task.manage`). */
export function StaffSummarySection({ summary }: { summary: StaffSummary }) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  const tiles = [
    {
      card: "staff.IN_PROGRESS",
      label: "Đang làm",
      value: summary.counts_by_status.IN_PROGRESS,
      tone: "in_progress",
    },
    {
      card: "staff.pending_acceptance",
      label: "Chưa tiếp nhận",
      value: summary.pending_acceptance_count,
      tone: "urgent",
    },
    {
      card: "staff.NOT_STARTED",
      label: "Chưa thực hiện",
      value: summary.counts_by_status.NOT_STARTED,
      tone: "review",
    },
    {
      card: "staff.IDLE",
      label: "Chờ giao việc",
      value: summary.counts_by_status.IDLE,
      tone: "urgent",
    },
  ] as const;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">
        Nhân sự kỹ thuật ({summary.active_technician_count} đang hoạt động)
      </h2>
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
