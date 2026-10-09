import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../../components/ui/EmptyState";
import type { Dashboard } from "../api";
import { TodayTaskCard } from "./TodayTaskCard";

/** AC-DASH-005/006/012/013: "Việc hôm nay" của KTV — gồm cả việc đã quá hạn. */
export function TodayTasksSection({ items }: { items: NonNullable<Dashboard["today_tasks"]> }) {
  const [now] = useState(() => Date.now());
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Việc hôm nay</h2>
      {items.length === 0 ? (
        <EmptyState icon={CalendarClock} message="Không có việc nào đến hạn hôm nay." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <TodayTaskCard key={item.assignment_id} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
