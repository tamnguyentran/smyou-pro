import { useState } from "react";
import { cn } from "../../../lib/cn";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { TileButton } from "./StatTile";

type FeedbackSummary = NonNullable<Dashboard["feedback_summary"]>;

const STARS = [5, 4, 3, 2, 1] as const;

function toneClass(rating: number): string {
  if (rating >= 4) return "border-completed-border bg-completed-bg text-completed-fg";
  if (rating === 3) return "border-review-border bg-review-bg text-review-fg";
  return "border-urgent-border bg-urgent-bg text-urgent-fg";
}

/** AC-DASH-056/058/059 (M15-04): 5 thẻ số theo mức sao (không có "chưa đánh giá", khác
 * `CsatSummaryStats.tsx` của M15-02b) — tông màu cố định theo mức: 4–5★ xanh, 3★ vàng, 1–2★ hồng.
 * M18-01c (AC-DASH-118): bấm thẻ mở popup các đơn được chấm mức sao đó. */
export function FeedbackSummarySection({ summary }: { summary: FeedbackSummary }) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">
        Phản hồi – đánh giá từ khách hàng (tháng này)
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {STARS.map((rating) => (
          <TileButton
            key={rating}
            onClick={() => {
              setOpen({ card: `feedback.${String(rating)}`, label: `Đánh giá ${String(rating)}★` });
            }}
          >
            <div className={cn("rounded-2xl border p-5", toneClass(rating))}>
              <p className="text-sm font-medium">{rating}★</p>
              <p className="text-2xl font-bold">{summary[String(rating)] ?? 0}</p>
            </div>
          </TileButton>
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
