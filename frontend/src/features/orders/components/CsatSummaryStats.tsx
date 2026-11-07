import { cn } from "../../../lib/cn";
import type { CsatSummary } from "../api";

const STARS = [5, 4, 3, 2, 1] as const;

function toneClass(rating: number | "none", active: boolean) {
  if (!active) return "bg-card shadow-card text-heading";
  if (rating === "none") return "border border-line bg-sidebar-sub text-body";
  if (rating >= 4) return "border border-completed-border bg-completed-bg text-completed-fg";
  if (rating === 3) return "border border-review-border bg-review-bg text-review-fg";
  return "border border-urgent-border bg-urgent-bg text-urgent-fg";
}

/** AC-CSK-012: 5 ô theo mức sao + "Chưa đánh giá" trên `/orders`; bấm 1 ô → lọc danh sách theo
 * đúng mức sao đó (hoặc gỡ lọc nếu bấm lại ô đang chọn). AC-CSK-030 (M20-02): ô "Chưa đánh giá"
 * cũng lọc được (`"none"`), loại trừ với ô sao. Lưới 2x3 ở mobile, 1 dòng ở desktop
 * (UI_GUIDELINES §6 — xem spec M15-02b mục 6). */
export function CsatSummaryStats({
  summary,
  selected,
  onSelect,
}: {
  summary: CsatSummary;
  selected: number | "none" | undefined;
  onSelect: (rating: number | "none" | undefined) => void;
}) {
  const tiles: { key: number | "none"; label: string; value: number }[] = [
    ...STARS.map((n) => ({ key: n, label: `${String(n)}★`, value: summary[String(n)] ?? 0 })),
    { key: "none", label: "Chưa đánh giá", value: summary.none ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => {
        const isSelected = selected === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => {
              onSelect(isSelected ? undefined : tile.key);
            }}
            className={cn(
              "min-h-11 cursor-pointer rounded-2xl p-4 text-left transition duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              toneClass(tile.key, tile.value > 0 || isSelected),
              isSelected && "ring-2 ring-brand ring-offset-2",
            )}
          >
            <p className="text-sm font-medium">{tile.label}</p>
            <p className="text-2xl font-bold">{tile.value}</p>
          </button>
        );
      })}
    </div>
  );
}
