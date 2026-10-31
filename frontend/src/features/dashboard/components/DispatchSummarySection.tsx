import { useState } from "react";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { StatTile } from "./StatTile";

type DispatchSummary = NonNullable<Dashboard["dispatch_summary"]>;

const TILES = [
  { key: "pending_dispatch_count", card: "dispatch.pending_dispatch", label: "Chờ điều phối" },
  {
    key: "in_progress_order_count",
    card: "dispatch.in_progress",
    label: "Đang thực hiện",
    tone: "in_progress",
  },
  {
    key: "needs_assignee_count",
    card: "dispatch.needs_assignee",
    label: "Cần giao lại",
    tone: "urgent",
  },
  { key: "overdue_task_count", card: "dispatch.overdue_tasks", label: "Quá hạn", tone: "urgent" },
] as const;

/** AC-DASH-002/003/004/007/008/011/014: 4 thẻ điều phối (toàn công ty, không có khái niệm "của tôi").
 * M18-01a (AC-DASH-079/080): bấm thẻ mở popup danh sách chi tiết (chỉ đọc) cho mọi vai trò thấy
 * khối này — kể cả Quản lý không có `task.manage` (Q117), nên không còn phụ thuộc quyền Bảng đầu việc. */
export function DispatchSummarySection({ summary }: { summary: DispatchSummary }) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Điều phối</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {TILES.map((tile) => (
          <StatTile
            key={tile.card}
            label={tile.label}
            value={summary[tile.key]}
            tone={"tone" in tile ? tile.tone : undefined}
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
